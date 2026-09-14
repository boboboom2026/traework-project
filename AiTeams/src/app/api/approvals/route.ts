import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { createApprovalTask, listApprovalTasks, approveTask, rejectTask, getApprovalTaskDetail } from "@/lib/agents/approval-service";
import { getSupabaseClient } from "@/storage/database/supabase-client";

/** 鉴权辅助：优先 token（requireAuth），失败则回退到显式传入的 userId（与全站接口一致） */
async function resolveUserId(request: NextRequest, fallback?: string | null): Promise<string> {
  try {
    const auth = await requireAuth(request);
    return auth.id;
  } catch (e) {
    if (e instanceof NextResponse) {
      // 无有效 token，回退到调用方显式指定的 userId
      if (fallback) return fallback;
      throw e;
    }
    throw e;
  }
}

// POST /api/approvals - 创建审批任务
// body: { title, task_type, description, draft, assignee_id, team_id, session_id, source_id }
// body: { action: "approve"|"reject", comment } — 创建时同时通过/驳回（用于"确认通过"/"修改意见"）
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const { title, task_type, description, draft, assignee_id, team_id, session_id, source_id, action, comment, user_id } = body;
    if (!title || !team_id) {
      return NextResponse.json({ success: false, error: "缺少必填字段(title, team_id)" }, { status: 400 });
    }

    const creatorId = await resolveUserId(request, user_id);

    // 创建任务
    const { task, error } = await createApprovalTask({
      team_id,
      creator_id: creatorId,
      assignee_id: assignee_id || null,
      title,
      task_type,
      description,
      draft,
      session_id,
      source_id,
    });

    if (error || !task) {
      return NextResponse.json({ success: false, error: error || "创建失败" }, { status: 500 });
    }

    // 创建后立即执行 approve / reject（用于"确认通过"/"提修改意见"）
    if (action === "approve") {
      await approveTask(task.id, creatorId, comment);
    } else if (action === "reject") {
      await rejectTask(task.id, creatorId, comment);
    }

    // 通知审批人
    if (assignee_id && action !== "approve") {
      const client = getSupabaseClient();
      await client.from("system_notifications").insert({
        team_id,
        user_id: assignee_id,
        type: "approval",
        title: `新的审批任务：${title}`,
        content: description || `您有一个新的审批任务"${title}"等待处理`,
        link: "/approvals",
      });
    }

    // 重新获取最终状态
    const { task: finalTask } = await getApprovalTaskDetail(task.id);

    return NextResponse.json({ success: true, data: finalTask || task }, { status: 201 });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    console.error("创建审批任务错误:", e);
    return NextResponse.json({ success: false, error: "服务器错误" }, { status: 500 });
  }
}

// GET /api/approvals - 查询审批任务列表
// 参数: role=mine|assigned|all, status=pending|approved|rejected, session_id, source_id, team_id
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const role = (searchParams.get("role") as any) || "all";
    const status = (searchParams.get("status") as any) || undefined;
    const sessionId = searchParams.get("session_id") || undefined;
    const sourceId = searchParams.get("source_id") || undefined;
    const teamId = searchParams.get("team_id") || undefined;

    const userId = await resolveUserId(request, searchParams.get("user_id"));

    const { tasks, error } = await listApprovalTasks({
      user_id: userId,
      role,
      status,
      session_id: sessionId,
      source_id: sourceId,
      team_id: teamId,
    });

    if (error) {
      return NextResponse.json({ success: false, error }, { status: 500 });
    }
    return NextResponse.json({ success: true, data: tasks });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    console.error("查询审批任务错误:", e);
    return NextResponse.json({ success: false, error: "服务器错误" }, { status: 500 });
  }
}