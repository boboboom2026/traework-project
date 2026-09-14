import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const teamId = searchParams.get("teamId");

    if (!teamId) {
      return NextResponse.json({ error: "teamId is required" }, { status: 400 });
    }

    const supabase = await getSupabaseClient();

    // 1. Total members count
    const { count: totalMembers } = await supabase
      .from("team_members")
      .select("*", { count: "exact", head: true })
      .eq("team_id", teamId);

    // 2. Active members (joined in last 30 days - proxy for active)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const { count: activeMembers } = await supabase
      .from("team_members")
      .select("*", { count: "exact", head: true })
      .eq("team_id", teamId)
      .gte("joined_at", thirtyDaysAgo.toISOString());

    // 3. Total channels (use is_active instead of deleted_at)
    const { count: totalChannels } = await supabase
      .from("channels")
      .select("*", { count: "exact", head: true })
      .eq("team_id", teamId)
      .eq("is_active", true);

    // 4. Get all channel IDs for this team (only active)
    const { data: channels } = await supabase
      .from("channels")
      .select("id, name")
      .eq("team_id", teamId)
      .eq("is_active", true);

    const channelIds = (channels || []).map((c: { id: string }) => c.id);

    // 5. Total messages (use is_active instead of deleted_at)
    let totalMessages = 0;
    let messagesLast7Days = 0;
    let messagesLast30Days = 0;

    if (channelIds.length > 0) {
      const { count: msgCount } = await supabase
        .from("channel_messages")
        .select("*", { count: "exact", head: true })
        .in("channel_id", channelIds)
        .eq("is_active", true);
      totalMessages = msgCount || 0;

      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const { count: count7d } = await supabase
        .from("channel_messages")
        .select("*", { count: "exact", head: true })
        .in("channel_id", channelIds)
        .eq("is_active", true)
        .gte("created_at", sevenDaysAgo.toISOString());
      messagesLast7Days = count7d || 0;

      const { count: count30d } = await supabase
        .from("channel_messages")
        .select("*", { count: "exact", head: true })
        .in("channel_id", channelIds)
        .eq("is_active", true)
        .gte("created_at", thirtyDaysAgo.toISOString());
      messagesLast30Days = count30d || 0;
    }

    // 6. Messages by channel (top 5)
    const topChannels: { name: string; count: number }[] = [];
    if (channelIds.length > 0 && channels) {
      for (const ch of channels.slice(0, 10)) {
        const { count } = await supabase
          .from("channel_messages")
          .select("*", { count: "exact", head: true })
          .eq("channel_id", ch.id)
          .eq("is_active", true);
        if (count && count > 0) {
          topChannels.push({ name: ch.name, count });
        }
      }
      topChannels.sort((a, b) => b.count - a.count);
      while (topChannels.length > 5) topChannels.pop();
    }

    // 7. Messages over time (last 7 days, daily)
    const dailyMessages: { date: string; count: number }[] = [];
    if (channelIds.length > 0) {
      for (let i = 6; i >= 0; i--) {
        const day = new Date();
        day.setDate(day.getDate() - i);
        const dayStart = new Date(day);
        dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date(day);
        dayEnd.setHours(23, 59, 59, 999);

        const { count } = await supabase
          .from("channel_messages")
          .select("*", { count: "exact", head: true })
          .in("channel_id", channelIds)
          .eq("is_active", true)
          .gte("created_at", dayStart.toISOString())
          .lte("created_at", dayEnd.toISOString());

        dailyMessages.push({
          date: day.toISOString().split("T")[0],
          count: count || 0,
        });
      }
    }

    // 8. Top active members (by message count)
    const topMembers: { userId: string; name: string; count: number }[] = [];
    if (channelIds.length > 0) {
      const { data: msgUsers } = await supabase
        .from("channel_messages")
        .select("sender_id")
        .in("channel_id", channelIds)
        .eq("is_active", true)
        .gte("created_at", thirtyDaysAgo.toISOString());

      if (msgUsers) {
        const userCountMap = new Map<string, number>();
        for (const m of msgUsers) {
          const uid = m.sender_id as string;
          userCountMap.set(uid, (userCountMap.get(uid) || 0) + 1);
        }
        const sorted = [...userCountMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);

        for (const [userId, count] of sorted) {
          const { data: user } = await supabase
            .from("users")
            .select("name, nickname")
            .eq("id", userId)
            .single();
          topMembers.push({
            userId,
            name: user?.nickname || user?.name || userId.slice(0, 8),
            count,
          });
        }
      }
    }

    return NextResponse.json({
      success: true,
      stats: {
        totalMembers: totalMembers || 0,
        activeMembers: activeMembers || 0,
        totalChannels: totalChannels || 0,
        totalMessages,
        messagesLast7Days,
        messagesLast30Days,
        topChannels,
        dailyMessages,
        topMembers,
      },
    });
  } catch (error) {
    console.error("Error fetching team stats:", error);
    return NextResponse.json(
      { error: "Failed to fetch team statistics" },
      { status: 500 }
    );
  }
}