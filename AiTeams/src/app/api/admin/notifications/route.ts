import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { getSupabaseClient } from "@/storage/database/supabase-client";

// 获取平台系统通知列表（scope = 'platform'）
export async function GET(request: NextRequest) {
  try {
    await requireAdmin(request);
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get("limit") || "20");
    const page = parseInt(searchParams.get("page") || "1");
    const offset = (page - 1) * limit;

    const client = getSupabaseClient();

    const { data: notifications, error } = await client
      .from("system_notifications")
      .select("*")
      .eq("scope", "platform")
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error("获取平台通知失败:", error);
      return NextResponse.json({ error: "查询失败" }, { status: 500 });
    }

    const { count: total } = await client
      .from("system_notifications")
      .select("*", { count: "exact", head: true })
      .eq("scope", "platform");

    return NextResponse.json({
      success: true,
      data: {
        notifications: (notifications || []).map((n) => ({
          id: n.id,
          scope: n.scope,
          type: n.type,
          title: n.title,
          content: n.content,
          link: n.link,
          createdAt: n.created_at,
        })),
        total: total || 0,
        page,
        limit,
      },
    });
  } catch (error) {
    if (error instanceof Response) return error;
    if (error && typeof error === "object" && "status" in error) {
      return NextResponse.json(
        { error: "unauthorized" },
        { status: (error as { status: number }).status }
      );
    }
    console.error("获取平台通知错误:", error);
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}

// 发送平台系统通知（scope = 'platform'）
export async function POST(request: NextRequest) {
  try {
    const admin = await requireAdmin(request);
    const { title, content, type, link } = await request.json();

    if (!title || !title.trim()) {
      return NextResponse.json({ error: "标题不能为空" }, { status: 400 });
    }

    const client = getSupabaseClient();

    const { data, error } = await client
      .from("system_notifications")
      .insert({
        scope: "platform",
        type: type || "system",
        title: title.trim(),
        content: content || "",
        link: link || null,
        user_id: null, // 全员通知
        team_id: null,  // 平台级，不限定团队
      })
      .select()
      .single();

    if (error) {
      console.error("发送平台通知失败:", error);
      return NextResponse.json({ error: "发送失败" }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      data: {
        id: data.id,
        scope: data.scope,
        type: data.type,
        title: data.title,
        content: data.content,
        link: data.link,
        createdAt: data.created_at,
      },
    });
  } catch (error) {
    if (error instanceof Response) return error;
    if (error && typeof error === "object" && "status" in error) {
      return NextResponse.json(
        { error: "unauthorized" },
        { status: (error as { status: number }).status }
      );
    }
    console.error("发送平台通知错误:", error);
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}