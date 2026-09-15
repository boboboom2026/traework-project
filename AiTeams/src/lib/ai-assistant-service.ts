import { getSupabaseClient } from "@/storage/database/supabase-client";
import { streamChat, toNativeTools, type NativeMessage, type NativeToolCall } from "@/lib/llm/native-client";

const ASSISTANT_NAME = "频道AI助手";

interface ChannelMessage {
  content: string;
  sender_id: string;
  sender_type?: string;
  created_at: string;
  attachments?: unknown[];
}

// ---------------------------------------------------------------------------
// 内置工具（原生 function calling）
// ---------------------------------------------------------------------------

/** get_current_time 实现 */
async function getCurrentTime(): Promise<string> {
  const now = new Date();
  const beijing = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const year = beijing.getUTCFullYear();
  const month = String(beijing.getUTCMonth() + 1).padStart(2, "0");
  const day = String(beijing.getUTCDate()).padStart(2, "0");
  const weekdays = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];
  const weekday = weekdays[beijing.getUTCDay()];
  const hours = String(beijing.getUTCHours()).padStart(2, "0");
  const minutes = String(beijing.getUTCMinutes()).padStart(2, "0");
  const seconds = String(beijing.getUTCSeconds()).padStart(2, "0");
  return `当前时间：${year}年${month}月${day}日 ${weekday} ${hours}:${minutes}:${seconds}（北京时间，UTC+8）`;
}

/** web_search 实现 */
async function webSearch(query: string, count: number, timeRange?: string): Promise<string> {
  const { SearchClient, Config } = await import("@/lib/sdk");
  const config = new Config();
  const searchClient = new SearchClient(config);
  let response;
  if (timeRange) {
    response = await searchClient.advancedSearch(query, { count: count || 10, timeRange, needSummary: true });
  } else {
    response = await searchClient.webSearch(query, count || 10, true);
  }
  const summary = response.summary || "";
  const items = response.web_items || [];
  const results = items.slice(0, 10).map((r: any, i: number) =>
    `[${i + 1}] ${r.title}\n${r.url}\n${r.snippet || (r.content || "").substring(0, 200) || ""}`
  ).join("\n\n");
  return `${summary ? `摘要：${summary}\n\n` : ""}搜索结果：\n${results}`;
}

/** 原生工具定义 */
const builtinTools = [
  {
    name: "get_current_time",
    description: "获取当前日期和时间（北京时间，UTC+8）。当你需要知道当前时间、日期、星期时使用。",
    parameters: { type: "object", properties: {}, required: [] as string[] },
  },
  {
    name: "web_search",
    description: "搜索互联网信息，获取最新资讯、实时动态或你不了解的知识。适用场景：最新新闻、时效性信息、外部资料查询。",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "搜索关键词" },
        count: { type: "number", description: "返回结果数量，默认10" },
        time_range: { type: "string", description: "时间范围，可选值：1d/1w/1m，用于限定搜索时间窗" },
      },
      required: ["query"],
    },
  },
];

/**
 * 执行原生工具调用，返回文本结果。
 */
async function executeTool(name: string, args: Record<string, unknown>): Promise<string> {
  if (name === "get_current_time") {
    return getCurrentTime();
  }
  if (name === "web_search") {
    return webSearch(args.query as string, (args.count as number) || 10, args.time_range as string | undefined);
  }
  return `工具"${name}"暂不支持`;
}

/**
 * 频道AI助手触发逻辑
 * 1. 查询团队级 channel_ai_assistant_config
 * 2. 检查最新消息是否 @了频道AI助手
 * 3. 如果是，调用 LLM 生成回复（支持原生工具调用）+ 写入频道消息
 */
