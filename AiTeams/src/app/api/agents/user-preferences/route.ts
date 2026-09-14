import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";

/**
 * GET /api/agents/user-preferences?agentId=xxx
 * 获取指定智能体的用户偏好列表
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const agentId = searchParams.get("agentId");
    const teamId = searchParams.get("teamId");
    const limit = parseInt(searchParams.get("limit") || "20");

    if (!agentId || !teamId) {
      return NextResponse.json({ error: "缺少参数 agentId 或 teamId" }, { status: 400 });
    }

    const client = await getSupabaseClient();

    const { data: preferences, error } = await client
      .from("agent_user_preferences")
      .select(`
        *,
        users:user_id (nickname, avatar_url)
      `)
      .eq("agent_id", agentId)
      .eq("team_id", teamId)
      .order("last_interaction_at", { ascending: false })
      .limit(limit);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data: preferences || [] });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

/**
 * POST /api/agents/user-preferences
 * 手动触发用户偏好学习（也可由对话完成后台自动调用）
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { agentId, userId, teamId, userMessage, agentResponse } = body;

    if (!agentId || !userId || !teamId) {
      return NextResponse.json({ error: "缺少必要参数" }, { status: 400 });
    }

    // 动态导入避免循环依赖
    const { learnUserPreferences } = await import("@/lib/user-preference-learner");
    await learnUserPreferences({ agentId, userId, teamId, userMessage, agentResponse });

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

/**
 * DELETE /api/agents/user-preferences?agentId=xxx&userId=xxx
 * 清除某个用户的偏好记录
 */
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const agentId = searchParams.get("agentId");
    const userId = searchParams.get("userId");

    if (!agentId || !userId) {
      return NextResponse.json({ error: "缺少参数 agentId 或 userId" }, { status: 400 });
    }

    const client = await getSupabaseClient();
    const { error } = await client
      .from("agent_user_preferences")
      .delete()
      .eq("agent_id", agentId)
      .eq("user_id", userId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}