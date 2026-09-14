import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";
import { recordFeedback, recordTraining } from "@/lib/agent-task-logger";

export const dynamic = "force-dynamic";

/**
 * POST /api/agents/feedback
 * 提交用户对智能体的反馈
 */
export async function POST(request: NextRequest) {
  try {
    const { agentId, teamId, userId, taskLogId, rating, tags, comment, correction } = await request.json();

    if (!agentId || !teamId || !userId || !rating) {
      return NextResponse.json({ error: "参数不完整" }, { status: 400 });
    }

    const success = await recordFeedback({
      agentId,
      teamId,
      userId,
      taskLogId,
      rating: Math.max(1, Math.min(5, rating)),
      feedbackType: correction ? "correction" : "manual",
      tags: tags || [],
      comment,
      correction,
    });

    if (!success) {
      return NextResponse.json({ error: "记录反馈失败" }, { status: 500 });
    }

    // 如果用户提供了修正内容（👎 时的修正），记录到 training_records
    if (correction && correction.trim()) {
      await recordTraining({
        agentId,
        teamId,
        trainType: "manual_correct",
        sourceType: "feedback",
        sourceRef: taskLogId || undefined,
        content: `用户修正: ${correction}`,
        createdBy: userId,
      }).catch(() => {});
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("反馈API错误:", e);
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}

/**
 * GET /api/agents/feedback
 * 获取智能体的反馈列表
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const agentId = searchParams.get("agentId");
    const teamId = searchParams.get("teamId");
    const limit = parseInt(searchParams.get("limit") || "20");
    const offset = parseInt(searchParams.get("offset") || "0");

    if (!agentId || !teamId) {
      return NextResponse.json({ error: "参数不完整" }, { status: 400 });
    }

    const client = getSupabaseClient();
    const { data: feedbacks, error } = await client
      .from("agent_feedbacks")
      .select("*, users:user_id(name, avatar)")
      .eq("agent_id", agentId)
      .eq("team_id", teamId)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      return NextResponse.json({ error: "查询反馈失败" }, { status: 500 });
    }

    return NextResponse.json({ success: true, feedbacks: feedbacks || [] });
  } catch (e) {
    console.error("反馈查询错误:", e);
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}