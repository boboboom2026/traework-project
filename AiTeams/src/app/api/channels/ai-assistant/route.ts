import { DEFAULT_LLM_MODEL } from "@/lib/llm/models";
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";

const ASSISTANT_NAME = "频道AI助手";

// 获取团队频道AI助手配置（通过频道ID获取团队ID后查询）
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const channelId = searchParams.get("channelId");
    const teamId = searchParams.get("teamId");

    if (!channelId && !teamId) {
      return NextResponse.json({ error: "缺少channelId或teamId参数" }, { status: 400 });
    }

    const client = getSupabaseClient();

    let targetTeamId = teamId;

    // 如果只有channelId，先查频道获取teamId
    if (!targetTeamId && channelId) {
      const { data: channel } = await client
        .from("channels")
        .select("team_id")
        .eq("id", channelId)
        .single();
      if (channel) {
        targetTeamId = (channel as { team_id: string }).team_id;
      }
    }

    if (!targetTeamId) {
      return NextResponse.json({ success: false, config: null });
    }

    // 查询团队级频道AI助手配置
    const { data: config } = await client
      .from("channel_ai_assistant_config")
      .select("*")
      .eq("team_id", targetTeamId)
      .single();

    if (!config) {
      return NextResponse.json({
        success: true,
        config: {
          aiAssistantEnabled: true,
          aiAssistantName: ASSISTANT_NAME,
          greeting: "你好！我是频道AI助手，有什么可以帮助你的？",
          userGuidance: "请输入你的需求，例如：帮我总结一下今天的讨论...",
        },
      });
    }

    const c = config as Record<string, unknown>;

    return NextResponse.json({
      success: true,
      config: {
        aiAssistantEnabled: c.enabled ?? true,
        aiAssistantName: c.name || ASSISTANT_NAME,
        greeting: c.greeting || "",
        userGuidance: c.user_guidance || "",
      },
    });
  } catch (error) {
    console.error("获取AI助手配置错误:", error);
    return NextResponse.json({ success: false, error: "服务器错误" }, { status: 500 });
  }
}

