import { getSupabaseClient } from "@/storage/database/supabase-client";

export type ApprovalStatus = "pending" | "approved" | "rejected";

export interface ApprovalFlowEntry {
  user_id: string;
  name: string;
  action: "submit" | "approve" | "reject" | "forward";
  comment?: string;
  time: string;
}

export interface ApprovalTaskInput {
  team_id: string;
  agent_id?: string;
  session_id?: string;
  creator_id: string;
  assignee_id?: string | null;
  title: string;
  task_type?: string;
  description?: string;
  draft?: unknown;
  source_id?: string;
}

/**
 * 创建审批任务（可选指定审批人）。
 * - 指定 assignee_id：转交该人审批，待审批状态
 * - 未指定：待创建者自行确认
 */
export async function createApprovalTask(input: ApprovalTaskInput): Promise<{ task: any; error?: string }> {
  const client = getSupabaseClient();
  const assignee = input.assignee_id || null;

  const flow: ApprovalFlowEntry[] = [{
    user_id: input.creator_id,
    name: "",
    action: "submit",
    time: new Date().toISOString(),
  }];

  const { data: user } = await client
    .from("users")
    .select("name")
    .eq("id", input.creator_id)
    .maybeSingle();
  if (user?.name) flow[0].name = user.name;

  const { data: task, error } = await client
    .from("approval_tasks")
    .insert({
      team_id: input.team_id,
      agent_id: input.agent_id || null,
      session_id: input.session_id || null,
      creator_id: input.creator_id,
      assignee_id: assignee,
      title: input.title,
      task_type: input.task_type || null,
      description: input.description || null,
      draft: input.draft !== undefined ? JSON.stringify(input.draft) : null,
      status: "pending",
      flow: JSON.stringify(flow),
      source_id: input.source_id || null,
    })
    .select("*")
    .single();

  if (error) {
    console.error("创建审批任务失败:", error);
    return { task: null, error: error.message };
  }

  // 指定审批人时，发送通知
  if (assignee && task) {
    await notifyApproval(task.id, assignee, input.title, input.task_type || "审批", "你有一条待审批任务，请处理");
  }

  return { task };
}

async function notifyApproval(
  taskId: string,
  userId: string,
  title: string,
  taskType: string,
  content: string
) {
  try {
    const client = getSupabaseClient();
    const { data: task } = await client
      .from("approval_tasks")
      .select("team_id")
      .eq("id", taskId)
      .single();
    await client.from("system_notifications").insert({
      team_id: task?.team_id || null,
      user_id: userId,
      type: taskType,
      title,
      content,
      link: `/approvals?id=${taskId}`,
    });
  } catch (err) {
    console.error("发送审批通知失败:", err);
  }
}

/**
 * 追加流转记录并更新任务
 */
async function appendFlow(taskId: string, entry: ApprovalFlowEntry, patch: Record<string, unknown>) {
  const client = getSupabaseClient();
  const { data: cur } = await client.from("approval_tasks").select("flow").eq("id", taskId).maybeSingle();
  let flow: ApprovalFlowEntry[] = [];
  if (cur?.flow) {
    try { flow = Array.isArray(cur.flow) ? cur.flow : JSON.parse(cur.flow as string); } catch { flow = []; }
  }
  flow.push(entry);
  await client
    .from("approval_tasks")
    .update({ ...patch, flow: JSON.stringify(flow), updated_at: new Date().toISOString() })
    .eq("id", taskId);
}

/**
 * 审批通过
 */
export async function approveTask(taskId: string, userId: string, comment?: string): Promise<{ success: boolean; error?: string; task?: any }> {
  const client = getSupabaseClient();
  const { data: task, error } = await client.from("approval_tasks").select("*").eq("id", taskId).single();
  if (error || !task) return { success: false, error: "任务不存在" };
  if (task.status !== "pending") return { success: false, error: `任务已${task.status === "approved" ? "通过" : "驳回"}，无需重复操作` };
  if (task.assignee_id && task.assignee_id !== userId) return { success: false, error: "你不是该任务的审批人" };

  const { data: user } = await client.from("users").select("name").eq("id", userId).maybeSingle();
  await appendFlow(taskId, {
    user_id: userId,
    name: user?.name || "",
    action: "approve",
    comment,
    time: new Date().toISOString(),
  }, { status: "approved", assignee_id: null, completed_at: new Date().toISOString() });

  const { data: updated } = await client.from("approval_tasks").select("*").eq("id", taskId).single();

  // 通知发起人审批结果
  await notifyApproval(taskId, task.creator_id, `「${task.title}」已通过审批`, "approval_result", comment ? `审批意见：${comment}` : "审批已通过");

  return { success: true, task: updated };
}

/**
 * 驳回并附修改意见
 */
