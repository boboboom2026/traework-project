import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";

// GET /api/tools/bindings - 获取智能体绑定的工具
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const agentId = searchParams.get("agentId");

    if (!agentId) {
      return NextResponse.json({ error: "智能体ID不能为空" }, { status: 400 });
    }

    const client = getSupabaseClient();

    const { data, error } = await client
      .from("agent_tool_bindings")
      .select(`
        id,
        config,
        created_at,
        tools (
          id,
          name,
          description,
          icon,
          category,
          parameters,
          action,
          enabled
        )
      `)
      .eq("agent_id", agentId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, bindings: data || [] });
  } catch (error) {
    console.error("获取工具绑定失败:", error);
    return NextResponse.json({ error: "获取工具绑定失败" }, { status: 500 });
  }
}

// POST /api/tools/bindings - 绑定工具到智能体
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { agentId, toolId, config } = body;

    if (!agentId || !toolId) {
      return NextResponse.json({ error: "智能体ID和工具ID不能为空" }, { status: 400 });
    }

    const client = getSupabaseClient();

    // 检查是否已绑定
    const { data: existing } = await client
      .from("agent_tool_bindings")
      .select("id")
      .eq("agent_id", agentId)
      .eq("tool_id", toolId)
      .single();

    if (existing) {
      return NextResponse.json({ error: "该工具已绑定到此智能体" }, { status: 400 });
    }

    const { data, error } = await client
      .from("agent_tool_bindings")
      .insert({
        agent_id: agentId,
        tool_id: toolId,
        config: config || {},
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, binding: data });
  } catch (error) {
    console.error("绑定工具失败:", error);
    return NextResponse.json({ error: "绑定工具失败" }, { status: 500 });
  }
}

// DELETE /api/tools/bindings - 解绑工具
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    const agentId = searchParams.get("agentId");
    const toolId = searchParams.get("toolId");

    const client = getSupabaseClient();

    let query = client.from("agent_tool_bindings").delete();

    if (id) {
      query = query.eq("id", id);
    } else if (agentId && toolId) {
      query = query.eq("agent_id", agentId).eq("tool_id", toolId);
    } else {
      return NextResponse.json({ error: "缺少参数" }, { status: 400 });
    }

    const { error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("解绑工具失败:", error);
    return NextResponse.json({ error: "解绑工具失败" }, { status: 500 });
  }
}
