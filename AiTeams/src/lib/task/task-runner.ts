import { getSupabaseClient } from "@/storage/database/supabase-client";
import { runWorkflow, resumeWorkflow } from "@/lib/workflow/engine";
import type { WorkflowEvent } from "@/lib/workflow/engine";
import { createNodeExecutor } from "@/lib/workflow/node-executor";
import type {
  ResumeSignal,
  WorkflowDefinitionV2,
  WorkflowSnapshot,
  WorkflowState,
  WorkflowStatus,
} from "@/lib/workflow/types";

export interface TaskRunDeps {
  teamId: string;
  userId?: string;
  agentId?: string;
}

/** 节点内模型流式片段（思考链 / 正文增量） */
export interface NodeStreamChunk {
  nodeId: string;
  kind: "reasoning" | "content";
  text: string;
}

export interface RunTaskOptions {
  taskId: string;
  definition: WorkflowDefinitionV2;
  initialState?: WorkflowState;
  sessionId?: string;
  onEvent?: (event: WorkflowEvent) => void;
  onStream?: (chunk: NodeStreamChunk) => void;
}

export interface ResumeTaskOptions {
  runId: string;
  taskId: string;
  definition: WorkflowDefinitionV2;
  signal: ResumeSignal;
  onEvent?: (event: WorkflowEvent) => void;
  onStream?: (chunk: NodeStreamChunk) => void;
}

function statusToDb(status: WorkflowStatus): string {
  // pending/running/awaiting_human/completed/failed/canceled 与任务模块语义一致
  return status;
}

export async function runTask(
  deps: TaskRunDeps,
  opts: RunTaskOptions,
): Promise<{ runId: string; status: WorkflowStatus; snapshot: WorkflowSnapshot | null }> {
  const { taskId, definition, initialState, sessionId, onEvent, onStream } = opts;
  const runId = crypto.randomUUID();
  const client = getSupabaseClient();
  const executor = createNodeExecutor({ ...deps, onStream });

  await client.from("task_runs").insert({
    id: runId,
    task_id: taskId,
    team_id: deps.teamId,
    session_id: sessionId ?? null,
    triggered_by: deps.userId ?? null,
    status: "running",
    started_at: new Date().toISOString(),
  });

  const result = await runWorkflow(definition, { executor, onEvent }, initialState ?? {});

  const isDone =
    result.status === "completed" ||
    result.status === "failed" ||
    result.status === "canceled";

  await client.from("task_runs").update({
    status: statusToDb(result.status),
    current_node_id: result.snapshot?.currentNodeId ?? null,
    snapshot: (result.snapshot ?? null) as unknown,
    result: result.status === "completed" ? JSON.stringify(result.state) : null,
    error: result.status === "failed" ? extractError(result.state) : null,
    completed_at: isDone ? new Date().toISOString() : null,
    updated_at: new Date().toISOString(),
  }).eq("id", runId);

  return { runId, status: result.status, snapshot: result.snapshot };
}

export async function resumeTask(
  deps: TaskRunDeps,
  opts: ResumeTaskOptions,
): Promise<{ runId: string; status: WorkflowStatus; snapshot: WorkflowSnapshot | null }> {
  const { runId, taskId, definition, signal, onEvent, onStream } = opts;
  const client = getSupabaseClient();
  const executor = createNodeExecutor({ ...deps, onStream });

  const { data: run } = await client
    .from("task_runs")
    .select("snapshot")
    .eq("id", runId)
    .eq("task_id", taskId)
    .single();

  if (!run?.snapshot) {
    throw new Error(`任务运行记录不存在或无可恢复快照：${runId}`);
  }

  const snapshot = run.snapshot as unknown as WorkflowSnapshot;

  await client.from("task_runs").update({
    status: "running",
    updated_at: new Date().toISOString(),
  }).eq("id", runId);

  const result = await resumeWorkflow(definition, snapshot, signal, { executor, onEvent });

  const isDone =
    result.status === "completed" ||
    result.status === "failed" ||
    result.status === "canceled";

  await client.from("task_runs").update({
    status: statusToDb(result.status),
    current_node_id: result.snapshot?.currentNodeId ?? null,
    snapshot: (result.snapshot ?? null) as unknown,
    result: result.status === "completed" ? JSON.stringify(result.state) : null,
    error: result.status === "failed" ? extractError(result.state) : null,
    completed_at: isDone ? new Date().toISOString() : null,
    updated_at: new Date().toISOString(),
  }).eq("id", runId);

  return { runId, status: result.status, snapshot: result.snapshot };
}

function extractError(state: WorkflowState): string | null {
  const err = state.__error;
  if (typeof err === "string") return err;
  if (err instanceof Error) return err.message;
  return null;
}