export async function rejectTask(taskId: string, userId: string, comment?: string): Promise<{ success: boolean; error?: string; task?: any }> {
  const client = getSupabaseClient();
  const { data: task, error } = await client.from("approval_tasks").select("*").eq("id", taskId).single();
  if (error || !task) return { success: false, error: "任务不存在" };
  if (task.status !== "pending") return { success: false, error: "任务已处理，无法驳回" };

  const { data: user } = await client.from("users").select("name").eq("id", userId).maybeSingle();
  await appendFlow(taskId, {
    user_id: userId,
    name: user?.name || "",
    action: "reject",
    comment,
    time: new Date().toISOString(),
  }, { status: "rejected", assignee_id: null, completed_at: new Date().toISOString() });

  const { data: updated } = await client.from("approval_tasks").select("*").eq("id", taskId).single();
  await notifyApproval(taskId, task.creator_id, `「${task.title}」被驳回`, "approval_result", comment ? `驳回原因：${comment}` : "审批被驳回，请修改后重新提交");

  return { success: true, task: updated };
}

/**
 * 转交指定人审批（提交指定人审批）
 */
export async function forwardApproval(taskId: string, userId: string, assigneeId: string, comment?: string): Promise<{ success: boolean; error?: string; task?: any }> {
  const client = getSupabaseClient();
  const { data: task, error } = await client.from("approval_tasks").select("*").eq("id", taskId).single();
  if (error || !task) return { success: false, error: "任务不存在" };
  if (task.status !== "pending") return { success: false, error: "任务已处理，无法转交" };

  const { data: user } = await client.from("users").select("name").eq("id", userId).maybeSingle();
  const { data: assignee } = await client.from("users").select("name").eq("id", assigneeId).maybeSingle();
  await appendFlow(taskId, {
    user_id: userId,
    name: user?.name || "",
    action: "forward",
    comment: comment || `转交${assignee?.name || "指定人"}审批`,
    time: new Date().toISOString(),
  }, { assignee_id: assigneeId });

  const { data: updated } = await client.from("approval_tasks").select("*").eq("id", taskId).single();
  await notifyApproval(taskId, assigneeId, `「${task.title}」待你审批`, "approval", comment || `有一条审批任务转交给你，请处理`);

  return { success: true, task: updated };
}

/**
 * 查询审批任务
 * role: "mine" 我发起的 / "assigned" 待我审批 / "all" 全部（团队成员）
 */
export async function listApprovalTasks(opts: {
  team_id?: string;
  user_id?: string;
  role?: "mine" | "assigned" | "all";
  status?: ApprovalStatus;
  session_id?: string;
  source_id?: string;
  limit?: number;
}): Promise<{ tasks: any[]; error?: string }> {
  const client = getSupabaseClient();
  let query: any = client.from("approval_tasks").select("*");

  if (opts.team_id) query = query.eq("team_id", opts.team_id);
  if (opts.session_id) query = query.eq("session_id", opts.session_id);
  if (opts.source_id) query = query.eq("source_id", opts.source_id);
  if (opts.status) query = query.eq("status", opts.status);

  if (opts.role === "mine" && opts.user_id) {
    query = query.eq("creator_id", opts.user_id);
  } else if (opts.role === "assigned" && opts.user_id) {
    query = query.eq("assignee_id", opts.user_id).eq("status", "pending");
  }

  query = query.order("created_at", { ascending: false }).limit(opts.limit || 50);

  const { data, error } = await query;
  if (error) return { tasks: [], error: error.message };

  const tasks = (data || []).map((t: any) => ({
    ...t,
    draft: typeof t.draft === "string" ? safeParse(t.draft) : t.draft,
    flow: typeof t.flow === "string" ? safeParse(t.flow) : t.flow,
  }));

  // 批量补发起人/审批人姓名
  const userIds = Array.from(
    new Set(tasks.flatMap((t: any) => [t.creator_id, t.assignee_id]).filter(Boolean))
  );
  if (userIds.length > 0) {
    const { data: users } = await client.from("users").select("id, name").in("id", userIds);
    const nameMap = Object.fromEntries((users || []).map((u: any) => [u.id, u.name]));
    for (const t of tasks) {
      t.creator_name = t.creator_id ? nameMap[t.creator_id] || "" : "";
      t.assignee_name = t.assignee_id ? nameMap[t.assignee_id] || "" : "";
    }
  }
  return { tasks };
}

function safeParse(str: string): unknown {
  try { return JSON.parse(str); } catch { return str; }
}

/**
 * 获取审批任务详情（含审批人/发起人姓名）
 */
export async function getApprovalTaskDetail(taskId: string): Promise<{ task: any; error?: string }> {
  const client = getSupabaseClient();
  const { data, error } = await client.from("approval_tasks").select("*").eq("id", taskId).single();
  if (error || !data) return { task: null, error: error?.message || "任务不存在" };

  const userIds = [data.creator_id, data.assignee_id].filter(Boolean);
  let nameMap: Record<string, string> = {};
  if (userIds.length > 0) {
    const { data: users } = await client.from("users").select("id, name, avatar").in("id", userIds);
    nameMap = Object.fromEntries((users || []).map((u: any) => [u.id, u.name]));
  }

  return {
    task: {
      ...data,
      creator_name: nameMap[data.creator_id] || "",
      assignee_name: data.assignee_id ? nameMap[data.assignee_id] || "" : "",
      draft: typeof data.draft === "string" ? safeParse(data.draft) : data.draft,
      flow: typeof data.flow === "string" ? safeParse(data.flow) : data.flow,
    },
  };
}