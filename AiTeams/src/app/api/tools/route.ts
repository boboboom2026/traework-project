import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";

// 预置的工具动作类型（包含参数说明）
const BUILTIN_ACTIONS = [
  { 
    action: "send_message", 
    name: "发送消息", 
    category: "message", 
    description: "给团队成员发送私信",
    parameters: {
      recipient: "接收者姓名或手机号（必填，支持按名字搜索）",
      content: "消息内容（必填）",
    }
  },
  { 
    action: "search_member", 
    name: "搜索成员", 
    category: "query", 
    description: "搜索团队成员",
    parameters: {
      keyword: "搜索关键词",
      team_id: "团队ID（必填）",
    }
  },
  { 
    action: "list_members", 
    name: "列出成员", 
    category: "query", 
    description: "获取团队成员列表",
    parameters: {
      team_id: "团队ID（必填）",
      page: "页码（默认1）",
      page_size: "每页数量（默认20）",
    }
  },
  { 
    action: "create_channel", 
    name: "创建频道", 
    category: "operation", 
    description: "创建新的频道",
    parameters: {
      name: "频道名称（必填）",
      team_id: "团队ID（必填）",
      description: "频道描述",
      is_private: "是否私密（默认false）",
      created_by: "创建者用户ID",
    }
  },
  { 
    action: "create_group", 
    name: "创建群组", 
    category: "operation", 
    description: "创建新的群组",
    parameters: {
      name: "群组名称（必填）",
      team_id: "团队ID（必填）",
      description: "群组描述",
      member_ids: "成员ID数组",
      created_by: "创建者用户ID",
    }
  },
  { 
    action: "search_channel", 
    name: "搜索频道", 
    category: "query", 
    description: "搜索频道",
    parameters: {
      keyword: "搜索关键词",
      team_id: "团队ID（必填）",
    }
  },
  { 
    action: "get_channel", 
    name: "获取频道", 
    category: "query", 
    description: "获取频道详情",
    parameters: {
      channel_id: "频道ID（必填）",
    }
  },
  { 
    action: "query_knowledge", 
    name: "查询知识库", 
    category: "query", 
    description: "从RAG知识库检索信息",
    parameters: {
      query: "查询内容（必填）",
      team_id: "团队ID（必填）",
      top_k: "返回数量（默认5）",
    }
  },
  { 
    action: "generate_document", 
    name: "生成文档", 
    category: "document", 
    description: "生成PRD、方案或分析报告",
    parameters: {
      type: "文档类型: prd/spec/report（默认prd）",
      title: "文档标题",
      sections: "自定义内容sections对象",
    }
  },
  { 
    action: "get_current_time", 
    name: "获取当前时间", 
    category: "system", 
    description: "获取当前日期时间",
    parameters: {}
  },
];

// GET /api/tools - 获取工具列表
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const teamId = searchParams.get("teamId");
    const agentId = searchParams.get("agentId");
    const category = searchParams.get("category");
    const builtin = searchParams.get("builtin");

    if (!teamId) {
      return NextResponse.json({ error: "团队ID不能为空" }, { status: 400 });
    }

    const client = getSupabaseClient();

    // 如果查询智能体关联的工具
    if (agentId) {
      const { data: bindings } = await client
        .from("agent_tool_bindings")
        .select(`
          id,
          created_at,
          tools!inner (
            id,
            name,
            description,
            category,
            parameters,
            action,
            enabled,
            is_builtin
          )
        `)
        .eq("agent_id", agentId);

      const tools = (bindings || []).map((b: Record<string, unknown>) => {
        const tool = b.tools as Record<string, unknown>;
        return {
          bindingId: b.id,
          createdAt: b.created_at,
          ...tool,
        };
      });

      return NextResponse.json({ success: true, tools });
    }

    // 查询团队工具
    let query = client
      .from("tools")
      .select("*")
      .eq("team_id", teamId)
      .order("created_at", { ascending: false });

    if (category) {
      query = query.eq("category", category);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ 
      success: true, 
      tools: data || [],
      builtinActions: BUILTIN_ACTIONS,
    });
  } catch (error) {
    console.error("获取工具列表失败:", error);
    return NextResponse.json({ error: "获取工具列表失败" }, { status: 500 });
  }
}

// POST /api/tools - 创建工具
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { teamId, name, description, category, parameters, action, tool_type, config, enabled, createdBy } = body;

    if (!teamId || !name) {
      return NextResponse.json({ error: "团队ID和名称不能为空" }, { status: 400 });
    }

    // HTTP 工具自动生成 action 名
    const finalAction = action || `http_${name.replace(/\s+/g, "_").toLowerCase()}`;
    const finalToolType = tool_type || "http";

    if (finalToolType === "http") {
      const httpConfig = config || {};
      if (!httpConfig.url) {
        return NextResponse.json({ error: "HTTP工具的请求地址不能为空" }, { status: 400 });
      }
      // 确保 config 包含必要字段
      httpConfig.method = httpConfig.method || "GET";
      httpConfig.headers = httpConfig.headers || {};
      httpConfig.bodyTemplate = httpConfig.bodyTemplate || "";
    }

    const client = getSupabaseClient();

    const { data, error } = await client
      .from("tools")
      .insert({
        team_id: teamId,
        name,
        description: description || "",
        category: category || "custom",
        parameters: parameters || [],
        action: finalAction,
        tool_type: finalToolType,
        config: config || {},
        enabled: enabled !== false,
        is_builtin: false,
        created_by: createdBy || null,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, tool: data });
  } catch (error) {
    console.error("创建工具失败:", error);
    return NextResponse.json({ error: "创建工具失败" }, { status: 500 });
  }
}

// PUT /api/tools - 更新工具
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, name, description, category, parameters, action, tool_type, config, enabled } = body;

    if (!id) {
      return NextResponse.json({ error: "工具ID不能为空" }, { status: 400 });
    }

    const client = getSupabaseClient();

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (name !== undefined) updates.name = name;
    if (description !== undefined) updates.description = description;
    if (category !== undefined) updates.category = category;
    if (parameters !== undefined) updates.parameters = parameters;
    if (action !== undefined) updates.action = action;
    if (tool_type !== undefined) updates.tool_type = tool_type;
    if (config !== undefined) updates.config = config;
    if (enabled !== undefined) updates.enabled = enabled;

    const { data, error } = await client
      .from("tools")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, tool: data });
  } catch (error) {
    console.error("更新工具失败:", error);
    return NextResponse.json({ error: "更新工具失败" }, { status: 500 });
  }
}

// DELETE /api/tools - 删除工具
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "工具ID不能为空" }, { status: 400 });
    }

    const client = getSupabaseClient();

    // 检查是否为内置工具
    const { data: tool } = await client
      .from("tools")
      .select("is_builtin")
      .eq("id", id)
      .single();

    if (tool?.is_builtin) {
      return NextResponse.json({ error: "内置工具不能删除" }, { status: 400 });
    }

    const { error } = await client
      .from("tools")
      .delete()
      .eq("id", id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("删除工具失败:", error);
    return NextResponse.json({ error: "删除工具失败" }, { status: 500 });
  }
}
