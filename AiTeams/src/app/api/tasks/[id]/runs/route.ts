import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";
import { getTeamMembership, requireAuth } from "@/lib/api-auth";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireAuth(request);
    const { id } = await params;
    const client = getSupabaseClient();

    // 校验任务归属：仅任务所属团队成员可查看运行记录
    const { data: task } = await client
      .from("tasks")
      .select("team_id")
      .eq("id", id)
      .single();

    if (!task) {
      return NextResponse.json({ error: "任务不存在" }, { status: 404 });
    }

    const membership = await getTeamMembership(client, auth.id, task.team_id as string);
    if (!membership) {
      return NextResponse.json({ error: "无权查看该任务的运行记录" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const runId = searchParams.get("runId");

    // 按 runId 精确查询单条（用于执行页刷新）
    if (runId) {
      const { data, error } = await client
        .from("task_runs")
        .select("*")
        .eq("task_id", id)
        .eq("id", runId)
        .maybeSingle();

      if (error) {
        return NextResponse.json({ error: "查询运行记录失败" }, { status: 500 });
      }
      return NextResponse.json({ success: true, data: data ? [data] : [] });
    }

    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") ?? "20", 10)));
    const offset = (page - 1) * limit;

    const { data, error, count } = await client
      .from("task_runs")
      .select("*", { count: "exact" })
      .eq("task_id", id)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      return NextResponse.json({ error: "查询运行记录失败" }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      data: data ?? [],
      page,
      limit,
      total: count ?? 0,
    });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    console.error("查询运行记录失败:", e);
    return NextResponse.json({ error: "查询运行记录失败" }, { status: 500 });
  }
}