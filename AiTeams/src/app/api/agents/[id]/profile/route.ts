import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";

export const dynamic = "force-dynamic";

/**
 * 计算能力评分
 */
function computeScores(stats: {
  totalTasks: number;
  completedTasks: number;
  avgRating: number;
  avgDuration: number;
  feedbackCount: number;
  skillCount: number;
  expectedSkillCount: number;
  toolCount: number;
  knowledgeCount: number;
}) {
  const completionRate = stats.totalTasks > 0 ? (stats.completedTasks / stats.totalTasks) * 100 : 0;
  const satisfaction = stats.feedbackCount > 0 ? (stats.avgRating / 5) * 100 : 0;
  const speed = stats.avgDuration > 0 ? Math.max(0, Math.min(100, 100 - stats.avgDuration / 100)) : 100;
  const skillMastery = stats.expectedSkillCount > 0 ? (stats.skillCount / stats.expectedSkillCount) * 100 : 50;
  const knowledge = Math.min(100, (stats.knowledgeCount * 25) + 20);

  const overall = Math.round(
    completionRate * 0.25 + satisfaction * 0.30 + speed * 0.15 + skillMastery * 0.20 + knowledge * 0.10
  );

  const getLevel = (score: number) => {
    if (score >= 90) return { name: "首席", color: "text-purple-500", rank: 5 };
    if (score >= 75) return { name: "专家", color: "text-amber-500", rank: 4 };
    if (score >= 60) return { name: "高级", color: "text-blue-500", rank: 3 };
    if (score >= 40) return { name: "中级", color: "text-emerald-500", rank: 2 };
    if (score >= 20) return { name: "初级", color: "text-gray-500", rank: 1 };
    return { name: "见习", color: "text-gray-400", rank: 0 };
  };

  return {
    overall,
    level: getLevel(overall),
    dimensions: {
      completionRate: Math.round(completionRate),
      satisfaction: Math.round(satisfaction),
      speed: Math.round(speed),
      skillMastery: Math.round(skillMastery),
      knowledge: Math.round(knowledge),
    },
  };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const teamId = searchParams.get("teamId");

    if (!id || !teamId) {
      return NextResponse.json({ error: "参数不完整" }, { status: 400 });
    }

    const client = getSupabaseClient();

    // 1. 获取智能体信息
    const { data: agent, error: agentError } = await client
      .from("agents")
      .select("*, positions:position_id(id, name, icon, color)")
      .eq("id", id)
      .single();

    if (agentError || !agent) {
      return NextResponse.json({ error: "智能体不存在" }, { status: 404 });
    }

    // 2. 获取任务统计（从 agent_task_records 读取，实际数据写入此表）
    const { data: taskLogs } = await client
      .from("agent_task_records")
      .select("status, execution_time_ms, created_at")
      .eq("agent_id", id)
      .eq("team_id", teamId)
      .order("created_at", { ascending: false })
      .limit(1000);

    const totalTasks = taskLogs?.length || 0;
    const completedTasks = taskLogs?.filter(t => t.status === "success").length || 0;
    const durations = (taskLogs || []).filter(t => t.execution_time_ms).map(t => t.execution_time_ms!);
    const avgDuration = durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;

    // 3. 获取反馈统计（从 agent_task_records 中筛选有评分的记录）
    const { data: feedbacks } = await client
      .from("agent_task_records")
      .select("rating, feedback_text, correction, tags, created_at, user_id, users:user_id(name, avatar)")
      .eq("agent_id", id)
      .eq("team_id", teamId)
      .not("rating", "is", null)
      .order("created_at", { ascending: false })
      .limit(50);

    const ratings = (feedbacks || []).filter(f => f.rating).map(f => f.rating);
    const avgRating = ratings.length > 0 ? ratings.reduce((a, b) => a + b, 0) / ratings.length : 0;

    // 4. 按天聚合评分趋势（近30天）
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const dailyTasks: Record<string, { count: number; success: number }> = {};
    (taskLogs || [])
      .filter(t => t.created_at && new Date(t.created_at) >= thirtyDaysAgo)
      .forEach(t => {
        const day = new Date(t.created_at).toISOString().slice(0, 10);
        if (!dailyTasks[day]) dailyTasks[day] = { count: 0, success: 0 };
        dailyTasks[day].count++;
        if (t.status === "success") dailyTasks[day].success++;
      });

    const dailyRatings: Record<string, { total: number; count: number }> = {};
    (feedbacks || [])
      .filter(f => f.created_at && new Date(f.created_at) >= thirtyDaysAgo)
      .forEach(f => {
        const day = new Date(f.created_at).toISOString().slice(0, 10);
        if (!dailyRatings[day]) dailyRatings[day] = { total: 0, count: 0 };
        dailyRatings[day].total += f.rating;
        dailyRatings[day].count++;
      });

    // 构建日期范围
    const trendDays: { date: string; tasks: number; successRate: number; avgRating: number }[] = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(thirtyDaysAgo);
      d.setDate(d.getDate() + i);
      const dateStr = d.toISOString().slice(0, 10);
      const td = dailyTasks[dateStr];
      const rd = dailyRatings[dateStr];
      trendDays.push({
        date: dateStr,
        tasks: td?.count || 0,
        successRate: td ? Math.round((td.success / td.count) * 100) : 0,
        avgRating: rd ? +(rd.total / rd.count).toFixed(1) : 0,
      });
    }

    // 5. 获取任务记录（成长档案，最近20条）
    const { data: taskRecords } = await client
      .from("agent_task_records")
      .select("id, task_type, source, input_summary, output_summary, execution_time_ms, status, rating, feedback_text, correction, tags, created_at")
      .eq("agent_id", id)
      .eq("team_id", teamId)
      .order("created_at", { ascending: false })
      .limit(50);

    // 5b. 获取培训记录
    const { data: trainingRecords } = await client
      .from("agent_training_records")
      .select("train_type, content, source_type, created_at")
      .eq("agent_id", id)
      .eq("team_id", teamId)
      .order("created_at", { ascending: false })
      .limit(20);

    // 6. 获取关联技能
    const skillIds = (agent.skill_ids as string[]) || [];
    const { data: skills } = skillIds.length > 0 ? await client
      .from("skills")
      .select("id, name, content")
      .in("id", skillIds) : { data: [] };

    // 7. 计算能力评分
    const expectedSkillCount = 3; // 每个岗位默认期望3个技能
    const toolIds = (agent.tool_ids as string[]) || [];
    const ragIds = (agent.rag_dataset_ids as string[]) || [];
    const scores = computeScores({
      totalTasks,
      completedTasks,
      avgRating,
      avgDuration,
      feedbackCount: feedbacks?.length || 0,
      skillCount: skillIds.length,
      expectedSkillCount,
      toolCount: toolIds.length,
      knowledgeCount: ragIds.length,
    });

    // 8. 获取用户偏好
    const { data: userPrefs } = await client
      .from("agent_user_preferences")
      .select("user_id, preferences, interaction_count, last_interaction_at, users:user_id(name, avatar)")
      .eq("agent_id", id)
      .eq("team_id", teamId)
      .order("interaction_count", { ascending: false })
      .limit(20);

    // 9. 组装响应
    const profile = {
      identity: {
        id: agent.id,
        name: agent.name,
        description: agent.description,
        avatar: agent.avatar,
        status: agent.status,
        greeting: agent.greeting || "",
        userGuidance: agent.user_guidance || "",
        position: agent.positions || null,
        createdAt: agent.created_at,
        roleIdentity: agent.role_identity || "",
        boundaries: (agent.boundaries as any[]) || [],
        skillIds: skillIds,
        toolIds: toolIds,
        ragDatasetIds: ragIds,
        mcpServiceIds: (agent.mcp_service_ids as string[]) || [],
      },
      scores,
      statistics: {
        totalTasks,
        completedTasks,
        successRate: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0,
        avgRating: avgRating ? +avgRating.toFixed(1) : 0,
        feedbackCount: feedbacks?.length || 0,
        avgDurationMs: Math.round(avgDuration),
        skillsCount: skillIds.length,
        toolsCount: toolIds.length,
        knowledgeCount: ragIds.length,
      },
      trend: {
        daily: trendDays,
      },
      recentFeedbacks: (feedbacks || []).slice(0, 10).map(f => ({
        rating: f.rating,
        tags: f.tags,
        correction: f.correction,
        comment: f.feedback_text,
        user: f.users || null,
        createdAt: f.created_at,
      })),
      taskRecords: (taskRecords || []).map(r => ({
        id: r.id,
        taskType: r.task_type,
        source: r.source,
        inputSummary: r.input_summary,
        outputSummary: r.output_summary,
        executionTimeMs: r.execution_time_ms,
        status: r.status,
        rating: r.rating,
        feedbackText: r.feedback_text,
        correction: r.correction,
        tags: r.tags,
        createdAt: r.created_at,
      })),
      trainingHistory: (trainingRecords || []).map(t => ({
        type: t.train_type,
        content: t.content,
        sourceType: t.source_type,
        createdAt: t.created_at,
      })),
      skills: (skills || []).map(s => ({
        id: s.id,
        name: s.name,
        content: s.content,
      })),
      userPreferences: (userPrefs || []).map(p => ({
        userId: p.user_id,
        userName: (p as any).users?.name || "未知用户",
        userAvatar: (p as any).users?.avatar || null,
        preferences: p.preferences,
        interactionCount: p.interaction_count,
        lastInteractionAt: p.last_interaction_at,
      })),
    };

    return NextResponse.json({ success: true, profile });
  } catch (e) {
    console.error("档案API错误:", e);
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}