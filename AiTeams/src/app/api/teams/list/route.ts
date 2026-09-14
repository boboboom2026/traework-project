import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";

// 获取用户团队列表
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");

    if (!userId) {
      return NextResponse.json({ error: "用户ID不能为空" }, { status: 400 });
    }

    const client = getSupabaseClient();

    // 获取用户的团队成员关系
    const { data: memberData, error: memberError } = await client
      .from("team_members")
      .select("team_id, role, joined_at")
      .eq("user_id", userId);

    if (memberError) {
      console.error("查询团队成员失败:", memberError);
      return NextResponse.json({ error: "查询失败" }, { status: 500 });
    }

    const teamIds = memberData?.map((m) => m.team_id) || [];

    if (teamIds.length === 0) {
      return NextResponse.json({
        success: true,
        teams: [],
      });
    }

    // 获取团队详情
    const { data: teamsData, error: teamsError } = await client.from("teams").select("*").in("id", teamIds);

    if (teamsError) {
      console.error("查询团队失败:", teamsError);
      return NextResponse.json({ error: "查询失败" }, { status: 500 });
    }

    // 合并成员关系中的角色信息
    const teams = teamsData?.map((team) => {
      const member = memberData?.find((m) => m.team_id === team.id);
      return {
        ...team,
        role: member?.role,
        joined_at: member?.joined_at,
      };
    });

    return NextResponse.json({
      success: true,
      teams,
    });
  } catch (error) {
    console.error("获取团队列表错误:", error);
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}
