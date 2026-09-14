import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";

// 搜索团队
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const keyword = searchParams.get("keyword");
    const page = parseInt(searchParams.get("page") || "1");
    const pageSize = parseInt(searchParams.get("pageSize") || "10");

    if (!keyword) {
      return NextResponse.json({ error: "搜索关键词不能为空" }, { status: 400 });
    }

    const client = getSupabaseClient();

    // 使用 ilike 进行模糊搜索
    const { data: teamsData, error: teamsError } = await client
      .from("teams")
      .select("id, name, type, logo, color, industry, created_at")
      .ilike("name", `%${keyword}%`)
      .order("created_at", { ascending: false })
      .range((page - 1) * pageSize, page * pageSize);

    if (teamsError) {
      console.error("搜索团队失败:", teamsError);
      return NextResponse.json({ error: "搜索失败" }, { status: 500 });
    }

    // 获取总数
    const { count } = await client
      .from("teams")
      .select("*", { count: "exact", head: true })
      .ilike("name", `%${keyword}%`);

    return NextResponse.json({
      success: true,
      teams: teamsData || [],
      total: count || 0,
      page,
      pageSize,
    });
  } catch (error) {
    console.error("搜索团队错误:", error);
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}
