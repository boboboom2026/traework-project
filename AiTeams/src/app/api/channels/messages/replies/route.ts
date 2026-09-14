import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";
import { S3Storage } from "coze-coding-dev-sdk";
import { getCachedSignedUrl, setCachedSignedUrl } from "@/storage/database/shared/signed-url-cache";

const storage = new S3Storage({
  endpointUrl: process.env.COZE_BUCKET_ENDPOINT_URL,
  accessKey: "",
  secretKey: "",
  bucketName: process.env.COZE_BUCKET_NAME,
  region: "cn-beijing",
});

// 获取消息回复线程
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const threadRootId = searchParams.get("threadRootId");
    const messageId = searchParams.get("messageId");
    const userId = searchParams.get("userId");

    if (!threadRootId && !messageId) {
      return NextResponse.json({ error: "threadRootId或messageId不能为空" }, { status: 400 });
    }

    const client = getSupabaseClient();

    const rootId = threadRootId || messageId;

    // 获取原始消息
    const { data: rootMessage, error: rootError } = await client
      .from("channel_messages")
      .select("*")
      .eq("id", rootId)
      .eq("is_active", true)
      .single();

    if (rootError || !rootMessage) {
      return NextResponse.json({ error: "消息不存在" }, { status: 404 });
    }

    // 获取所有回复
    const { data: replies, error: repliesError } = await client
      .from("channel_messages")
      .select("*")
      .eq("thread_root_id", rootId)
      .eq("is_active", true)
      .order("created_at", { ascending: true });

    if (repliesError) {
      console.error("查询回复失败:", repliesError);
      return NextResponse.json({ error: "查询回复失败" }, { status: 500 });
    }

    // 收集所有发送者ID，区分用户和智能体
    const allMessages = [rootMessage, ...(replies || [])];
    const agentSenderIds = [...new Set(
      allMessages.filter(m => (m as Record<string, unknown>).sender_type === "agent").map((m: { sender_id: string }) => m.sender_id)
    )];
    const userSenderIds = [...new Set(
      allMessages.filter(m => (m as Record<string, unknown>).sender_type !== "agent").map((m: { sender_id: string }) => m.sender_id)
    )];

    // 并行查询用户和智能体信息
    const [usersMap, agentsMap, reactionsData, signedUrlMap] = await Promise.all([
      // 用户信息
      (async () => {
        const map: Record<string, { name: string; avatar: string | null; department: string | null }> = {};
        if (userSenderIds.length === 0) return map;
        const { data } = await client.from("users").select("id, name, avatar, department").in("id", userSenderIds);
        if (data) {
          for (const u of data as Array<{ id: string; name: string; avatar: string | null; department: string | null }>) {
            map[u.id] = u;
          }
        }
        return map;
      })(),
      // 智能体信息
      (async () => {
        const map: Record<string, { name: string }> = {};
        if (agentSenderIds.length === 0) return map;
        const { data } = await client.from("agents").select("id, name").in("id", agentSenderIds);
        if (data) {
          for (const a of data as Array<{ id: string; name: string }>) {
            map[a.id] = { name: a.name };
          }
        }
        return map;
      })(),
      // 反应数据
      (async () => {
        const allMessageIds = allMessages.map((m: { id: string }) => m.id);
        const { data } = await client
          .from("channel_message_reactions")
          .select("message_id, user_id, emoji")
          .in("message_id", allMessageIds);
        return data as Array<{ message_id: string; user_id: string; emoji: string }> | null;
      })(),
      // 附件签名 URL（使用缓存）
      (async () => {
        const allAttachmentKeys: string[] = [];
        for (const msg of allMessages) {
          const atts = (msg as { attachments: Array<Record<string, unknown>> | null }).attachments;
          if (atts) {
            for (const att of atts) {
              if (att.key && typeof att.key === "string") {
                allAttachmentKeys.push(att.key);
              }
            }
          }
        }
        const result: Record<string, string> = {};
        if (allAttachmentKeys.length === 0) return result;
        const uniqueKeys = [...new Set(allAttachmentKeys)];
        const missedKeys: string[] = [];
        for (const key of uniqueKeys) {
          const cached = getCachedSignedUrl(key);
          if (cached) {
            result[key] = cached;
          } else {
            missedKeys.push(key);
          }
        }
        if (missedKeys.length > 0) {
          await Promise.all(
            missedKeys.map(async (key) => {
              try {
                const url = await storage.generatePresignedUrl({ key, expireTime: 86400 });
                setCachedSignedUrl(key, url);
                result[key] = url;
              } catch {
                result[key] = "";
              }
            })
          );
        }
        return result;
      })(),
    ]);

    // 处理反应数据
    const reactionsMap: Record<string, Array<{ emoji: string; count: number; userReacted: boolean }>> = {};
    if (reactionsData) {
      for (const r of reactionsData) {
        if (!reactionsMap[r.message_id]) reactionsMap[r.message_id] = [];
        const existing = reactionsMap[r.message_id].find((e) => e.emoji === r.emoji);
        if (existing) {
          existing.count++;
          if (r.user_id === userId) existing.userReacted = true;
        } else {
          reactionsMap[r.message_id] = [{ emoji: r.emoji, count: 1, userReacted: r.user_id === userId }];
        }
      }
    }

    const formatMessage = (msg: {
      id: string;
      channel_id: string;
      sender_id: string;
      content: string | null;
      message_type: string;
      attachments: Array<Record<string, unknown>> | null;
      topic_tags: string[] | null;
      reply_to_id: string | null;
      thread_root_id: string | null;
      created_at: string;
    }) => {
      const senderType = (msg as Record<string, unknown>).sender_type as string || "user";
      const isAgent = senderType === "agent";
      const agentInfo = isAgent ? agentsMap[msg.sender_id] : null;
      const userInfo = usersMap[msg.sender_id];

      const senderName = isAgent
        ? (agentInfo?.name || "智能体")
        : (userInfo?.name || "未知用户");
      const senderAvatar = isAgent ? null : (userInfo?.avatar || null);
      const senderDept = isAgent ? null : (userInfo?.department || null);

      return {
        id: msg.id,
        channelId: msg.channel_id,
        senderId: msg.sender_id,
        senderType,
        sender: {
          id: msg.sender_id,
          name: senderName,
          avatar: senderAvatar,
          department: senderDept,
        },
        content: msg.content || "",
        messageType: msg.message_type,
        attachments: (msg.attachments || []).map((att: Record<string, unknown>) => {
          const key = att.key as string | undefined;
          if (key && signedUrlMap[key]) {
            return { ...att, url: signedUrlMap[key] };
          }
          return att;
        }),
        topicTags: msg.topic_tags || [],
        reactions: reactionsMap[msg.id] || [],
        replyToId: msg.reply_to_id,
        threadRootId: msg.thread_root_id,
        createdAt: msg.created_at,
      };
    };

    return NextResponse.json({
      success: true,
      rootMessage: formatMessage(rootMessage as typeof allMessages[0]),
      replies: (replies || []).map((r: typeof allMessages[0]) => formatMessage(r)),
    });
  } catch (error) {
    console.error("获取回复线程错误:", error);
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}
