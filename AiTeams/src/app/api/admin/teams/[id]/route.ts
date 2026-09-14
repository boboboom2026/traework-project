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

    const { data: team, error } = await client
      .from("teams")
      .select(`*, owner:users!teams_owner_id_users_id_fk(id, name, phone, avatar)`)
      .eq("id", id)
      .single();

    if (error || !team) {
      return NextResponse.json({ success: false, error: "团队不存在" }, { status: 404 });
    }

    // Get members
    const { data: members } = await client
      .from("team_members")
      .select(`*, user:users(id, name, phone, avatar, email, is_active, platform_role, created_at)`)
      .eq("team_id", id);

    // Get agent count
    const { count: agentCount } = await client
      .from("agents")
      .select("*", { count: "exact", head: true })
      .eq("team_id", id);

    return NextResponse.json({
      success: true,
      data: {
        ...team,
        members: members || [],
        memberCount: members?.length || 0,
        agentCount: agentCount || 0,
      },
    });
  } catch (error) {
    if (error instanceof Response) return error;
    if (error && typeof error === 'object' && 'status' in error) {
      return NextResponse.json({ error: "unauthorized" }, { status: (error as { status: number }).status });
    }
    console.error("获取团队详情失败:", error);
    return NextResponse.json({ success: false, error: "获取团队详情失败" }, { status: 500 });
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
    if (body.name !== undefined) updates.name = body.name;
    updates.updated_at = new Date().toISOString();

    const { error } = await client.from("teams").update(updates).eq("id", id);

    if (error) throw error;

    return NextResponse.json({ success: true, data: { id, ...updates } });
  } catch (error) {
    if (error instanceof Response) return error;
    if (error && typeof error === 'object' && 'status' in error) {
      return NextResponse.json({ error: "unauthorized" }, { status: (error as { status: number }).status });
    }
    console.error("更新团队失败:", error);
    return NextResponse.json({ success: false, error: "更新团队失败" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin(request);
    const { id } = await params;
    const client = getSupabaseClient();

    // Soft delete: mark as inactive
    const { error } = await client
      .from("teams")
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq("id", id);

    if (error) throw error;

    return NextResponse.json({ success: true, data: { id, deleted: true } });
  } catch (error) {
    if (error instanceof Response) return error;
    if (error && typeof error === 'object' && 'status' in error) {
      return NextResponse.json({ error: "unauthorized" }, { status: (error as { status: number }).status });
    }
    console.error("删除团队失败:", error);
    return NextResponse.json({ success: false, error: "删除团队失败" }, { status: 500 });
  }
}