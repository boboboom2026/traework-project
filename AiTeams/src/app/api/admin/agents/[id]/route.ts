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

    const { data: agent, error } = await client
      .from("agents")
      .select(`*, team:teams(id, name)`)
      .eq("id", id)
      .single();

    if (error || !agent) {
      return NextResponse.json({ success: false, error: "智能体不存在" }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: agent });
  } catch (error) {
    if (error instanceof Response) return error;
    if (error && typeof error === 'object' && 'status' in error) {
      return NextResponse.json({ error: "unauthorized" }, { status: (error as { status: number }).status });
    }
    console.error("获取智能体详情失败:", error);
    return NextResponse.json({ success: false, error: "获取智能体详情失败" }, { status: 500 });
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
    if (body.status !== undefined) updates.status = body.status;
    updates.updated_at = new Date().toISOString();

    const { error } = await client.from("agents").update(updates).eq("id", id);

    if (error) throw error;

    return NextResponse.json({ success: true, data: { id, ...updates } });
  } catch (error) {
    if (error instanceof Response) return error;
    if (error && typeof error === 'object' && 'status' in error) {
      return NextResponse.json({ error: "unauthorized" }, { status: (error as { status: number }).status });
    }
    console.error("更新智能体失败:", error);
    return NextResponse.json({ success: false, error: "更新智能体失败" }, { status: 500 });
  }
}