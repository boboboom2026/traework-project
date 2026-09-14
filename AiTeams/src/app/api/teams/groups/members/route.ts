import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";

// 获取群组成员列表
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const groupId = searchParams.get("groupId");

    if (!groupId) {
      return NextResponse.json({ error: "群组ID不能为空" }, { status: 400 });
    }

    const client = getSupabaseClient();

    // 查询群组成员
    const { data: memberData, error: memberError } = await client
      .from("group_members")
      .select("user_id, added_at")
      .eq("group_id", groupId);

    if (memberError) {
      console.error("查询群组成员失败:", memberError);
      return NextResponse.json({ error: "查询成员失败" }, { status: 500 });
    }

    if (!memberData || memberData.length === 0) {
      return NextResponse.json({ success: true, members: [] });
    }

    // 获取用户详情
    const userIds = memberData.map((m: { user_id: string }) => m.user_id);
    const { data: usersData, error: usersError } = await client
      .from("users")
      .select("id, name, phone, email, avatar, department, position, is_active")
      .in("id", userIds);

    if (usersError) {
      console.error("查询用户信息失败:", usersError);
      return NextResponse.json({ error: "查询用户信息失败" }, { status: 500 });
    }

    const members = memberData.map((member: { user_id: string; added_at: string }) => {
      const user = usersData?.find((u: { id: string }) => u.id === member.user_id);
      return {
        id: member.user_id,
        name: user?.name || "",
        department: user?.department || "",
        position: user?.position || "",
        avatar: user?.avatar || "",
        email: user?.email || "",
        addedAt: member.added_at,
      };
    });

    return NextResponse.json({
      success: true,
      members,
    });
  } catch (error) {
    console.error("获取群组成员错误:", error);
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}

// 添加群组成员
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { groupId, userIds } = body;

    if (!groupId || !userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return NextResponse.json({ error: "群组ID和用户ID列表不能为空" }, { status: 400 });
    }

    const client = getSupabaseClient();

    // 先获取已存在的成员，避免重复
    const { data: existingMembers } = await client
      .from("group_members")
      .select("user_id")
      .eq("group_id", groupId)
      .in("user_id", userIds);

    const existingUserIds = new Set(
      (existingMembers || []).map((m: { user_id: string }) => m.user_id)
    );

    // 过滤掉已存在的成员
    const newUserIds = userIds.filter((id: string) => !existingUserIds.has(id));

    if (newUserIds.length === 0) {
      return NextResponse.json({
        success: true,
        message: "所有用户已是群组成员",
        addedCount: 0,
      });
    }

    const members = newUserIds.map((userId: string) => ({
      group_id: groupId,
      user_id: userId,
    }));

    const { error } = await client
      .from("group_members")
      .insert(members);

    if (error) {
      console.error("添加群组成员失败:", error);
      return NextResponse.json({ error: "添加成员失败" }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      addedCount: newUserIds.length,
    });
  } catch (error) {
    console.error("添加群组成员错误:", error);
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}

// 移除群组成员
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const groupId = searchParams.get("groupId");
    const userId = searchParams.get("userId");

    if (!groupId || !userId) {
      return NextResponse.json({ error: "群组ID和用户ID不能为空" }, { status: 400 });
    }

    const client = getSupabaseClient();

    const { error } = await client
      .from("group_members")
      .delete()
      .eq("group_id", groupId)
      .eq("user_id", userId);

    if (error) {
      console.error("移除群组成员失败:", error);
      return NextResponse.json({ error: "移除成员失败" }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
    });
  } catch (error) {
    console.error("移除群组成员错误:", error);
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}
