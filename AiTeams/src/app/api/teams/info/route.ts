import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";

// 获取团队信息
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const teamId = searchParams.get("teamId");

    if (!teamId) {
      return NextResponse.json({ error: "团队ID不能为空" }, { status: 400 });
    }

    const client = getSupabaseClient();
    const { data: team, error } = await client
      .from("teams")
      .select("id, name, logo, color, industry, type, created_at")
      .eq("id", teamId)
      .single();

    if (error) {
      console.error("查询团队信息失败:", error);
      return NextResponse.json({ error: "查询团队信息失败" }, { status: 500 });
    }

    return NextResponse.json({ success: true, team });
  } catch (error) {
    console.error("获取团队信息错误:", error);
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}

// 更新团队信息
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { teamId, name, logo, color, industry } = body;

    if (!teamId) {
      return NextResponse.json({ error: "团队ID不能为空" }, { status: 400 });
    }

    const updateData: Record<string, string | undefined> = {};
    if (name !== undefined) updateData.name = name;
    if (logo !== undefined) updateData.logo = logo;
    if (color !== undefined) updateData.color = color;
    if (industry !== undefined) updateData.industry = industry;
    updateData.updated_at = new Date().toISOString();

    const client = getSupabaseClient();
    const { data, error } = await client
      .from("teams")
      .update(updateData)
      .eq("id", teamId)
      .select("id, name, logo, color, industry, type")
      .single();

    if (error) {
      console.error("更新团队信息失败:", error);
      return NextResponse.json({ error: "更新团队信息失败" }, { status: 500 });
    }

    return NextResponse.json({ success: true, team: data });
  } catch (error) {
    console.error("更新团队信息错误:", error);
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}