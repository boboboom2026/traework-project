import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";
import { addMemberToTeamDefaultChannels } from "@/lib/team-channels";

// 接受邀请
export async function POST(request: NextRequest) {
  try {
    const { inviteCode, userId } = await request.json();

    if (!inviteCode) {
      return NextResponse.json({ error: "邀请码不能为空" }, { status: 400 });
    }

    const client = getSupabaseClient();

    // 查找邀请记录
    const { data: inviteData, error: inviteError } = await client.from("team_invites").select("*").eq("invite_code", inviteCode).maybeSingle();

    if (inviteError) {
      console.error("查询邀请失败:", inviteError);
      return NextResponse.json({ error: "查询失败" }, { status: 500 });
    }

    if (!inviteData) {
      return NextResponse.json({ error: "邀请链接无效" }, { status: 404 });
    }

    // 检查邀请状态
    if (inviteData.status !== "pending") {
      return NextResponse.json({ error: `邀请链接已${inviteData.status === "expired" ? "过期" : "失效"}` }, { status: 410 });
    }

    // 检查是否过期
    if (inviteData.expires_at && new Date(inviteData.expires_at) < new Date()) {
      await client.from("team_invites").update({ status: "expired" }).eq("id", inviteData.id);
      return NextResponse.json({ error: "邀请链接已过期" }, { status: 410 });
    }

    // 检查使用次数
    if (inviteData.max_uses && inviteData.used_count >= inviteData.max_uses) {
      return NextResponse.json({ error: "邀请链接已失效" }, { status: 410 });
    }

    // 如果提供了用户ID，检查用户是否已是团队成员
    if (userId) {
      const { data: existingMember } = await client
        .from("team_members")
        .select("id")
        .eq("team_id", inviteData.team_id)
        .eq("user_id", userId)
        .maybeSingle();

      if (existingMember) {
        return NextResponse.json({ error: "你已经是该团队成员" }, { status: 409 });
      }

      // 添加团队成员
      const { error: memberError } = await client.from("team_members").insert({
        team_id: inviteData.team_id,
        user_id: userId,
        role: "member",
      });

      if (memberError) {
        console.error("加入团队失败:", memberError);
        return NextResponse.json({ error: "加入团队失败" }, { status: 500 });
      }

      // 自动加入团队的默认频道（如"全员"）
      await addMemberToTeamDefaultChannels(inviteData.team_id, userId);
    }

    // 更新邀请使用次数
    await client.from("team_invites").update({ used_count: (inviteData.used_count || 0) + 1 }).eq("id", inviteData.id);

    // 检查是否达到最大使用次数
    if (inviteData.max_uses && inviteData.used_count + 1 >= inviteData.max_uses) {
      await client.from("team_invites").update({ status: "accepted" }).eq("id", inviteData.id);
    }

    // 获取团队信息
    const { data: teamData } = await client.from("teams").select("*").eq("id", inviteData.team_id).maybeSingle();

    return NextResponse.json({
      success: true,
      message: "成功加入团队",
      team: teamData,
      usedCount: inviteData.used_count + 1,
      maxUses: inviteData.max_uses,
    });
  } catch (error) {
    console.error("接受邀请错误:", error);
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}
