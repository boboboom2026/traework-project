import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";
import { requireAuth } from "@/lib/api-auth";

// GET /api/agents/workflows/approvals/[id] - 审批工单详情（含完整正文 content）
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth(request);
    const { id } = await params;
    const client = getSupabaseClient();

    const { data: task, error } = await client
      .from("workflow_approval_tasks")
      .select("*")
      .eq("id", id)
      .single();

    if (error || !task) {
      return NextResponse.json({ error: "审批任务不存在" }, { status: 404 });
    }

    // 仅审批人、发起人、团队成员可查看
    if (task.approver_id !== auth.id && task.applicant_id !== auth.id) {
      return NextResponse.json({ error: "无权查看该审批任务" }, { status: 403 });
    }

    // 关联工作流名称
    const { data: wf } = await client
      .from("agent_workflows")
      .select("name")
      .eq("id", task.workflow_id)
      .single();

    return NextResponse.json({
      success: true,
      data: {
        ...task,
        workflow_name: wf?.name || "",
      },
    });
  } catch (error) {
    if (error instanceof NextResponse) return error;
    console.error("获取审批详情失败:", error);
    return NextResponse.json({ error: "获取审批详情失败" }, { status: 500 });
  }
}
