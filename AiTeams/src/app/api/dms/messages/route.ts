import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";
import { batchGenerateSignedUrls } from "@/storage/database/shared/signed-url-cache";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const conversationId = searchParams.get("conversationId");
    if (!conversationId) return NextResponse.json({ error: "会话ID不能为空" }, { status: 400 });
    const client = getSupabaseClient();
    const { data: messages, error: msgError } = await client.from("dm_messages").select("*").eq("conversation_id", conversationId).order("created_at", { ascending: true });
    if (msgError) return NextResponse.json({ error: "查询消息失败" }, { status: 500 });

    // 收集所有 forwarded_from_id，按类型分组
    const channelForwardIds: string[] = [];
    const dmForwardIds: string[] = [];
    const agentForwardIds: string[] = [];
    for (const m of messages || []) {
      const t = (m as any).forwarded_from_type as string | null;
      const id = (m as any).forwarded_from_id as string | null;
      if (!t || !id) continue;
      if (t === "channel_message") channelForwardIds.push(id);
      else if (t === "dm_message") dmForwardIds.push(id);
      else if (t === "agent_message") agentForwardIds.push(id);
    }

    // 获取频道转发消息 + 发送者信息
    const allUsersMap = new Map<string, { id: string; name: string; avatar: string | null }>();
    let channelMsgs: Array<{ id: string; sender_id: string; content: string | null; attachments: Array<Record<string, unknown>> | null; channel_id: string; created_at: string }> = [];
    const channelNameMap: Record<string, string> = {};
    let attKeys: string[] = [];

    if (channelForwardIds.length > 0) {
      const { data: cm } = await client.from("channel_messages").select("id, sender_id, content, attachments, channel_id, created_at").in("id", channelForwardIds).eq("is_active", true);
      if (cm) {
        channelMsgs = cm as typeof channelMsgs;
        const userRows: Array<{ id: string; name: string; avatar: string | null }> = [];
        const allSenderIds = [...new Set(channelMsgs.map(m => m.sender_id))];
        for (const sid of allSenderIds) {
          const { data: u } = await client.from("team_members").select("id, name, avatar").eq("id", sid).single();
          if (u) userRows.push(u as never);
        }
        for (const u of userRows) allUsersMap.set(u.id, u);
        const cIds = [...new Set(channelMsgs.map(m => m.channel_id))];
        if (cIds.length > 0) {
          const { data: ch } = await client.from("channels").select("id, name").in("id", cIds);
          if (ch) for (const c of ch as Array<{ id: string; name: string }>) channelNameMap[c.id] = c.name;
        }
        for (const m of channelMsgs) {
          if (m.attachments) for (const a of m.attachments) { const k = a.key as string; if (k) attKeys.push(k); }
        }
      }
    }

    // 获取 DM 转发消息
    let dmFwdMsgs: Array<{ id: string; sender_id: string; content: string | null }> = [];
    if (dmForwardIds.length > 0) {
      const { data: dmf } = await client.from("dm_messages").select("id, sender_id, content").in("id", dmForwardIds);
      if (dmf) dmFwdMsgs = dmf as never;
      for (const m of dmf || []) {
        if (!allUsersMap.has((m as any).sender_id)) {
          const { data: u } = await client.from("team_members").select("id, name, avatar").eq("id", (m as any).sender_id).single();
          if (u) allUsersMap.set(u.id, u as never);
        }
      }
    }

    // 获取 Agent 转发消息
    let agentFwdMsgs: Array<{ id: string; content: string | null; attachments: Array<Record<string, unknown>> | null }> = [];
    if (agentForwardIds.length > 0) {
      const { data: am } = await client.from("agent_chat_messages").select("id, content, attachments").in("id", agentForwardIds);
      if (am) agentFwdMsgs = am as never;
    }

    // 签名附件 URL
    if (attKeys.length > 0) {
      const urlMap = await batchGenerateSignedUrls([...new Set(attKeys)]);
      const processed: Record<string, Array<Record<string, unknown>> | null> = {};
      for (const m of channelMsgs) {
        const rawAtts = (m.attachments || []) as Array<Record<string, unknown>>;
        processed[m.id] = rawAtts.map(a => {
          const key = a.key as string | undefined;
          if (key && urlMap[key]) return { ...a, url: urlMap[key] };
          return a;
        });
      }
      channelMsgs = channelMsgs.map(m => ({ ...m, attachments: processed[m.id] || null }));
    }

    // 构建 forwarding lookup
    const fwdMapping: Record<string, Record<string, unknown> | null> = {};
    for (const fm of channelMsgs) {
      const sender = allUsersMap.get(fm.sender_id);
      fwdMapping[fm.id] = {
        senderName: sender?.name || "未知成员",
        senderAvatar: sender?.avatar || null,
        content: fm.content || "",
        attachments: fm.attachments || [],
        channelName: channelNameMap[fm.channel_id] || null,
        createdAt: fm.created_at,
      };
    }
    for (const fm of dmFwdMsgs) {
      const sender = allUsersMap.get(fm.sender_id);
      fwdMapping[fm.id] = {
        senderName: sender?.name || "未知成员",
        senderAvatar: sender?.avatar || null,
        content: fm.content || "",
        attachments: [] as Array<Record<string, unknown>>,
        channelName: null,
        createdAt: null,
      };
    }
    for (const fm of agentFwdMsgs) {
      fwdMapping[fm.id] = {
        senderName: "智能体",
        senderAvatar: null,
        content: fm.content || "",
        attachments: (fm.attachments || []) as Array<Record<string, unknown>>,
        channelName: null,
        createdAt: null,
      };
    }

    const result = (messages || []).map((msg: any) => ({
      id: msg.id,
      conversationId: msg.conversation_id,
      senderId: msg.sender_id,
      sender: msg.sender || { id: msg.sender_id, name: "未知", avatar: null },
      content: msg.content || "",
      messageType: msg.message_type || "text",
      attachments: msg.attachments || [],
      createdAt: msg.created_at,
      isRead: msg.is_read,
      forwardedFromType: msg.forwarded_from_type || null,
      forwardedFromId: msg.forwarded_from_id || null,
      forwardedMessage: msg.forwarded_from_id && fwdMapping[msg.forwarded_from_id as string] 
        ? fwdMapping[msg.forwarded_from_id as string] 
        : null,
    }));

    return NextResponse.json({ success: true, messages: result });
  } catch (e) { console.error("GET错误:", e); return NextResponse.json({ error: "服务器错误" }, { status: 500 }); }
}

