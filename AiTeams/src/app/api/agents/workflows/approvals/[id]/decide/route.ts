import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";
import { requireAuth } from "@/lib/api-auth";
import { WorkflowExecutor } from "@/lib/workflow-executor";

// POST /api/agents/workflows/approvals/[id]/decide - 审批通过/驳回
// body: { action: "approve" | "reject", note?: string }
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth(request);
    const { id } = await params;
    const client = getSupabaseClient();

    const body = await request.json().catch(() => ({}));
    const action = body.action;
    const note = body.note;

    if (action !== "approve" && action !== "reject") {
      return NextResponse.json({ error: "action 必须为 approve 或 reject" }, { status: 400 });
    }

    const { data: task, error } = await client
      .from("workflow_approval_tasks")
      .select("*")
      .eq("id", id)
      .single();

    if (error || !task) {
      return NextResponse.json({ error: "审批任务不存在" }, { status: 404 });
    }
    if (task.status !== "pending") {
      return NextResponse.json({ error: "该审批任务已处理" }, { status: 400 });
    }
    if (task.approver_id !== auth.id) {
      return NextResponse.json({ error: "您不是该任务的审批人" }, { status: 403 });
    }

    const decision = action === "approve" ? "approved" : "rejected";

    // 更新任务状态
    const { error: updErr } = await client
      .from("workflow_approval_tasks")
      .update({
        status: decision,
        decided_by: auth.id,
        decided_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (updErr) {
      console.error("更新审批任务失败:", updErr);
      return NextResponse.json({ error: "更新审批任务失败" }, { status: 500 });
    }

    // 投递结果通知给发起人
    if (task.applicant_id) {
      await client.from("system_notifications").insert({
        team_id: task.team_id || null,
        user_id: task.applicant_id,
        scope: "user",
        type: "workflow_approval",
        title: `【审批结果】${task.step_name || "人工审批"}${decision === "approved" ? "已通过" : "被驳回"}`,
        content:
          decision === "approved"
            ? `工作流「${task.step_name || "人工审批"}」已通过审批。`
            : `工作流「${task.step_name || "人工审批"}」被驳回：${note || "未填写备注"}`,
        link: `/apps?tab=approvals`,
      });
    }

    // 恢复工作流执行（尽力而为，审批 API 不等待执行完成）
    let restarted = false;
    (async () => {
      try {
        const { data: wf } = await client
          .from("agent_workflows")
          .select("id, name, description, steps")
          .eq("id", task.workflow_id)
          .single();

        if (wf?.steps) {
          const executor = new WorkflowExecutor(
            { id: wf.id, name: wf.name, description: wf.description || "", steps: wf.steps },
            task.session_id,
            async () => {},
            { teamId: task.team_id || undefined, applicantId: task.applicant_id || undefined }
          );
          await executor.resumeFromTask({
            step_index: task.step_index,
            payload: task.payload || {},
            decision,
            note,
          });
        }
        restarted = true;
      } catch (e) {
        console.error("[workflow] 审批后恢复执行失败:", e);
      }
    })();

    return NextResponse.json({ success: true, status: decision, restarted });
  } catch (error) {
    if (error instanceof NextResponse) return error;
    console.error("审批操作失败:", error);
    return NextResponse.json({ error: "审批操作失败" }, { status: 500 });
  }
}
