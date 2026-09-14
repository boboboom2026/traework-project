import { getSupabaseClient } from "@/storage/database/supabase-client";

export interface TaskRecordInput {
  agentId: string;
  teamId: string;
  userId: string;
  sessionId?: string;
  taskType: "chat" | "skill" | "workflow" | "schedule";
  skillId?: string;
  workflowId?: string;
  source: "channel" | "chat" | "schedule" | "dm";
  channelId?: string;
  inputSummary: string;
  outputSummary?: string;
  executionTimeMs?: number;
  status: "success" | "failed" | "partial" | "completed";
  tags?: string[];
}

/**
 * 记录智能体任务到成长档案
 */
export async function recordTask(input: TaskRecordInput): Promise<string | null> {
  try {
    const client = getSupabaseClient();
    const { data, error } = await client
      .from("agent_task_records")
      .insert({
        agent_id: input.agentId,
        team_id: input.teamId,
        user_id: input.userId,
        session_id: input.sessionId || null,
        task_type: input.taskType,
        skill_id: input.skillId || null,
        workflow_id: input.workflowId || null,
        source: input.source,
        channel_id: input.channelId || null,
        input_summary: input.inputSummary,
        output_summary: input.outputSummary || null,
        execution_time_ms: input.executionTimeMs || null,
        status: input.status,
        tags: input.tags ? input.tags.join(",") : null,
        updated_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (error) {
      console.error("记录任务失败:", error);
      return null;
    }
    return data?.id || null;
  } catch (e) {
    console.error("记录任务异常:", e);
    return null;
  }
}

/**
 * 更新任务记录（如添加反馈、补充输出等）
 */
export async function updateTaskRecord(
  recordId: string,
  updates: {
    outputSummary?: string;
    status?: string;
    rating?: number;
    feedbackText?: string;
    correction?: string;
    executionTimeMs?: number;
  }
): Promise<boolean> {
  try {
    const client = getSupabaseClient();
    const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (updates.outputSummary !== undefined) updateData.output_summary = updates.outputSummary;
    if (updates.status !== undefined) updateData.status = updates.status;
    if (updates.rating !== undefined) updateData.rating = updates.rating;
    if (updates.feedbackText !== undefined) updateData.feedback_text = updates.feedbackText;
    if (updates.correction !== undefined) updateData.correction = updates.correction;
    if (updates.executionTimeMs !== undefined) updateData.execution_time_ms = updates.executionTimeMs;

    const { error } = await client
      .from("agent_task_records")
      .update(updateData)
      .eq("id", recordId);

    if (error) {
      console.error("更新任务记录失败:", error);
      return false;
    }
    return true;
  } catch (e) {
    console.error("更新任务记录异常:", e);
    return false;
  }
}

/**
 * 记录反馈到任务记录（兼容旧反馈API，自动查询最近任务记录）
 */
export async function recordFeedbackToTask(
  agentId: string,
  teamId: string,
  userId: string,
  sessionId: string | null,
  rating: number,
  feedbackText?: string,
  correction?: string
): Promise<boolean> {
  try {
    const client = getSupabaseClient();

    // 查找最近的未反馈任务记录
    const query = client
      .from("agent_task_records")
      .select("id")
      .eq("agent_id", agentId)
      .eq("team_id", teamId)
      .eq("user_id", userId)
      .is("rating", null)
      .order("created_at", { ascending: false })
      .limit(1);

    if (sessionId) {
      query.eq("session_id", sessionId);
    }

    const { data } = await query;
    if (data && data.length > 0) {
      return await updateTaskRecord(data[0].id, { rating, feedbackText, correction });
    }
    return false;
  } catch (e) {
    console.error("记录反馈到任务失败:", e);
    return false;
  }
}

/**
 * 记录旧训练数据（兼容旧接口）
 */
/**
 * 快捷记录日志（兼容 stream-agent-chat 调用的 logAgentTask）
 * 自动从对话上下文中提取摘要
 *
 * 支持两种参数格式：
 * 1. 新格式（推荐）: { agentId, teamId, userId, input, output, source, ... }
 * 2. 旧格式（兼容）: { agentId, teamId, userId, taskInput, taskOutput, durationMs, ... }
 */
export async function logAgentTask(params: {
  agentId: string;
  teamId: string;
  userId?: string;
  sessionId?: string;
  // 新格式字段
  input?: string;
  output?: string;
  // 旧格式字段（兼容）
  taskInput?: string;
  taskOutput?: string;
  durationMs?: number;
  toolCalls?: Array<{ tool: string; action: string; params: Record<string, unknown>; result: Record<string, unknown> }>;
  errorMessage?: string;
  // 通用字段
  source?: "channel" | "chat" | "schedule" | "dm";
  taskType?: "chat" | "skill" | "workflow" | "schedule";
  channelId?: string;
  executionTimeMs?: number;
  status?: "success" | "failed" | "partial" | "completed";
  // 直接摘要字段（scheduler-service 使用）
  inputSummary?: string;
  outputSummary?: string;
  tags?: string[];
}): Promise<string | null> {
  // 映射 status: "completed" → "success"
  const mappedStatus = params.status === "completed" ? "success" : (params.status || "success");

  // 映射字段：优先使用新格式，再回退到旧格式，最后到直接摘要
  const inputSummary = params.inputSummary || params.input || params.taskInput || "";
  const outputSummary = params.outputSummary || params.output || params.taskOutput || "";
  const executionTimeMs = params.executionTimeMs || params.durationMs || undefined;

  return await recordTask({
    agentId: params.agentId,
    teamId: params.teamId,
    userId: params.userId || "system",
    sessionId: params.sessionId,
    taskType: params.taskType || "chat",
    source: params.source || "chat",
    channelId: params.channelId,
    inputSummary: inputSummary.slice(0, 500),
    outputSummary: outputSummary.slice(0, 2000),
    executionTimeMs: executionTimeMs,
    status: mappedStatus,
    tags: params.tags,
  });
}

/**
 * 记录反馈（兼容旧 API）
 * 被 feedback/route.ts 调用
 */
export async function recordFeedback(params: {
  agentId: string;
  teamId: string;
  userId: string;
  taskLogId?: string;
  rating: number;
  feedbackType?: string;
  tags?: string[];
  comment?: string;
  correction?: string;
}): Promise<boolean> {
  try {
    const client = getSupabaseClient();

    // 如果指定了 taskLogId，直接更新该记录
    if (params.taskLogId) {
      return await updateTaskRecord(params.taskLogId, {
        rating: params.rating,
        feedbackText: params.comment,
        correction: params.correction,
      });
    }

    // 否则查找最近的未反馈记录
    return await recordFeedbackToTask(
      params.agentId,
      params.teamId,
      params.userId,
      null,
      params.rating,
      params.comment,
      params.correction
    );
  } catch (e) {
    console.error("recordFeedback 失败:", e);
    return false;
  }
}

/**
 * 记录培训/知识投喂
 * 支持两种调用方式：
 * 1. 旧格式: recordTraining(agentId, teamId, userId, input, output, rating, tags?)
 * 2. 新格式: recordTraining({ agentId, teamId, trainType, sourceType, content, ... })
 */
export async function recordTraining(
  ...args: any[]
): Promise<string | null> {
  try {
    const client = getSupabaseClient();

    // 新格式：对象参数
    if (typeof args[0] === "object" && args[0] !== null) {
      const params = args[0] as {
        agentId: string;
        teamId: string;
        trainType?: string;
        sourceType?: string;
        sourceRef?: string;
        content?: string;
        createdBy?: string;
      };
      const { data, error } = await client
        .from("agent_training_records")
        .insert({
          agent_id: params.agentId,
          team_id: params.teamId,
          train_type: params.trainType || "manual_correct",
          source_type: params.sourceType || "feedback",
          source_ref: params.sourceRef || null,
          content: params.content || "",
          created_by: params.createdBy || null,
          updated_at: new Date().toISOString(),
        })
        .select("id")
        .single();

      if (error) {
        console.error("记录培训失败:", error);
        return null;
      }
      return data?.id || null;
    }

    // 旧格式：位置参数
    const [agentId, teamId, userId, input, output, rating, tags] = args;
    return await recordTask({
      agentId,
      teamId,
      userId,
      taskType: "chat",
      source: "chat",
      inputSummary: input,
      outputSummary: output,
      status: "success",
      tags: tags || ["training"],
    });
  } catch (e) {
    console.error("记录培训异常:", e);
    return null;
  }
}