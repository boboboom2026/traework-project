import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";

// 获取团队成员列表
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const teamId = searchParams.get("teamId");

    if (!teamId) {
      return NextResponse.json({ error: "团队ID不能为空" }, { status: 400 });
    }

    const client = getSupabaseClient();

    // 查询团队成员（关联用户信息）
    const { data: memberData, error: memberError } = await client
      .from("team_members")
      .select("role, joined_at, user_id")
      .eq("team_id", teamId);

    if (memberError) {
      console.error("查询团队成员失败:", memberError);
      return NextResponse.json({ error: "查询成员失败" }, { status: 500 });
    }

    if (!memberData || memberData.length === 0) {
      return NextResponse.json({ success: true, members: [] });
    }

    // 获取所有成员的用户详情
    const userIds = memberData.map((m: { user_id: string }) => m.user_id);
    const { data: usersData, error: usersError } = await client
      .from("users")
      .select("id, name, nickname, phone, email, avatar, department, position, is_active")
      .in("id", userIds);

    if (usersError) {
      console.error("查询用户信息失败:", usersError);
      return NextResponse.json({ error: "查询用户信息失败" }, { status: 500 });
    }

    // 合并成员关系和用户信息
    const members = memberData.map((member: { user_id: string; role: string; joined_at: string }) => {
      const user = usersData?.find((u: { id: string; nickname?: string }) => u.id === member.user_id);
      return {
        id: member.user_id,
        name: (user as { name?: string })?.name || "",
        nickname: user?.nickname || "",
        department: user?.department || "无",
        position: user?.position || "",
        phone: user?.phone ? user.phone.replace(/(\d{3})\d{4}(\d{4})/, "$1****$2") : "",
        email: user?.email || "",
        avatar: user?.avatar || "",
        status: user?.is_active !== false ? "正常" : "已注销",
        role: member.role,
        joinedAt: member.joined_at,
      };
    });

    return NextResponse.json({
      success: true,
      members,
    });
  } catch (error) {
    console.error("获取团队成员错误:", error);
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}

// 更新成员角色
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { teamId, userId, role } = body;

    if (!teamId || !userId || !role) {
      return NextResponse.json({ error: "参数不完整" }, { status: 400 });
    }

    if (!["admin", "member"].includes(role)) {
      return NextResponse.json({ error: "无效的角色类型" }, { status: 400 });
    }

    const client = getSupabaseClient();

    // 检查目标成员是否存在
    const { data: member, error: findError } = await client
      .from("team_members")
      .select("id, role")
      .eq("team_id", teamId)
      .eq("user_id", userId)
      .single();

    if (findError || !member) {
      return NextResponse.json({ error: "成员不存在" }, { status: 404 });
    }

    // 不能修改owner角色
    if (member.role === "owner") {
      return NextResponse.json({ error: "不能修改团队所有者的角色" }, { status: 403 });
    }

    // 更新角色
    const { error: updateError } = await client
      .from("team_members")
      .update({ role })
      .eq("team_id", teamId)
      .eq("user_id", userId);

    if (updateError) {
      console.error("更新成员角色失败:", updateError);
      return NextResponse.json({ error: "更新角色失败" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("更新成员角色错误:", error);
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}

// 移除成员
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const teamId = searchParams.get("teamId");
    const userId = searchParams.get("userId");

    if (!teamId || !userId) {
      return NextResponse.json({ error: "参数不完整" }, { status: 400 });
    }

    const client = getSupabaseClient();

    // 检查目标成员
    const { data: member, error: findError } = await client
      .from("team_members")
      .select("id, role")
      .eq("team_id", teamId)
      .eq("user_id", userId)
      .single();

    if (findError || !member) {
      return NextResponse.json({ error: "成员不存在" }, { status: 404 });
    }

    // 不能移除owner
    if (member.role === "owner") {
      return NextResponse.json({ error: "不能移除团队所有者" }, { status: 403 });
    }

    // 移除成员（级联删除频道成员等关联数据）
    const { error: deleteError } = await client
      .from("team_members")
      .delete()
      .eq("team_id", teamId)
      .eq("user_id", userId);

    if (deleteError) {
      console.error("移除成员失败:", deleteError);
      return NextResponse.json({ error: "移除成员失败" }, { status: 500 });
    }

    // 同时移除该成员所有频道成员关系
    await client
      .from("channel_members")
      .delete()
      .eq("user_id", userId)
      .in("channel_id", (await client.from("channels").select("id").eq("team_id", teamId)).data?.map(c => c.id) || []);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("移除成员错误:", error);
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}
