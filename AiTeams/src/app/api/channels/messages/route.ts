import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";
import { S3Storage, HeaderUtils } from "@/lib/sdk";
import { batchGenerateSignedUrls } from "@/storage/database/shared/signed-url-cache";
import { generateMessageEmbedding } from "@/lib/agent-context";
import { triggerAiAssistant } from "@/lib/ai-assistant-service";
import { recordChannelFiles } from "@/lib/channel-files";

const storage = new S3Storage({
  endpointUrl: process.env.S3_ENDPOINT_URL,
  accessKey: "",
  secretKey: "",
  bucketName: process.env.S3_BUCKET_NAME,
  region: "cn-beijing",
});

// ============ 用户信息批量查询辅助函数 ============
async function batchFetchUsers(
  client: ReturnType<typeof getSupabaseClient>,
  ids: string[],
  fields: string = "id, name, avatar, department, position"
): Promise<Record<string, Record<string, unknown>>> {
  if (ids.length === 0) return {};
  const { data } = await client.from("users").select(fields).in("id", ids);
  const map: Record<string, Record<string, unknown>> = {};
  if (data) {
    for (const u of data as unknown as Array<Record<string, unknown>>) {
      map[u.id as string] = u;
    }
  }
  return map;
}

// 获取频道消息列表
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const channelId = searchParams.get("channelId");
    const limit = parseInt(searchParams.get("limit") || "20");
    const before = searchParams.get("before"); // cursor: 获取此时间之前的消息
    const userId = searchParams.get("userId");

    if (!channelId) {
      return NextResponse.json({ error: "频道ID不能为空" }, { status: 400 });
    }

    const client = getSupabaseClient();

    // 获取频道信息（名称、类型等）
    const { data: channelData } = await client
      .from("channels")
      .select("type, is_active, name")
      .eq("id", channelId)
      .single();
    const channelName = (channelData as { name?: string } | null)?.name || null;

    // 权限检查：私密频道非成员不可查看
    if (userId) {
      if (channelData && (channelData as { type: string }).type === "private") {
        const { data: membership } = await client
          .from("channel_members")
          .select("id")
          .eq("channel_id", channelId)
          .eq("user_id", userId)
          .limit(1);
        if (!membership || membership.length === 0) {
          return NextResponse.json({ error: "无权查看此频道消息" }, { status: 403 });
        }
      }
    }

    // 获取主消息（非回复）
    let query = client
      .from("channel_messages")
      .select("*")
      .eq("channel_id", channelId)
      .is("reply_to_id", null)
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (before) {
      query = query.lt("created_at", before);
    }

    const { data: messages, error: msgError } = await query;

    if (msgError) {
      console.error("查询频道消息失败:", msgError);
      return NextResponse.json({ error: "查询消息失败" }, { status: 500 });
    }

    const messageList = (messages || []) as Array<{
      id: string;
      channel_id: string;
      sender_id: string;
      content: string | null;
      message_type: string;
      attachments: Array<Record<string, unknown>> | null;
      topic_tags: string[] | null;
      reply_to_id: string | null;
      thread_root_id: string | null;
      forwarded_from_id: string | null;
      is_active: boolean;
      created_at: string;
      updated_at: string | null;
    }>;

    if (messageList.length === 0) {
      return NextResponse.json({ success: true, messages: [], nextCursor: null });
    }

    const messageIds = messageList.map((m) => m.id);
    const senderIds = [...new Set(messageList.map((m) => m.sender_id))];
    // 分离用户和智能体的 sender_id（sender_type 是新增字段，需要类型断言）
    const agentSenderIds = [...new Set(messageList.filter(m => (m as Record<string, unknown>).sender_type === "agent").map(m => m.sender_id))];
    const userSenderIds = senderIds.filter(id => !agentSenderIds.includes(id));
    const forwardedFromIds = [...new Set(messageList.filter(m => m.forwarded_from_id).map(m => m.forwarded_from_id!))];

    // 收集所有附件 key（含转发原消息的 key，需要先在并行中获取）
    const allAttachmentKeysFromMessages: string[] = [];
    for (const msg of messageList) {
      const atts = msg.attachments as Array<Record<string, unknown>> | null;
      if (atts) {
        for (const att of atts) {
          if (att.key && typeof att.key === "string") {
            allAttachmentKeysFromMessages.push(att.key);
          }
        }
      }
    }

    // ============ 并行查询所有下游数据 ============
    const [
      usersResult,
      agentResult,
      reactionsResult,
      replyStatsResult,
      bookmarksResult,
      forwardedResult,
      signedUrlsResult,
    ] = await Promise.all([
      // 1. 用户发送者信息
      batchFetchUsers(client, userSenderIds, "id, name, avatar, department, position"),

      // 1.5 智能体发送者信息
      (async () => {
        if (agentSenderIds.length === 0) return {};
        const { data } = await client.from("agents").select("id, name").in("id", agentSenderIds);
        const map: Record<string, { name: string }> = {};
        if (data) {
          for (const a of (data as Array<{ id: string; name: string }>)) {
            map[a.id] = { name: a.name };
          }
        }
        return map;
      })(),

      // 2. 消息反应
      (async () => {
        const { data } = await client
          .from("channel_message_reactions")
          .select("message_id, user_id, emoji")
          .in("message_id", messageIds);
        return data as Array<{ message_id: string; user_id: string; emoji: string }> | null;
      })(),

      // 3. 回复统计
      (async () => {
        const { data } = await client
          .from("channel_messages")
          .select("thread_root_id, sender_id")
          .in("thread_root_id", messageIds)
          .eq("is_active", true);
        return data as Array<{ thread_root_id: string; sender_id: string }> | null;
      })(),

      // 4. 收藏状态
      (async () => {
        if (!userId) return [] as Array<{ message_id: string }>;
        const { data } = await client
          .from("channel_bookmarks")
          .select("message_id")
          .eq("user_id", userId)
          .in("message_id", messageIds);
        return (data || []) as Array<{ message_id: string }>;
      })(),

      // 5. 转发原消息 + 转发消息的发送者和频道（级联并行）
      (async () => {
        if (forwardedFromIds.length === 0) return {} as Record<string, {
          id: string;
          senderName: string;
          senderAvatar: string | null;
          content: string;
          attachments: Array<Record<string, unknown>>;
          channelName: string | null;
          createdAt: string;
        }>;
        const { data: fwdMsgs } = await client
          .from("channel_messages")
          .select("id, sender_id, content, attachments, channel_id, created_at")
          .in("id", forwardedFromIds);

        if (!fwdMsgs) return {};

        const fwdSenderIds = [...new Set(fwdMsgs.map(m => m.sender_id as string))];
        const fwdChannelIds = [...new Set(fwdMsgs.map(m => m.channel_id as string))];

        // 转发消息的发送者 + 频道 + 转发附件签名URL 并行
        const fwdAttsKeys: string[] = [];
        for (const fm of fwdMsgs as Array<{ attachments: Array<Record<string, unknown>> | null }>) {
          const atts = fm.attachments;
          if (atts) {
            for (const att of atts) {
              if (att.key && typeof att.key === "string") {
                fwdAttsKeys.push(att.key);
              }
            }
          }
        }

        const [fwdSenders, fwdChannels, fwdSignedUrls] = await Promise.all([
          batchFetchUsers(client, fwdSenderIds, "id, name, avatar"),
          (async () => {
            if (fwdChannelIds.length === 0) return {};
            const { data } = await client.from("channels").select("id, name").in("id", fwdChannelIds);
            const map: Record<string, string> = {};
            if (data) {
              for (const c of data as Array<{ id: string; name: string }>) {
                map[c.id] = c.name;
              }
            }
            return map;
          })(),
          batchGenerateSignedUrls([...new Set(fwdAttsKeys)]),
        ]);

        const map: Record<string, {
          id: string;
          senderName: string;
          senderAvatar: string | null;
          content: string;
          attachments: Array<Record<string, unknown>>;
          channelName: string | null;
          createdAt: string;
        }> = {};

        for (const fm of fwdMsgs as Array<{
          id: string;
          sender_id: string;
          content: string | null;
          attachments: Array<Record<string, unknown>> | null;
          channel_id: string;
          created_at: string;
        }>) {
          const fwdSender = fwdSenders[fm.sender_id];
          const rawFwdAtts = (fm.attachments || []) as Array<Record<string, unknown>>;
          const processedFwdAtts = rawFwdAtts.map((att) => {
            const key = att.key as string | undefined;
            if (key && fwdSignedUrls[key]) {
              return { ...att, url: fwdSignedUrls[key] };
            }
            return att;
          });
          map[fm.id] = {
            id: fm.id,
            senderName: (fwdSender?.name as string) || "未知用户",
            senderAvatar: (fwdSender?.avatar as string | null) || null,
            content: fm.content || "",
            attachments: processedFwdAtts,
            channelName: (fwdChannels as Record<string, string>)[fm.channel_id] || null,
            createdAt: fm.created_at,
          };
        }
        return map;
      })(),

      // 6. 当前消息的附件签名 URL
      batchGenerateSignedUrls([...new Set(allAttachmentKeysFromMessages)]),
    ]);

    // ============ 处理反应数据（需要反应用户信息） ============
    const reactionsMap: Record<string, Array<{ emoji: string; count: number; userReacted: boolean; users: Array<{ id: string; name: string; avatar: string | null }> }>> = {};
    const reactionUserIds = new Set<string>();

    if (reactionsResult) {
      for (const r of reactionsResult) {
        reactionUserIds.add(r.user_id);
        if (!reactionsMap[r.message_id]) {
          reactionsMap[r.message_id] = [];
        }
        const existing = reactionsMap[r.message_id].find((e) => e.emoji === r.emoji);
        if (existing) {
          existing.count++;
          if (r.user_id === userId) existing.userReacted = true;
        } else {
          reactionsMap[r.message_id].push({ emoji: r.emoji, count: 1, userReacted: r.user_id === userId, users: [] });
        }
      }
    }

    // 获取反应用户信息（合并到已查询的发送者 + 单独查）
    const reactionUserIdArr = [...reactionUserIds].filter(id => !usersResult[id]);
    const reactionUsersMap: Record<string, { name: string; avatar: string | null }> = {};
    // 先从已查的发送者中取
    for (const id of [...reactionUserIds]) {
      if (usersResult[id]) {
        reactionUsersMap[id] = { name: usersResult[id].name as string, avatar: usersResult[id].avatar as string | null };
      }
    }
    // 未在发送者中的反应用户再查一次
    if (reactionUserIdArr.length > 0) {
      const extraReactionUsers = await batchFetchUsers(client, reactionUserIdArr, "id, name, avatar");
      for (const [id, u] of Object.entries(extraReactionUsers)) {
        reactionUsersMap[id] = { name: u.name as string, avatar: u.avatar as string | null };
      }
    }

    // 填充反应用户
    if (reactionsResult) {
      for (const r of reactionsResult) {
        const reactionGroup = reactionsMap[r.message_id]?.find((e) => e.emoji === r.emoji);
        if (reactionGroup && reactionUsersMap[r.user_id]) {
          if (reactionGroup.users.length < 5) {
            reactionGroup.users.push({ id: r.user_id, ...reactionUsersMap[r.user_id] });
          }
        }
      }
    }

    // ============ 处理回复统计 ============
    const replyCountMap: Record<string, number> = {};
    const replyUsersMap: Record<string, Array<{ id: string; name: string; avatar: string | null }>> = {};
    const replySenderIds = new Set<string>();

    if (replyStatsResult) {
      for (const rs of replyStatsResult) {
        replyCountMap[rs.thread_root_id] = (replyCountMap[rs.thread_root_id] || 0) + 1;
        replySenderIds.add(rs.sender_id);
      }
    }

    // 获取回复者信息（优先从已查用户中取）
    const replySenderIdArr = [...replySenderIds].filter(id => !usersResult[id] && !reactionUsersMap[id]);
    const replySenderInfoMap: Record<string, { name: string; avatar: string | null }> = {};
    // 从已查数据中取
    for (const id of [...replySenderIds]) {
      if (usersResult[id]) {
        replySenderInfoMap[id] = { name: usersResult[id].name as string, avatar: usersResult[id].avatar as string | null };
      } else if (reactionUsersMap[id]) {
        replySenderInfoMap[id] = reactionUsersMap[id];
      }
    }
    // 仍未查到的再查一次
    if (replySenderIdArr.length > 0) {
      const extraReplyUsers = await batchFetchUsers(client, replySenderIdArr, "id, name, avatar");
      for (const [id, u] of Object.entries(extraReplyUsers)) {
        replySenderInfoMap[id] = { name: u.name as string, avatar: u.avatar as string | null };
      }
    }

    // 构建回复用户列表
    if (replyStatsResult) {
      const seen: Record<string, Set<string>> = {};
      for (const rs of replyStatsResult) {
        if (!seen[rs.thread_root_id]) seen[rs.thread_root_id] = new Set();
        if (!seen[rs.thread_root_id].has(rs.sender_id) && replySenderInfoMap[rs.sender_id]) {
          seen[rs.thread_root_id].add(rs.sender_id);
          if (!replyUsersMap[rs.thread_root_id]) replyUsersMap[rs.thread_root_id] = [];
          if (replyUsersMap[rs.thread_root_id].length < 5) {
            replyUsersMap[rs.thread_root_id].push({ id: rs.sender_id, ...replySenderInfoMap[rs.sender_id] });
          }
        }
      }
    }

    // ============ 处理收藏状态 ============
    const bookmarkedMap: Record<string, boolean> = {};
    if (bookmarksResult) {
      for (const bm of bookmarksResult) {
        bookmarkedMap[bm.message_id] = true;
      }
    }

    // ============ 组装结果 ============
    const result = messageList.map((msg) => {
      const senderType = (msg as Record<string, unknown>).sender_type as string || "user";
      const isAgent = senderType === "agent";
      const agentInfo = isAgent ? agentResult[msg.sender_id] : null;
      const sender = isAgent
        ? { name: agentInfo?.name || "智能体", avatar: null, department: null, position: null }
        : (usersResult[msg.sender_id] || { name: "未知用户", avatar: null, department: null, position: null });
      const rawAttachments = (msg.attachments || []) as Array<Record<string, unknown>>;
      const processedAttachments = rawAttachments.map((att) => {
        const key = att.key as string | undefined;
        if (key && signedUrlsResult[key]) {
          return { ...att, url: signedUrlsResult[key] };
        }
        return att;
      });
      return {
        id: msg.id,
        channelId: msg.channel_id,
        senderId: msg.sender_id,
        senderType,
        sender: {
          id: msg.sender_id,
          name: isAgent ? (agentInfo?.name || "智能体") : (sender.name as string),
          avatar: sender.avatar as string | null,
          department: sender.department as string | null,
          position: sender.position as string | null,
        },
        content: msg.content || "",
        messageType: msg.message_type,
        attachments: processedAttachments,
        topicTags: msg.topic_tags || [],
        sourceChannelName: channelName || null,
        sourceChannelId: channelName ? channelId : null,
        reactions: reactionsMap[msg.id] || [],
        replyCount: replyCountMap[msg.id] || 0,
        replyUsers: replyUsersMap[msg.id] || [],
        forwardedFromId: msg.forwarded_from_id || null,
        forwardedMessage: msg.forwarded_from_id ? (forwardedResult[msg.forwarded_from_id] || null) : null,
        isBookmarked: bookmarkedMap[msg.id] || false,
        createdAt: msg.created_at,
      };
    });

    // nextCursor
    const oldestMsg = messageList[messageList.length - 1];
    const nextCursor = messageList.length >= limit ? oldestMsg.created_at : null;

    return NextResponse.json({ success: true, messages: result, nextCursor });
  } catch (error) {
    console.error("获取频道消息错误:", error);
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}

