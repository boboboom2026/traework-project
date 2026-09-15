import { NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";
import { AVAILABLE_MODELS } from "@/lib/llm/models";

export async function GET() {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from("models")
      .select("*")
      .eq("is_active", true)
      .order("provider", { ascending: true })
      .order("name", { ascending: true });

    if (error) throw error;

    // 模型表为空时，回退到内置模型目录
    if (!data || data.length === 0) {
      return NextResponse.json({
        success: true,
        data: AVAILABLE_MODELS,
        fallback: true,
      });
    }

    return NextResponse.json({
      success: true,
      data,
    });
  } catch {
    // 数据库不可用时，回退到内置模型目录
    return NextResponse.json({
      success: true,
      data: AVAILABLE_MODELS,
      fallback: true,
    });
  }
}
