import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";

export const dynamic = "force-dynamic";

/**
 * 获取智能体通知配置
 * GET /api/agents/notify-config?agentId=xxx
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const agentId = searchParams.get("agentId");

    if (!agentId) {
      return NextResponse.json({ error: "智能体ID不能为空" }, { status: 400 });
    }

    const client = getSupabaseClient();

    const { data: agent, error } = await client
      .from("agents")
      .select("id, name, notify_enabled, notify_config, team_id")
      .eq("id", agentId)
      .eq("status", "active")
      .single();

    if (error || !agent) {
      return NextResponse.json({ error: "智能体不存在" }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      notifyEnabled: agent.notify_enabled,
      notifyConfig: agent.notify_config || {},
    });
  } catch (error) {
    console.error("获取通知配置错误:", error);
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}

/**
 * 更新智能体通知配置
 * PUT /api/agents/notify-config
 * Body: { agentId, notifyEnabled, notifyConfig }
 */
export async function PUT(request: NextRequest) {
  try {
    const { agentId, notifyEnabled, notifyConfig } = await request.json();

    if (!agentId) {
      return NextResponse.json({ error: "智能体ID不能为空" }, { status: 400 });
    }

    // 校验 notifyConfig 格式
    const validatedConfig: Record<string, unknown> = {};

    if (notifyConfig) {
      // channels: 应为字符串数组
      if (Array.isArray(notifyConfig.channels)) {
        validatedConfig.channels = notifyConfig.channels.filter((c: unknown) => typeof c === "string");
      }

      // users: 应为字符串数组
      if (Array.isArray(notifyConfig.users)) {
        validatedConfig.users = notifyConfig.users.filter((u: unknown) => typeof u === "string");
      }

      // webhook_secret: 应为字符串
      if (typeof notifyConfig.webhook_secret === "string") {
        validatedConfig.webhook_secret = notifyConfig.webhook_secret;
      }

      // template: 应为字符串
      if (typeof notifyConfig.template === "string") {
        validatedConfig.template = notifyConfig.template;
      }

      // quiet_hours: 应为 { start, end } 格式
      if (notifyConfig.quiet_hours && typeof notifyConfig.quiet_hours === "object") {
        const qh = notifyConfig.quiet_hours as { start?: string; end?: string };
        if (qh.start && qh.end) {
          validatedConfig.quiet_hours = { start: qh.start, end: qh.end };
        }
      }
    }

    const client = getSupabaseClient();

    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (notifyEnabled !== undefined) {
      updateData.notify_enabled = notifyEnabled;
    }
    if (Object.keys(validatedConfig).length > 0) {
      updateData.notify_config = validatedConfig;
    }

    const { data, error } = await client
      .from("agents")
      .update(updateData)
      .eq("id", agentId)
      .select("id, name, notify_enabled, notify_config")
      .single();

    if (error) {
      console.error("更新通知配置失败:", error);
      return NextResponse.json({ error: "更新通知配置失败" }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      notifyEnabled: data.notify_enabled,
      notifyConfig: data.notify_config,
    });
  } catch (error) {
    console.error("更新通知配置错误:", error);
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}
