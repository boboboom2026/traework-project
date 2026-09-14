import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";

// 添加表情反应
export async function POST(request: NextRequest) {
  try {
    const { messageId, userId, emoji } = await request.json();

    if (!messageId || !userId || !emoji) {
      return NextResponse.json({ error: "参数不完整" }, { status: 400 });
    }

    const client = getSupabaseClient();

    // upsert：如果已存在则忽略（唯一约束 message_id + user_id + emoji）
    const { data, error } = await client
      .from("channel_message_reactions")
      .upsert(
        { message_id: messageId, user_id: userId, emoji },
        { onConflict: "message_id,user_id,emoji" }
      )
      .select()
      .single();

    if (error) {
      console.error("添加反应失败:", error);
      return NextResponse.json({ error: "添加反应失败" }, { status: 500 });
    }

    return NextResponse.json({ success: true, reaction: data });
  } catch (error) {
    console.error("添加反应错误:", error);
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}

// 取消表情反应
export async function DELETE(request: NextRequest) {
  try {
    const { messageId, userId, emoji } = await request.json();

    if (!messageId || !userId || !emoji) {
      return NextResponse.json({ error: "参数不完整" }, { status: 400 });
    }

    const client = getSupabaseClient();

    const { error } = await client
      .from("channel_message_reactions")
      .delete()
      .eq("message_id", messageId)
      .eq("user_id", userId)
      .eq("emoji", emoji);

    if (error) {
      console.error("取消反应失败:", error);
      return NextResponse.json({ error: "取消反应失败" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("取消反应错误:", error);
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}