export async function POST(request: NextRequest) {
  try {
    const { conversationId, senderId, receiverId, content, messageType, forwardedFromId, forwardedFromType } = await request.json();
    if (content === undefined || content === null) return NextResponse.json({ error: "消息内容不能为空" }, { status: 400 });

    let targetConversationId = conversationId;
    const client = getSupabaseClient();

    if (conversationId === "new" && senderId && receiverId) {
      const existingConv = await client
        .from("dm_conversations")
        .select("id")
        .or(`and(user1_id.eq.${senderId},user2_id.eq.${receiverId}),and(user1_id.eq.${receiverId},user2_id.eq.${senderId})`)
        .limit(1)
        .single();
      if (existingConv.data) {
        targetConversationId = existingConv.data.id;
      } else {
        const { data: newConv, error: convError } = await client
          .from("dm_conversations")
          .insert({ user1_id: senderId, user2_id: receiverId, created_at: new Date().toISOString(), updated_at: new Date().toISOString() })
          .select()
          .single();
        if (convError) return NextResponse.json({ error: "创建会话失败" }, { status: 500 });
        targetConversationId = newConv!.id;
      }
    }

    const insertData: Record<string, unknown> = {
      conversation_id: targetConversationId,
      sender_id: senderId,
      content,
      message_type: messageType || "text",
      created_at: new Date().toISOString(),
      is_read: false,
    };
    if (forwardedFromId && forwardedFromType) {
      insertData.forwarded_from_id = forwardedFromId;
      insertData.forwarded_from_type = forwardedFromType;
    }

    const { data: message, error: msgError } = await client
      .from("dm_messages")
      .insert(insertData)
      .select()
      .single();

    if (msgError) return NextResponse.json({ error: "发送消息失败" }, { status: 500 });

    await client
      .from("dm_conversations")
      .update({
        last_message: content,
        last_message_at: message.created_at,
        updated_at: new Date().toISOString(),
      })
      .eq("id", targetConversationId);

    return NextResponse.json({ success: true, message });
  } catch (e) { console.error("POST错误:", e); return NextResponse.json({ error: "服务器错误" }, { status: 500 }); }
}