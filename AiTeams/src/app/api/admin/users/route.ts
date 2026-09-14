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
    const filter = url.searchParams.get("filter") || ""; // active, banned, admin
    const offset = (page - 1) * limit;

    const client = getSupabaseClient();

    let query = client.from("users").select("*", { count: "exact" });

    if (search) {
      query = query.or(`name.ilike.%${search}%,phone.ilike.%${search}%,email.ilike.%${search}%`);
    }

    if (filter === "active") {
      query = query.eq("is_active", true);
    } else if (filter === "banned") {
      query = query.eq("is_active", false);
    } else if (filter === "admin") {
      query = query.in("platform_role", ["super_admin", "admin"]);
    }

    const { data, count, error } = await query
      .order(sortBy, { ascending: sortOrder === "asc" })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    // Get team count for each user
    const usersWithTeamCounts = await Promise.all(
      (data || []).map(async (user: Record<string, unknown>) => {
        const { count: teamCount } = await client
          .from("team_members")
          .select("*", { count: "exact", head: true })
          .eq("user_id", user.id);
        return { ...user, teamCount: teamCount || 0 };
      })
    );

    return NextResponse.json({
      success: true,
      data: usersWithTeamCounts,
      pagination: { page, limit, total: count || 0, totalPages: Math.ceil((count || 0) / limit) },
    });
  } catch (error) {
    if (error instanceof Response) return error;
    if (error && typeof error === 'object' && 'status' in error) {
      return NextResponse.json({ error: "unauthorized" }, { status: (error as { status: number }).status });
    }
    console.error("获取用户列表失败:", error);
    return NextResponse.json({ success: false, error: "获取用户列表失败" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireAdmin(request);
    const body = await request.json();
    const client = getSupabaseClient();

    const { userId, platformRole } = body;

    const { error } = await client
      .from("users")
      .update({ platform_role: platformRole, updated_at: new Date().toISOString() })
      .eq("id", userId);

    if (error) throw error;

    return NextResponse.json({ success: true, data: { id: userId, platformRole } });
  } catch (error) {
    if (error instanceof Response) return error;
    if (error && typeof error === 'object' && 'status' in error) {
      return NextResponse.json({ error: "unauthorized" }, { status: (error as { status: number }).status });
    }
    console.error("更新用户角色失败:", error);
    return NextResponse.json({ success: false, error: "更新用户角色失败" }, { status: 500 });
  }
}