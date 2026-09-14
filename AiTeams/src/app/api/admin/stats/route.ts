import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { getSupabaseClient } from "@/storage/database/supabase-client";

export async function GET(request: NextRequest) {
  try {
    await requireAdmin(request);
    const client = getSupabaseClient();

    const [
      { count: totalTeams },
      { count: activeTeams },
      { count: frozenTeams },
      { count: totalUsers },
      { count: activeUsers },
      { count: bannedUsers },
      { count: totalAgents },
      { count: activeAgents },
    ] = await Promise.all([
      client.from("teams").select("*", { count: "exact", head: true }),
      client.from("teams").select("*", { count: "exact", head: true }).eq("is_active", true),
      client.from("teams").select("*", { count: "exact", head: true }).eq("is_active", false),
      client.from("users").select("*", { count: "exact", head: true }),
      client.from("users").select("*", { count: "exact", head: true }).eq("is_active", true),
      client.from("users").select("*", { count: "exact", head: true }).eq("is_active", false),
      client.from("agents").select("*", { count: "exact", head: true }),
      client.from("agents").select("*", { count: "exact", head: true }).eq("status", "active"),
    ]);

    // Message counts (last 7 days)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { count: messages7d } = await client
      .from("channel_messages")
      .select("*", { count: "exact", head: true })
      .gte("created_at", sevenDaysAgo);

    // DM messages (last 7 days)
    const { count: dmMessages7d } = await client
      .from("dm_messages")
      .select("*", { count: "exact", head: true })
      .gte("created_at", sevenDaysAgo);

    // Agent chat messages (last 7 days)
    const { count: agentMessages7d } = await client
      .from("agent_chat_messages")
      .select("*", { count: "exact", head: true })
      .gte("created_at", sevenDaysAgo);

    // Pending reviews (agents with status = 'pending')
    const { count: pendingAgents } = await client
      .from("agents")
      .select("*", { count: "exact", head: true })
      .eq("status", "pending");

    return NextResponse.json({
      success: true,
      data: {
        teams: { total: totalTeams || 0, active: activeTeams || 0, frozen: frozenTeams || 0 },
        users: { total: totalUsers || 0, active: activeUsers || 0, banned: bannedUsers || 0 },
        agents: { total: totalAgents || 0, active: activeAgents || 0, pendingReview: pendingAgents || 0 },
        messages: {
          last7Days: (messages7d || 0) + (dmMessages7d || 0) + (agentMessages7d || 0),
          channels: messages7d || 0,
          dms: dmMessages7d || 0,
          agentChats: agentMessages7d || 0,
        },
      },
    });
  } catch (error) {
    if (error instanceof Response) return error;
    if (error && typeof error === 'object' && 'status' in error) {
      return NextResponse.json({ error: "unauthorized" }, { status: (error as { status: number }).status });
    }
    console.error("获取平台统计失败:", error);
    return NextResponse.json({ success: false, error: "获取统计失败" }, { status: 500 });
  }
}