import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";

// 获取群组列表
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const teamId = searchParams.get("teamId");
    const search = searchParams.get("search");
    const page = parseInt(searchParams.get("page") || "1");
    const pageSize = parseInt(searchParams.get("pageSize") || "10");

    if (!teamId) {
      return NextResponse.json({ error: "团队ID不能为空" }, { status: 400 });
    }

    const client = getSupabaseClient();

    // 构建查询 - 获取活跃群组
    let query = client
      .from("groups")
      .select("id, name, description, creator_id, is_active, created_at, updated_at", { count: "exact" })
      .eq("team_id", teamId)
      .eq("is_active", true)
      .order("created_at", { ascending: false });

    if (search) {
      query = query.ilike("name", `%${search}%`);
    }

    // 分页
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    query = query.range(from, to);

    const { data: groupsData, error: groupsError, count } = await query;

    if (groupsError) {
      console.error("查询群组失败:", groupsError);
      return NextResponse.json({ error: "查询群组失败" }, { status: 500 });
    }

    if (!groupsData || groupsData.length === 0) {
      return NextResponse.json({
        success: true,
        groups: [],
        total: count || 0,
        page,
        pageSize,
      });
    }

    // 获取每个群组的成员数
    const groupIds = groupsData.map((g: { id: string }) => g.id);
    const { data: memberCounts } = await client
      .from("group_members")
      .select("group_id")
      .in("group_id", groupIds);

    // 统计每个群组的成员数
    const countMap: Record<string, number> = {};
    if (memberCounts) {
      for (const m of memberCounts) {
        const gid = m.group_id as string;
        countMap[gid] = (countMap[gid] || 0) + 1;
      }
    }

    // 获取创建人信息
    const creatorIds = [...new Set(groupsData.map((g: { creator_id: string }) => g.creator_id))];
    const { data: creatorsData } = await client
      .from("users")
      .select("id, name")
      .in("id", creatorIds);

    const creatorMap: Record<string, string> = {};
    if (creatorsData) {
      for (const c of creatorsData) {
        creatorMap[c.id as string] = c.name as string;
      }
    }

    const groups = groupsData.map((g: { id: string; name: string; description: string | null; creator_id: string; is_active: boolean; created_at: string; updated_at: string | null }) => ({
      id: g.id,
      name: g.name,
      description: g.description || "",
      creatorId: g.creator_id,
      creatorName: creatorMap[g.creator_id] || "",
      memberCount: countMap[g.id] || 0,
      isActive: g.is_active,
      createdAt: g.created_at,
      updatedAt: g.updated_at,
    }));

    return NextResponse.json({
      success: true,
      groups,
      total: count || 0,
      page,
      pageSize,
    });
  } catch (error) {
    console.error("获取群组列表错误:", error);
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}

// 创建群组
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { teamId, name, description, memberIds } = body;

    if (!teamId || !name?.trim()) {
      return NextResponse.json({ error: "团队ID和群组名称不能为空" }, { status: 400 });
    }

    const client = getSupabaseClient();

    // 创建群组
    const { data: groupData, error: groupError } = await client
      .from("groups")
      .insert({
        team_id: teamId,
        name: name.trim(),
        description: description?.trim() || null,
        creator_id: body.creatorId,
        is_active: true,
      })
      .select("id, name, description, creator_id, created_at")
      .single();

    if (groupError) {
      console.error("创建群组失败:", groupError);
      return NextResponse.json({ error: "创建群组失败" }, { status: 500 });
    }

    // 添加成员
    if (memberIds && memberIds.length > 0 && groupData) {
      const members = memberIds.map((userId: string) => ({
        group_id: groupData.id,
        user_id: userId,
      }));

      const { error: memberError } = await client
        .from("group_members")
        .insert(members);

      if (memberError) {
        console.error("添加群组成员失败:", memberError);
        // 不回滚群组创建，但返回警告
      }
    }

    return NextResponse.json({
      success: true,
      group: groupData,
    });
  } catch (error) {
    console.error("创建群组错误:", error);
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}

// 更新群组
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, name, description } = body;

    if (!id || !name?.trim()) {
      return NextResponse.json({ error: "群组ID和名称不能为空" }, { status: 400 });
    }

    const client = getSupabaseClient();

    const { data, error } = await client
      .from("groups")
      .update({
        name: name.trim(),
        description: description?.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select("id, name, description")
      .single();

    if (error) {
      console.error("更新群组失败:", error);
      return NextResponse.json({ error: "更新群组失败" }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      group: data,
    });
  } catch (error) {
    console.error("更新群组错误:", error);
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}

// 解散/注销群组
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "群组ID不能为空" }, { status: 400 });
    }

    const client = getSupabaseClient();

    // 软删除 - 标记为不活跃
    const { error } = await client
      .from("groups")
      .update({
        is_active: false,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (error) {
      console.error("解散群组失败:", error);
      return NextResponse.json({ error: "解散群组失败" }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
    });
  } catch (error) {
    console.error("解散群组错误:", error);
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}
