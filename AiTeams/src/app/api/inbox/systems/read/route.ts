import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";

// 标记系统消息为已读
export async function POST(request: NextRequest) {
  try {
    const { userId, teamId, notificationIds } = await request.json();

    if (!userId || !teamId) {
      return NextResponse.json({ error: "参数不完整" }, { status: 400 });
    }

    const client = getSupabaseClient();

    if (notificationIds && Array.isArray(notificationIds) && notificationIds.length > 0) {
      // 标记指定通知为已读
      const { error } = await client
        .from("system_notifications")
        .update({ is_read: true })
        .in("id", notificationIds);

      if (error) {
        console.error("标记系统消息已读失败:", error);
        return NextResponse.json({ error: "更新失败" }, { status: 500 });
      }
    } else {
      // 标记所有系统消息为已读（团队级 + 平台级）
      const { error } = await client
        .from("system_notifications")
        .update({ is_read: true })
        .or(`and(scope.eq.team,team_id.eq.${teamId},or(user_id.eq.${userId},user_id.is.null)),and(scope.eq.platform,or(user_id.eq.${userId},user_id.is.null))`)
        .eq("is_read", false);

      if (error) {
        console.error("标记全部系统消息已读失败:", error);
        return NextResponse.json({ error: "更新失败" }, { status: 500 });
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("标记系统消息已读错误:", error);
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}