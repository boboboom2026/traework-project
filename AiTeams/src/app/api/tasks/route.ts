import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";
import { requireAuth, resolveUserTeamId } from "@/lib/api-auth";
import type { WorkflowDefinitionV2 } from "@/lib/workflow/types";

// 空任务定义（编排放置占位）
function emptyDefinition(name: string): WorkflowDefinitionV2 {
  return { id: "", name, description: "", nodes: [], entry_node: "" };
}

// 轻量校验 definition 结构，避免写入非法编排
function normalizeDefinition(raw: unknown, name: string): WorkflowDefinitionV2 {
  if (raw && typeof raw === "object") {
    const def = raw as Partial<WorkflowDefinitionV2>;
    return {
      id: typeof def.id === "string" ? def.id : "",
      name: typeof def.name === "string" && def.name ? def.name : name,
      description: typeof def.description === "string" ? def.description : "",
      nodes: Array.isArray(def.nodes) ? def.nodes : [],
      entry_node: typeof def.entry_node === "string" ? def.entry_node : "",
    };
  }
  return emptyDefinition(name);
}

/**
 * 解析当前用户可操作的团队：
 * 优先使用请求显式传入的 teamId（会校验成员身份），否则取用户所属的第一个团队。
 */
async function resolveTeam(userId: string, explicitTeamId?: string | null) {
  const client = getSupabaseClient();
  const teamId = await resolveUserTeamId(client, userId, explicitTeamId);
  return { client, teamId };
}

// GET /api/tasks - 获取任务列表（或单条）
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    const { searchParams } = new URL(request.url);
    const requestedTeamId = searchParams.get("teamId");
    const { client, teamId } = await resolveTeam(auth.id, requestedTeamId);

    if (!teamId) {
      return NextResponse.json({ error: "未找到团队信息" }, { status: 400 });
    }

    const id = searchParams.get("id");
    const status = searchParams.get("status");

    if (id) {
      const { data, error } = await client
        .from("tasks")
        .select("*")
        .eq("id", id)
        .eq("team_id", teamId)
        .single();
      if (error) {
        return NextResponse.json({ error: "任务不存在" }, { status: 404 });
      }
      return NextResponse.json({ success: true, data });
    }

    let query = client
      .from("tasks")
      .select("*")
      .eq("team_id", teamId)
      .eq("is_active", true)
      .order("created_at", { ascending: false });

    if (status) {
      query = query.eq("status", status);
    }

    const { data, error } = await query;
    if (error) {
      console.error("获取任务列表失败:", error);
      return NextResponse.json({ error: "获取任务列表失败" }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: data || [] });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    console.error("获取任务列表失败:", e);
    return NextResponse.json({ error: "获取任务列表失败" }, { status: 500 });
  }
}

// POST /api/tasks - 创建任务定义
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    const body = await request.json().catch(() => ({}));
    const { name, description, trigger_condition, agent_id, definition, status, teamId: bodyTeamId } = body;

    const { client, teamId } = await resolveTeam(auth.id, bodyTeamId);
    if (!teamId) {
      return NextResponse.json({ error: "未找到团队信息" }, { status: 400 });
    }

    if (!name) {
      return NextResponse.json({ error: "任务名称为必填项" }, { status: 400 });
    }

    const def = normalizeDefinition(definition, name);

    const { data, error } = await client
      .from("tasks")
      .insert({
        team_id: teamId,
        name,
        description: description || "",
        trigger_condition: trigger_condition || "",
        agent_id: agent_id || null,
        definition: def,
        status: status === "active" || status === "archived" ? status : "draft",
        is_active: true,
      })
      .select()
      .single();

    if (error) {
      console.error("创建任务失败:", error);
      return NextResponse.json({ error: "创建任务失败" }, { status: 500 });
    }

    return NextResponse.json({ success: true, data });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    console.error("创建任务失败:", e);
    return NextResponse.json({ error: "创建任务失败" }, { status: 500 });
  }
}

// PUT /api/tasks - 更新任务定义
export async function PUT(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    const body = await request.json().catch(() => ({}));
    const { id, name, description, trigger_condition, agent_id, definition, status, teamId: bodyTeamId } = body;

    if (!id) {
      return NextResponse.json({ error: "缺少任务ID" }, { status: 400 });
    }

    const { client, teamId } = await resolveTeam(auth.id, bodyTeamId);
    if (!teamId) {
      return NextResponse.json({ error: "未找到团队信息" }, { status: 400 });
    }

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (name !== undefined) patch.name = name;
    if (description !== undefined) patch.description = description;
    if (trigger_condition !== undefined) patch.trigger_condition = trigger_condition;
    if (agent_id !== undefined) patch.agent_id = agent_id || null;
    if (status !== undefined) {
      patch.status = status === "active" || status === "archived" ? status : "draft";
    }
    if (definition !== undefined) {
      patch.definition = normalizeDefinition(definition, (patch.name as string) || "");
    }

    const { data, error } = await client
      .from("tasks")
      .update(patch)
      .eq("id", id)
      .eq("team_id", teamId)
      .select()
      .single();

    if (error) {
      console.error("更新任务失败:", error);
      return NextResponse.json({ error: "任务不存在或无权修改" }, { status: 404 });
    }

    return NextResponse.json({ success: true, data });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    console.error("更新任务失败:", e);
    return NextResponse.json({ error: "更新任务失败" }, { status: 500 });
  }
}

// DELETE /api/tasks - 软删除任务定义
export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    const requestedTeamId = searchParams.get("teamId");

    if (!id) {
      return NextResponse.json({ error: "缺少任务ID" }, { status: 400 });
    }

    const { client, teamId } = await resolveTeam(auth.id, requestedTeamId);
    if (!teamId) {
      return NextResponse.json({ error: "未找到团队信息" }, { status: 400 });
    }

    const { error } = await client
      .from("tasks")
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("team_id", teamId);

    if (error) {
      console.error("删除任务失败:", error);
      return NextResponse.json({ error: "删除任务失败" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    console.error("删除任务失败:", e);
    return NextResponse.json({ error: "删除任务失败" }, { status: 500 });
  }
}
