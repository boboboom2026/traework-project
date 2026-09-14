import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";

interface SearchItem {
  id: string;
  type: "message" | "channel" | "user";
  title: string;
  content: string;
  meta?: string;
  link?: string;
  created_at?: string;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q")?.trim();
    const type = searchParams.get("type") || "all";
    const teamId = searchParams.get("teamId");
    const page = parseInt(searchParams.get("page") || "1");
    const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 50);

    if (!q || q.length < 1) {
      return NextResponse.json({ success: true, items: [], total: 0 });
    }

    const client = getSupabaseClient();
    const results: SearchItem[] = [];
    const keyword = `%${q}%`;

    // 1. Search channels
    if (type === "all" || type === "channels") {
      let query = client
        .from("channels")
        .select("id, name, description, type, created_at")
        .or(`name.ilike.${keyword},description.ilike.${keyword}`)
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(limit);

      if (teamId) {
        query = query.eq("team_id", teamId);
      }

      const { data: channels } = await query;

      if (channels) {
        for (const ch of channels) {
          results.push({
            id: ch.id,
            type: "channel",
            title: ch.name,
            content: ch.description || `# ${ch.type === "private" ? "私密" : "公开"}频道`,
            meta: "频道",
            link: `/channels?channel=${ch.id}`,
            created_at: ch.created_at,
          });
        }
      }
    }

    // 2. Search users
    if (type === "all" || type === "users") {
      let query = client
        .from("users")
        .select("id, name, nickname, department, position, avatar")
        .or(`name.ilike.${keyword},nickname.ilike.${keyword}`)
        .eq("is_active", true)
        .limit(limit);

      const { data: users } = await query;

      if (users) {
        for (const u of users) {
          const displayName = u.nickname || u.name;
          const deptInfo = [u.department, u.position].filter(Boolean).join(" · ");
          results.push({
            id: u.id,
            type: "user",
            title: displayName,
            content: deptInfo || u.name,
            meta: "用户",
            link: `/dms?userId=${u.id}`,
          });
        }
      }
    }

    // 3. Search channel messages
    if (type === "all" || type === "messages") {
      let msgQuery = client
        .from("channel_messages")
        .select(`
          id, content, channel_id, sender_id, created_at,
          channels!inner(name, team_id),
          users!inner(name, nickname)
        `)
        .ilike("content", keyword)
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(limit);

      if (teamId) {
        msgQuery = msgQuery.eq("channels.team_id", teamId);
      }

      const { data: messages } = await msgQuery;

      if (messages) {
        for (const m of messages as any[]) {
          const senderName = m.users?.nickname || m.users?.name || "未知";
          const channelName = m.channels?.name || "未知频道";
          const contentPreview = m.content?.substring(0, 200) || "";
          const time = new Date(m.created_at).toLocaleString("zh-CN", {
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          });

          results.push({
            id: m.id,
            type: "message",
            title: senderName,
            content: contentPreview,
            meta: `${channelName} · ${time}`,
            link: `/channels?channel=${m.channel_id}&message=${m.id}`,
            created_at: m.created_at,
          });
        }
      }
    }

    // Sort all results: messages first by created_at descending
    results.sort((a, b) => {
      if (a.created_at && b.created_at) {
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }
      return 0;
    });

    const offset = (page - 1) * limit;
    const paginatedResults = results.slice(offset, offset + limit);

    return NextResponse.json({
      success: true,
      items: paginatedResults,
      total: results.length,
      page,
      limit,
    });
  } catch (error: any) {
    console.error("[Search API] Error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "搜索失败" },
      { status: 500 }
    );
  }
}