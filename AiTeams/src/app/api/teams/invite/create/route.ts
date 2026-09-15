import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";

// 生成随机邀请码
function generateInviteCode(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let code = "";
  for (let i = 0; i < 16; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// 创建邀请链接
export async function POST(request: NextRequest) {
  try {
    const { teamId, inviterId, maxUses = 1, expiresInDays = 7 } = await request.json();

    if (!teamId || !inviterId) {
      return NextResponse.json({ error: "团队ID和邀请人ID不能为空" }, { status: 400 });
    }

    const client = getSupabaseClient();

    // 检查团队是否存在
    const { data: teamData } = await client.from("teams").select("id, name").eq("id", teamId).maybeSingle();

    if (!teamData) {
      return NextResponse.json({ error: "团队不存在" }, { status: 404 });
    }

    // 检查邀请人是否是团队成员
    const { data: memberData } = await client
      .from("team_members")
      .select("role")
      .eq("team_id", teamId)
      .eq("user_id", inviterId)
      .maybeSingle();

    if (!memberData) {
      return NextResponse.json({ error: "你必须是团队成员才能邀请他人" }, { status: 403 });
    }

    // 生成邀请码
    let inviteCode = generateInviteCode();

    // 确保邀请码唯一
    let exists = true;
    while (exists) {
      const { data: existing } = await client.from("team_invites").select("id").eq("invite_code", inviteCode).maybeSingle();
      if (existing) {
        inviteCode = generateInviteCode();
      } else {
        exists = false;
      }
    }

    // 计算过期时间
    const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000);

    // 创建邀请记录
    const { data: inviteData, error: inviteError } = await client
      .from("team_invites")
      .insert({
        team_id: teamId,
        inviter_id: inviterId,
        invite_code: inviteCode,
        max_uses: maxUses,
        expires_at: expiresAt.toISOString(),
        status: "pending",
      })
      .select()
      .single();

    if (inviteError) {
      console.error("创建邀请失败:", inviteError);
      return NextResponse.json({ error: "创建邀请失败" }, { status: 500 });
    }

    // 生成邀请链接
    const baseUrl = process.env.APP_BASE_URL || "http://localhost:5000";
    const inviteUrl = `${baseUrl}/invite/${inviteCode}`;

    return NextResponse.json({
      success: true,
      invite: {
        ...inviteData,
        invite_url: inviteUrl,
      },
    });
  } catch (error) {
    console.error("创建邀请错误:", error);
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}
