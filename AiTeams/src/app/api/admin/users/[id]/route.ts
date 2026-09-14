import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { getSupabaseClient } from "@/storage/database/supabase-client";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin(request);
    const { id } = await params;
    const client = getSupabaseClient();

    const { data: user, error } = await client
      .from("users")
      .select("*")
      .eq("id", id)
      .single();

    if (error || !user) {
      return NextResponse.json({ success: false, error: "用户不存在" }, { status: 404 });
    }

    // Get user's teams
    const { data: memberships } = await client
      .from("team_members")
      .select(`role, joined_at, team:teams(id, name, type, logo)`)
      .eq("user_id", id);

    // Get recent login sessions
    const { data: sessions } = await client
      .from("sessions")
      .select("created_at, last_used_at, expires_at")
      .eq("user_id", id)
      .order("last_used_at", { ascending: false })
      .limit(10);

    return NextResponse.json({
      success: true,
      data: {
        ...user,
        teams: memberships || [],
        sessions: sessions || [],
      },
    });
  } catch (error) {
    if (error instanceof Response) return error;
    if (error && typeof error === 'object' && 'status' in error) {
      return NextResponse.json({ error: "unauthorized" }, { status: (error as { status: number }).status });
    }
    console.error("获取用户详情失败:", error);
    return NextResponse.json({ success: false, error: "获取用户详情失败" }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin(request);
    const { id } = await params;
    const body = await request.json();
    const client = getSupabaseClient();

    const updates: Record<string, unknown> = {};
    if (body.is_active !== undefined) updates.is_active = body.is_active;
    if (body.platform_role !== undefined) updates.platform_role = body.platform_role;
    updates.updated_at = new Date().toISOString();

    const { error } = await client.from("users").update(updates).eq("id", id);

    if (error) throw error;

    return NextResponse.json({ success: true, data: { id, ...updates } });
  } catch (error) {
    if (error instanceof Response) return error;
    if (error && typeof error === 'object' && 'status' in error) {
      return NextResponse.json({ error: "unauthorized" }, { status: (error as { status: number }).status });
    }
    console.error("更新用户失败:", error);
    return NextResponse.json({ success: false, error: "更新用户失败" }, { status: 500 });
  }
}