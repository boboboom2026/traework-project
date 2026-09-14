import { getSupabaseClient } from "@/storage/database/supabase-client";

/**
 * 初始化团队频道模块：
 * 1. 创建默认分区 "频道"（is_default=true，不可删除）
 * 2. 创建默认频道 "全员"（is_default=true，不可删除、不可退出）
 * 3. 将创建者自动加入 "全员" 频道
 */
export async function initializeTeamChannels(teamId: string, creatorId: string) {
  const client = getSupabaseClient();

  // 1. 创建默认分区
  const { data: defaultSection, error: sectionError } = await client
    .from("channel_sections")
    .insert({
      team_id: teamId,
      name: "频道",
      icon: null,
      is_default: true,
      sort_order: 0,
      is_collapsed: false,
      created_by: creatorId,
    })
    .select("id")
    .single();

  if (sectionError) {
    console.error("初始化频道分区失败:", sectionError);
    return null;
  }

  // 2. 创建默认 "全员" 频道
  const { data: defaultChannel, error: channelError } = await client
    .from("channels")
    .insert({
      team_id: teamId,
      section_id: defaultSection.id,
      name: "全员",
      description: "团队默认频道，所有成员自动加入",
      type: "public",
      icon: null,
      creator_id: creatorId,
      sort_order: 0,
      is_active: true,
      is_default: true,
      is_pinned: false,
    })
    .select("id")
    .single();

  if (channelError) {
    console.error("初始化全员频道失败:", channelError);
    return null;
  }

  // 3. 创建者自动加入 "全员" 频道
  await addMemberToDefaultChannel(defaultChannel.id, creatorId);

  return { sectionId: defaultSection.id, channelId: defaultChannel.id };
}

/**
 * 将用户加入团队的默认频道（"全员"）
 * 用于：加入团队、接受邀请等场景
 */
export async function addMemberToDefaultChannel(channelId: string, userId: string) {
  const client = getSupabaseClient();

  // 检查是否已加入
  const { data: existing } = await client
    .from("channel_members")
    .select("id")
    .eq("channel_id", channelId)
    .eq("user_id", userId)
    .maybeSingle();

  if (existing) return;

  await client.from("channel_members").insert({
    channel_id: channelId,
    user_id: userId,
  });
}

/**
 * 将用户加入团队的所有默认频道
 * 先查找团队中所有 is_default=true 的频道，再逐一加入
 */
export async function addMemberToTeamDefaultChannels(teamId: string, userId: string) {
  const client = getSupabaseClient();

  // 查找团队所有默认频道
  const { data: defaultChannels } = await client
    .from("channels")
    .select("id")
    .eq("team_id", teamId)
    .eq("is_default", true)
    .eq("is_active", true);

  if (!defaultChannels || defaultChannels.length === 0) return;

  // 查找用户已加入的频道
  const { data: existingMemberships } = await client
    .from("channel_members")
    .select("channel_id")
    .eq("user_id", userId);

  const joinedChannelIds = new Set(
    (existingMemberships || []).map((m) => m.channel_id)
  );

  // 批量加入未加入的默认频道
  const toJoin = defaultChannels.filter((ch) => !joinedChannelIds.has(ch.id));

  if (toJoin.length > 0) {
    await client.from("channel_members").insert(
      toJoin.map((ch) => ({
        channel_id: ch.id,
        user_id: userId,
      }))
    );
  }
}