// 发送频道消息
export async function POST(request: NextRequest) {
  try {
    const { channelId, senderId, content, messageType, attachments, topicTags, replyToId, threadRootId, forwardedFromId, mentions } = await request.json();

    if (!channelId || !senderId) {
      return NextResponse.json({ error: "频道ID和发送者ID不能为空" }, { status: 400 });
    }

    const client = getSupabaseClient();

    // 检查是否为频道成员
    const { data: membership } = await client
      .from("channel_members")
      .select("id")
      .eq("channel_id", channelId)
      .eq("user_id", senderId)
      .limit(1);

    if (!membership || membership.length === 0) {
      return NextResponse.json({ error: "您不是该频道成员，无法发送消息" }, { status: 403 });
    }

    // 如果是回复，验证被回复消息存在
    if (replyToId) {
      const { data: parentMsg } = await client
        .from("channel_messages")
        .select("id, channel_id")
        .eq("id", replyToId)
        .eq("is_active", true)
        .single();

      if (!parentMsg) {
        return NextResponse.json({ error: "被回复的消息不存在" }, { status: 404 });
      }
    }

    // 如果是转发，验证原消息存在
    if (forwardedFromId) {
      const { data: fwdMsg } = await client
        .from("channel_messages")
        .select("id")
        .eq("id", forwardedFromId)
        .eq("is_active", true)
        .single();

      if (!fwdMsg) {
        return NextResponse.json({ error: "转发的原消息不存在" }, { status: 404 });
      }
    }

    const insertData: Record<string, unknown> = {
      channel_id: channelId,
      sender_id: senderId,
      content: content || null,
      message_type: messageType || "text",
      attachments: attachments || [],
      topic_tags: topicTags || [],
      reply_to_id: replyToId || null,
      thread_root_id: threadRootId || replyToId || null,
      forwarded_from_id: forwardedFromId || null,
      mentions: mentions || [],
    };

    const { data: newMessage, error: insertError } = await client
      .from("channel_messages")
      .insert(insertData)
      .select()
      .single();

    if (insertError) {
      console.error("发送消息失败:", insertError);
      return NextResponse.json({ error: "发送消息失败" }, { status: 500 });
    }

    // 附件自动归档到频道文件（异步，不阻塞响应）
    if (newMessage?.id && Array.isArray(attachments) && attachments.length > 0) {
      try {
        const { data: ch } = await client
          .from("channels")
          .select("team_id")
          .eq("id", channelId)
          .single();
        const teamId = (ch as { team_id: string } | null)?.team_id;
        if (teamId) {
          const files = (attachments as Array<Record<string, unknown>>)
            .filter((att) => typeof att.key === "string" && (att.key as string).length > 0)
            .map((att) => {
              const rawType = att.type as string | undefined;
              const mime = (att.contentType as string) || (att.mimeType as string) || null;
              const fileType: "image" | "video" | "file" =
                rawType === "image" || rawType === "video" ? rawType : "file";
              return {
                channelId,
                teamId,
                uploaderId: senderId,
                uploaderType: "user" as const,
                messageId: newMessage.id,
                name: (att.name as string) || "未命名文件",
                fileKey: att.key as string,
                fileSize: (att.size as number) || (att.fileSize as number) || 0,
                mimeType: mime,
                fileType,
                source: "upload" as const,
              };
            });
          if (files.length > 0) {
            recordChannelFiles(files).catch(() => {});
          }
        }
      } catch (e) {
        console.error("归档频道附件失败:", e);
      }
    }

    // 异步生成 Embedding 向量（不阻塞响应）
    if (newMessage?.id && content) {
      try {
        const customHeaders = HeaderUtils.extractForwardHeaders(request.headers);
        generateMessageEmbedding(newMessage.id, content, customHeaders).catch(() => {});
      } catch {
        // Embedding 生成失败不影响消息发送
      }
    }

    // 异步触发频道AI助手（检查是否@了频道AI助手，不阻塞响应）
    if (content) {
      const assistantName = "频道AI助手";
      const mentionPattern = new RegExp(`@${assistantName}`, "i");
      if (mentionPattern.test(content)) {
        setTimeout(async () => {
          try {
            await triggerAiAssistant(channelId, content);
          } catch (e) {
            console.error("AI Assistant trigger failed:", e);
          }
        }, 1000);
      }
    }

    // 查询发送者信息，构造完整的消息对象返回给前端
    const usersResult = await batchFetchUsers(client, [senderId], "id, name, avatar, department, position");
    const userInfo = usersResult[senderId];

    // 处理附件签名 URL
    const rawAttachments = (attachments || []) as Array<Record<string, unknown>>;
    const attachmentKeys = rawAttachments.map((att) => att.key as string).filter(Boolean);
    const signedUrlsResult: Record<string, string> = {};
    if (attachmentKeys.length > 0) {
      const { data: urlData } = await client.storage.from("channel-attachments").createSignedUrls(attachmentKeys, 3600);
      if (urlData) {
        for (const item of urlData) {
          if (item.signedUrl && item.path) {
            signedUrlsResult[item.path] = item.signedUrl;
          }
        }
      }
    }
    const processedAttachments = rawAttachments.map((att) => {
      const key = att.key as string | undefined;
      if (key && signedUrlsResult[key]) {
        return { ...att, url: signedUrlsResult[key] };
      }
      return att;
    });

    const fullMessage = {
      id: newMessage.id,
      channelId: newMessage.channel_id,
      senderId: newMessage.sender_id,
      senderType: newMessage.sender_type || "user",
      sender: {
        id: senderId,
        name: (userInfo?.name as string) || "未知用户",
        avatar: (userInfo?.avatar as string | null) || null,
        department: (userInfo?.department as string | null) || null,
        position: (userInfo?.position as string | null) || null,
      },
      content: newMessage.content || "",
      messageType: newMessage.message_type,
      attachments: processedAttachments,
      topicTags: newMessage.topic_tags || [],
      sourceChannelName: null,
      sourceChannelId: channelId || null,
      reactions: [],
      replyCount: 0,
      replyUsers: [],
      forwardedFromId: forwardedFromId || null,
      forwardedMessage: null,
      isBookmarked: false,
      createdAt: newMessage.created_at,
    };

    return NextResponse.json({ success: true, message: fullMessage });
  } catch (error) {
    console.error("发送频道消息错误:", error);
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}

// 删除频道消息（软删除，仅消息发送者可操作）
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const messageId = searchParams.get("messageId");
    const userId = searchParams.get("userId");

    if (!messageId || !userId) {
      return NextResponse.json({ error: "消息ID和用户ID不能为空" }, { status: 400 });
    }

    const client = getSupabaseClient();

    // 验证消息存在且属于该用户，同时获取附件信息用于清理 S3 文件
    const { data: message, error: fetchError } = await client
      .from("channel_messages")
      .select("id, sender_id, is_active, attachments")
      .eq("id", messageId)
      .single();

    if (fetchError || !message) {
      return NextResponse.json({ error: "消息不存在" }, { status: 404 });
    }

    if (message.sender_id !== userId) {
      return NextResponse.json({ error: "只能删除自己发送的消息" }, { status: 403 });
    }

    if (!message.is_active) {
      return NextResponse.json({ error: "消息已被删除" }, { status: 400 });
    }

    // 软删除：设置 is_active = false
    const { error: updateError } = await client
      .from("channel_messages")
      .update({ is_active: false })
      .eq("id", messageId);

    if (updateError) {
      console.error("删除消息失败:", updateError);
      return NextResponse.json({ error: "删除消息失败" }, { status: 500 });
    }

    // 异步清理 S3 附件文件（不阻塞消息删除的成功响应）
    const attachments = message.attachments as Array<Record<string, unknown>> | null;
    if (attachments && attachments.length > 0) {
      const keys = attachments
        .map((att) => att.key)
        .filter((key): key is string => typeof key === "string" && key.length > 0);

      if (keys.length > 0) {
        // 后台异步删除，失败仅记录日志，不影响消息删除结果
        Promise.allSettled(
          keys.map(async (key) => {
            try {
              await storage.deleteFile({ fileKey: key });
            } catch (err) {
              console.error(`删除附件文件失败 (key: ${key}):`, err);
            }
          })
        );
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("删除频道消息错误:", error);
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}
