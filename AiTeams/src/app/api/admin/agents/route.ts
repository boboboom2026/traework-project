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
    const filter = url.searchParams.get("filter") || ""; // pending, active, inactive
    const offset = (page - 1) * limit;

    const client = getSupabaseClient();

    let query = client
      .from("agents")
      .select(`*, team:teams(id, name)`, { count: "exact" });

    if (search) {
      query = query.or(`name.ilike.%${search}%,description.ilike.%${search}%`);
    }

    if (filter === "pending") {
      query = query.eq("status", "pending");
    } else if (filter === "active") {
      query = query.eq("status", "active");
    } else if (filter === "inactive") {
      query = query.eq("status", "inactive");
    }

    const { data, count, error } = await query
      .order(sortBy, { ascending: sortOrder === "asc" })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    return NextResponse.json({
      success: true,
      data: data || [],
      pagination: { page, limit, total: count || 0, totalPages: Math.ceil((count || 0) / limit) },
    });
  } catch (error) {
    if (error instanceof Response) return error;
    if (error && typeof error === 'object' && 'status' in error) {
      return NextResponse.json({ error: "unauthorized" }, { status: (error as { status: number }).status });
    }
    console.error("获取智能体列表失败:", error);
    return NextResponse.json({ success: false, error: "获取智能体列表失败" }, { status: 500 });
  }
}