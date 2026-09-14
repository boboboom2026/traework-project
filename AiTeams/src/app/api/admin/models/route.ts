import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { getSupabaseClient } from "@/storage/database/supabase-client";

export async function GET(request: NextRequest) {
  try {
    const user = await requireAdmin(request);
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "50");
    const all = searchParams.get("all") === "true";

    const supabase = getSupabaseClient();
    let query = supabase.from("models").select("*", { count: "exact" });

    if (!all) {
      query = query.eq("is_active", true);
    }

    const { data, error, count } = await query
      .order("provider", { ascending: true })
      .order("name", { ascending: true })
      .range((page - 1) * limit, page * limit - 1);

    if (error) throw error;

    return NextResponse.json({
      success: true,
      data: data || [],
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limit),
      },
    });
  } catch (error: any) {
    if (error && typeof error === "object" && "status" in error && "headers" in error) {
      return error as NextResponse;
    }
    return NextResponse.json({ success: false, error: "获取模型列表失败" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireAdmin(request);
    const body = await request.json();
    const { id, name, provider, description, supportsMultimodal } = body;

    if (!id || !name || !provider) {
      return NextResponse.json(
        { success: false, error: "模型ID、名称和提供商为必填项" },
        { status: 400 }
      );
    }

    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from("models")
      .insert({
        id,
        name,
        provider,
        description: description || null,
        supports_multimodal: supportsMultimodal || false,
        is_active: true,
        is_builtin: false,
      })
      .select()
      .single();

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json(
          { success: false, error: "模型ID已存在" },
          { status: 409 }
        );
      }
      throw error;
    }

    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error: any) {
    if (error && typeof error === "object" && "status" in error && "headers" in error) {
      return error as NextResponse;
    }
    return NextResponse.json({ success: false, error: "创建模型失败" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const user = await requireAdmin(request);
    const body = await request.json();
    const { id, name, provider, description, supportsMultimodal, isActive } = body;

    if (!id) {
      return NextResponse.json(
        { success: false, error: "模型ID为必填项" },
        { status: 400 }
      );
    }

    const supabase = getSupabaseClient();
    const updateData: Record<string, any> = {};
    if (name !== undefined) updateData.name = name;
    if (provider !== undefined) updateData.provider = provider;
    if (description !== undefined) updateData.description = description;
    if (supportsMultimodal !== undefined) updateData.supports_multimodal = supportsMultimodal;
    if (isActive !== undefined) updateData.is_active = isActive;

    const { data, error } = await supabase
      .from("models")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    if (error && typeof error === "object" && "status" in error && "headers" in error) {
      return error as NextResponse;
    }
    return NextResponse.json({ success: false, error: "更新模型失败" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await requireAdmin(request);
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { success: false, error: "请提供模型ID" },
        { status: 400 }
      );
    }

    const supabase = getSupabaseClient();

    // 检查是否为内置模型
    const { data: model } = await supabase
      .from("models")
      .select("is_builtin")
      .eq("id", id)
      .single();

    if (model?.is_builtin) {
      // 内置模型只禁用，不删除
      await supabase.from("models").update({ is_active: false }).eq("id", id);
      return NextResponse.json({ success: true, data: { disabled: true } });
    }

    const { error } = await supabase.from("models").delete().eq("id", id);
    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (error && typeof error === "object" && "status" in error && "headers" in error) {
      return error as NextResponse;
    }
    return NextResponse.json({ success: false, error: "删除模型失败" }, { status: 500 });
  }
}