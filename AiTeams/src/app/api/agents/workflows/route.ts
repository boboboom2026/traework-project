import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";

// 获取当前团队ID
async function getCurrentTeamId(client: ReturnType<typeof getSupabaseClient>): Promise<string | null> {
  const { data } = await client.from("team_members").select("team_id").limit(1).single();
  return data?.team_id || null;
}

// GET /api/agents/workflows - 获取工作流列表
export async function GET(request: NextRequest) {
  try {
    const client = getSupabaseClient();
    const teamId = await getCurrentTeamId(client);
    if (!teamId) {
      return NextResponse.json({ error: "未找到团队信息" }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    const agentId = searchParams.get("agent_id");
    const skillId = searchParams.get("skill_id");

    // 单条查询
    if (id) {
      const { data, error } = await client
        .from("agent_workflows")
        .select("*")
        .eq("id", id)
        .single();

      if (error) {
        return NextResponse.json({ error: "工作流不存在" }, { status: 404 });
      }

      // 查询关联的技能名称
      const { data: skill } = data.skill_id
        ? await client.from("skills").select("name").eq("id", data.skill_id).single()
        : { data: null };

      // 查询关联的智能体名称
      const { data: agent } = data.agent_id
        ? await client.from("agents").select("name").eq("id", data.agent_id).single()
        : { data: null };

      return NextResponse.json({
        success: true,
        data: { ...data, skill_name: skill?.name || null, agent_name: agent?.name || null },
      });
    }

    let query = client
      .from("agent_workflows")
      .select("*")
      .eq("team_id", teamId)
      .eq("is_active", true)
      .order("created_at", { ascending: false });

    if (agentId) {
      query = query.eq("agent_id", agentId);
    }
    if (skillId) {
      query = query.eq("skill_id", skillId);
    }

    const { data, error } = await query;

    if (error) {
      console.error("获取工作流列表失败:", error);
      return NextResponse.json({ error: "获取工作流列表失败" }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: data || [] });
  } catch (error) {
    console.error("获取工作流列表失败:", error);
    return NextResponse.json({ error: "获取工作流列表失败" }, { status: 500 });
  }
}

// POST /api/agents/workflows - 创建工作流
export async function POST(request: NextRequest) {
  try {
    const client = getSupabaseClient();
    const teamId = await getCurrentTeamId(client);
    if (!teamId) {
      return NextResponse.json({ error: "未找到团队信息" }, { status: 400 });
    }

    const body = await request.json();
    const { agent_id, skill_id, name, description, trigger_condition, steps } = body;

    if (!name || !steps) {
      return NextResponse.json({ error: "名称和步骤为必填项" }, { status: 400 });
    }

    const { data, error } = await client
      .from("agent_workflows")
      .insert({
        agent_id: agent_id || null,
        skill_id: skill_id || null,
        team_id: teamId,
        name,
        description: description || "",
        trigger_condition: trigger_condition || "",
        steps,
        is_active: true,
      })
      .select()
      .single();

    if (error) {
      console.error("创建工作流失败:", error);
      return NextResponse.json({ error: "创建工作流失败" }, { status: 500 });
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("创建工作流失败:", error);
    return NextResponse.json({ error: "创建工作流失败" }, { status: 500 });
  }
}

// PUT /api/agents/workflows - 更新工作流
export async function PUT(request: NextRequest) {
  try {
    const client = getSupabaseClient();
    const teamId = await getCurrentTeamId(client);
    if (!teamId) {
      return NextResponse.json({ error: "未找到团队信息" }, { status: 400 });
    }

    const body = await request.json();
    const { id, name, description, trigger_condition, steps, is_active } = body;

    if (!id) {
      return NextResponse.json({ error: "工作流ID为必填项" }, { status: 400 });
    }

    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (trigger_condition !== undefined) updateData.trigger_condition = trigger_condition;
    if (steps !== undefined) updateData.steps = steps;
    if (is_active !== undefined) updateData.is_active = is_active;

    const { data, error } = await client
      .from("agent_workflows")
      .update(updateData)
      .eq("id", id)
      .eq("team_id", teamId)
      .select()
      .single();

    if (error) {
      console.error("更新工作流失败:", error);
      return NextResponse.json({ error: "更新工作流失败" }, { status: 500 });
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("更新工作流失败:", error);
    return NextResponse.json({ error: "更新工作流失败" }, { status: 500 });
  }
}

// DELETE /api/agents/workflows - 删除工作流
export async function DELETE(request: NextRequest) {
  try {
    const client = getSupabaseClient();
    const teamId = await getCurrentTeamId(client);
    if (!teamId) {
      return NextResponse.json({ error: "未找到团队信息" }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "工作流ID为必填项" }, { status: 400 });
    }

    // 软删除
    const { error } = await client
      .from("agent_workflows")
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("team_id", teamId);

    if (error) {
      console.error("删除工作流失败:", error);
      return NextResponse.json({ error: "删除工作流失败" }, { status: 500 });
    }

    // 同时清除关联该工作流的 Agent 的 workflow_id
    await client
      .from("agents")
      .update({ workflow_id: null })
      .eq("workflow_id", id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("删除工作流失败:", error);
    return NextResponse.json({ error: "删除工作流失败" }, { status: 500 });
  }
}