import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const teamId = searchParams.get("teamId");

    if (!teamId) {
      return NextResponse.json({ error: "teamId 参数缺失" }, { status: 400 });
    }

    const client = getSupabaseClient();

    const { data: departments, error } = await client
      .from("departments")
      .select("id, name, parent_id, sort_order")
      .eq("team_id", teamId)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });

    if (error) {
      return NextResponse.json({ error: "查询部门列表失败" }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: departments });
  } catch (err) {
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}