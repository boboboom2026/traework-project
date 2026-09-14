/**
 * 智能体频道上下文模块
 * 
 * 基于 Embedding 语义检索，为智能体调用注入频道历史上下文。
 * 支持多媒体内容处理：图片传 image_url、视频/文件传摘要或元数据。
 */

import { getSupabaseClient } from "@/storage/database/supabase-client";
import { EmbeddingClient, type ContentPart } from "@/lib/coze-compat";
import { batchGenerateSignedUrls } from "@/storage/database/shared/signed-url-cache";

// ============ 类型定义 ============

interface ChannelMessageRow {
  id: string;
  sender_id: string;
  sender_type?: string;
  content: string | null;
  attachments: Array<Record<string, unknown>> | null;
  attachment_summary: string | null;
  topic_tags: string[] | null;
  created_at: string;
  embedding?: number[] | null;
}

interface SenderInfo {
  name: string;
  avatar: string | null;
  isAgent: boolean;
}

interface ContextMessage {
  senderName: string;
  isAgent: boolean;
  textContent: string;
  imageAttachments: Array<{ key: string }>;
  otherAttachments: Array<{ type: string; name: string; summary?: string }>;
  createdAt: string;
}

// ============ 核心函数：构建频道上下文 ============

/**
 * 获取频道历史上下文（Embedding 语义检索 + 最近消息混合）
 * 
 * 策略：
 * 1. 将用户问题生成 Embedding
 * 2. 在频道消息中做 cosine similarity 搜索，取 top-K 语义相关消息
 * 3. 同时取最近 N 条消息
 * 4. 合并去重，按时间排序
 * 5. 格式化为 LLM 可消费的 Message[]
 */
