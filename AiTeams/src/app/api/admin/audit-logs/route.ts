import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { getSupabaseClient } from "@/storage/database/supabase-client";

export async function GET(request: NextRequest) {
  try {
    await requireAdmin(request);
    const url = new URL(request.url);
    const page = parseInt(url.searchParams.get("page") || "1");
    const limit = parseInt(url.searchParams.get("limit") || "30");
    const action = url.searchParams.get("action") || "";
    const userId = url.searchParams.get("userId") || "";
    const offset = (page - 1) * limit;

    const client = getSupabaseClient();

    // For MVP, we aggregate from existing tables to provide audit-like data
    // 1. System notifications as admin actions
    // 2. Session data as login logs
    // 3. Team member changes

    const logs: Record<string, unknown>[] = [];

    // Get recent login sessions
    const { data: sessions } = await client
      .from("sessions")
      .select(`id, user_id, created_at, last_used_at, expires_at`)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (sessions) {
      for (const s of sessions) {
        if (userId && s.user_id !== userId) continue;
        const { data: user } = await client
          .from("users")
          .select("name, phone")
          .eq("id", s.user_id)
          .single();
        logs.push({
          id: `login-${s.id}`,
          userId: s.user_id,
          userName: user?.name || "未知用户",
          action: "login",
          detail: "用户登录",
          timestamp: s.created_at,
        });
      }
    }

    // Get recent team memberships
    const { data: memberships } = await client
      .from("team_members")
      .select(`id, user_id, team_id, role, joined_at`)
      .order("joined_at", { ascending: false })
      .limit(limit);

    if (memberships) {
      for (const m of memberships) {
        if (userId && m.user_id !== userId) continue;
        const { data: team } = await client
          .from("teams")
          .select("name")
          .eq("id", m.team_id)
          .single();
        logs.push({
          id: `member-${m.id}`,
          userId: m.user_id,
          teamId: m.team_id,
          teamName: team?.name || "未知团队",
          action: "join_team",
          detail: `加入团队 "${team?.name || "未知"}"`,
          role: m.role,
          timestamp: m.joined_at,
        });
      }
    }

    // Get recent team creations
    const { data: teams } = await client
      .from("teams")
      .select(`id, name, owner_id, created_at`)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (teams) {
      for (const t of teams) {
        if (userId && t.owner_id !== userId) continue;
        logs.push({
          id: `team-${t.id}`,
          userId: t.owner_id,
          teamId: t.id,
          teamName: t.name,
          action: "create_team",
          detail: `创建团队 "${t.name}"`,
          timestamp: t.created_at,
        });
      }
    }

    // Sort by timestamp desc
    logs.sort((a, b) => new Date(b.timestamp as string).getTime() - new Date(a.timestamp as string).getTime());

    // Filter by action
    const filteredLogs = action ? logs.filter((l) => l.action === action) : logs;

    return NextResponse.json({
      success: true,
      data: filteredLogs.slice(0, limit),
      pagination: { page, limit, total: logs.length },
    });
  } catch (error) {
    if (error instanceof Response) return error;
    if (error && typeof error === 'object' && 'status' in error) {
      return NextResponse.json({ error: "unauthorized" }, { status: (error as { status: number }).status });
    }
    console.error("获取审计日志失败:", error);
    return NextResponse.json({ success: false, error: "获取审计日志失败" }, { status: 500 });
  }
}