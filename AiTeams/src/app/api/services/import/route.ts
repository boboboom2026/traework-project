import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";
import {
  parseOpenAPISchema,
  endpointToToolDefinition,
  fetchOpenAPISchema,
} from "@/lib/openapi-parser";

// POST /api/services/import - 导入 OpenAPI 文档并解析
export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const teamId = searchParams.get("teamId");
    if (!teamId) {
      return NextResponse.json({ success: false, error: "缺少团队ID" }, { status: 400 });
    }

    const body = await request.json();
    const { serviceId, openapiUrl, openapiContent } = body;

    if (!serviceId) {
      return NextResponse.json({ success: false, error: "服务ID为必填项" }, { status: 400 });
    }

    const client = getSupabaseClient();

    const { data: service, error: serviceError } = await client
      .from("mcp_services")
      .select("*")
      .eq("id", serviceId)
      .eq("team_id", teamId)
      .single();

    if (serviceError || !service) {
      return NextResponse.json({ success: false, error: "服务不存在" }, { status: 404 });
    }

    let rawSchema: string;

    if (openapiContent) {
      rawSchema = openapiContent;
    } else if (openapiUrl) {
      try {
        rawSchema = await fetchOpenAPISchema(openapiUrl);
      } catch (fetchError) {
        return NextResponse.json({
          success: false,
          error: `获取 OpenAPI 文档失败: ${fetchError instanceof Error ? fetchError.message : "未知错误"}`,
        }, { status: 400 });
      }
    } else {
      return NextResponse.json({
        success: false,
        error: "请提供 OpenAPI 文档 URL 或内容",
      }, { status: 400 });
    }

    let parsed;
    try {
      parsed = parseOpenAPISchema(rawSchema);
    } catch (parseError) {
      return NextResponse.json({
        success: false,
        error: `解析 OpenAPI 文档失败: ${parseError instanceof Error ? parseError.message : "格式错误"}`,
      }, { status: 400 });
    }

    const currentConfig = (service.config as Record<string, unknown>) || {};
    const updatedConfig = {
      ...currentConfig,
      openapi_url: openapiUrl || (currentConfig.openapi_url as string),
      openapi_schema: JSON.parse(rawSchema),
    };

    await client
      .from("mcp_services")
      .update({
        config: updatedConfig,
        updated_at: new Date().toISOString(),
      })
      .eq("id", serviceId);

    const endpoints = parsed.endpoints.map((ep) => ({
      ...ep,
      toolDefinition: endpointToToolDefinition(ep, serviceId, parsed.baseUrl),
    }));

    return NextResponse.json({
      success: true,
      data: {
        title: parsed.title,
        version: parsed.version,
        description: parsed.description,
        baseUrl: parsed.baseUrl,
        totalEndpoints: endpoints.length,
        endpoints,
      },
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: `导入失败: ${error instanceof Error ? error.message : "未知错误"}`,
    }, { status: 500 });
  }
}

// PUT /api/services/import - 批量创建工具
export async function PUT(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const teamId = searchParams.get("teamId");
    if (!teamId) {
      return NextResponse.json({ success: false, error: "缺少团队ID" }, { status: 400 });
    }

    const body = await request.json();
    const { serviceId, endpoints } = body;

    if (!serviceId || !endpoints || !Array.isArray(endpoints) || endpoints.length === 0) {
      return NextResponse.json({ success: false, error: "请至少选择一个端点" }, { status: 400 });
    }

    const client = getSupabaseClient();

    const { data: service, error: serviceError } = await client
      .from("mcp_services")
      .select("*")
      .eq("id", serviceId)
      .eq("team_id", teamId)
      .single();

    if (serviceError || !service) {
      return NextResponse.json({ success: false, error: "服务不存在" }, { status: 404 });
    }

    const created: string[] = [];
    const skipped: string[] = [];
    const errors: string[] = [];

    for (const ep of endpoints) {
      const toolDef = ep.toolDefinition;
      if (!toolDef) continue;

      try {
        const { data: existing } = await client
          .from("tools")
          .select("id")
          .eq("action", toolDef.action)
          .eq("team_id", teamId)
          .maybeSingle();

        if (existing) {
          skipped.push(toolDef.name);
          continue;
        }

        const { error: insertError } = await client.from("tools").insert({
          team_id: teamId,
          name: toolDef.name,
          description: toolDef.description,
          action: toolDef.action,
          tool_type: toolDef.tool_type,
          mcp_service_id: serviceId,
          parameters: toolDef.parameters,
          config: toolDef.config,
          enabled: true,
        });

        if (insertError) {
          errors.push(`${toolDef.name}: ${insertError.message}`);
        } else {
          created.push(toolDef.name);
        }
      } catch (err) {
        errors.push(`${toolDef.name}: ${err instanceof Error ? err.message : "未知错误"}`);
      }
    }

    return NextResponse.json({
      success: true,
      data: { created, skipped, errors, total: created.length },
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: `批量创建工具失败: ${error instanceof Error ? error.message : "未知错误"}`,
    }, { status: 500 });
  }
}