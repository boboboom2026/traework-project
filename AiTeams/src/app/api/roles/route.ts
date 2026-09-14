import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";

type Role = {
  id: string;
  team_id: string;
  name: string;
  description: string | null;
  responsibilities: string | null;
  sort_order: number;
  status: string;
  created_by: string | null;
  created_at: string;
  updated_at: string | null;
};

// GET /api/roles?teamId=xxx - 获取角色列表
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const teamId = searchParams.get("teamId");
  const search = searchParams.get("search");

  if (!teamId) {
    return NextResponse.json({ error: "teamId不能为空" }, { status: 400 });
  }

  const client = getSupabaseClient();

  // 获取角色列表
  let query = client
    .from("roles")
    .select("*")
    .eq("team_id", teamId)
    .eq("status", "active")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });

  if (search) {
    query = query.or(`name.ilike.%${search}%,description.ilike.%${search}%`);
  }

  const { data: roles, error } = await query;

  if (error) {
    return NextResponse.json({ error: "获取角色列表失败" }, { status: 500 });
  }

  const roleList = (roles || []) as Role[];

  // 获取每个角色绑定的Agent数量
  const roleIds = roleList.map((r: Role) => r.id);
  const { data: agentCounts } = await client
    .from("agents")
    .select("role_id")
    .in("role_id", roleIds.length > 0 ? roleIds : ["none"])
    .eq("is_active", true);

  const agentCountMap = new Map<string, number>();
  if (agentCounts) {
    for (const row of agentCounts) {
      const rid = row.role_id as string;
      agentCountMap.set(rid, (agentCountMap.get(rid) || 0) + 1);
    }
  }

  return NextResponse.json({
    success: true,
    roles: roleList.map((r: Role) => ({
      ...r,
      agentCount: agentCountMap.get(r.id) || 0,
    })),
  });
}

// POST /api/roles - 创建角色
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { teamId, name, description, responsibilities, createdBy } = body;

  if (!teamId || !name) {
    return NextResponse.json({ error: "teamId和name不能为空" }, { status: 400 });
  }

  const client = getSupabaseClient();

  // 创建角色
  const { data: role, error: roleError } = await client
    .from("roles")
    .insert({
      team_id: teamId,
      name,
      description: description || null,
      responsibilities: responsibilities || null,
      created_by: createdBy || null,
    })
    .select()
    .single();

  if (roleError) {
    return NextResponse.json({ error: "创建角色失败: " + roleError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, role });
}

// PUT /api/roles - 更新角色
export async function PUT(request: NextRequest) {
  const body = await request.json();
  const { id, name, description, responsibilities, sort_order } = body;

  if (!id) {
    return NextResponse.json({ error: "id不能为空" }, { status: 400 });
  }

  const client = getSupabaseClient();

  const updateData: Record<string, unknown> = {};
  if (name !== undefined) updateData.name = name;
  if (description !== undefined) updateData.description = description;
  if (responsibilities !== undefined) updateData.responsibilities = responsibilities;
  if (sort_order !== undefined) updateData.sort_order = sort_order;
  updateData.updated_at = new Date().toISOString();

  const { error: roleError } = await client
    .from("roles")
    .update(updateData)
    .eq("id", id);

  if (roleError) {
    return NextResponse.json({ error: "更新角色失败: " + roleError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

// DELETE /api/roles?id=xxx - 删除角色
export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "id不能为空" }, { status: 400 });
  }

  const client = getSupabaseClient();

  // 软删除 - 标记为inactive
  const { error } = await client
    .from("roles")
    .update({ status: "inactive", updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: "删除角色失败: " + error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}