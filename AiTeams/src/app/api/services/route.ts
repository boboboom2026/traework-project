import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";

// GET /api/services - 获取服务列表
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const teamId = searchParams.get("teamId");

    if (!teamId) {
      return NextResponse.json({ success: false, error: "团队ID不能为空" }, { status: 400 });
    }

    const client = getSupabaseClient();
    const { data: services, error } = await client
      .from("mcp_services")
      .select("*")
      .eq("team_id", teamId)
      .eq("status", "active")
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    // 计数组件工具数
    const servicesWithCount = await Promise.all(
      (services || []).map(async (svc: { id: string }) => {
        const { count } = await client
          .from("tools")
          .select("*", { count: "exact", head: true })
          .eq("mcp_service_id", svc.id)
          .eq("enabled", true);

        return {
          ...svc,
          toolCount: count || 0,
        };
      })
    );

    return NextResponse.json({ success: true, data: servicesWithCount });
  } catch (error) {
    return NextResponse.json({ success: false, error: "获取服务列表失败" }, { status: 500 });
  }
}

// POST /api/services - 创建服务
export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const body = await request.json();
    const teamId = body.teamId || searchParams.get("teamId");
    const name = body.name;
    const endpoint_url = body.endpointUrl || body.endpoint_url || "";
    const description = body.description || "";
    const config = body.config || {};

    if (!teamId || !name || !endpoint_url) {
      return NextResponse.json({ success: false, error: "团队ID、服务名称和端点URL为必填项" }, { status: 400 });
    }

    const client = getSupabaseClient();
    const { data: service, error } = await client
      .from("mcp_services")
      .insert({
        team_id: teamId,
        name,
        description: description || "",
        endpoint_url,
        config: config || {},
        allowed_operations: [],
        status: "active",
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: service });
  } catch (error) {
    return NextResponse.json({ success: false, error: "创建服务失败" }, { status: 500 });
  }
}

// PUT /api/services - 更新服务
export async function PUT(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const body = await request.json();
    const id = body.id || searchParams.get("id");
    const teamId = body.teamId || searchParams.get("teamId");
    const endpoint_url = body.endpointUrl || body.endpoint_url;
    const { name, description, config } = body;

    if (!id || !teamId) {
      return NextResponse.json({ success: false, error: "服务ID和团队ID为必填项" }, { status: 400 });
    }

    const client = getSupabaseClient();
    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (endpoint_url !== undefined) updateData.endpoint_url = endpoint_url;
    if (config !== undefined) updateData.config = config;

    const { data: service, error } = await client
      .from("mcp_services")
      .update(updateData)
      .eq("id", id)
      .eq("team_id", teamId)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: service });
  } catch (error) {
    return NextResponse.json({ success: false, error: "更新服务失败" }, { status: 500 });
  }
}

// DELETE /api/services - 删除服务
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    let id = searchParams.get("id");
    let teamId = searchParams.get("teamId");
    
    // Also try to read from body
    try {
      const body = await request.json();
      if (!id) id = body.id;
      if (!teamId) teamId = body.teamId;
    } catch { /* ignore body parse error */ }

    if (!id || !teamId) {
      return NextResponse.json({ success: false, error: "服务ID和团队ID为必填项" }, { status: 400 });
    }

    const client = getSupabaseClient();
    const { error } = await client
      .from("mcp_services")
      .update({ status: "deleted", updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("team_id", teamId);

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ success: false, error: "删除服务失败" }, { status: 500 });
  }
}