import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";

// 获取频道成员列表
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const channelId = searchParams.get("channelId");
    const userId = searchParams.get("userId");

    if (!channelId) {
      return NextResponse.json({ error: "频道ID不能为空" }, { status: 400 });
    }

    const client = getSupabaseClient();

    // 检查频道类型
    const { data: channel } = await client
      .from("channels")
      .select("type, is_active")
      .eq("id", channelId)
      .single();

    if (!channel || !(channel as { is_active: boolean }).is_active) {
      return NextResponse.json({ error: "频道不存在" }, { status: 404 });
    }

    const channelType = (channel as { type: string }).type;

    // 私密频道权限检查：仅成员可查看
    if (channelType === "private" && userId) {
      const { data: membership } = await client
        .from("channel_members")
        .select("id")
        .eq("channel_id", channelId)
        .eq("user_id", userId)
        .limit(1);

      if (!membership || membership.length === 0) {
        return NextResponse.json({ error: "无权查看此频道成员" }, { status: 403 });
      }
    }

    // 获取频道成员
    const { data: members, error } = await client
      .from("channel_members")
      .select("id, user_id, joined_at")
      .eq("channel_id", channelId)
      .order("joined_at", { ascending: true });

    if (error) {
      console.error("查询频道成员失败:", error);
      return NextResponse.json({ error: "查询频道成员失败" }, { status: 500 });
    }

    if (!members || members.length === 0) {
      return NextResponse.json({ success: true, members: [] });
    }

    // 获取关联的用户信息
    const userIds = [...new Set((members as { user_id: string }[]).map((m) => m.user_id))];
    const { data: users } = await client
      .from("users")
      .select("id, name, nickname, avatar, department, position")
      .in("id", userIds);

    // 构建 userId -> user 映射
    const userMap = new Map<string, {
      name: string;
      nickname: string | null;
      avatar: string | null;
      department: string | null;
      position: string | null;
    }>();
    (users || []).forEach((u: {
      id: string;
      name: string;
      nickname: string | null;
      avatar: string | null;
      department: string | null;
      position: string | null;
    }) => {
      userMap.set(u.id, {
        name: u.name,
        nickname: u.nickname,
        avatar: u.avatar,
        department: u.department,
        position: u.position,
      });
    });

    const result = (members || []).map((m: {
      id: string;
      user_id: string;
      joined_at: string;
    }) => {
      const user = userMap.get(m.user_id);
      return {
        id: m.id,
        userId: m.user_id,
        joinedAt: m.joined_at,
        name: user?.name || "未知用户",
        nickname: user?.nickname || null,
        avatar: user?.avatar || null,
        department: user?.department || null,
        position: user?.position || null,
      };
    });

    return NextResponse.json({ success: true, members: result });
  } catch (error) {
    console.error("获取频道成员错误:", error);
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}

// 添加频道成员（批量）
export async function POST(request: NextRequest) {
  try {
    const { channelId, userIds } = await request.json();

    if (!channelId || !userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return NextResponse.json({ error: "参数不完整" }, { status: 400 });
    }

    const client = getSupabaseClient();

    // 查询已存在的成员，避免重复添加
    const { data: existingMembers } = await client
      .from("channel_members")
      .select("user_id")
      .eq("channel_id", channelId)
      .in("user_id", userIds);

    const existingSet = new Set(
      (existingMembers || []).map((m: { user_id: string }) => m.user_id)
    );

    const newUserIds = userIds.filter((uid: string) => !existingSet.has(uid));

    if (newUserIds.length === 0) {
      return NextResponse.json({ success: true, added: 0, message: "成员已在频道中" });
    }

    // 批量插入
    const insertData = newUserIds.map((uid: string) => ({
      channel_id: channelId,
      user_id: uid,
    }));

    const { error } = await client
      .from("channel_members")
      .insert(insertData);

    if (error) {
      console.error("添加频道成员失败:", error);
      return NextResponse.json({ error: "添加频道成员失败" }, { status: 500 });
    }

    return NextResponse.json({ success: true, added: newUserIds.length });
  } catch (error) {
    console.error("添加频道成员错误:", error);
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}

// 移除频道成员
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const channelId = searchParams.get("channelId");
    const userId = searchParams.get("userId");

    if (!channelId || !userId) {
      return NextResponse.json({ error: "参数不完整" }, { status: 400 });
    }

    const client = getSupabaseClient();

    // 检查是否为频道创建者
    const { data: channel } = await client
      .from("channels")
      .select("creator_id")
      .eq("id", channelId)
      .single();

    if (channel && (channel as { creator_id: string }).creator_id === userId) {
      return NextResponse.json({ error: "不能移除频道创建者" }, { status: 400 });
    }

    const { error } = await client
      .from("channel_members")
      .delete()
      .eq("channel_id", channelId)
      .eq("user_id", userId);

    if (error) {
      console.error("移除频道成员失败:", error);
      return NextResponse.json({ error: "移除频道成员失败" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("移除频道成员错误:", error);
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}
