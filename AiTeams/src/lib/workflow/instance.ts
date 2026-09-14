/**
 * 确定性工作流内核 —— 任务实例持久化桥接层。
 *
 * 职责边界：
 *  - 流程的"纪律"（流转/挂起/恢复/副作用闸门）全部由 engine.ts 的确定性状态机掌控；
 *  - 本层仅负责把"一次执行"落成 workflow_instances 行、保存/加载完整快照、
 *    支持幂等恢复（恢复不是重跑，而是继续）。
 *
 * 审批待办（human_review / human_choice 挂号）不在此层创建：
 * 审批人解析依赖团队/申请人上下文，属于上层薄封装职责；
 * 本层通过 onEvent 将 "waiting_human" 事件上抛，由薄封装层消费后创建审批工单。
 *
 * LLM 不做流程解释器，只在 engine 调用 NodeExecutor 时处理单个节点。
 */
import { getSupabaseClient } from "@/storage/database/supabase-client";
import {
  runWorkflow,
  resumeWorkflow,
} from "@/lib/workflow/engine";
import type { NodeExecutor, RunResult, WorkflowEvent } from "@/lib/workflow/engine";
import type {
  ResumeSignal,
  WorkflowDefinitionV2,
  WorkflowSnapshot,
  WorkflowState,
} from "@/lib/workflow/types";

const INSTANCE_TABLE = "workflow_instances";

/** 依赖注入：节点处理器 + 可选事件回调（薄封装层据此映射到 SSE / 审批工单）*/
export interface InstanceDeps {
  executor: NodeExecutor;
  onEvent?: (event: WorkflowEvent) => void;
}

/** 新建（或续跑）一个任务实例。 */
export async function runInstance(
  deps: InstanceDeps,
  opts: {
    instanceId: string;
    workflow: WorkflowDefinitionV2;
    input: WorkflowState;
    sessionId: string;
    teamId?: string;
    agentId?: string;
  },
): Promise<RunResult> {
  const { instanceId, workflow, input, sessionId, teamId, agentId } = opts;
  const { executor, onEvent } = deps;

  const result = await runWorkflow(workflow, { executor, onEvent }, input);

  await persistInstance(instanceId, workflow.id, sessionId, teamId, agentId, result);

  return result;
}

/** 从挂起快照恢复（决策续跑），不重跑流程。 */
export async function resumeInstance(
  deps: InstanceDeps,
  opts: {
    instanceId: string;
    workflow: WorkflowDefinitionV2;
    sessionId: string;
    signal: ResumeSignal;
    teamId?: string;
    agentId?: string;
  },
): Promise<RunResult> {
  const { instanceId, workflow, sessionId, signal, teamId, agentId } = opts;
  const { executor, onEvent } = deps;

  const snapshot = await loadSnapshot(instanceId);
  if (!snapshot) {
    return {
      status: "failed",
      state: { __instance_id: instanceId },
      snapshot: null,
    };
  }

  const result = await resumeWorkflow(workflow, snapshot, signal, {
    executor,
    onEvent,
  });

  await persistInstance(instanceId, workflow.id, sessionId, teamId, agentId, result);

  return result;
}

/** 将 RunResult 落库为实例行（快照整份持久化，可幂等续跑）。 */
async function persistInstance(
  instanceId: string,
  workflowId: string,
  sessionId: string,
  teamId: string | undefined,
  agentId: string | undefined,
  result: RunResult,
): Promise<void> {
  const client = getSupabaseClient();

  const payload = {
    workflow_id: workflowId,
    session_id: sessionId,
    team_id: teamId ?? null,
    agent_id: agentId ?? null,
    status: result.status,
    current_node_id: result.snapshot?.currentNodeId ?? null,
    snapshot: (result.snapshot ?? null) as unknown,
    result: result.status === "completed" ? JSON.stringify(result.state) : null,
    updated_at: new Date().toISOString(),
  };

  const { data: existing } = await client
    .from(INSTANCE_TABLE)
    .select("id")
    .eq("id", instanceId)
    .maybeSingle();

  if (existing) {
    await client.from(INSTANCE_TABLE).update(payload).eq("id", instanceId);
  } else {
    await client.from(INSTANCE_TABLE).insert({ id: instanceId, ...payload });
  }
}

async function loadSnapshot(
  instanceId: string,
): Promise<WorkflowSnapshot | null> {
  const client = getSupabaseClient();
  const { data } = await client
    .from(INSTANCE_TABLE)
    .select("snapshot")
    .eq("id", instanceId)
    .maybeSingle();
  if (!data || !data.snapshot) return null;
  return data.snapshot as unknown as WorkflowSnapshot;
}