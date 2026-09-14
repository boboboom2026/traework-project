import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";

// 获取频道详情/列表
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const channelId = searchParams.get("channelId");
    const teamId = searchParams.get("teamId");
    const sectionId = searchParams.get("sectionId");
    const userId = searchParams.get("userId");

    const client = getSupabaseClient();

    if (channelId) {
      // 获取单个频道详情
      const { data: channel, error } = await client
        .from("channels")
        .select("*")
        .eq("id", channelId)
        .eq("is_active", true)
        .single();

      if (error) {
        console.error("查询频道失败:", error);
        return NextResponse.json({ error: "查询频道失败" }, { status: 500 });
      }

      const channelData = channel as {
        id: string;
        type: string;
        creator_id: string;
        created_at: string;
        is_pinned: boolean;
        is_default: boolean;
        [key: string]: unknown;
      };

      // 私密频道权限检查
      let isMember = false;
      if (userId) {
        const { data: membership } = await client
          .from("channel_members")
          .select("id")
          .eq("channel_id", channelId)
          .eq("user_id", userId)
          .limit(1);
        isMember = !!(membership && membership.length > 0);
      }

      if (channelData.type === "private" && !isMember) {
        return NextResponse.json({ error: "无权查看此私密频道", isPrivate: true }, { status: 403 });
      }

      // 获取频道成员数
      const { count } = await client
        .from("channel_members")
        .select("*", { count: "exact", head: true })
        .eq("channel_id", channelId);

      // 获取创建者昵称
      let creatorName = "";
      if (channelData.creator_id) {
        const { data: creator } = await client
          .from("users")
          .select("name")
          .eq("id", channelData.creator_id)
          .single();
        creatorName = creator?.name || "";
      }

      return NextResponse.json({
        success: true,
        channel: {
          ...channelData,
          memberCount: count || 0,
          creatorName,
          isMember,
        },
      });
    }

    // 获取团队下的频道列表
    let query = client
      .from("channels")
      .select("*")
      .eq("is_active", true)
      .order("sort_order", { ascending: true });

    if (teamId) query = query.eq("team_id", teamId);
    if (sectionId) query = query.eq("section_id", sectionId);

    const { data: channels, error } = await query;

    if (error) {
      console.error("查询频道列表失败:", error);
      return NextResponse.json({ error: "查询频道列表失败" }, { status: 500 });
    }

    return NextResponse.json({ success: true, channels: channels || [] });
  } catch (error) {
    console.error("获取频道错误:", error);
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}

// 创建频道
export async function POST(request: NextRequest) {
  try {
    const { teamId, sectionId, name, description, type, icon, creatorId } = await request.json();

    if (!teamId || !name || !creatorId) {
      return NextResponse.json({ error: "参数不完整" }, { status: 400 });
    }

    const client = getSupabaseClient();

    // 获取当前最大 sort_order
    const sortQuery = sectionId
      ? client.from("channels").select("sort_order").eq("section_id", sectionId).eq("is_active", true).order("sort_order", { ascending: false }).limit(1)
      : client.from("channels").select("sort_order").eq("team_id", teamId).eq("section_id", null).eq("is_active", true).order("sort_order", { ascending: false }).limit(1);

    const { data: maxOrder } = await sortQuery;
    const nextOrder = maxOrder && maxOrder.length > 0 ? (maxOrder[0] as { sort_order: number }).sort_order + 1 : 0;

    const { data: newChannel, error } = await client
      .from("channels")
      .insert({
        team_id: teamId,
        section_id: sectionId || null,
        name,
        description: description || null,
        type: type || "public",
        icon: icon || null,
        creator_id: creatorId,
        sort_order: nextOrder,
      })
      .select()
      .single();

    if (error) {
      console.error("创建频道失败:", error);
      return NextResponse.json({ error: "创建频道失败" }, { status: 500 });
    }

    // 创建者自动加入频道
    await client
      .from("channel_members")
      .insert({
        channel_id: newChannel.id,
        user_id: creatorId,
      });

    return NextResponse.json({ success: true, channel: newChannel });
  } catch (error) {
    console.error("创建频道错误:", error);
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}

// 更新频道
export async function PUT(request: NextRequest) {
  try {
    const { channelId, name, description, type, icon, sectionId, sortOrder, isPinned, aiAssistantEnabled, aiAssistantId, aiAssistantConfig } = await request.json();

    if (!channelId) {
      return NextResponse.json({ error: "频道ID不能为空" }, { status: 400 });
    }

    const client = getSupabaseClient();

    const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (type !== undefined) updateData.type = type;
    if (icon !== undefined) updateData.icon = icon;
    if (sectionId !== undefined) updateData.section_id = sectionId;
    if (sortOrder !== undefined) updateData.sort_order = sortOrder;
    if (isPinned !== undefined) updateData.is_pinned = isPinned;
    if (aiAssistantEnabled !== undefined) updateData.ai_assistant_enabled = aiAssistantEnabled;
    if (aiAssistantId !== undefined) updateData.ai_assistant_id = aiAssistantId || null;
    if (aiAssistantConfig !== undefined) updateData.ai_assistant_config = aiAssistantConfig;

    const { data, error } = await client
      .from("channels")
      .update(updateData)
      .eq("id", channelId)
      .select()
      .single();

    if (error) {
      console.error("更新频道失败:", error);
      return NextResponse.json({ error: "更新频道失败" }, { status: 500 });
    }

    return NextResponse.json({ success: true, channel: data });
  } catch (error) {
    console.error("更新频道错误:", error);
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}

// 删除频道（软删除）
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const channelId = searchParams.get("channelId");

    if (!channelId) {
      return NextResponse.json({ error: "频道ID不能为空" }, { status: 400 });
    }

    const client = getSupabaseClient();

    // 检查是否为默认频道
    const { data: channel } = await client
      .from("channels")
      .select("is_default")
      .eq("id", channelId)
      .single();

    if (channel && (channel as { is_default: boolean }).is_default) {
      return NextResponse.json({ error: "默认频道不可删除" }, { status: 400 });
    }

    const { error } = await client
      .from("channels")
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq("id", channelId);

    if (error) {
      console.error("删除频道失败:", error);
      return NextResponse.json({ error: "删除频道失败" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("删除频道错误:", error);
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}

// PATCH: 批量更新频道排序
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { channelIds, sectionId, teamId } = body;

    if (!channelIds || !Array.isArray(channelIds)) {
      return NextResponse.json({ error: "频道ID列表不能为空" }, { status: 400 });
    }

    const client = getSupabaseClient();

    // 批量更新排序
    const updates = channelIds.map((id: string, index: number) => 
      client.from("channels").update({ 
        sort_order: index,
        section_id: sectionId || null,
        updated_at: new Date().toISOString()
      }).eq("id", id)
    );

    const results = await Promise.all(updates);
    const hasError = results.some(r => r.error);

    if (hasError) {
      console.error("批量更新频道排序失败");
      return NextResponse.json({ error: "批量更新失败" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("批量更新频道排序错误:", error);
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}
