import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";

// 获取会话列表
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");
    const teamId = searchParams.get("teamId");

    if (!userId || !teamId) {
      return NextResponse.json({ error: "参数不完整" }, { status: 400 });
    }

    const client = getSupabaseClient();

    // 查询当前用户参与的所有会话（仅返回有消息记录的）
    const { data: conversations, error: convError } = await client
      .from("dm_conversations")
      .select("*")
      .eq("team_id", teamId)
      .eq("is_active", true)
      .or(`participant1_id.eq.${userId},participant2_id.eq.${userId}`)
      .not("last_message_at", "is", null)
      .order("last_message_at", { ascending: false, nullsFirst: false });

    if (convError) {
      console.error("查询会话列表失败:", convError);
      return NextResponse.json({ error: "查询会话失败" }, { status: 500 });
    }

    if (!conversations || conversations.length === 0) {
      return NextResponse.json({ success: true, conversations: [] });
    }

    // 获取所有对话方的用户信息
    const participantIds = conversations.map((c: { participant1_id: string; participant2_id: string }) => {
      return c.participant1_id === userId ? c.participant2_id : c.participant1_id;
    });
    const uniqueIds = [...new Set(participantIds)];

    const { data: usersData, error: usersError } = await client
      .from("users")
      .select("id, name, avatar, department, position, email, phone")
      .in("id", uniqueIds);

    if (usersError) {
      console.error("查询用户信息失败:", usersError);
      return NextResponse.json({ error: "查询用户信息失败" }, { status: 500 });
    }

    // 获取每个会话的未读消息数
    const conversationIds = conversations.map((c: { id: string }) => c.id);
    const { data: unreadData, error: unreadError } = await client
      .from("dm_messages")
      .select("conversation_id")
      .in("conversation_id", conversationIds)
      .neq("sender_id", userId)
      .eq("is_read", false);

    if (unreadError) {
      console.error("查询未读消息失败:", unreadError);
    }

    // 统计未读数
    const unreadMap = new Map<string, number>();
    if (unreadData) {
      for (const msg of unreadData as { conversation_id: string }[]) {
        unreadMap.set(msg.conversation_id, (unreadMap.get(msg.conversation_id) || 0) + 1);
      }
    }

    // 组装结果
    const result = conversations.map((conv: {
      id: string;
      participant1_id: string;
      participant2_id: string;
      last_message: string | null;
      last_message_at: string | null;
      created_at: string;
    }) => {
      const otherId = conv.participant1_id === userId ? conv.participant2_id : conv.participant1_id;
      const otherUser = (usersData as { id: string }[] | null)?.find((u) => u.id === otherId);
      return {
        id: conv.id,
        otherUser: otherUser || { id: otherId, name: "未知用户" },
        lastMessage: conv.last_message || "",
        lastMessageAt: conv.last_message_at || conv.created_at,
        unreadCount: unreadMap.get(conv.id) || 0,
      };
    });

    return NextResponse.json({ success: true, conversations: result });
  } catch (error) {
    console.error("获取会话列表错误:", error);
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}

// 创建新会话
export async function POST(request: NextRequest) {
  try {
    const { teamId, userId, otherUserId } = await request.json();

    if (!teamId || !userId || !otherUserId) {
      return NextResponse.json({ error: "参数不完整" }, { status: 400 });
    }

    if (userId === otherUserId) {
      return NextResponse.json({ error: "不能与自己创建会话" }, { status: 400 });
    }

    const client = getSupabaseClient();

    // 确保 participant1_id < participant2_id 以避免重复
    const [p1, p2] = userId < otherUserId ? [userId, otherUserId] : [otherUserId, userId];

    // 检查是否已存在会话
    const { data: existing, error: existError } = await client
      .from("dm_conversations")
      .select("*")
      .eq("team_id", teamId)
      .eq("participant1_id", p1)
      .eq("participant2_id", p2)
      .eq("is_active", true)
      .maybeSingle();

    if (existError) {
      console.error("查询会话失败:", existError);
      return NextResponse.json({ error: "查询会话失败" }, { status: 500 });
    }

    if (existing) {
      return NextResponse.json({ success: true, conversation: existing, created: false });
    }

    // 创建新会话
    const { data: newConv, error: createError } = await client
      .from("dm_conversations")
      .insert({
        team_id: teamId,
        participant1_id: p1,
        participant2_id: p2,
      })
      .select()
      .single();

    if (createError) {
      console.error("创建会话失败:", createError);
      return NextResponse.json({ error: "创建会话失败" }, { status: 500 });
    }

    return NextResponse.json({ success: true, conversation: newConv, created: true });
  } catch (error) {
    console.error("创建会话错误:", error);
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}
