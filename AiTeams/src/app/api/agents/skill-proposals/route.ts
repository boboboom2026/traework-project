import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const agentId = searchParams.get("agentId");
    const teamId = searchParams.get("teamId");
    const status = searchParams.get("status"); // pending / approved / rejected / all
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");

    if (!agentId || !teamId) {
      return NextResponse.json({ success: false, error: "参数不完整" }, { status: 400 });
    }

    const supabase = getSupabaseClient();
    let query = supabase
      .from("skill_update_proposals")
      .select("*")
      .eq("agent_id", agentId)
      .eq("team_id", teamId);

    if (status && status !== "all") {
      query = query.eq("status", status);
    }

    const { data: proposals, error } = await query
      .order("created_at", { ascending: false })
      .range((page - 1) * limit, page * limit - 1);

    if (error) throw error;

    // 获取总数
    let countQuery = supabase
      .from("skill_update_proposals")
      .select("id", { count: "exact", head: true })
      .eq("agent_id", agentId)
      .eq("team_id", teamId);
    if (status && status !== "all") {
      countQuery = countQuery.eq("status", status);
    }
    const { count } = await countQuery;

    return NextResponse.json({
      success: true,
      proposals: proposals || [],
      total: count || 0,
      page,
      limit,
    });
  } catch (error: any) {
    console.error("获取技能建议列表失败:", error);
    return NextResponse.json({ success: false, error: error.message || "获取失败" }, { status: 500 });
  }
}