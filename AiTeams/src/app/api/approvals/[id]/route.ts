import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { getApprovalTaskDetail } from "@/lib/agents/approval-service";

/** 鉴权辅助：优先 token（requireAuth），失败则回退到显式传入的 userId（与全站接口一致） */
async function resolveUserId(request: NextRequest, fallback?: string | null): Promise<string> {
  try {
    const auth = await requireAuth(request);
    return auth.id;
  } catch (e) {
    if (e instanceof NextResponse) {
      if (fallback) return fallback;
      throw e;
    }
    throw e;
  }
}

// GET /api/approvals/[id] - 获取审批任务详情
export async function GET(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const url = new URL(request.url);
    const user_id = url.searchParams.get("user_id");
    await resolveUserId(request, user_id);
    const { id } = await ctx.params;
    const { task, error } = await getApprovalTaskDetail(id);
    if (error || !task) {
      return NextResponse.json({ success: false, error: error || "任务不存在" }, { status: 404 });
    }
    return NextResponse.json({ success: true, data: task });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    console.error("获取审批任务详情错误:", e);
    return NextResponse.json({ success: false, error: "服务器错误" }, { status: 500 });
  }
}

// POST /api/approvals/[id]/decide - 审批操作（approve/reject/forward）
// body: { action: "approve"|"reject"|"forward", comment?, assignee_id?, user_id? }
export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const { action, comment, assignee_id, user_id } = await request.json();
    const operatorId = await resolveUserId(request, user_id);

    if (action === "approve") {
      const { approveTask } = await import("@/lib/agents/approval-service");
      const res = await approveTask(id, operatorId, comment);
      if (!res.success) return NextResponse.json({ success: false, error: res.error }, { status: 400 });
      return NextResponse.json({ success: true, data: res.task });
    }
    if (action === "reject") {
      const { rejectTask } = await import("@/lib/agents/approval-service");
      const res = await rejectTask(id, operatorId, comment);
      if (!res.success) return NextResponse.json({ success: false, error: res.error }, { status: 400 });
      return NextResponse.json({ success: true, data: res.task });
    }
    if (action === "forward") {
      if (!assignee_id) return NextResponse.json({ success: false, error: "缺少 assignee_id" }, { status: 400 });
      const { forwardApproval } = await import("@/lib/agents/approval-service");
      const res = await forwardApproval(id, operatorId, assignee_id, comment);
      if (!res.success) return NextResponse.json({ success: false, error: res.error }, { status: 400 });
      return NextResponse.json({ success: true, data: res.task });
    }
    return NextResponse.json({ success: false, error: "不支持的操作类型" }, { status: 400 });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    console.error("审批操作错误:", e);
    return NextResponse.json({ success: false, error: "服务器错误" }, { status: 500 });
  }
}