import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";

// 加入频道
export async function POST(request: NextRequest) {
  try {
    const { channelId, userId } = await request.json();

    if (!channelId || !userId) {
      return NextResponse.json({ error: "参数不完整" }, { status: 400 });
    }

    const client = getSupabaseClient();

    // 获取频道信息
    const { data: channel, error: channelError } = await client
      .from("channels")
      .select("id, type, is_active, is_default, name")
      .eq("id", channelId)
      .single();

    if (channelError || !channel) {
      return NextResponse.json({ error: "频道不存在" }, { status: 404 });
    }

    const channelData = channel as { id: string; type: string; is_active: boolean; is_default: boolean; name: string };

    if (!channelData.is_active) {
      return NextResponse.json({ error: "频道已停用" }, { status: 400 });
    }

    // 私密频道不允许自由加入
    if (channelData.type === "private") {
      return NextResponse.json({ error: "私密频道需要邀请才能加入" }, { status: 403 });
    }

    // 检查是否已加入
    const { data: existing } = await client
      .from("channel_members")
      .select("id")
      .eq("channel_id", channelId)
      .eq("user_id", userId)
      .limit(1);

    if (existing && existing.length > 0) {
      return NextResponse.json({ success: true, message: "已在该频道中" });
    }

    // 加入频道
    const { error: joinError } = await client
      .from("channel_members")
      .insert({
        channel_id: channelId,
        user_id: userId,
      });

    if (joinError) {
      console.error("加入频道失败:", joinError);
      return NextResponse.json({ error: "加入频道失败" }, { status: 500 });
    }

    return NextResponse.json({ success: true, channelName: channelData.name });
  } catch (error) {
    console.error("加入频道错误:", error);
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}

// 退出频道
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const channelId = searchParams.get("channelId");
    const userId = searchParams.get("userId");

    if (!channelId || !userId) {
      return NextResponse.json({ error: "参数不完整" }, { status: 400 });
    }

    const client = getSupabaseClient();

    // 检查是否为默认频道（默认频道不可退出）
    const { data: channel } = await client
      .from("channels")
      .select("is_default")
      .eq("id", channelId)
      .single();

    if (channel && (channel as { is_default: boolean }).is_default) {
      return NextResponse.json({ error: "默认频道不可退出" }, { status: 400 });
    }

    // 检查是否为频道创建者（创建者不可退出）
    const { data: channelCreator } = await client
      .from("channels")
      .select("creator_id")
      .eq("id", channelId)
      .single();

    if (channelCreator && (channelCreator as { creator_id: string }).creator_id === userId) {
      return NextResponse.json({ error: "频道创建者不可退出，如需离开请转让或删除频道" }, { status: 400 });
    }

    // 退出频道
    const { error } = await client
      .from("channel_members")
      .delete()
      .eq("channel_id", channelId)
      .eq("user_id", userId);

    if (error) {
      console.error("退出频道失败:", error);
      return NextResponse.json({ error: "退出频道失败" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("退出频道错误:", error);
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}
