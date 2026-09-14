import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";

// 获取频道已读状态
// GET /api/channels/read-state?channelId=xxx&userId=xxx
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const channelId = searchParams.get("channelId");
    const userId = searchParams.get("userId");

    if (!channelId || !userId) {
      return NextResponse.json({ error: "参数不完整" }, { status: 400 });
    }

    const client = getSupabaseClient();

    const { data, error } = await client
      .from("channel_read_states")
      .select("last_read_at")
      .eq("channel_id", channelId)
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      console.error("获取已读状态失败:", error);
      return NextResponse.json({ error: "获取已读状态失败" }, { status: 500 });
    }

    // 查询该频道未读消息数（在 last_read_at 之后的消息数量）
    let unreadCount = 0;
    if (data?.last_read_at) {
      const { count, error: countError } = await client
        .from("channel_messages")
        .select("*", { count: "exact", head: true })
        .eq("channel_id", channelId)
        .eq("is_active", true)
        .gt("created_at", data.last_read_at);

      if (!countError && count !== null) {
        unreadCount = count;
      }
    } else {
      // 没有 read state，意味着从未读过，所有消息都是未读
      const { count, error: countError } = await client
        .from("channel_messages")
        .select("*", { count: "exact", head: true })
        .eq("channel_id", channelId)
        .eq("is_active", true);

      if (!countError && count !== null) {
        unreadCount = count;
      }
    }

    return NextResponse.json({
      success: true,
      lastReadAt: data?.last_read_at || null,
      unreadCount,
    });
  } catch (error) {
    console.error("获取已读状态错误:", error);
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}

// 更新频道已读状态（upsert）
// PUT /api/channels/read-state
export async function PUT(request: NextRequest) {
  try {
    const { channelId, userId } = await request.json();

    if (!channelId || !userId) {
      return NextResponse.json({ error: "参数不完整" }, { status: 400 });
    }

    const client = getSupabaseClient();
    const now = new Date().toISOString();

    // 先查是否已存在
    const { data: existing } = await client
      .from("channel_read_states")
      .select("id")
      .eq("channel_id", channelId)
      .eq("user_id", userId)
      .maybeSingle();

    let error;
    if (existing) {
      // 更新
      ({ error } = await client
        .from("channel_read_states")
        .update({ last_read_at: now })
        .eq("channel_id", channelId)
        .eq("user_id", userId));
    } else {
      // 插入
      ({ error } = await client
        .from("channel_read_states")
        .insert({
          channel_id: channelId,
          user_id: userId,
          last_read_at: now,
        }));
    }

    if (error) {
      console.error("更新已读状态失败:", error);
      return NextResponse.json({ error: "更新已读状态失败" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("更新已读状态错误:", error);
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}
