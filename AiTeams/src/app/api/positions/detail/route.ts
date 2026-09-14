import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ success: false, error: "缺少岗位ID" }, { status: 400 });
    }

    const supabase = getSupabaseClient();

    // 获取岗位信息
    const { data: position, error: posError } = await supabase
      .from("positions")
      .select("*")
      .eq("id", id)
      .eq("status", "active")
      .single();

    if (posError || !position) {
      return NextResponse.json({ success: false, error: "岗位不存在" }, { status: 404 });
    }

    // 获取分配到此岗位的智能体
    const { data: agents } = await supabase
      .from("agents")
      .select("id, name, avatar")
      .eq("position_id", id)
      .eq("status", "active");

    // 获取此岗位的技能（职能工作）
    const { data: skills } = await supabase
      .from("skills")
      .select("id, name, description, content, source_type, created_at, updated_at")
      .eq("position_id", id)
      .eq("status", "active")
      .order("created_at", { ascending: true });

    return NextResponse.json({
      success: true,
      position: {
        id: position.id,
        name: position.name,
        description: position.description,
        icon: position.icon || "Briefcase",
        color: position.color || "#3B82F6",
        createdAt: position.created_at,
        agents: (agents || []).map((a: any) => ({ id: a.id, name: a.name, avatar: a.avatar })),
        skills: (skills || []).map((s: any) => ({
          id: s.id,
          name: s.name,
          description: s.description,
          content: s.content,
          sourceType: s.source_type,
          createdAt: s.created_at,
          updatedAt: s.updated_at,
        })),
        jobWorks: typeof position.job_works === 'string' ? JSON.parse(position.job_works) : (position.job_works || []),
      },
    });
  } catch (err) {
    console.error("获取岗位详情失败:", err);
    return NextResponse.json({ success: false, error: "获取岗位详情失败" }, { status: 500 });
  }
}