import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";

// 标记@我的消息为已读
export async function POST(request: NextRequest) {
  try {
    const { userId, teamId } = await request.json();

    if (!userId || !teamId) {
      return NextResponse.json({ error: "参数不完整" }, { status: 400 });
    }

    const client = getSupabaseClient();

    // 更新 last_read_mentions_at 为当前时间
    const { error: updateError } = await client
      .from("team_members")
      .update({ last_read_mentions_at: new Date().toISOString() })
      .eq("team_id", teamId)
      .eq("user_id", userId);

    if (updateError) {
      console.error("标记已读失败:", updateError);
      return NextResponse.json({ error: "标记已读失败" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("标记已读错误:", error);
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}