// 保存频道AI助手配置（兼容旧接口，重定向到团队级配置）
export async function PUT(request: NextRequest) {
  try {
    const { channelId, aiAssistantEnabled, aiAssistantId } = await request.json();

    if (!channelId) {
      return NextResponse.json({ error: "缺少channelId参数" }, { status: 400 });
    }

    const client = getSupabaseClient();

    // 获取频道所属团队
    const { data: channel } = await client
      .from("channels")
      .select("team_id")
      .eq("id", channelId)
      .single();

    if (!channel) {
      return NextResponse.json({ error: "频道不存在" }, { status: 404 });
    }

    const teamId = (channel as { team_id: string }).team_id;

    // 更新团队级配置
    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (aiAssistantEnabled !== undefined) updateData.enabled = aiAssistantEnabled;
    // aiAssistantId 参数不再使用，所有频道共享同一个助手

    const { error } = await client
      .from("channel_ai_assistant_config")
      .upsert({ team_id: teamId, ...updateData }, { onConflict: "team_id" });

    if (error) {
      console.error("保存AI助手配置失败:", error);
      return NextResponse.json({ error: "保存失败" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("保存AI助手配置错误:", error);
    return NextResponse.json({ success: false, error: "服务器错误" }, { status: 500 });
  }
}

// 当频道有新消息时，判断是否被 @频道AI助手，如果是则生成回复
export async function POST(request: NextRequest) {
  try {
    const { channelId, messageId, teamId, content } = await request.json();

    if (!channelId || !messageId || !teamId) {
      return NextResponse.json({ error: "参数不完整" }, { status: 400 });
    }

    const client = getSupabaseClient();

    // 1. 获取团队频道AI助手配置
    const { data: config } = await client
      .from("channel_ai_assistant_config")
      .select("*")
      .eq("team_id", teamId)
      .single();

    if (!config) {
      return NextResponse.json({ success: false, reason: "频道AI助手未配置" });
    }

    const aiConfig = config as Record<string, unknown>;
    if (!aiConfig.enabled) {
      return NextResponse.json({ success: false, reason: "频道AI助手已禁用" });
    }

    const assistantName = (aiConfig.name as string) || ASSISTANT_NAME;
    const systemPrompt = (aiConfig.system_prompt as string) || "";
    const modelConfig = (aiConfig.model_config as { model: string; temperature: number; maxTokens: number }) || { model: DEFAULT_LLM_MODEL, temperature: 0.7, maxTokens: 2000 };

    // 2. 获取当前消息内容，判断是否 @了频道AI助手
    // 如果前端传了content就用，否则从数据库查
    let messageContent = content || "";
    if (!messageContent) {
      const { data: msg } = await client
        .from("channel_messages")
        .select("content")
        .eq("id", messageId)
        .single();
      if (msg) {
        messageContent = (msg as { content: string }).content || "";
      }
    }

    // 检查是否 @了频道AI助手
    const mentionPattern = new RegExp(`@${assistantName}|@${ASSISTANT_NAME}`, "i");
    if (!mentionPattern.test(messageContent)) {
      return NextResponse.json({ success: true, participated: false, reason: "未提及频道AI助手" });
    }

    // 3. 获取最近的频道消息作为上下文
    const { data: recentMessages, error: recentError } = await client
      .from("channel_messages")
      .select("id, content, sender_type, created_at, sender_id")
      .eq("channel_id", channelId)
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(50);

    if (recentError) {
      console.error("获取频道消息失败:", recentError);
    }

    // 4. 构建消息历史
    const messages = (recentMessages || []).reverse();
    const senderIds = new Set<string>();
    for (const msg of messages) {
      if (msg.sender_id) senderIds.add(msg.sender_id as string);
    }

    const userNames: Record<string, string> = {};
    const agentIds = Array.from(senderIds).filter(id => messages.some(m => m.sender_type === "agent" && m.sender_id === id));
    if (agentIds.length > 0) {
      const { data: agents } = await client
        .from("agents")
        .select("id, name")
        .in("id", agentIds);
      if (agents) {
        for (const a of agents as Array<{ id: string; name: string }>) {
          userNames[a.id] = a.name;
        }
      }
    }

    const userIds = Array.from(senderIds).filter(id => messages.some(m => (m.sender_type === "user" || !m.sender_type) && m.sender_id === id));
    if (userIds.length > 0) {
      const { data: users } = await client
        .from("users")
        .select("id, name")
        .in("id", userIds);
      if (users) {
        for (const u of users as Array<{ id: string; name: string }>) {
          userNames[u.id] = u.name;
        }
      }
    }

    // 5. 构建消息历史文本
    const messageHistory = messages.map((m) => {
      const senderName = m.sender_type === "agent"
        ? (userNames[m.sender_id as string] || "AI")
        : (userNames[m.sender_id as string] || "用户");
      const time = m.created_at ? new Date(m.created_at as string).toLocaleString("zh-CN") : "";
      return `[${time}] ${senderName}: ${m.content || ""}`;
    }).join("\n");

    // 6. 构建回复Prompt
    const replyPrompt = `你是一个名为"${assistantName}"的AI助手，正在参与团队频道的讨论。

你的角色定位：
${systemPrompt}

当前频道的最新讨论内容如下（从旧到新）：
${messageHistory}

用户的最新消息提到了你，请根据对话历史和你的角色定位，生成合适的回复。
回复要简洁、专业、有条理，使用 Markdown 格式。

请直接输出你的回复内容，不要输出JSON或其他格式。`;

    // 7. 调用LLM生成回复
    const { LLMClient, Config } = await import("@/lib/sdk");
    const llmConfig = new Config();
    const llmClient = new LLMClient(llmConfig);

    // 使用流式返回
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          const result = await llmClient.invoke(
            [{ role: "system", content: replyPrompt }],
            {
              model: modelConfig.model || DEFAULT_LLM_MODEL,
              temperature: modelConfig.temperature ?? 0.7,
            }
          );

          const responseText = result.content || "";

          // 写入到频道消息
          const { data: newMessage, error: msgError } = await client
            .from("channel_messages")
            .insert({
              channel_id: channelId,
              sender_type: "agent",
              sender_id: "channel-ai-assistant",
              content: responseText,
              attachments: null,
              is_active: true,
              created_at: new Date().toISOString(),
            })
            .select()
            .single();

          if (msgError) {
            console.error("写入AI助手消息失败:", msgError);
            controller.enqueue(encoder.encode(JSON.stringify({ error: "写入消息失败" })));
          } else {
            // 发送WebSocket通知
            try {
              const wsUrl = `ws://localhost:${process.env.DEPLOY_RUN_PORT || 5000}/ws/channels`;
              const ws = new WebSocket(wsUrl);
              ws.onopen = () => {
                ws.send(JSON.stringify({ type: "new_message", channelId, message: newMessage }));
                ws.close();
              };
            } catch {
              // WebSocket通知非关键
            }
            controller.enqueue(encoder.encode(JSON.stringify({ message: newMessage, content: responseText })));
          }
        } catch (e) {
          console.error("AI助手生成回复失败:", e);
          controller.enqueue(encoder.encode(JSON.stringify({ error: "生成回复失败" })));
        }
        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    console.error("AI助手处理错误:", error);
    return NextResponse.json({ success: false, error: "服务器错误" }, { status: 500 });
  }
}