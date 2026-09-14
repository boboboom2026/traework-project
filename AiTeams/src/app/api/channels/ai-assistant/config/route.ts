import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";

// 获取团队频道AI助手配置
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const teamId = searchParams.get("teamId");

    if (!teamId) {
      return NextResponse.json({ error: "缺少teamId参数" }, { status: 400 });
    }

    const client = getSupabaseClient();

    const { data, error } = await client
      .from("channel_ai_assistant_config")
      .select("*")
      .eq("team_id", teamId)
      .single();

    if (error && error.code !== "PGRST116") {
      console.error("获取频道AI助手配置失败:", error);
      return NextResponse.json({ error: "获取配置失败" }, { status: 500 });
    }

    if (!data) {
      // 返回默认配置
      return NextResponse.json({
        success: true,
        config: {
          teamId: teamId,
          name: "频道AI助手",
          systemPrompt: `你是一个专业的**频道AI助手**，负责协助团队进行频道内的日常沟通与协作。

## 核心身份
你是团队所有频道共享的AI助手，名称统一为"频道AI助手"。

## 行为规范
1. **被动响应**：你绝不主动在频道中发言。只有在以下情况才会回复：
   - 用户在频道消息中 @频道AI助手 或 @你
   - 用户在专属对话面板中与你对话
2. **回复风格**：简洁、专业、有条理。使用 Markdown 格式化。
3. **上下文感知**：充分利用频道历史消息作为上下文，保持回答的连贯性。
4. **能力边界**：如果你不确定或无法回答，诚实地告知用户，不要编造信息。

## 你可以帮助用户做的事情
- 总结频道讨论内容
- 回答关于团队协作的问题
- 提供创意建议和 brainstorming
- 协助撰写文档、文案
- 整理和分析信息
- 其他频道协作相关的帮助`,
          greeting: "你好！我是频道AI助手，有什么可以帮助你的？",
          userGuidance: "请输入你的需求，例如：帮我总结一下今天的讨论...",
          modelConfig: { model: "doubao-seed-2-0-pro-260215", temperature: 0.7, maxTokens: 2000 },
          enabled: true,
        },
      });
    }

    const d = data as Record<string, unknown>;

    return NextResponse.json({
      success: true,
      config: {
        teamId: d.team_id,
        name: d.name || "频道AI助手",
        systemPrompt: d.system_prompt || "",
        greeting: d.greeting || "",
        userGuidance: d.user_guidance || "",
        modelConfig: d.model_config || { model: "doubao-seed-2-0-pro-260215", temperature: 0.7, maxTokens: 2000 },
        enabled: d.enabled ?? true,
      },
    });
  } catch (error) {
    console.error("获取频道AI助手配置错误:", error);
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}

// 保存团队频道AI助手配置
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { teamId, name, systemPrompt, greeting, userGuidance, modelConfig, enabled } = body;

    if (!teamId) {
      return NextResponse.json({ error: "缺少teamId参数" }, { status: 400 });
    }

    const client = getSupabaseClient();

    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (name !== undefined) updateData.name = name;
    if (systemPrompt !== undefined) updateData.system_prompt = systemPrompt;
    if (greeting !== undefined) updateData.greeting = greeting;
    if (userGuidance !== undefined) updateData.user_guidance = userGuidance;
    if (modelConfig !== undefined) updateData.model_config = modelConfig;
    if (enabled !== undefined) updateData.enabled = enabled;

    const { error } = await client
      .from("channel_ai_assistant_config")
      .upsert({
        team_id: teamId,
        ...updateData,
      }, { onConflict: "team_id" });

    if (error) {
      console.error("保存频道AI助手配置失败:", error);
      return NextResponse.json({ error: "保存失败" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("保存频道AI助手配置错误:", error);
    return NextResponse.json({ success: false, error: "服务器错误" }, { status: 500 });
  }
}