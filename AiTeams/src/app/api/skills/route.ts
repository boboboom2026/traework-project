import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";

// GET /api/skills - 获取技能列表
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const teamId = searchParams.get("teamId");
    const search = searchParams.get("search");
    const positionId = searchParams.get("positionId");

    if (!teamId) {
      return NextResponse.json({ error: "团队ID不能为空" }, { status: 400 });
    }

    const client = getSupabaseClient();

    let query = client
      .from("skills")
      .select("*")
      .eq("team_id", teamId)
      .order("created_at", { ascending: false });

    if (search) {
      query = query.or(`name.ilike.%${search}%,description.ilike.%${search}%`);
    }

    if (positionId) {
      query = query.eq("position_id", positionId);
    }

    const { data, error } = await query;

    if (error) {
      console.error("查询技能失败:", error);
      return NextResponse.json({ error: "查询技能失败" }, { status: 500 });
    }

    const skills = (data || []).map((d: Record<string, unknown>) => ({
      id: d.id,
      name: d.name,
      description: d.description || "",
      content: d.content || "",
      sourceType: d.source_type,
      sourceFile: d.source_file,
      version: d.version,
      isPublished: d.is_published,
      positionId: d.position_id,
      triggerCondition: d.trigger_condition || "",
      
      isExecutable: d.is_executable || false,
      createdAt: d.created_at,
      updatedAt: d.updated_at,
    }));

    return NextResponse.json({ success: true, skills });
  } catch (error) {
    console.error("获取技能列表错误:", error);
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}

// POST /api/skills - 创建技能
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { teamId, userId, name, description, content, sourceType, sourceFile, positionId, triggerCondition, isExecutable } = body;

    if (!teamId || !name?.trim()) {
      return NextResponse.json({ error: "团队ID和名称不能为空" }, { status: 400 });
    }

    const client = getSupabaseClient();

    const insertData: Record<string, unknown> = {
      team_id: teamId,
      user_id: userId || null,
      name: name.trim(),
      description: description?.trim() || null,
      content: content || "",
      source_type: sourceType || "manual",
      source_file: sourceFile || null,
      position_id: positionId || null,
      trigger_condition: triggerCondition || null,
      
      is_executable: isExecutable || false,
      version: 1,
      is_published: false,
    };

    const { data, error } = await client
      .from("skills")
      .insert(insertData)
      .select()
      .single();

    if (error) {
      console.error("创建技能失败:", error);
      return NextResponse.json({ error: "创建技能失败" }, { status: 500 });
    }

    return NextResponse.json({ 
      success: true, 
      skill: {
        id: data.id,
        name: data.name,
        description: data.description,
        content: data.content,
        sourceType: data.source_type,
        version: data.version,
        createdAt: data.created_at,
      }
    });
  } catch (error) {
    console.error("创建技能错误:", error);
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}

// PUT /api/skills - 更新技能
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, name, description, content, sourceType, sourceFile, positionId, triggerCondition, isExecutable, isPublished } = body;

    if (!id) {
      return NextResponse.json({ error: "技能ID不能为空" }, { status: 400 });
    }

    const client = getSupabaseClient();

    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (name !== undefined) updateData.name = name.trim();
    if (description !== undefined) updateData.description = description?.trim() || null;
    if (content !== undefined) updateData.content = content;
    if (sourceType !== undefined) updateData.source_type = sourceType;
    if (sourceFile !== undefined) updateData.source_file = sourceFile;
    if (positionId !== undefined) updateData.position_id = positionId;
    if (triggerCondition !== undefined) updateData.trigger_condition = triggerCondition;
    
    if (isExecutable !== undefined) updateData.is_executable = isExecutable;
    if (isPublished !== undefined) updateData.is_published = isPublished;

    const { data, error } = await client
      .from("skills")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.error("更新技能失败:", error);
      return NextResponse.json({ error: "更新技能失败" }, { status: 500 });
    }

    return NextResponse.json({ 
      success: true, 
      skill: {
        id: data.id,
        name: data.name,
        description: data.description,
        content: data.content,
        version: data.version,
        isPublished: data.is_published,
        updatedAt: data.updated_at,
      }
    });
  } catch (error) {
    console.error("更新技能错误:", error);
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}

// DELETE /api/skills - 删除技能
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "技能ID不能为空" }, { status: 400 });
    }

    const client = getSupabaseClient();

    const { error } = await client
      .from("skills")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("删除技能失败:", error);
      return NextResponse.json({ error: "删除技能失败" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("删除技能错误:", error);
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}
