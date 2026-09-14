import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";
import { initializeTeamChannels, addMemberToTeamDefaultChannels } from "@/lib/team-channels";

// 注册
export async function POST(request: NextRequest) {
  try {
    const { phone, name, password, teamName, industry, inviteCode } = await request.json();

    if (!phone) {
      return NextResponse.json({ error: "手机号不能为空" }, { status: 400 });
    }

    if (!name) {
      return NextResponse.json({ error: "名称不能为空" }, { status: 400 });
    }

    if (!password) {
      return NextResponse.json({ error: "密码不能为空" }, { status: 400 });
    }

    if (password.length < 6) {
      return NextResponse.json({ error: "密码至少6位" }, { status: 400 });
    }

    const client = getSupabaseClient();

    // 检查用户是否已存在
    const { data: existingUser } = await client.from("users").select("id").eq("phone", phone).maybeSingle();

    if (existingUser) {
      return NextResponse.json({ error: "该手机号已注册" }, { status: 409 });
    }

    // 创建用户
    const { data: userData, error: userError } = await client
      .from("users")
      .insert({
        phone,
        name,
        password,
        is_active: true,
      })
      .select()
      .single();

    if (userError) {
      console.error("创建用户失败:", userError);
      return NextResponse.json({ error: "注册失败" }, { status: 500 });
    }

    // 如果有邀请码，先处理邀请
    let teamId: string | null = null;

    if (inviteCode) {
      // 验证邀请码
      const { data: inviteData } = await client
        .from("team_invites")
        .select("*")
        .eq("invite_code", inviteCode)
        .eq("status", "pending")
        .maybeSingle();

      if (inviteData) {
        // 检查邀请码是否过期
        if (inviteData.expires_at && new Date(inviteData.expires_at) < new Date()) {
          // 标记过期
          await client.from("team_invites").update({ status: "expired" }).eq("id", inviteData.id);
        } else {
          teamId = inviteData.team_id;

          // 加入团队
          await client.from("team_members").insert({
            team_id: teamId,
            user_id: userData.id,
            role: "member",
          });

          // 自动加入团队的默认频道（如"全员"）
          if (teamId) {
            await addMemberToTeamDefaultChannels(teamId, userData.id);
          }

          // 更新邀请码使用次数
          await client.from("team_invites").update({ used_count: (inviteData.used_count || 0) + 1 }).eq("id", inviteData.id);

          // 检查是否达到最大使用次数
          if (inviteData.max_uses && inviteData.used_count + 1 >= inviteData.max_uses) {
            await client.from("team_invites").update({ status: "accepted" }).eq("id", inviteData.id);
          }
        }
      }
    }

    // 如果没有邀请码但有团队名称，创建新团队
    if (!teamId && teamName) {
      const { data: teamData, error: teamError } = await client
        .from("teams")
        .insert({
          name: teamName,
          type: "company",
          owner_id: userData.id,
          industry,
        })
        .select()
        .single();

      if (teamError) {
        console.error("创建团队失败:", teamError);
      } else {
        teamId = teamData.id;

        // 创建者自动成为团队所有者
        await client.from("team_members").insert({
          team_id: teamId,
          user_id: userData.id,
          role: "owner",
        });

        // 初始化频道模块：创建默认分区"频道" + 默认频道"全员" + 创建者自动加入
        if (teamId) {
          await initializeTeamChannels(teamId, userData.id);
        }
      }
    }

    // 获取用户加入的团队
    const { data: memberData } = await client.from("team_members").select("team_id, role").eq("user_id", userData.id);

    const memberTeamIds = memberData?.map((m) => m.team_id) || [];

    // 获取团队详情
    let teamsData: Record<string, unknown>[] = [];
    if (memberTeamIds.length > 0) {
      const { data } = await client.from("teams").select("*").in("id", memberTeamIds);
      teamsData = data || [];
    }

    // 将 role 从 team_members 合并到 teams
    const teams = (teamsData || []).map((team: Record<string, unknown>) => {
      const member = memberData?.find((m) => m.team_id === team.id);
      return {
        ...team,
        role: member?.role,
      };
    });

    // 创建会话
    const token = crypto.randomUUID();
    const tokenExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await client.from("sessions").insert({
      user_id: userData.id,
      token,
      expires_at: tokenExpiresAt.toISOString(),
    });

    return NextResponse.json({
      success: true,
      user: {
        id: userData.id,
        name: userData.name,
        phone: userData.phone,
        avatar: userData.avatar,
        email: userData.email,
      },
      teams,
      token,
    });
  } catch (error) {
    console.error("注册错误:", error);
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}
