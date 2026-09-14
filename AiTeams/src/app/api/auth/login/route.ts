import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";

// 验证码登录
export async function POST(request: NextRequest) {
  try {
    const { phone, code } = await request.json();

    if (!phone || !code) {
      return NextResponse.json({ error: "手机号和验证码不能为空" }, { status: 400 });
    }

    const client = getSupabaseClient();

    // 查找有效验证码
    const { data: verifyData, error: verifyError } = await client
      .from("verification_codes")
      .select("*")
      .eq("phone", phone)
      .eq("code", code)
      .eq("used", false)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (verifyError) {
      console.error("验证验证码失败:", verifyError);
      return NextResponse.json({ error: "验证失败" }, { status: 500 });
    }

    if (!verifyData) {
      return NextResponse.json({ error: "验证码错误或已过期" }, { status: 401 });
    }

    // 检查验证码是否过期
    const expiresAt = new Date(verifyData.expires_at);
    if (expiresAt < new Date()) {
      return NextResponse.json({ error: "验证码已过期" }, { status: 401 });
    }

    // 标记验证码已使用
    await client.from("verification_codes").update({ used: true }).eq("id", verifyData.id);

    // 查找用户
    const { data: userData, error: userError } = await client.from("users").select("*").eq("phone", phone).maybeSingle();

    if (userError) {
      console.error("查询用户失败:", userError);
      return NextResponse.json({ error: "查询用户失败" }, { status: 500 });
    }

    if (!userData) {
      // 新用户，返回标记
      return NextResponse.json({
        success: true,
        hasAccount: false,
        user: null,
        teams: [],
      });
    }

    // 获取用户的团队列表
    const { data: memberData } = await client
      .from("team_members")
      .select("team_id, role")
      .eq("user_id", userData.id);

    const teamIds = memberData?.map((m) => m.team_id) || [];

    // 获取团队详情
    let teamsData: Record<string, unknown>[] = [];
    if (teamIds.length > 0) {
      const { data } = await client.from("teams").select("*").in("id", teamIds);
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
    const sessionExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7天
    await client.from("sessions").insert({
      user_id: userData.id,
      token,
      expires_at: sessionExpiresAt.toISOString(),
    });

    return NextResponse.json({
      success: true,
      hasAccount: true,
      user: {
        id: userData.id,
        name: userData.name,
        phone: userData.phone,
        avatar: userData.avatar,
        email: userData.email,
        platformRole: userData.platform_role || "user",
      },
      teams,
      token,
    });
  } catch (error) {
    console.error("登录错误:", error);
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}
