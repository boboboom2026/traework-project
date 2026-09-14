import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";
import { addMemberToTeamDefaultChannels } from "@/lib/team-channels";

// 创建系统消息
async function createSystemNotification(
  client: ReturnType<typeof getSupabaseClient>,
  teamId: string,
  userId: string | null,
  type: string,
  title: string,
  content?: string,
  link?: string
) {
  try {
    await client.from("system_notifications").insert({
      team_id: teamId,
      user_id: userId,
      type,
      title,
      content,
      link,
    });
  } catch (err) {
    console.error("创建系统消息失败:", err);
  }
}

// 加入团队
export async function POST(request: NextRequest) {
  try {
    const { userId, teamId } = await request.json();

    if (!userId || !teamId) {
      return NextResponse.json({ error: "用户ID和团队ID不能为空" }, { status: 400 });
    }

    const client = getSupabaseClient();

    // 检查用户是否存在
    const { data: userData } = await client.from("users").select("id").eq("id", userId).maybeSingle();

    if (!userData) {
      return NextResponse.json({ error: "用户不存在" }, { status: 404 });
    }

    // 检查团队是否存在
    const { data: teamData } = await client.from("teams").select("id, name").eq("id", teamId).maybeSingle();

    if (!teamData) {
      return NextResponse.json({ error: "团队不存在" }, { status: 404 });
    }

    // 检查是否已经是团队成员
    const { data: existingMember } = await client
      .from("team_members")
      .select("id")
      .eq("user_id", userId)
      .eq("team_id", teamId)
      .maybeSingle();

    if (existingMember) {
      return NextResponse.json({ error: "你已经是该团队成员" }, { status: 409 });
    }

    // 加入团队
    const { error: memberError } = await client.from("team_members").insert({
      team_id: teamId,
      user_id: userId,
      role: "member",
    });

    if (memberError) {
      console.error("加入团队失败:", memberError);
      return NextResponse.json({ error: "加入团队失败" }, { status: 500 });
    }

    // 自动加入团队的默认频道（如"全员"）
    await addMemberToTeamDefaultChannels(teamId, userId);

    // 发送系统消息
    await createSystemNotification(
      client,
      teamId,
      userId,
      "welcome",
      `欢迎加入 ${teamData.name}！`,
      "你可以开始浏览频道、与团队成员交流了。",
      "/channels"
    );

    // 通知团队管理员有新成员加入（全员通知，user_id为null）
    const { data: userInfo } = await client
      .from("users")
      .select("name")
      .eq("id", userId)
      .maybeSingle();

    if (userInfo) {
      await createSystemNotification(
        client,
        teamId,
        null,
        "member_joined",
        `新成员加入`,
        `${userInfo.name} 加入了团队`,
        "/contacts"
      );
    }

    return NextResponse.json({
      success: true,
      message: `成功加入 ${teamData.name}`,
      team: teamData,
    });
  } catch (error) {
    console.error("加入团队错误:", error);
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}