export async function buildChannelContext(params: {
  channelId: string;
  teamId: string;
  userMessage: string;
  contextLimit: number;
  customHeaders: Record<string, string>;
}): Promise<{
  llmMessages: Array<{ role: "system" | "user" | "assistant"; content: string | ContentPart[] }>;
  contextText: string;
}> {
  const { channelId, teamId, userMessage, contextLimit, customHeaders } = params;
  const client = getSupabaseClient();

  // 1. 生成用户问题的 Embedding
  let queryEmbedding: number[] | null = null;
  try {
    const embeddingClient = new EmbeddingClient(undefined, customHeaders);
    queryEmbedding = await embeddingClient.embedText(userMessage, { dimensions: 1024 });
  } catch (err) {
    console.error("生成查询 Embedding 失败，将降级为仅最近消息模式:", err);
  }

  // 2. 语义检索 top-K 相关消息（如果有 embedding）
  const semanticMessageIds: Set<string> = new Set();
  const SEMANTIC_TOP_K = Math.min(10, Math.floor(contextLimit * 0.6)); // 60% 来自语义检索

  if (queryEmbedding) {
    try {
      const embeddingStr = `[${queryEmbedding.join(",")}]`;
      const { data: semanticResults } = await client.rpc("search_similar_messages", {
        query_embedding: embeddingStr,
        p_channel_id: channelId,
        match_limit: SEMANTIC_TOP_K,
        match_threshold: 0.3,
      });
      if (semanticResults && Array.isArray(semanticResults)) {
        for (const r of semanticResults) {
          if (r.id) semanticMessageIds.add(r.id);
        }
      }
    } catch (err) {
      console.error("语义检索失败，降级为仅最近消息模式:", err);
    }
  }

  // 3. 获取最近 N 条消息
  const { data: recentMsgs } = await client
    .from("channel_messages")
    .select("id, sender_id, sender_type, content, attachments, attachment_summary, topic_tags, created_at")
    .eq("channel_id", channelId)
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(contextLimit);

  const recentMsgIds = new Set((recentMsgs || []).map((m: { id: string }) => m.id));

  // 4. 获取语义检索到但不在最近消息中的消息
  let semanticOnlyMsgs: ChannelMessageRow[] = [];
  const missingIds = [...semanticMessageIds].filter(id => !recentMsgIds.has(id));
  if (missingIds.length > 0) {
    const { data: extraMsgs } = await client
      .from("channel_messages")
      .select("id, sender_id, sender_type, content, attachments, attachment_summary, topic_tags, created_at")
      .in("id", missingIds)
      .eq("is_active", true);
    semanticOnlyMsgs = (extraMsgs || []) as ChannelMessageRow[];
  }

  // 5. 合并去重
  const allMsgs = [...(recentMsgs || []), ...semanticOnlyMsgs] as ChannelMessageRow[];
  // 去重
  const seenIds = new Set<string>();
  const uniqueMsgs = allMsgs.filter(m => {
    if (seenIds.has(m.id)) return false;
    seenIds.add(m.id);
    return true;
  });
  // 按时间排序（从旧到新）
  uniqueMsgs.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  // 6. 获取发送者信息
  const senderIds = [...new Set(uniqueMsgs.map(m => m.sender_id))];
  const agentSenderIds = [...new Set(uniqueMsgs.filter(m => m.sender_type === "agent").map(m => m.sender_id))];
  const userSenderIds = senderIds.filter(id => !agentSenderIds.includes(id));

  const senderMap = new Map<string, SenderInfo>();

  if (userSenderIds.length > 0) {
    const { data: users } = await client
      .from("users")
      .select("id, name, avatar")
      .in("id", userSenderIds);
    (users || []).forEach((u: { id: string; name: string; avatar: string | null }) => {
      senderMap.set(u.id, { name: u.name, avatar: u.avatar, isAgent: false });
    });
  }

  if (agentSenderIds.length > 0) {
    const { data: agents } = await client
      .from("agents")
      .select("id, name, avatar")
      .in("id", agentSenderIds);
    (agents || []).forEach((a: { id: string; name: string; avatar: string | null }) => {
      senderMap.set(a.id, { name: a.name, avatar: a.avatar, isAgent: true });
    });
  }

  // 7. 收集图片附件 key，批量生成签名 URL
  const allImageKeys: string[] = [];
  for (const msg of uniqueMsgs) {
    const atts = msg.attachments || [];
    for (const att of atts) {
      if (att.type === "image" && att.key && typeof att.key === "string") {
        allImageKeys.push(att.key);
      }
    }
  }
  const signedUrlMap = await batchGenerateSignedUrls([...new Set(allImageKeys)]);

  // 8. 格式化上下文
  const MAX_IMAGES = 10;
  let imageCount = 0;
  const contextParts: string[] = [];
  const llmMessages: Array<{ role: "system" | "user" | "assistant"; content: string | ContentPart[] }> = [];

  for (const msg of uniqueMsgs) {
    const sender = senderMap.get(msg.sender_id);
    const senderName = sender?.isAgent ? `🤖${sender.name}` : (sender?.name || "未知用户");
    const atts = (msg.attachments || []) as Array<Record<string, unknown>>;
    const imageAtts = atts.filter(a => a.type === "image" && a.key);
    const otherAtts = atts.filter(a => a.type !== "image");

    // 文本内容
    let textPart = msg.content || "";

    // 非图片附件描述
    for (const att of otherAtts) {
      const summary = msg.attachment_summary;
      if (att.type === "video") {
        textPart += `\n[视频: ${att.name || "未知"}]${summary ? ` ${summary}` : ""}`;
      } else if (att.type === "file") {
        textPart += `\n[文件: ${att.name || "未知"}]${summary ? ` ${summary}` : ""}`;
      }
    }

    // 话题标签
    const topics = msg.topic_tags as string[] | null;
    if (topics && topics.length > 0) {
      textPart += `\n话题: ${topics.map(t => `#${t}`).join(" ")}`;
    }

    const contextLine = `[${senderName}] ${textPart}`;
    contextParts.push(contextLine);

    // 如果有图片且未超过限制，用多模态格式
    if (imageAtts.length > 0 && imageCount < MAX_IMAGES) {
      const contentParts: ContentPart[] = [
        { type: "text", text: `[${senderName}] ${textPart}` }
      ];
      for (const att of imageAtts) {
        if (imageCount >= MAX_IMAGES) break;
        const key = att.key as string;
        const url = signedUrlMap[key];
        if (url) {
          contentParts.push({
            type: "image_url",
            image_url: { url, detail: "low" }
          });
          imageCount++;
        } else {
          textPart += " [图片]";
        }
      }
      llmMessages.push({ role: "user", content: contentParts });
    } else {
      if (imageAtts.length > 0) {
        textPart += ` [${imageAtts.length}张图片]`;
      }
      llmMessages.push({ role: "user", content: `[${senderName}] ${textPart}` });
    }
  }

  const contextText = contextParts.join("\n");
  return { llmMessages, contextText };
}

/**
 * 为消息异步生成 Embedding 并写入数据库
 * 在消息发送后调用，不阻塞消息发送流程
 */
export async function generateMessageEmbedding(
  messageId: string,
  content: string,
  customHeaders?: Record<string, string>
): Promise<void> {
  if (!content || content.trim().length === 0) return;

  try {
    const embeddingClient = new EmbeddingClient(undefined, customHeaders);
    const embedding = await embeddingClient.embedText(content.slice(0, 2000), { dimensions: 1024 });

    const client = getSupabaseClient();
    const { error } = await client
      .from("channel_messages")
      .update({ embedding })
      .eq("id", messageId);

    if (error) {
      console.error("写入消息 Embedding 失败:", error.message);
    }
  } catch (err) {
    console.error("生成消息 Embedding 失败:", err);
    // 不抛出异常，Embedding 生成失败不应影响消息发送
  }
}