export async function triggerAiAssistant(channelId: string, messageContent?: string) {
  try {
    const supabase = getSupabaseClient();

    // 1. 获取频道信息
    const { data: channel } = await supabase
      .from("channels")
      .select("name, team_id")
      .eq("id", channelId)
      .single();

    if (!channel) return;
    const channelName = (channel as { name?: string }).name || "";
    const teamId = (channel as { team_id: string }).team_id;

    // 2. 查询团队级频道AI助手配置
    const { data: config } = await supabase
      .from("channel_ai_assistant_config")
      .select("*")
      .eq("team_id", teamId)
      .single();

    if (!config) return;

    const aiConfig = config as Record<string, unknown>;
    if (!aiConfig.enabled) return; // 已禁用

    const assistantName = (aiConfig.name as string) || ASSISTANT_NAME;
    const systemPrompt = (aiConfig.system_prompt as string) || "";
    const modelConfig = (aiConfig.model_config as { model: string; temperature: number; maxTokens: number }) || { model: "doubao-seed-2-0-pro-260215", temperature: 0.7, maxTokens: 2000 };

    // 3. 获取最新消息，判断是否 @了频道AI助手
    if (!messageContent) {
      const { data: latestMsg } = await supabase
        .from("channel_messages")
        .select("content")
        .eq("channel_id", channelId)
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (!latestMsg) return;
      messageContent = (latestMsg as { content: string }).content || "";
    }

    // 检查是否 @了频道AI助手
    const mentionPattern = new RegExp(`@${assistantName}|@${ASSISTANT_NAME}`, "i");
    if (!mentionPattern.test(messageContent)) {
      return; // 未提及，不参与
    }

    // 4. 获取最近消息作为上下文
    const { data: messages } = await supabase
      .from("channel_messages")
      .select("content, sender_id, sender_type, created_at, attachments")
      .eq("channel_id", channelId)
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(50);

    const recentMessages = (messages as ChannelMessage[] || []).reverse();

    // 5. 获取发送者名称
    const userIds = new Set<string>();
    const agentIds = new Set<string>();
    for (const msg of recentMessages) {
      if (msg.sender_type === "agent") {
        agentIds.add(msg.sender_id);
      } else {
        userIds.add(msg.sender_id);
      }
    }

    const { data: users } = await supabase
      .from("users")
      .select("id, name")
      .in("id", Array.from(userIds));

    const userMap = new Map<string, string>();
    if (users) {
      for (const u of users) {
        userMap.set(u.id, u.name);
      }
    }

    const { data: agents } = await supabase
      .from("agents")
      .select("id, name")
      .in("id", Array.from(agentIds));

    const agentMap = new Map<string, string>();
    if (agents) {
      for (const a of agents) {
        agentMap.set(a.id, a.name);
      }
    }

    function getSenderName(msg: ChannelMessage): string {
      if (msg.sender_type === "agent") {
        return agentMap.get(msg.sender_id) || "AI 助手";
      }
      return userMap.get(msg.sender_id) || "未知用户";
    }

    // 6. 构建消息上下文
    const messageContext = recentMessages.map((msg) => {
      const senderName = getSenderName(msg);
      const attachments = msg.attachments || [];
      const attachmentInfo = attachments.length > 0 ? ` [附件: ${attachments.length}个]` : "";
      return `${senderName}: ${msg.content}${attachmentInfo}`;
    }).join("\n");

    // 7. 构建系统 Prompt（工具定义交给原生 tools 参数，不再注入文本标签协议）
    const systemMessage = `你是一个名为"${assistantName}"的AI助手，正在参与团队频道的讨论。

你的角色定位：
${systemPrompt}

## 当前日期和时间
当前系统日期和时间（北京时间）：${new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })}

## 工具使用
当用户需要实时信息、最新动态、或查询你不了解的知识时，你可以通过调用工具获取信息。工具会在需要时自动触发，你只需自然地在回复中请求信息即可。

## 当前频道讨论内容（从旧到新）
${channelName ? `频道名称：${channelName}\n` : ""}${messageContext}

用户的最新消息提到了你，请根据对话历史和你的角色定位，生成合适的回复。
回复要简洁、专业、有条理，使用 Markdown 格式。

## 文档输出规则
当你输出结构化的知识文档（报告、方案、评估、教程、分析等）时，请使用 Markdown 格式，第一行用 # 或 ## 标题开头，正文使用 Markdown 语法组织。普通对话回复不需要此结构。`;

    // 8. 调用 LLM 生成回复（原生 function calling 工具循环）
    const model = modelConfig.model || "doubao-seed-2-0-pro-260215";
    const temperature = modelConfig.temperature ?? 0.7;

    const nativeTools = toNativeTools(builtinTools);
    const llmMessages: NativeMessage[] = [{ role: "system", content: systemMessage }];

    let finalResponse = "";
    let round = 0;
    const MAX_ROUNDS = 3;

    while (round < MAX_ROUNDS) {
      round++;
      let content = "";
      let toolCalls: NativeToolCall[] = [];
      for await (const ev of streamChat({ messages: llmMessages, model, temperature, tools: nativeTools })) {
        if (ev.type === "done") {
          content = ev.content || "";
          toolCalls = ev.toolCalls || [];
        }
      }

      // 保存 assistant 消息（含 tool_calls，供原生协议回传）
      const assistantMsg: NativeMessage = { role: "assistant", content: content || null };
      if (toolCalls.length > 0) {
        assistantMsg.tool_calls = toolCalls;
      }
      llmMessages.push(assistantMsg);

      if (toolCalls.length === 0) {
        finalResponse = content;
        break; // 无工具调用，结束
      }

      // 执行工具调用，结果以 role:"tool" 回传
      for (const tc of toolCalls) {
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(tc.function.arguments || "{}");
        } catch {
          args = {};
        }
        console.log(`[AI Assistant] 调用工具: ${tc.function.name}`);
        const toolResult = await executeTool(tc.function.name, args);
        llmMessages.push({ role: "tool", tool_call_id: tc.id, content: toolResult });
      }
    }

    if (!finalResponse) return;

    // 9. 写入频道消息
    const { error: insertError } = await supabase.from("channel_messages").insert({
      channel_id: channelId,
      sender_id: "channel-ai-assistant",
      content: finalResponse,
      sender_type: "agent",
      is_active: true,
      created_at: new Date().toISOString(),
    });

    if (insertError) {
      console.error("[AI Assistant] 发送消息失败:", insertError);
    } else {
      console.log(`[AI Assistant] ${assistantName} 在频道 ${channelId} 中回复了@提及`);
    }
  } catch (error) {
    console.error("[AI Assistant] 执行出错:", error);
  }
}