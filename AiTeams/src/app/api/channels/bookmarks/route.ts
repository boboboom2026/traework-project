import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";
import { S3Storage } from "@/lib/coze-compat";
import { getCachedSignedUrl, setCachedSignedUrl } from "@/storage/database/shared/signed-url-cache";

const storage = new S3Storage({
  endpointUrl: process.env.COZE_BUCKET_ENDPOINT_URL,
  accessKey: "",
  secretKey: "",
  bucketName: process.env.COZE_BUCKET_NAME,
  region: "cn-beijing",
});

// 收藏消息
export async function POST(request: NextRequest) {
  try {
    const { messageId, userId } = await request.json();

    if (!messageId || !userId) {
      return NextResponse.json({ error: "参数不完整" }, { status: 400 });
    }

    const client = getSupabaseClient();

    // 检查是否已收藏
    const { data: existing } = await client
      .from("channel_bookmarks")
      .select("id")
      .eq("message_id", messageId)
      .eq("user_id", userId)
      .limit(1);

    if (existing && existing.length > 0) {
      return NextResponse.json({ success: true, bookmarked: true, message: "已收藏" });
    }

    // 插入收藏记录
    const { data, error } = await client
      .from("channel_bookmarks")
      .insert({ message_id: messageId, user_id: userId })
      .select()
      .single();

    if (error) {
      console.error("收藏消息失败:", error);
      return NextResponse.json({ error: "收藏失败" }, { status: 500 });
    }

    return NextResponse.json({ success: true, bookmarked: true, bookmark: data });
  } catch (error) {
    console.error("收藏消息错误:", error);
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}

// 取消收藏
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const messageId = searchParams.get("messageId");
    const userId = searchParams.get("userId");

    if (!messageId || !userId) {
      return NextResponse.json({ error: "参数不完整" }, { status: 400 });
    }

    const client = getSupabaseClient();

    const { error } = await client
      .from("channel_bookmarks")
      .delete()
      .eq("message_id", messageId)
      .eq("user_id", userId);

    if (error) {
      console.error("取消收藏失败:", error);
      return NextResponse.json({ error: "取消收藏失败" }, { status: 500 });
    }

    return NextResponse.json({ success: true, bookmarked: false });
  } catch (error) {
    console.error("取消收藏错误:", error);
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}

