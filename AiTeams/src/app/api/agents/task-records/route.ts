import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";

export const dynamic = "force-dynamic";

/**
 * GET /api/agents/task-records
 * 获取智能体任务记录列表（成长档案）
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const agentId = searchParams.get("agentId");
    const teamId = searchParams.get("teamId");
    const taskType = searchParams.get("taskType");
    const status = searchParams.get("status");
    const limit = parseInt(searchParams.get("limit") || "50");
    const offset = parseInt(searchParams.get("offset") || "0");

    if (!agentId || !teamId) {
      return NextResponse.json({ error: "参数不完整" }, { status: 400 });
    }

    const client = getSupabaseClient();
    let query = client
      .from("agent_task_records")
      .select("*", { count: "exact" })
      .eq("agent_id", agentId)
      .eq("team_id", teamId);

    if (taskType) query = query.eq("task_type", taskType);
    if (status) query = query.eq("status", status);

    const { data, error, count } = await query
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      return NextResponse.json({ error: "查询任务记录失败" }, { status: 500 });
    }

    return NextResponse.json({ success: true, records: data || [], total: count || 0 });
  } catch (e) {
    console.error("任务记录查询错误:", e);
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}

/**
 * POST /api/agents/task-records
 * 创建任务记录
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { agentId, teamId, userId, sessionId, taskType, skillId, workflowId, source, channelId, inputSummary, outputSummary, executionTimeMs, status, tags } = body;

    if (!agentId || !teamId || !userId || !inputSummary) {
      return NextResponse.json({ error: "参数不完整" }, { status: 400 });
    }

    const client = getSupabaseClient();
    const { data, error } = await client
      .from("agent_task_records")
      .insert({
        agent_id: agentId,
        team_id: teamId,
        user_id: userId,
        session_id: sessionId || null,
        task_type: taskType || "chat",
        skill_id: skillId || null,
        workflow_id: workflowId || null,
        source: source || "chat",
        channel_id: channelId || null,
        input_summary: inputSummary,
        output_summary: outputSummary || null,
        execution_time_ms: executionTimeMs || null,
        status: status || "success",
        tags: tags || null,
      })
      .select("id")
      .single();

    if (error) {
      return NextResponse.json({ error: "创建任务记录失败" }, { status: 500 });
    }

    return NextResponse.json({ success: true, id: data?.id });
  } catch (e) {
    console.error("创建任务记录错误:", e);
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}

/**
 * PUT /api/agents/task-records
 * 更新任务记录（反馈/评分）
 */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, rating, feedbackText, correction } = body;

    if (!id) {
      return NextResponse.json({ error: "缺少记录ID" }, { status: 400 });
    }

    const client = getSupabaseClient();
    const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (rating !== undefined) updateData.rating = rating;
    if (feedbackText !== undefined) updateData.feedback_text = feedbackText;
    if (correction !== undefined) updateData.correction = correction;

    const { error } = await client
      .from("agent_task_records")
      .update(updateData)
      .eq("id", id);

    if (error) {
      return NextResponse.json({ error: "更新任务记录失败" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("更新任务记录错误:", e);
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}

/**
 * DELETE /api/agents/task-records
 * 删除任务记录
 */
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "缺少记录ID" }, { status: 400 });
    }

    const client = getSupabaseClient();
    const { error } = await client
      .from("agent_task_records")
      .delete()
      .eq("id", id);

    if (error) {
      return NextResponse.json({ error: "删除任务记录失败" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("删除任务记录错误:", e);
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}