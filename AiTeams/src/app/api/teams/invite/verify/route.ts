import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";

// 验证邀请链接
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const inviteCode = searchParams.get("code");

    if (!inviteCode) {
      return NextResponse.json({ error: "邀请码不能为空" }, { status: 400 });
    }

    const client = getSupabaseClient();

    // 查找邀请记录
    const { data: inviteData, error: inviteError } = await client
      .from("team_invites")
      .select("*")
      .eq("invite_code", inviteCode)
      .maybeSingle();

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
      // 标记过期
      await client.from("team_invites").update({ status: "expired" }).eq("id", inviteData.id);
      return NextResponse.json({ error: "邀请链接已过期" }, { status: 410 });
    }

    // 检查使用次数
    if (inviteData.max_uses && inviteData.used_count >= inviteData.max_uses) {
      return NextResponse.json({ error: "邀请链接已失效" }, { status: 410 });
    }

    // 获取团队信息
    const { data: teamData } = await client.from("teams").select("id, name, type, logo, color").eq("id", inviteData.team_id).maybeSingle();

    if (!teamData) {
      return NextResponse.json({ error: "团队不存在" }, { status: 404 });
    }

    // 获取邀请人信息
    const { data: inviterData } = await client.from("users").select("id, name, avatar").eq("id", inviteData.inviter_id).maybeSingle();

    return NextResponse.json({
      success: true,
      team: teamData,
      inviter: inviterData,
      invite: {
        id: inviteData.id,
        max_uses: inviteData.max_uses,
        used_count: inviteData.used_count,
        expires_at: inviteData.expires_at,
      },
    });
  } catch (error) {
    console.error("验证邀请错误:", error);
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}
