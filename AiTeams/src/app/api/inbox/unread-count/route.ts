import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";

// 获取未读通知数（@我的 + 系统通知）
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");
    const teamId = searchParams.get("teamId");

    if (!userId || !teamId) {
      return NextResponse.json({ error: "参数不完整" }, { status: 400 });
    }

    const client = getSupabaseClient();

    // 查询用户在当前团队的 last_read_mentions_at
    const { data: membership, error: memberError } = await client
      .from("team_members")
      .select("last_read_mentions_at")
      .eq("team_id", teamId)
      .eq("user_id", userId)
      .maybeSingle();

    if (memberError) {
      console.error("查询团队成员信息失败:", memberError);
      return NextResponse.json({ error: "查询失败" }, { status: 500 });
    }

    const lastReadAt = membership?.last_read_mentions_at;

    // 查询未读的 @我的 消息数（created_at > last_read_mentions_at）
    let unreadMentions = 0;
    if (lastReadAt) {
      const { data: mentions, error: mentionsError } = await client
        .from("channel_messages")
        .select("id")
        .eq("is_active", true)
        .contains("mentions", JSON.stringify([userId]))
        .gt("created_at", lastReadAt)
        .limit(100);

      if (mentionsError) {
        console.error("查询未读@我的消息失败:", mentionsError);
      } else {
        unreadMentions = mentions?.length || 0;
      }
    } else {
      // 如果从未读过，统计所有 mentions
      const { count, error: countError } = await client
        .from("channel_messages")
        .select("id", { count: "exact", head: true })
        .eq("is_active", true)
        .contains("mentions", JSON.stringify([userId]));

      if (!countError) {
        unreadMentions = count || 0;
      }
    }

    // 查询未读系统消息数（团队级 + 平台级）
    let unreadSystems = 0;
    const { count: systemsCount, error: systemsError } = await client
      .from("system_notifications")
      .select("id", { count: "exact", head: true })
      .or(`and(scope.eq.team,team_id.eq.${teamId},or(user_id.eq.${userId},user_id.is.null)),scope.eq.platform`)
      .eq("is_read", false);

    if (!systemsError) {
      unreadSystems = systemsCount || 0;
    }

    return NextResponse.json({
      success: true,
      data: {
        unreadMentions,
        unreadSystems,
        total: unreadMentions + unreadSystems,
      },
    });
  } catch (error) {
    console.error("获取未读计数错误:", error);
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}