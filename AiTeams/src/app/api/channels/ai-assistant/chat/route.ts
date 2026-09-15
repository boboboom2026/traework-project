import { DEFAULT_LLM_MODEL } from "@/lib/llm/models";
import { NextRequest } from "next/server";
import { streamChat, type NativeMessage } from "@/lib/llm/native-client";
import { getSupabaseClient } from "@/storage/database/supabase-client";

export const runtime = "nodejs";

// 固定的频道AI助手身份
const ASSISTANT_NAME = "频道AI助手";
const ASSISTANT_SYSTEM_PROMPT = `你是一个专门的"频道AI助手"，职责是协助团队频道的用户分析讨论内容、提取信息、总结要点。

你的核心能力：
1. 频道内容总结 —— 概括频道近期的讨论主题、关键结论和待办事项
2. 信息检索 —— 帮助用户找到频道中讨论过的内容
3. 待办提取 —— 从讨论中提取行动项和决策
4. 话题分析 —— 分析讨论趋势、参与人员等

你的回答风格：
- 简洁、有条理，使用结构化格式（列表、标题等）
- 基于频道实际内容回答，不臆测
- 如果用户的问题与频道内容无关，礼貌引导回频道相关话题
- 回答中适当使用emoji让内容更易读`;

export async function POST(request: NextRequest) {
  try {
    const { channelId, teamId, messages } = await request.json();

    if (!channelId || !teamId || !messages) {
      return new Response(
        "data: " + JSON.stringify({ error: "参数不完整" }) + "\n\n",
        { headers: { "Content-Type": "text/event-stream" }, status: 400 }
      );
    }

    const client = getSupabaseClient();

    // 1. 获取频道信息（名称、团队）
    const { data: channelInfo } = await client
      .from("channels")
      .select("id, name, team_id")
      .eq("id", channelId)
      .single();

    const channelName = (channelInfo as { name?: string } | null)?.name || "";

    // 2. 获取频道上下文（最近消息）
    const { data: recentMessages, error: recentError } = await client
      .from("channel_messages")
      .select("id, content, sender_type, sender_id, created_at, attachments")
      .eq("channel_id", channelId)
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(30);

    if (recentError) {
      console.error("获取频道消息失败:", recentError);
    }

    // 2. 构建频道上下文文本
    let channelContext = "";
    if (recentMessages && recentMessages.length > 0) {
      const msgs = (recentMessages as Array<Record<string, unknown>>).reverse();

      // 获取发送者名称映射
      const senderIds = new Set<string>();
      for (const msg of msgs) {
        if (msg.sender_id) senderIds.add(msg.sender_id as string);
      }

      const agentIds = Array.from(senderIds).filter(id =>
        msgs.some(m => m.sender_type === "agent" && m.sender_id === id)
      );
      const userNames: Record<string, string> = {};
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

      const userIds = Array.from(senderIds).filter(id =>
        msgs.some(m => (m.sender_type === "user" || !m.sender_type) && m.sender_id === id)
      );
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

      channelContext = msgs.map((m) => {
        const senderName = m.sender_type === "agent"
          ? (userNames[m.sender_id as string] || "AI")
          : (userNames[m.sender_id as string] || "用户");
        const time = m.created_at ? new Date(m.created_at as string).toLocaleString("zh-CN") : "";
        const content = m.content || "";
        const attachments = m.attachments as Array<{ type: string; name: string }> | null;
        const attachMark = attachments && attachments.length > 0
          ? ` [附件: ${attachments.map(a => a.name).join(", ")}]`
          : "";
        return `[${time}] ${senderName}: ${content}${attachMark}`;
      }).join("\n");
    }

    // 3. 构建 LLM 消息
    const systemMessage: { role: "system" | "user" | "assistant"; content: string } = {
      role: "system",
      content: `${ASSISTANT_SYSTEM_PROMPT}

当前频道「${channelName || channelId}」的最新讨论内容（从旧到新）：
${channelContext || "暂无频道消息"}

请基于以上频道上下文回答用户的问题。`,
    };

    const historyMessages: Array<{ role: "system" | "user" | "assistant"; content: string }> = messages.map((m: { role: string; content: string }) => ({
      role: m.role === "system" ? "system" : m.role === "assistant" ? "assistant" : "user",
      content: m.content,
    }));

    const llmMessages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [systemMessage, ...historyMessages];

    // 4. 创建 SSE 流式响应（原生 LLM 客户端）
    const encoder = new TextEncoder();

    const readableStream = new ReadableStream({
      async start(controller) {
        function sendSSE(data: Record<string, unknown>) {
          controller.enqueue(encoder.encode("data: " + JSON.stringify(data) + "\n\n"));
        }

        try {
          for await (const ev of streamChat({
            messages: llmMessages as unknown as NativeMessage[],
            model: DEFAULT_LLM_MODEL,
            temperature: 0.7,
          })) {
            if (ev.type === "text" && ev.content) {
              sendSSE({ content: ev.content });
            }
          }
          sendSSE({ content: "" });
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        } catch (error) {
          console.error("频道AI助手流式输出错误:", error);
          sendSSE({ error: "AI响应异常，请重试" });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(readableStream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    console.error("频道AI助手对话错误:", error);
    return new Response(
      "data: " + JSON.stringify({ error: "服务器错误" }) + "\n\n",
      { headers: { "Content-Type": "text/event-stream" }, status: 500 }
    );
  }
}