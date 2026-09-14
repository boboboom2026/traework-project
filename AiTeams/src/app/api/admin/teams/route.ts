import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { getSupabaseClient } from "@/storage/database/supabase-client";

export async function GET(request: NextRequest) {
  try {
    await requireAdmin(request);
    const url = new URL(request.url);
    const search = url.searchParams.get("search") || "";
    const page = parseInt(url.searchParams.get("page") || "1");
    const limit = parseInt(url.searchParams.get("limit") || "20");
    const sortBy = url.searchParams.get("sortBy") || "created_at";
    const sortOrder = url.searchParams.get("sortOrder") || "desc";
    const offset = (page - 1) * limit;

    const client = getSupabaseClient();

    let query = client.from("teams").select(
      `*, 
       owner:users!teams_owner_id_users_id_fk(id, name, phone)`,
      { count: "exact" }
    );

    if (search) {
      query = query.ilike("name", `%${search}%`);
    }

    const { data, count, error } = await query
      .order(sortBy, { ascending: sortOrder === "asc" })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    // Get member count for each team
    const teamsWithCounts = await Promise.all(
      (data || []).map(async (team: Record<string, unknown>) => {
        const { count: memberCount } = await client
          .from("team_members")
          .select("*", { count: "exact", head: true })
          .eq("team_id", team.id);
        return { ...team, memberCount: memberCount || 0 };
      })
    );

    return NextResponse.json({
      success: true,
      data: teamsWithCounts,
      pagination: { page, limit, total: count || 0, totalPages: Math.ceil((count || 0) / limit) },
    });
  } catch (error) {
    if (error instanceof Response) return error;
    if (error && typeof error === 'object' && 'status' in error) {
      return NextResponse.json({ error: "unauthorized" }, { status: (error as { status: number }).status });
    }
    console.error("获取团队列表失败:", error);
    return NextResponse.json({ success: false, error: "获取团队列表失败" }, { status: 500 });
  }
}