import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";

// 获取分区列表（含频道）
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const teamId = searchParams.get("teamId");
    const userId = searchParams.get("userId");

    if (!teamId) {
      return NextResponse.json({ error: "团队ID不能为空" }, { status: 400 });
    }

    const client = getSupabaseClient();

    // 获取分区列表
    const { data: sections, error: sectionError } = await client
      .from("channel_sections")
      .select("*")
      .eq("team_id", teamId)
      .order("sort_order", { ascending: true });

    if (sectionError) {
      console.error("查询分区失败:", sectionError);
      return NextResponse.json({ error: "查询分区失败" }, { status: 500 });
    }

    // 获取所有频道
    const { data: channelsData, error: channelsError } = await client
      .from("channels")
      .select("*")
      .eq("team_id", teamId)
      .eq("is_active", true)
      .order("sort_order", { ascending: true });

    if (channelsError) {
      console.error("查询频道失败:", channelsError);
      return NextResponse.json({ error: "查询频道失败" }, { status: 500 });
    }

    // 获取当前用户已加入的频道ID列表
    let userChannelIds = new Set<string>();
    if (userId) {
      const { data: userMemberships } = await client
        .from("channel_members")
        .select("channel_id")
        .eq("user_id", userId);

      if (userMemberships) {
        userChannelIds = new Set(
          (userMemberships as { channel_id: string }[]).map((m) => m.channel_id)
        );
      }
    }

    // 过滤和处理频道数据
    const processChannel = (ch: {
      id: string;
      name: string;
      description: string | null;
      type: string;
      icon: string | null;
      creator_id: string;
      sort_order: number;
      is_default: boolean;
      is_pinned: boolean;
    }) => {
      // 私密频道：仅成员可见
      if (ch.type === "private" && !userChannelIds.has(ch.id)) {
        return null;
      }

      return {
        id: ch.id,
        name: ch.name,
        description: ch.description,
        type: ch.type,
        icon: ch.icon,
        creatorId: ch.creator_id,
        sortOrder: ch.sort_order,
        isDefault: ch.is_default,
        isPinned: ch.is_pinned,
        isMember: userChannelIds.has(ch.id),
      };
    };

    // 组装分区+频道数据
    const result = (sections || []).map((section: {
      id: string;
      name: string;
      icon: string | null;
      is_default: boolean;
      sort_order: number;
      is_collapsed: boolean;
      created_by: string | null;
      created_at: string;
    }) => {
      const sectionChannels = (channelsData || [])
        .filter((ch: { section_id: string | null }) => ch.section_id === section.id)
        .map(processChannel)
        .filter(Boolean) as Array<{
          id: string;
          name: string;
          description: string | null;
          type: string;
          icon: string | null;
          creatorId: string;
          sortOrder: number;
          isDefault: boolean;
          isPinned: boolean;
          isMember: boolean;
        }>;

      // 排序：默认分区 → 默认频道永远最前，其余按置顶优先再按 sort_order
      // 非默认分区 → 置顶频道排最前，其余按 sort_order
      if (section.is_default) {
        sectionChannels.sort((a, b) => {
          if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
          if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
          return a.sortOrder - b.sortOrder;
        });
      } else {
        sectionChannels.sort((a, b) => {
          if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
          return a.sortOrder - b.sortOrder;
        });
      }

      return {
        id: section.id,
        name: section.name,
        icon: section.icon,
        isDefault: section.is_default,
        sortOrder: section.sort_order,
        isCollapsed: section.is_collapsed,
        createdBy: section.created_by,
        createdAt: section.created_at,
        channels: sectionChannels,
      };
    });

    // 也包含没有分区的频道（section_id 为 null）— 归入默认分区
    const orphanChannels = (channelsData || [])
      .filter((ch: { section_id: string | null }) => ch.section_id === null)
      .map(processChannel)
      .filter(Boolean) as Array<{
        id: string;
        name: string;
        description: string | null;
        type: string;
        icon: string | null;
        creatorId: string;
        sortOrder: number;
        isDefault: boolean;
        isPinned: boolean;
        isMember: boolean;
      }>;

    return NextResponse.json({
      success: true,
      sections: result,
      orphanChannels,
    });
  } catch (error) {
    console.error("获取分区列表错误:", error);
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}

