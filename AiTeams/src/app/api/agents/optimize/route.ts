import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const agentId = searchParams.get("agentId");
    const teamId = searchParams.get("teamId");
    const status = searchParams.get("status");
    const sessionId = searchParams.get("sessionId");
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "20", 10);

    if (!agentId || !teamId) {
      return NextResponse.json({ error: "参数不完整" }, { status: 400 });
    }

    const supabase = getSupabaseClient();

    let query = supabase
      .from("agent_optimization_proposals")
      .select("*", { count: "exact" })
      .eq("agent_id", agentId)
      .eq("team_id", teamId);

    if (status) {
      query = query.eq("status", status);
    }
    if (sessionId) {
      query = query.eq("session_id", sessionId);
    }

    const from = (page - 1) * limit;
    const to = from + limit - 1;

    const { data, error, count } = await query
      .order("created_at", { ascending: false })
      .range(from, to);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Group by session_id for display
    const sessionGroups: Record<string, any> = {};
    for (const item of data || []) {
      const sid = item.session_id || "standalone";
      if (!sessionGroups[sid]) {
        sessionGroups[sid] = {
          session_id: sid,
          created_at: item.created_at,
          proposals: [],
        };
      }
      sessionGroups[sid].proposals.push(item);
    }

    return NextResponse.json({
      success: true,
      proposals: data || [],
      session_groups: Object.values(sessionGroups),
      total: count || 0,
      page,
      limit,
    });

  } catch (error) {
    console.error("Optimize list error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}