import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";
import { requireAuth } from "@/lib/api-auth";

// GET /api/agents/workflows/approvals/pending - 获取指定会话(session_id)下等待当前用户审批的任务
// 用于前端审批卡片"重放化"：会话刷新/重新打开时，从已落库的审批任务恢复审批卡片
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    const client = getSupabaseClient();

    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get("session_id");

    if (!sessionId) {
      return NextResponse.json({ error: "缺少 session_id 参数" }, { status: 400 });
    }

    const { data, error } = await client
      .from("workflow_approval_tasks")
      .select("*")
      .like("session_id", `${sessionId}-wf-%`)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) {
      console.error("查询会话待审批任务失败:", error);
      return NextResponse.json({ error: "查询会话待审批任务失败" }, { status: 500 });
    }

    // 过滤出需要当前用户处理的（审批人 = 当前用户）
    const tasks = (data || []).filter((t) => t.approver_id === auth.id);

    if (tasks.length === 0) {
      return NextResponse.json({ success: true, data: [] });
    }

    const task = tasks[0];
    // 关联工作流名称与步骤名
    const { data: wf } = await client
      .from("agent_workflows")
      .select("name, steps")
      .eq("id", task.workflow_id)
      .single();

    let stepName = task.step_name || "";
    if (wf?.steps) {
      const steps = Array.isArray(wf.steps) ? wf.steps : [];
      const step = steps.find((s: any) => s.step_id === task.step_id);
      if (step?.name) stepName = step.name;
    }

    return NextResponse.json({
      success: true,
      data: tasks.map((t) => ({ ...t, workflow_name: wf?.name || "", step_name: stepName })),
    });
  } catch (error) {
    if (error instanceof NextResponse) return error;
    console.error("获取会话待审批任务失败:", error);
    return NextResponse.json({ error: "获取会话待审批任务失败" }, { status: 500 });
  }
}
