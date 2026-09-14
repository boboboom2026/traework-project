import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";
import { initializeTeamChannels } from "@/lib/team-channels";

// 创建团队
export async function POST(request: NextRequest) {
  try {
    const { userId, teamName, industry } = await request.json();

    if (!userId) {
      return NextResponse.json({ error: "用户ID不能为空" }, { status: 400 });
    }

    if (!teamName) {
      return NextResponse.json({ error: "团队名称不能为空" }, { status: 400 });
    }

    const client = getSupabaseClient();

    // 检查用户是否存在
    const { data: userData } = await client.from("users").select("id").eq("id", userId).maybeSingle();

    if (!userData) {
      return NextResponse.json({ error: "用户不存在" }, { status: 404 });
    }

    // 创建团队
    const { data: teamData, error: teamError } = await client
      .from("teams")
      .insert({
        name: teamName,
        type: "company",
        owner_id: userId,
        industry,
      })
      .select()
      .single();

    if (teamError) {
      console.error("创建团队失败:", teamError);
      return NextResponse.json({ error: "创建团队失败" }, { status: 500 });
    }

    // 创建者自动成为团队所有者
    const { error: memberError } = await client.from("team_members").insert({
      team_id: teamData.id,
      user_id: userId,
      role: "owner",
    });

    if (memberError) {
      console.error("添加团队成员失败:", memberError);
    }

    // 初始化频道模块：创建默认分区"频道" + 默认频道"全员" + 创建者自动加入
    await initializeTeamChannels(teamData.id, userId);

    return NextResponse.json({
      success: true,
      team: teamData,
    });
  } catch (error) {
    console.error("创建团队错误:", error);
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}
