import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";

// 获取团队部门列表（树形结构）
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const teamId = searchParams.get("teamId");

    if (!teamId) {
      return NextResponse.json({ error: "团队ID不能为空" }, { status: 400 });
    }

    const client = getSupabaseClient();

    const { data, error } = await client
      .from("departments")
      .select("*")
      .eq("team_id", teamId)
      .order("sort_order", { ascending: true });

    if (error) {
      console.error("查询部门失败:", error);
      return NextResponse.json({ error: "查询失败" }, { status: 500 });
    }

    // 构建树形结构
    const departments = data || [];
    const tree = buildTree(departments);

    return NextResponse.json({
      success: true,
      departments,
      tree,
    });
  } catch (error) {
    console.error("获取部门列表错误:", error);
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}

// 新增部门
export async function POST(request: NextRequest) {
  try {
    const { teamId, name, parentId, sortOrder } = await request.json();

    if (!teamId || !name) {
      return NextResponse.json({ error: "团队ID和部门名称不能为空" }, { status: 400 });
    }

    const client = getSupabaseClient();

    const { data, error } = await client
      .from("departments")
      .insert({
        team_id: teamId,
        name: name.trim(),
        parent_id: parentId || null,
        sort_order: sortOrder || 0,
      })
      .select()
      .single();

    if (error) {
      console.error("创建部门失败:", error);
      return NextResponse.json({ error: "创建失败" }, { status: 500 });
    }

    return NextResponse.json({ success: true, department: data });
  } catch (error) {
    console.error("创建部门错误:", error);
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}

// 编辑部门
export async function PUT(request: NextRequest) {
  try {
    const { id, name, parentId, sortOrder } = await request.json();

    if (!id || !name) {
      return NextResponse.json({ error: "部门ID和名称不能为空" }, { status: 400 });
    }

    // 防止将部门设为自己的子部门
    if (parentId === id) {
      return NextResponse.json({ error: "不能将部门设为自身的子部门" }, { status: 400 });
    }

    const client = getSupabaseClient();

    const updateData: Record<string, unknown> = {
      name: name.trim(),
      updated_at: new Date().toISOString(),
    };
    if (parentId !== undefined) {
      updateData.parent_id = parentId || null;
    }
    if (sortOrder !== undefined) {
      updateData.sort_order = sortOrder;
    }

    const { data, error } = await client
      .from("departments")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.error("更新部门失败:", error);
      return NextResponse.json({ error: "更新失败" }, { status: 500 });
    }

    return NextResponse.json({ success: true, department: data });
  } catch (error) {
    console.error("更新部门错误:", error);
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}

// 删除部门
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "部门ID不能为空" }, { status: 400 });
    }

    const client = getSupabaseClient();

    // 检查是否有子部门
    const { data: children } = await client
      .from("departments")
      .select("id")
      .eq("parent_id", id);

    if (children && children.length > 0) {
      // 子部门将被级联删除，先获取子部门信息返回给前端
    }

    const { error } = await client
      .from("departments")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("删除部门失败:", error);
      return NextResponse.json({ error: "删除失败" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("删除部门错误:", error);
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}

// 构建树形结构
interface DepartmentRow {
  id: string;
  team_id: string;
  name: string;
  parent_id: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string | null;
}

interface DepartmentNode {
  id: string;
  name: string;
  parentId: string | null;
  sortOrder: number;
  children: DepartmentNode[];
}

function buildTree(departments: DepartmentRow[]): DepartmentNode[] {
  const map = new Map<string, DepartmentNode>();
  const roots: DepartmentNode[] = [];

  // 先创建所有节点
  for (const dept of departments) {
    map.set(dept.id, {
      id: dept.id,
      name: dept.name,
      parentId: dept.parent_id,
      sortOrder: dept.sort_order,
      children: [],
    });
  }

  // 建立父子关系
  for (const dept of departments) {
    const node = map.get(dept.id)!;
    if (dept.parent_id && map.has(dept.parent_id)) {
      map.get(dept.parent_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}
