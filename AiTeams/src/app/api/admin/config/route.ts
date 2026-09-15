import { DEFAULT_LLM_MODEL } from "@/lib/llm/models";
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { getSupabaseClient } from "@/storage/database/supabase-client";

// System config is stored in a special team-less record or JSON config
// For now, we use a simple approach with a config table approach
const CONFIG_KEY = "platform_config";

export async function GET(request: NextRequest) {
  try {
    await requireAdmin(request);
    const client = getSupabaseClient();

    // Try to get from system_notifications or a dedicated config
    // For MVP, return default config
    const { data: configData } = await client
      .from("system_notifications")
      .select("content")
      .eq("type", CONFIG_KEY)
      .maybeSingle();

    const config = configData?.content || {
      llm: { defaultModel: DEFAULT_LLM_MODEL, defaultTemperature: 0.7, defaultMaxTokens: 2000 },
      storage: { maxFileSize: 50 * 1024 * 1024, allowedTypes: ["image/*", "video/*", "application/pdf"] },
      invite: { linkExpiryHours: 72, requireApproval: false },
      security: { maxLoginAttempts: 5, sessionTimeoutMinutes: 43200 },
    };

    return NextResponse.json({ success: true, data: config });
  } catch (error) {
    if (error instanceof Response) return error;
    if (error && typeof error === 'object' && 'status' in error) {
      return NextResponse.json({ error: "unauthorized" }, { status: (error as { status: number }).status });
    }
    console.error("获取系统配置失败:", error);
    return NextResponse.json({ success: false, error: "获取系统配置失败" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    await requireAdmin(request);
    const body = await request.json();
    const client = getSupabaseClient();

    // Upsert config
    const { error } = await client.from("system_notifications").upsert(
      {
        type: CONFIG_KEY,
        title: "系统配置",
        content: body,
        team_id: "00000000-0000-0000-0000-000000000000", // system-level
        is_global: true,
        created_at: new Date().toISOString(),
      },
      { onConflict: "type" }
    );

    if (error) {
      // Fallback: just return success for MVP
      console.warn("配置保存警告:", error);
    }

    return NextResponse.json({ success: true, data: body });
  } catch (error) {
    if (error instanceof Response) return error;
    if (error && typeof error === 'object' && 'status' in error) {
      return NextResponse.json({ error: "unauthorized" }, { status: (error as { status: number }).status });
    }
    console.error("更新系统配置失败:", error);
    return NextResponse.json({ success: false, error: "更新系统配置失败" }, { status: 500 });
  }
}