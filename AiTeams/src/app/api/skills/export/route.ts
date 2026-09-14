import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";

// GET /api/skills/export?id=xxx - 导出技能为 Markdown 文件
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "技能ID不能为空" }, { status: 400 });
    }

    const client = getSupabaseClient();
    const { data, error } = await client
      .from("skills")
      .select("*")
      .eq("id", id)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: "技能不存在" }, { status: 404 });
    }

    // content 已经是 Markdown 文本，直接返回
    const fileContent = data.content || "";
    const fileName = `${data.name}.md`;

    return new NextResponse(fileContent, {
      status: 200,
      headers: {
        "Content-Type": "text/markdown;charset=utf-8",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(fileName)}"`,
      },
    });
  } catch (error) {
    console.error("导出技能失败:", error);
    return NextResponse.json({ error: "导出技能失败" }, { status: 500 });
  }
}