// 创建分区
export async function POST(request: NextRequest) {
  try {
    const { teamId, name, icon, createdBy } = await request.json();

    if (!teamId || !name) {
      return NextResponse.json({ error: "参数不完整" }, { status: 400 });
    }

    const client = getSupabaseClient();

    // 获取当前最大 sort_order
    const { data: maxOrder } = await client
      .from("channel_sections")
      .select("sort_order")
      .eq("team_id", teamId)
      .order("sort_order", { ascending: false })
      .limit(1);

    const nextOrder = maxOrder && maxOrder.length > 0 ? (maxOrder[0] as { sort_order: number }).sort_order + 1 : 0;

    const { data: newSection, error } = await client
      .from("channel_sections")
      .insert({
        team_id: teamId,
        name,
        icon: icon || null,
        created_by: createdBy || null,
        sort_order: nextOrder,
      })
      .select()
      .single();

    if (error) {
      console.error("创建分区失败:", error);
      return NextResponse.json({ error: "创建分区失败" }, { status: 500 });
    }

    return NextResponse.json({ success: true, section: newSection });
  } catch (error) {
    console.error("创建分区错误:", error);
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}

// 更新分区
export async function PUT(request: NextRequest) {
  try {
    const { sectionId, name, icon, isCollapsed, sortOrder } = await request.json();

    if (!sectionId) {
      return NextResponse.json({ error: "分区ID不能为空" }, { status: 400 });
    }

    const client = getSupabaseClient();

    const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (name !== undefined) updateData.name = name;
    if (icon !== undefined) updateData.icon = icon;
    if (isCollapsed !== undefined) updateData.is_collapsed = isCollapsed;
    if (sortOrder !== undefined) updateData.sort_order = sortOrder;

    const { data, error } = await client
      .from("channel_sections")
      .update(updateData)
      .eq("id", sectionId)
      .select()
      .single();

    if (error) {
      console.error("更新分区失败:", error);
      return NextResponse.json({ error: "更新分区失败" }, { status: 500 });
    }

    return NextResponse.json({ success: true, section: data });
  } catch (error) {
    console.error("更新分区错误:", error);
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}

// 删除分区
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const sectionId = searchParams.get("sectionId");

    if (!sectionId) {
      return NextResponse.json({ error: "分区ID不能为空" }, { status: 400 });
    }

    const client = getSupabaseClient();

    // 检查是否为默认分区
    const { data: section } = await client
      .from("channel_sections")
      .select("is_default, team_id")
      .eq("id", sectionId)
      .single();

    if (section && (section as { is_default: boolean }).is_default) {
      return NextResponse.json({ error: "默认分区不可删除" }, { status: 400 });
    }

    const teamId = (section as { team_id: string }).team_id;

    // 找到默认分区（"频道"分区）
    const { data: defaultSection } = await client
      .from("channel_sections")
      .select("id")
      .eq("team_id", teamId)
      .eq("is_default", true)
      .single();

    if (defaultSection) {
      // 将该分区下的所有频道移到默认分区
      await client
        .from("channels")
        .update({ section_id: (defaultSection as { id: string }).id, updated_at: new Date().toISOString() })
        .eq("section_id", sectionId)
        .eq("is_active", true);
    }

    const { error } = await client
      .from("channel_sections")
      .delete()
      .eq("id", sectionId);

    if (error) {
      console.error("删除分区失败:", error);
      return NextResponse.json({ error: "删除分区失败" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("删除分区错误:", error);
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}

// PATCH: 批量更新分区排序
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { sectionIds, teamId } = body;

    if (!sectionIds || !Array.isArray(sectionIds)) {
      return NextResponse.json({ error: "分区ID列表不能为空" }, { status: 400 });
    }

    const client = getSupabaseClient();

    // 批量更新排序
    const updates = sectionIds.map((id: string, index: number) => 
      client.from("channel_sections").update({ 
        sort_order: index,
        updated_at: new Date().toISOString()
      }).eq("id", id)
    );

    const results = await Promise.all(updates);
    const hasError = results.some(r => r.error);

    if (hasError) {
      console.error("批量更新分区排序失败");
      return NextResponse.json({ error: "批量更新失败" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("批量更新分区排序错误:", error);
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}
