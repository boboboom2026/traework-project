import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";

export const dynamic = "force-dynamic";

/**
 * GET /api/agents/task-records/stats
 * 获取智能体任务统计（成长档案统计）
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const agentId = searchParams.get("agentId");
    const teamId = searchParams.get("teamId");

    if (!agentId || !teamId) {
      return NextResponse.json({ error: "参数不完整" }, { status: 400 });
    }

    const client = getSupabaseClient();

    // 总任务数
    const { count: totalCount } = await client
      .from("agent_task_records")
      .select("*", { count: "exact", head: true })
      .eq("agent_id", agentId)
      .eq("team_id", teamId);

    // 各类型任务数
    const { data: typeStats } = await client
      .from("agent_task_records")
      .select("task_type, status")
      .eq("agent_id", agentId)
      .eq("team_id", teamId);

    // 统计各类型
    const typeCount: Record<string, number> = {};
    let successCount = 0;
    let totalRating = 0;
    let ratingCount = 0;

    typeStats?.forEach((r: { task_type: string; status: string }) => {
      typeCount[r.task_type] = (typeCount[r.task_type] || 0) + 1;
      if (r.status === "success") successCount++;
    });

    // 评分统计
    const { data: ratingData } = await client
      .from("agent_task_records")
      .select("rating")
      .eq("agent_id", agentId)
      .eq("team_id", teamId)
      .not("rating", "is", null);

    ratingData?.forEach((r: { rating: number }) => {
      totalRating += r.rating;
      ratingCount++;
    });

    // 最近7天任务数
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const { count: weeklyCount } = await client
      .from("agent_task_records")
      .select("*", { count: "exact", head: true })
      .eq("agent_id", agentId)
      .eq("team_id", teamId)
      .gte("created_at", sevenDaysAgo.toISOString());

    // 最近30天任务数
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const { count: monthlyCount } = await client
      .from("agent_task_records")
      .select("*", { count: "exact", head: true })
      .eq("agent_id", agentId)
      .eq("team_id", teamId)
      .gte("created_at", thirtyDaysAgo.toISOString());

    return NextResponse.json({
      success: true,
      stats: {
        totalCount: totalCount || 0,
        successCount,
        successRate: totalCount ? Math.round((successCount / totalCount) * 100) : 0,
        avgRating: ratingCount ? Math.round((totalRating / ratingCount) * 10) / 10 : 0,
        ratingCount,
        weeklyCount: weeklyCount || 0,
        monthlyCount: monthlyCount || 0,
        typeDistribution: typeCount,
      },
    });
  } catch (e) {
    console.error("任务统计错误:", e);
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}