// 获取用户收藏的消息列表
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");
    const teamId = searchParams.get("teamId");
    const limit = parseInt(searchParams.get("limit") || "20");
    const before = searchParams.get("before"); // cursor

    if (!userId) {
      return NextResponse.json({ error: "用户ID不能为空" }, { status: 400 });
    }

    const client = getSupabaseClient();

    // 获取用户的收藏记录
    let query = client
      .from("channel_bookmarks")
      .select(`
        id,
        message_id,
        created_at,
        channel_messages!inner(
          id,
          channel_id,
          sender_id,
          sender_type,
          content,
          message_type,
          attachments,
          topic_tags,
          mentions,
          forwarded_from_id,
          created_at,
          channels!inner(id, name, type, team_id, is_active)
        )
      `)
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (before) {
      query = query.lt("created_at", before);
    }

    const { data: bookmarks, error: fetchError } = await query;

    if (fetchError) {
      console.error("获取收藏列表错误:", fetchError);
      return NextResponse.json({ error: "获取收藏列表失败" }, { status: 500 });
    }

    // 如果指定了 teamId，过滤该团队下的频道消息
    let filteredBookmarks = bookmarks || [];
    if (teamId) {
      filteredBookmarks = filteredBookmarks.filter(
        (b: Record<string, unknown>) => {
          const msg = b.channel_messages as Record<string, unknown> | null;
          if (!msg) return false;
          const ch = msg.channels as { team_id: string } | null;
          return ch?.team_id === teamId;
        }
      );
    }

    if (filteredBookmarks.length === 0) {
      return NextResponse.json({ success: true, messages: [], nextCursor: null });
    }

    // 提取消息数据
    const messageRecords = filteredBookmarks.map(
      (b: Record<string, unknown>) => b.channel_messages as Record<string, unknown>
    ).filter(Boolean);

    const messageIds = messageRecords.map((m) => m.id as string);

    // 并行获取：发送者信息 + 签名URL + 反应 + 回复数
    // 区分用户和智能体发送者
    const agentSenderIds = [...new Set(
      messageRecords.filter(m => m.sender_type === "agent").map((m) => m.sender_id as string)
    )];
    const userSenderIds = [...new Set(
      messageRecords.filter(m => m.sender_type !== "agent").map((m) => m.sender_id as string)
    )];
    const allAttachmentKeys: string[] = [];
    for (const msg of messageRecords) {
      const atts = msg.attachments as Array<Record<string, unknown>> | null;
      if (atts) {
        for (const att of atts) {
          if (att.key && typeof att.key === "string") {
            allAttachmentKeys.push(att.key);
          }
        }
      }
    }

    const [usersResult, agentsResult, signedUrlsResult, reactionsResult, replyCountsResult] = await Promise.all([
      // 用户信息
      (async () => {
        const map: Record<string, { name: string; nickname: string | null; avatar: string | null; department: string | null; position: string | null }> = {};
        if (userSenderIds.length === 0) return map;
        const { data: users } = await client
          .from("users")
          .select("id, name, nickname, avatar, department, position")
          .in("id", userSenderIds);
        if (users) {
          for (const u of users as Array<{ id: string; name: string; nickname: string | null; avatar: string | null; department: string | null; position: string | null }>) {
            map[u.id] = { name: u.name, nickname: u.nickname, avatar: u.avatar, department: u.department, position: u.position };
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
      // 签名URL（优先缓存）
      (async () => {
        const map: Record<string, string> = {};
        if (allAttachmentKeys.length === 0) return map;
        const uniqueKeys = [...new Set(allAttachmentKeys)];
        const missedKeys: string[] = [];
        for (const key of uniqueKeys) {
          const cached = getCachedSignedUrl(key);
          if (cached) {
            map[key] = cached;
          } else {
            missedKeys.push(key);
          }
        }
        if (missedKeys.length > 0) {
          await Promise.all(
            missedKeys.map(async (key) => {
              try {
                const url = await storage.generatePresignedUrl({ key, expireTime: 86400 });
                map[key] = url;
                setCachedSignedUrl(key, url);
              } catch {
                map[key] = "";
              }
            })
          );
        }
        return map;
      })(),
      // 反应信息
      (async () => {
        const map: Record<string, Array<{ id: string; userId: string; emoji: string }>> = {};
        if (messageIds.length === 0) return map;
        const { data: reactions } = await client
          .from("channel_message_reactions")
          .select("id, message_id, user_id, emoji")
          .in("message_id", messageIds);
        if (reactions) {
          for (const r of reactions as Array<{ id: string; message_id: string; user_id: string; emoji: string }>) {
            if (!map[r.message_id]) map[r.message_id] = [];
            map[r.message_id].push({ id: r.id, userId: r.user_id, emoji: r.emoji });
          }
        }
        return map;
      })(),
      // 回复数
      (async () => {
        const map: Record<string, number> = {};
        if (messageIds.length === 0) return map;
        const { data: replyCounts } = await client
          .from("channel_messages")
          .select("thread_root_id")
          .in("thread_root_id", messageIds)
          .eq("is_active", true);
        if (replyCounts) {
          for (const rc of replyCounts as Array<{ thread_root_id: string }>) {
            map[rc.thread_root_id] = (map[rc.thread_root_id] || 0) + 1;
          }
        }
        return map;
      })(),
    ]);

    // 组装结果
    const result = filteredBookmarks.map((b: Record<string, unknown>) => {
      const msg = b.channel_messages as Record<string, unknown>;
      const senderType = (msg.sender_type as string) || "user";
      const isAgent = senderType === "agent";
      const agentInfo = isAgent ? agentsResult[msg.sender_id as string] : null;
      const userInfo = usersResult[msg.sender_id as string];

      const senderName = isAgent
        ? (agentInfo?.name || "智能体")
        : (userInfo?.name || "未知用户");
      const senderNickname = isAgent ? null : (userInfo?.nickname || null);
      const senderAvatar = isAgent ? null : (userInfo?.avatar || null);
      const senderDept = isAgent ? null : (userInfo?.department || null);
      const senderPosition = isAgent ? null : (userInfo?.position || null);

      const channel = msg.channels as { id: string; name: string; type: string; team_id: string } | null;
      const rawAttachments = (msg.attachments || []) as Array<Record<string, unknown>>;
      const processedAttachments = rawAttachments.map((att) => {
        const key = att.key as string | undefined;
        if (key && signedUrlsResult[key]) {
          return { ...att, url: signedUrlsResult[key] };
        }
        return att;
      });

      // 反应数据
      const rawReactions = reactionsResult[msg.id as string] || [];
      const reactionGroups: Record<string, { emoji: string; count: number; userIds: string[] }> = {};
      for (const r of rawReactions) {
        if (!reactionGroups[r.emoji]) {
          reactionGroups[r.emoji] = { emoji: r.emoji, count: 0, userIds: [] };
        }
        reactionGroups[r.emoji].count++;
        reactionGroups[r.emoji].userIds.push(r.userId);
      }

      return {
        id: msg.id,
        channelId: msg.channel_id,
        channelName: channel?.name || null,
        channelType: channel?.type || null,
        senderId: msg.sender_id,
        senderType,
        sender: {
          id: msg.sender_id,
          name: senderName,
          nickname: senderNickname,
          avatar: senderAvatar,
          department: senderDept,
          position: senderPosition,
        },
        content: msg.content || "",
        messageType: msg.message_type,
        attachments: processedAttachments,
        topicTags: msg.topic_tags || [],
        mentions: msg.mentions || [],
        forwardedFromId: msg.forwarded_from_id || null,
        reactions: Object.values(reactionGroups),
        replyCount: replyCountsResult[msg.id as string] || 0,
        createdAt: msg.created_at,
        bookmarkedAt: b.created_at,
        bookmarkId: b.id,
      };
    });

    // nextCursor
    const oldestBookmark = filteredBookmarks[filteredBookmarks.length - 1];
    const nextCursor = filteredBookmarks.length >= limit ? (oldestBookmark as Record<string, unknown>).created_at as string : null;

    return NextResponse.json({ success: true, messages: result, nextCursor });
  } catch (error) {
    console.error("获取收藏列表错误:", error);
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}
