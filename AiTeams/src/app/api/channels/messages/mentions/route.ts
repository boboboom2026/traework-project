import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";
import { S3Storage } from "@/lib/sdk";
import { getCachedSignedUrl, setCachedSignedUrl } from "@/storage/database/shared/signed-url-cache";

const storage = new S3Storage({
  endpointUrl: process.env.S3_ENDPOINT_URL,
  accessKey: "",
  secretKey: "",
  bucketName: process.env.S3_BUCKET_NAME,
  region: "cn-beijing",
});

// 获取@我的消息列表
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

    // 查询 mentions 包含当前用户ID的消息
    const { data: messages, error: fetchError } = await client
      .from("channel_messages")
      .select(`
        id,
        channel_id,
        sender_id,
        content,
        message_type,
        attachments,
        topic_tags,
        mentions,
        created_at,
        channels!inner(id, name, type, team_id, is_active)
      `)
      .eq("is_active", true)
      .contains("mentions", JSON.stringify([userId]))
      .order("created_at", { ascending: false })
      .limit(limit);

    if (fetchError) {
      console.error("获取@我的消息错误:", fetchError);
      return NextResponse.json({ error: "获取消息失败" }, { status: 500 });
    }

    // 如果指定了 teamId，只查询该团队下的频道消息
    let filteredMessages = messages || [];
    if (teamId) {
      filteredMessages = filteredMessages.filter(
        (m: Record<string, unknown>) => {
          const ch = m.channels as { team_id: string } | null;
          return ch?.team_id === teamId;
        }
      );
    }

    // cursor 分页
    if (before) {
      filteredMessages = filteredMessages.filter(
        (m: Record<string, unknown>) => (m.created_at as string) < before
      );
    }

    if (filteredMessages.length === 0) {
      return NextResponse.json({ success: true, messages: [], nextCursor: null });
    }

    // 区分用户和智能体发送者
    const agentSenderIds = [...new Set(
      filteredMessages.filter(m => (m as Record<string, unknown>).sender_type === "agent").map((m: Record<string, unknown>) => m.sender_id as string)
    )];
    const userSenderIds = [...new Set(
      filteredMessages.filter(m => (m as Record<string, unknown>).sender_type !== "agent").map((m: Record<string, unknown>) => m.sender_id as string)
    )];

    // 收集附件 key
    const allAttachmentKeys: string[] = [];
    for (const msg of filteredMessages) {
      const atts = msg.attachments as Array<Record<string, unknown>> | null;
      if (atts) {
        for (const att of atts) {
          if (att.key && typeof att.key === "string") {
            allAttachmentKeys.push(att.key);
          }
        }
      }
    }

    // 并行获取发送者信息 + 签名URL
    const [usersResult, agentsResult, signedUrlsResult] = await Promise.all([
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
        // 先查缓存
        const missedKeys: string[] = [];
        for (const key of uniqueKeys) {
          const cached = getCachedSignedUrl(key);
          if (cached) {
            map[key] = cached;
          } else {
            missedKeys.push(key);
          }
        }
        // 缓存未命中的并行生成
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
    ]);

    // 组装结果
    const result = filteredMessages.map((msg: Record<string, unknown>) => {
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
        createdAt: msg.created_at,
      };
    });

    // nextCursor
    const oldestMsg = filteredMessages[filteredMessages.length - 1];
    const nextCursor = filteredMessages.length >= limit ? (oldestMsg as Record<string, unknown>).created_at as string : null;

    return NextResponse.json({ success: true, messages: result, nextCursor });
  } catch (error) {
    console.error("获取@我的消息错误:", error);
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}
