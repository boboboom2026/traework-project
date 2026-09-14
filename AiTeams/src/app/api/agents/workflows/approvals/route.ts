import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";
import { requireAuth } from "@/lib/api-auth";

// GET /api/agents/workflows/approvals - 获取当前用户的审批任务（我的待办/已办）
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    const client = getSupabaseClient();

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status"); // pending(默认) / approved / rejected / all
    const limit = Math.min(Number(searchParams.get("limit")) || 50, 100);

    let query = client
      .from("workflow_approval_tasks")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (status && status !== "all") {
      query = query.eq("status", status);
    } else if (!status) {
      query = query.eq("status", "pending");
    }

    const { data, error } = await query;

    if (error) {
      console.error("查询审批任务失败:", error);
      return NextResponse.json({ error: "查询审批任务失败" }, { status: 500 });
    }

    // 关联发起人 / 工作流名称，用于列表展示
    const tasks = data || [];
    const workflowIds = Array.from(new Set(tasks.map((t) => t.workflow_id)));
    const applicantIds = Array.from(new Set(tasks.map((t) => t.applicant_id).filter(Boolean)));

    let workflows: Record<string, string> = {};
    if (workflowIds.length > 0) {
      const { data: wf } = await client
        .from("agent_workflows")
        .select("id, name")
        .in("id", workflowIds);
      workflows = Object.fromEntries((wf || []).map((w) => [w.id, w.name]));
    }

    let applicants: Record<string, string> = {};
    if (applicantIds.length > 0) {
      const { data: users } = await client
        .from("users")
        .select("id, full_name, real_name, nickname")
        .in("id", applicantIds);
      applicants = Object.fromEntries(
        (users || []).map((u) => [u.id, u.full_name || u.real_name || u.nickname || "成员"])
      );
    }

    const enriched = tasks.map((t) => ({
      ...t,
      workflow_name: workflows[t.workflow_id] || "",
      applicant_name: applicants[t.applicant_id] || "",
    }));

    return NextResponse.json({ success: true, data: enriched });
  } catch (error) {
    if (error instanceof NextResponse) return error;
    console.error("获取审批任务失败:", error);
    return NextResponse.json({ error: "获取审批任务失败" }, { status: 500 });
  }
}
