import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";

// 获取用户的智能体对话会话列表
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");
    const teamId = searchParams.get("teamId");

    if (!userId || !teamId) {
      return NextResponse.json({ error: "参数不完整" }, { status: 400 });
    }

    const client = getSupabaseClient();

    // 查询会话列表
    const { data: sessions, error: sessionError } = await client
      .from("agent_chat_sessions")
      .select("*")
      .eq("user_id", userId)
      .eq("team_id", teamId)
      .eq("is_active", true)
      .order("last_message_at", { ascending: false, nullsFirst: false });

    if (sessionError) {
      console.error("查询智能体会话失败:", sessionError);
      return NextResponse.json({ error: "查询会话失败" }, { status: 500 });
    }

    if (!sessions || sessions.length === 0) {
      return NextResponse.json({ success: true, sessions: [] });
    }

    // 获取关联的智能体信息
    const agentIds = [...new Set(sessions.map((s: { agent_id: string }) => s.agent_id))];
    const { data: agentsData } = await client
      .from("agents")
      .select("id, name, avatar, description, system_prompt")
      .in("id", agentIds);

    const agentMap: Record<string, { name: string; avatar: string; description: string; system_prompt: string }> = {};
    if (agentsData) {
      for (const a of agentsData as { id: string; name: string; avatar: string; description: string; system_prompt: string }[]) {
        agentMap[a.id] = a;
      }
    }

    // 获取每个会话的未读消息数
    const sessionIds = sessions.map((s: { id: string }) => s.id);
    const { data: unreadData } = await client
      .from("agent_chat_messages")
      .select("session_id")
      .in("session_id", sessionIds)
      .eq("sender_type", "agent")
      .eq("is_read", false);

    const unreadMap = new Map<string, number>();
    if (unreadData) {
      for (const msg of unreadData as { session_id: string }[]) {
        unreadMap.set(msg.session_id, (unreadMap.get(msg.session_id) || 0) + 1);
      }
    }

    const result = sessions.map((session: {
      id: string;
      agent_id: string;
      last_message: string | null;
      last_message_at: string | null;
      created_at: string;
    }) => {
      const agent = agentMap[session.agent_id] || { name: "未知智能体", avatar: "", description: "", system_prompt: "" };
      const s = session as Record<string, unknown>;
      return {
        id: session.id,
        agentId: session.agent_id,
        agentName: agent.name,
        agentAvatar: agent.avatar,
        agentDescription: agent.description,
        agentGoal: agent.system_prompt,
        lastMessage: session.last_message || "",
        lastMessageAt: session.last_message_at || session.created_at,
        unreadCount: unreadMap.get(session.id) || 0,
        taskStatus: s.task_status || "idle",
        taskSummary: s.task_summary || "",
        lastArtifacts: s.last_artifacts || [],
      };
    });

    return NextResponse.json({ success: true, sessions: result });
  } catch (error) {
    console.error("获取智能体会话列表错误:", error);
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}

// 创建新的智能体对话会话
export async function POST(request: NextRequest) {
  try {
    const { teamId: inputTeamId, userId, agentId } = await request.json();

    if (!userId || !agentId) {
      return NextResponse.json({ error: "参数不完整", details: "userId 和 agentId 是必填参数" }, { status: 400 });
    }

    // 获取有效的 teamId（优先使用输入的，否则查找用户所属的第一个团队）
    let teamId = inputTeamId;
    if (!teamId) {
      const client = getSupabaseClient();
      const { data: memberData } = await client
        .from("team_members")
        .select("team_id")
        .eq("user_id", userId)
        .limit(1)
        .maybeSingle();
      
      if (memberData?.team_id) {
        teamId = memberData.team_id;
      } else {
        // 尝试从 teams 表获取第一个团队
        const { data: teamData } = await client
          .from("teams")
          .select("id")
          .limit(1)
          .maybeSingle();
        teamId = teamData?.id;
      }
    }

    // 如果仍然没有有效的 teamId，返回错误
    if (!teamId) {
      return NextResponse.json({ error: "无法确定团队", details: "请先选择一个团队" }, { status: 400 });
    }

    const client = getSupabaseClient();

    // 检查是否已存在该用户与智能体的会话
    const { data: existing, error: existError } = await client
      .from("agent_chat_sessions")
      .select("*")
      .eq("user_id", userId)
      .eq("agent_id", agentId)
      .eq("team_id", teamId)
      .eq("is_active", true)
      .maybeSingle();

    if (existError) {
      console.error("查询会话失败:", existError);
      return NextResponse.json({ error: "查询会话失败" }, { status: 500 });
    }

    if (existing) {
      // 获取智能体信息
      const { data: agentData } = await client
        .from("agents")
        .select("id, name, avatar, description, system_prompt")
        .eq("id", agentId)
        .single();

      const agent = agentData || { name: "未知智能体", avatar: "", description: "", system_prompt: "" };
      return NextResponse.json({
        success: true,
        session: {
          id: existing.id,
          agentId,
          agentName: agent.name,
          agentAvatar: agent.avatar,
          agentDescription: agent.description,
          agentGoal: agent.system_prompt,
          lastMessage: existing.last_message || "",
          lastMessageAt: existing.last_message_at || existing.created_at,
          unreadCount: 0,
          taskStatus: existing.task_status || "idle",
          taskSummary: existing.task_summary || "",
          lastArtifacts: existing.last_artifacts || [],
        },
        created: false,
      });
    }

    // 创建新会话
    const { data: newSession, error: createError } = await client
      .from("agent_chat_sessions")
      .insert({
        team_id: teamId,
        user_id: userId,
        agent_id: agentId,
      })
      .select()
      .single();

    if (createError) {
      console.error("创建智能体会话失败:", createError);
      console.error("参数: teamId=", teamId, "userId=", userId, "agentId=", agentId);
      return NextResponse.json({ error: "创建会话失败", details: createError.message }, { status: 500 });
    }

    // 获取智能体信息
    const { data: agentData } = await client
      .from("agents")
      .select("id, name, avatar, description, system_prompt")
      .eq("id", agentId)
      .single();

    const agent = agentData || { name: "未知智能体", avatar: "", description: "", system_prompt: "" };
    return NextResponse.json({
      success: true,
      session: {
        id: newSession.id,
        agentId,
        agentName: agent.name,
        agentAvatar: agent.avatar,
        agentDescription: agent.description,
        agentGoal: agent.system_prompt,
        lastMessage: "",
        lastMessageAt: newSession.created_at,
        unreadCount: 0,
        taskStatus: "idle",
        taskSummary: "",
        lastArtifacts: [],
      },
      created: true,
    });
  } catch (error) {
    console.error("创建智能体会话错误:", error);
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}
