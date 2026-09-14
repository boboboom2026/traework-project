import { NextRequest, NextResponse } from "next/server";
import { LLMClient, Config, HeaderUtils } from "coze-coding-dev-sdk";
import { getSupabaseClient } from "@/storage/database/supabase-client";

// POST /api/channels/summary - 生成频道消息摘要
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { channelId } = body;

    if (!channelId) {
      return NextResponse.json({ error: "频道ID不能为空" }, { status: 400 });
    }

    const client = getSupabaseClient();

    // 获取频道信息
    const { data: channelData } = await client
      .from("channels")
      .select("name, type")
      .eq("id", channelId)
      .single();
    const channelName = (channelData as { name?: string } | null)?.name || "未命名频道";

    // 获取最近 50 条消息（按时间降序，取最新的）
    const { data: messages } = await client
      .from("channel_messages")
      .select("id, sender_id, content, attachments, created_at, sender_type")
      .eq("channel_id", channelId)
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(50);

    if (!messages || messages.length === 0) {
      return NextResponse.json({
        success: true,
        summary: { topics: [], actions: [], keyPeople: [], isEmpty: true },
      });
    }

    // 批量查询用户信息（只查非智能体的消息发送者）
    const senderIds = [
      ...new Set(
        (messages as Array<{ sender_id: string; sender_type: string | null }>)
          .filter((m) => !m.sender_type || m.sender_type === "user")
          .map((m) => m.sender_id)
      ),
    ];

    let userMap: Record<string, string> = {};
    if (senderIds.length > 0) {
      const { data: users } = await client
        .from("users")
        .select("id, name")
        .in("id", senderIds);
      if (users) {
        for (const u of users as Array<{ id: string; name: string }>) {
          userMap[u.id] = u.name;
        }
      }
    }

    // 组装消息文本（按时间正序排列）
    const sortedMessages = [...(messages as Array<{
      content: string | null;
      sender_id: string;
      sender_type: string | null;
      created_at: string;
    }>)].reverse();

    const messageText = sortedMessages
      .map((m) => {
        const sender = m.sender_type === "agent" ? "AI智能体" : (userMap[m.sender_id] || "未知用户");
        const time = new Date(m.created_at).toLocaleString("zh-CN", {
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        });
        const content = m.content || "(无文本内容)";
        return `[${time}] ${sender}: ${content}`;
      })
      .join("\n");

    // 调用 LLM 生成摘要
    const customHeaders = HeaderUtils.extractForwardHeaders(request.headers);
    const config = new Config();
    const llmClient = new LLMClient(config, customHeaders);

    const systemPrompt = `你是一个企业协作频道的AI助手，擅长分析团队对话并生成结构化摘要。
请分析以下频道消息，输出结构化的 JSON 摘要，包含以下字段：

- topics: 核心话题列表（2-3条），每条包含 title（话题标题）和 desc（简要描述）
- actions: 待办/决策项列表，每条包含 content（事项描述）和 type（"decision" 或 "todo"）
- keyPeople: 涉及的关键人列表，每条包含 name（人名）和 context（在讨论中的角色或贡献）
- overall: 一句话总结频道近期讨论的整体情况

注意：只输出 JSON，不要输出其他文字。JSON 格式如下：
{
  "topics": [{ "title": "", "desc": "" }],
  "actions": [{ "content": "", "type": "decision|todo" }],
  "keyPeople": [{ "name": "", "context": "" }],
  "overall": ""
}`;

    const userPrompt = `频道名称：${channelName}
消息数：${sortedMessages.length}
消息内容：
${messageText}`;

    const response = await llmClient.invoke(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      {
        model: "doubao-seed-2-0-lite-260215",
        temperature: 0.3,
      }
    );

    let summary;
    try {
      summary = JSON.parse(response.content);
    } catch {
      // 如果解析失败，尝试提取 JSON 块
      const jsonMatch = response.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        summary = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("无法解析 LLM 输出");
      }
    }

    return NextResponse.json({
      success: true,
      summary: {
        ...summary,
        isEmpty: false,
        channelName,
        messageCount: sortedMessages.length,
      },
    });
  } catch (error) {
    console.error("生成频道摘要失败:", error);
    return NextResponse.json({ error: "生成频道摘要失败" }, { status: 500 });
  }
}