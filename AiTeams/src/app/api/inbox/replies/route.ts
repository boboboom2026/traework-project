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

// 获取回复我的消息列表（按线程分组）
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");
    const teamId = searchParams.get("teamId");
    const limit = parseInt(searchParams.get("limit") || "20");
    const before = searchParams.get("before");

    if (!userId) {
      return NextResponse.json({ error: "用户ID不能为空" }, { status: 400 });
    }

    const client = getSupabaseClient();

    // 第一步：获取当前用户发送的消息列表（别人回复的父消息）
    const parentQuery = client
      .from("channel_messages")
      .select(`
        id, channel_id, sender_id, sender_type, content, message_type,
        attachments, topic_tags, reply_to_id, thread_root_id, created_at,
        channels:channel_id(id, name, type, team_id)
      `)
      .eq("sender_id", userId)
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(100);

    if (teamId) {
      const { data: teamChannels } = await client
        .from("channels")
        .select("id")
        .eq("team_id", teamId)
        .eq("is_active", true);
      const channelIds = (teamChannels || []).map((c: { id: string }) => c.id);
      if (channelIds.length === 0) {
        return NextResponse.json({ success: true, replyGroups: [] });
      }
      parentQuery.in("channel_id", channelIds);
    }

    const { data: userMessages } = await parentQuery;
    if (!userMessages || userMessages.length === 0) {
      return NextResponse.json({ success: true, replyGroups: [] });
    }

    const userMsgIds = new Set(userMessages.map((m) => m.id));
    const userThreadRootIds = new Set(
      userMessages.map((m) => m.thread_root_id).filter(Boolean)
    );

    // 第二步：查询回复（reply_to_id 指向用户消息 或 thread_root_id 是用户消息的根）
    // 把 thread_root_id 和 reply_to_id 的OR逻辑分开查更清晰
    const replyToClause = [...userMsgIds];
    const threadRootClause = [...userThreadRootIds];

    let repliesQuery = client
      .from("channel_messages")
      .select("*")
      .eq("is_active", true)
      .neq("sender_id", userId)
      .not("reply_to_id", "is", null)
      .order("created_at", { ascending: false });

    const orConditions: string[] = [];
    if (replyToClause.length > 0) {
      orConditions.push(`reply_to_id.in.(${replyToClause.join(",")})`);
    }
    if (threadRootClause.length > 0) {
      orConditions.push(`thread_root_id.in.(${threadRootClause.join(",")})`);
    }

    if (orConditions.length === 0) {
      return NextResponse.json({ success: true, replyGroups: [] });
    }

    if (teamId) {
      const { data: teamChannels } = await client
        .from("channels")
        .select("id")
        .eq("team_id", teamId)
        .eq("is_active", true);
      const channelIds = (teamChannels || []).map((c: { id: string }) => c.id);
      if (channelIds.length > 0) {
        repliesQuery = repliesQuery.in("channel_id", channelIds);
      }
    }

    // 用 or 查询
    repliesQuery = repliesQuery.or(orConditions.join(","));

    const { data: allReplies } = await repliesQuery;
    if (!allReplies || allReplies.length === 0) {
      return NextResponse.json({ success: true, replyGroups: [] });
    }

    // 第三步：按 thread_root_id 分组，没有 thread_root_id 的用 reply_to_id 分组
    const groupsMap = new Map<string, typeof allReplies>();
    for (const reply of allReplies) {
      const groupKey = reply.thread_root_id || reply.reply_to_id;
      if (!groupKey) continue;
      if (!groupsMap.has(groupKey)) {
        groupsMap.set(groupKey, []);
      }
      groupsMap.get(groupKey)!.push(reply);
    }

    // 按最新回复排序，并按 before 分页
    let sortedGroups = [...groupsMap.entries()]
      .map(([threadId, replies]) => ({
        threadId,
        replies,
        latestReply: replies.reduce((latest, r) =>
          r.created_at > latest.created_at ? r : latest
        ),
      }))
      .sort((a, b) => b.latestReply.created_at.localeCompare(a.latestReply.created_at));

    if (before) {
      sortedGroups = sortedGroups.filter((g) => g.latestReply.created_at < before);
    }

    const pagedGroups = sortedGroups.slice(0, limit);

    if (pagedGroups.length === 0) {
      return NextResponse.json({ success: true, replyGroups: [] });
    }

    // 第四步：收集所有需要展示的消息ID
    const allReplyIds = new Set<string>();
    const allGroupMessageIds = new Set<string>();
    for (const g of pagedGroups) {
      allGroupMessageIds.add(g.threadId);
      for (const r of g.replies) {
        allReplyIds.add(r.id);
        allGroupMessageIds.add(r.id);
      }
    }

    // 第五步：获取发送者信息
    const replyMsgs = allReplies.filter((r) => allReplyIds.has(r.id));
    const agentSenderIds = [
      ...new Set(replyMsgs.filter((m) => m.sender_type === "agent").map((m) => m.sender_id)),
    ];
    const userSenderIds = [
      ...new Set(replyMsgs.filter((m) => m.sender_type !== "agent").map((m) => m.sender_id)),
    ];

    // 收集附件 key
    const allAttachmentKeys: string[] = [];

    // 格式化的父消息查找
    const parentMap = new Map(userMessages.map((m) => [m.id, m]));

    const [usersResult, agentsResult, signedUrlsResult] = await Promise.all([
      (async () => {
        const map: Record<string, { name: string; nickname: string | null; avatar: string | null; department: string | null; position: string | null }> = {};
        if (userSenderIds.length === 0) return map;
        const { data: users } = await client
          .from("users")
          .select("id, name, nickname, avatar, department, position")
          .in("id", userSenderIds);
        if (users) {
          for (const u of users) {
            map[u.id] = u;
          }
        }
        return map;
      })(),
      (async () => {
        const map: Record<string, { name: string }> = {};
        if (agentSenderIds.length === 0) return map;
        const { data } = await client.from("agents").select("id, name").in("id", agentSenderIds);
        if (data) {
          for (const a of data) {
            map[a.id] = { name: a.name };
          }
        }
        return map;
      })(),
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
                setCachedSignedUrl(key, url);
                map[key] = url;
              } catch {
                map[key] = "";
              }
            })
          );
        }
        return map;
      })(),
    ]);

    // 第六步：获取 reactions
    const { data: reactionsData } = await client
      .from("channel_message_reactions")
      .select("message_id, user_id, emoji")
      .in("message_id", [...allGroupMessageIds]);

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

    // 格式化函数
    const formatReply = (msg: typeof allReplies[0]) => {
      const senderType = msg.sender_type || "user";
      const isAgent = senderType === "agent";
      const agentInfo = isAgent ? agentsResult[msg.sender_id] : null;
      const userInfo = usersResult[msg.sender_id];

      // 处理附件中的 key -> signed url
      let attachments = (msg.attachments || []) as Array<Record<string, unknown>>;
      attachments = attachments.map((att) => {
        const key = att.key as string | undefined;
        if (key && signedUrlsResult[key]) {
          return { ...att, url: signedUrlsResult[key] };
        }
        return att;
      });

      return {
        id: msg.id,
        senderId: msg.sender_id,
        senderType,
        sender: {
          id: msg.sender_id,
          name: isAgent ? agentInfo?.name || "智能体" : userInfo?.name || "未知用户",
          nickname: isAgent ? null : userInfo?.nickname || null,
          avatar: isAgent ? null : userInfo?.avatar || null,
          department: isAgent ? null : userInfo?.department || null,
          position: isAgent ? null : userInfo?.position || null,
        },
        content: msg.content || "",
        messageType: msg.message_type,
        attachments,
        topicTags: (msg.topic_tags || []) as string[],
        reactions: reactionsMap[msg.id] || [],
        createdAt: msg.created_at,
      };
    };

    // 第七步：组装结果
    const replyGroupsResult = pagedGroups.map((group) => {
      const parentMsg = parentMap.get(group.threadId);
      const channel = (parentMsg as unknown as { channels?: { id: string; name: string; type: string; team_id: string } })?.channels || null;

      // 收集回复者名称
      const replierSet = new Set<string>();
      for (const reply of group.replies) {
        const senderType = reply.sender_type || "user";
        const isAgent = senderType === "agent";
        const rInfo = isAgent
          ? agentsResult[reply.sender_id]
          : usersResult[reply.sender_id];
        if (rInfo) {
          replierSet.add((rInfo as { name: string }).name);
        } else {
          replierSet.add("未知用户");
        }
      }

      return {
        threadId: group.threadId,
        parentMessage: {
          id: parentMsg?.id || "",
          channelId: parentMsg?.channel_id || "",
          channelName: channel?.name || null,
          channelType: channel?.type || null,
          content: parentMsg?.content || "",
          topicTags: (parentMsg?.topic_tags || []) as string[],
          senderId: parentMsg?.sender_id || "",
          createdAt: parentMsg?.created_at || "",
        },
        replierNames: [...replierSet],
        latestReplyAt: group.latestReply.created_at,
        totalReplies: group.replies.length,
        initialReplies: group.replies.slice(0, 3).map(formatReply),
        remainingReplies: group.replies.slice(3).map(formatReply),
      };
    });

    const nextCursor = pagedGroups.length === limit
      ? pagedGroups[pagedGroups.length - 1].latestReply.created_at
      : null;

    return NextResponse.json({
      success: true,
      replyGroups: replyGroupsResult,
      nextCursor,
    });
  } catch (error) {
    console.error("获取回复我的消息错误:", error);
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}