import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";

// 获取系统消息列表
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");
    const teamId = searchParams.get("teamId");
    const limit = parseInt(searchParams.get("limit") || "20");
    const before = searchParams.get("before");

    if (!userId || !teamId) {
      return NextResponse.json({ error: "参数不完整" }, { status: 400 });
    }

    const client = getSupabaseClient();

    // 查询系统消息：团队级（user_id 为当前用户 或 null全员） + 平台级（scope='platform'）
    let query = client
      .from("system_notifications")
      .select("*")
      .or(`and(scope.eq.team,team_id.eq.${teamId},or(user_id.eq.${userId},user_id.is.null)),scope.eq.platform`)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (before) {
      query = query.lt("created_at", before);
    }

    const { data: notifications, error } = await query;

    if (error) {
      console.error("获取系统消息失败:", error);
      return NextResponse.json({ error: "查询失败" }, { status: 500 });
    }

    const nextCursor =
      notifications && notifications.length === limit
        ? notifications[notifications.length - 1].created_at
        : null;

    return NextResponse.json({
      success: true,
      notifications: (notifications || []).map((n) => ({
        id: n.id,
        teamId: n.team_id,
        userId: n.user_id,
        scope: n.scope,
        type: n.type,
        title: n.title,
        content: n.content,
        link: n.link,
        isRead: n.is_read,
        createdAt: n.created_at,
      })),
      nextCursor,
    });
  } catch (error) {
    console.error("获取系统消息错误:", error);
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}