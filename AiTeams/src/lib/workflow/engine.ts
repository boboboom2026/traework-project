// ========== 确定性工作流内核：状态机引擎 ==========
//
// 设计原则（对齐行业状态机模型，如 LangGraph）：
//   - 引擎只负责"纪律"：流转、分支、挂起/恢复、副作用闸门
//   - LLM/工具/Skill 的执行通过注入的 NodeExecutor 完成（节点处理器）
//   - 引擎是纯代码状态机，不把流程 JSON 交给模型、不让模型决定流转
//
// 与旧 WorkflowExecutor 的关系：
//   - 本内核为新工作流的执行载体，保证确定性与可恢复性
//   - 旧 WorkflowExecutor 逐步薄封装迁移到本内核

import { evaluateCondition } from "./condition";
import type {
  NodeContext,
  NodeResult,
  ResumeSignal,
  WorkflowDefinitionV2,
  WorkflowNode,
  WorkflowSnapshot,
  WorkflowState,
  WorkflowStatus,
} from "./types";

/** 节点处理器：在一个节点内部做一次产出计算（LLM/工具/Skill 的具体执行）*/
export type NodeExecutor = (ctx: NodeContext) => Promise<NodeResult>;

export interface WorkflowEvent {
  type:
    | "step_start"
    | "step_complete"
    | "step_error"
    | "workflow_complete"
    | "waiting_human";
  nodeId?: string;
  nodeName?: string;
  payload?: Record<string, unknown>;
}

export interface EngineOptions {
  executor: NodeExecutor;
  /** 可选：事件回调（薄封装层据此映射到 SSE）*/
  onEvent?: (event: WorkflowEvent) => void;
}

export interface RunResult {
  status: WorkflowStatus;
  state: WorkflowState;
  /** 挂起/停止时的快照；若 completed/failed/canceled 则为 null */
  snapshot: WorkflowSnapshot | null;
}

/** 处理流程定义，建立 id->node 索引，并校验完整性 */
function indexNodes(def: WorkflowDefinitionV2): {
  map: Map<string, WorkflowNode>;
  entry: WorkflowNode;
} {
  const map = new Map<string, WorkflowNode>();
  for (const n of def.nodes) {
    if (map.has(n.id)) {
      throw new Error(`工作流节点 id 重复：${n.id}`);
    }
    map.set(n.id, n);
  }
  const entry = map.get(def.entry_node);
  if (!entry) {
    throw new Error(`工作流入口节点不存在：${def.entry_node}`);
  }
  return { map, entry };
}

/**
 * 副作用闸门：side_effect=true 的节点，前驱必须已经有人工审批通过。
 * 引擎用一个累计标志追踪"是否已发生一次 approved 的人工审批"。
 * 未解锁时遇到 side_effect 节点 → 只拦截、不执行，显式抛错。
 */
function assertSideEffectGate(
  node: WorkflowNode,
  sideEffectUnlocked: boolean,
): void {
  if (node.side_effect && !sideEffectUnlocked) {
    throw new Error(
      `节点「${node.name}」为有副作用操作，但尚未通过人工审批闸门，已拦截，不执行。`,
    );
  }
}

/**
 * 从快照开始（或首次启动）推进工作流，直到：
 *   - 完成（completed）
 *   - 挂起等待人工（awaiting_human）
 *   - 失败（failed）
 * 幂等恢复：snapshot 携带完整 state 与游标，恢复不是"重跑"，而是继续。
 */
export async function runWorkflow(
  def: WorkflowDefinitionV2,
  opts: EngineOptions,
  initialState?: WorkflowState,
  resume?: { snapshot: WorkflowSnapshot; signal: ResumeSignal },
): Promise<RunResult> {
  const { map, entry } = indexNodes(def);
  const emit = opts.onEvent ?? (() => {});

  // ---------- 状态初始化（首次运行 或 从快照恢复）----------
  let state: WorkflowState = initialState ?? {};
  let currentNodeId: string = entry.id;
  let sideEffectUnlocked = false; // 是否已有一次 approved 的人工审批

  if (resume) {
    const snap = resume.snapshot;
    state = snap.state ?? {};
    currentNodeId = snap.currentNodeId;
    // 恢复时若此前已解锁，保留解锁标志（从 state 内部标记恢复）
    sideEffectUnlocked = state["__side_effect_unlocked"] === true;
    emit({ type: "step_start", nodeId: snap.currentNodeId });
  }

  const instanceId: string =
    resume?.snapshot.instanceId ??
    (state["__instance_id"] as string | undefined) ??
    "instance";

  // ---------- 主循环（引擎代码驱动流转）----------
  let maxSteps = def.nodes.length * 10 + 100; // 防死循环护栏
  while (maxSteps-- > 0) {
    const node = map.get(currentNodeId);
    if (!node) {
      throw new Error(`工作流节点不存在：${currentNodeId}`);
    }

    emit({ type: "step_start", nodeId: node.id, nodeName: node.name });

    // ---- 0) 恢复时人工决策应用（若刚 resume，需按决策跳转/继续，而非再次挂起）----
    const justResumed = resume && resume.snapshot.currentNodeId === node.id;
    if (justResumed && resume.signal) {
      const sig = resume.signal;
      if (sig.decision === "approved") {
        sideEffectUnlocked = true;
        state["__side_effect_unlocked"] = true;
      } else if (sig.decision === "rejected") {
        // 根据 human_review_config.on_reject 决定驳回后行为
        const onReject = node.human_review_config?.on_reject ?? "end";
        if (onReject === "restart") {
          emit({
            type: "step_error",
            nodeId: node.id,
            payload: { message: `「${node.name}」已驳回，工作流将从入口节点重新开始。`, action: "restart" },
          });
          // 回到入口节点重新执行（不抛错，继续循环）
          currentNodeId = def.entry_node;
          continue;
        }
        if (onReject === "skip") {
          // 驳回后跳过本节点继续下一节点
          emit({ type: "step_complete", nodeId: node.id, payload: { skipped: true } });
          const afterHuman = nextNodeAfter(map, node, state);
          if (!afterHuman) {
            emit({ type: "workflow_complete", payload: { state } });
            return { status: "completed", state, snapshot: null };
          }
          currentNodeId = afterHuman;
          continue;
        }
        throw new Error("工作流在人工审批处被驳回。");
      } else if (sig.decision === "choice") {
        // 人为分支选择：跳到所选分支
        const chosen = node.human_choice_config?.options.find(
          (o) => o.value === sig.choiceValue,
        );
        if (!chosen) {
          throw new Error(`人工选择值无效：${sig.choiceValue}`);
        }
        emit({ type: "step_complete", nodeId: node.id });
        const chosenNext = chosen.next_step;
        if (!chosenNext) {
          emit({ type: "workflow_complete", payload: { state } });
          return { status: "completed", state, snapshot: null };
        }
        currentNodeId = chosenNext;
        continue;
      }
      // approved/continue 往下执行（对人工节点而言已完成）
      emit({ type: "step_complete", nodeId: node.id });
      const afterHuman = nextNodeAfter(map, node, state);
      if (!afterHuman) {
        emit({ type: "workflow_complete", payload: { state } });
        return { status: "completed", state, snapshot: null };
      }
      currentNodeId = afterHuman;
      continue;
    }

    // ---- 1) 确定性条件分支（不经过 LLM）----
    if (node.type === "condition") {
      if (!node.condition) {
        throw new Error(`条件节点「${node.name}」缺少 condition 定义`);
      }
      const result = evaluateCondition(node.condition.expression, state);
      const nextId = result
        ? node.condition.true_branch
        : node.condition.false_branch;
      emit({ type: "step_complete", nodeId: node.id });
      if (!nextId) {
        // 无下一跳 → 结束
        emit({ type: "workflow_complete", payload: { state } });
        return { status: "completed", state, snapshot: null };
      }
      currentNodeId = nextId;
      continue;
    }

    // ---- 2) 人工审批：真正挂起 ----
    if (node.type === "human_review") {
      const payload: Record<string, unknown> = {
        nodeId: node.id,
        nodeName: node.name,
        detail: resolveDetail(state, node.human_review_config?.detail_ref),
        approverType: node.human_review_config?.approver_type ?? "user",
        approverIds: node.human_review_config?.approver_ids ?? [],
        requireAll: node.human_review_config?.require_all ?? false,
      };
      emit({ type: "waiting_human", nodeId: node.id, payload });
      state["__current_wait"] = "human_review";
      currentAfterSuspend(node, state, sideEffectUnlocked);
      const snapshot = buildSnapshot(
        def.id,
        instanceId,
        "awaiting_human",
        state,
        node.id,
      );
      return { status: "awaiting_human", state, snapshot };
    }

    // ---- 3) 人工分支选择：真正挂起，返回所选分支 ----
    if (node.type === "human_choice") {
      const options = (node.human_choice_config?.options ?? []).map((o) => ({
        label: o.label,
        value: o.value,
      }));
      emit({
        type: "waiting_human",
        nodeId: node.id,
        payload: {
          nodeId: node.id,
          nodeName: node.name,
          detail: resolveDetail(state, node.human_choice_config?.detail_ref),
          options,
        },
      });
      state["__current_wait"] = "human_choice";
      const snapshot = buildSnapshot(
        def.id,
        instanceId,
        "awaiting_human",
        state,
        node.id,
      );
      return { status: "awaiting_human", state, snapshot };
    }

    // ---- 5) 普通节点（llm/tool/skill/agent）通过注入的 executor 执行 ----
    assertSideEffectGate(node, sideEffectUnlocked);
    const ctx: NodeContext = {
      state,
      node,
      env: {
        teamId: (state["__team_id"] as string) ?? "",
        agentId: (state["__agent_id"] as string | undefined),
        workflowId: def.id,
        instanceId,
      },
    };

    let result: NodeResult;
    try {
      result = await opts.executor(ctx);
    } catch (err) {
      emit({
        type: "step_error",
        nodeId: node.id,
        payload: { message: (err as Error).message },
      });
      return {
        status: "failed",
        state,
        snapshot: buildSnapshot(def.id, instanceId, "failed", state, node.id),
      };
    }

    if (result.kind === "error") {
      emit({ type: "step_error", nodeId: node.id, payload: { message: result.message } });
      return {
        status: "failed",
        state,
        snapshot: buildSnapshot(def.id, instanceId, "failed", state, node.id),
      };
    }

    if (result.kind === "suspend") {
      emit({
        type: "waiting_human",
        nodeId: node.id,
        payload: { nodeId: node.id, nodeName: node.name, ...result.payload },
      });
      state["__current_wait"] = result.wait;
      return {
        status: "awaiting_human",
        state,
        snapshot: buildSnapshot(
          def.id,
          instanceId,
          "awaiting_human",
          state,
          node.id,
        ),
      };
    }

    // result.kind === "ok"（或 "branch"）
    if (result.kind === "branch") {
      // 分支型节点输出一个 key/value，供条件边使用
      state[result.key] = result.value;
      emit({ type: "step_complete", nodeId: node.id, payload: { ...result } });
    } else {
      // 合并输出：支持 output_key 定向写入，也支持展开多个键
      if (node.output_key) {
        state[node.output_key] = result.output;
      } else {
        Object.assign(state, result.output);
      }
      emit({ type: "step_complete", nodeId: node.id, payload: { ...result.output } });
    }

    // 找到下一节点
    const next = nextNodeAfter(map, node, state);
    if (!next) {
      emit({ type: "workflow_complete", payload: { state } });
      return { status: "completed", state, snapshot: null };
    }
    currentNodeId = next;
  }

  throw new Error("工作流执行步数超过上限，判定为死循环，已中止。");
}

/** 从快照恢复执行（幂等继续，而非重跑）*/
export async function resumeWorkflow(
  def: WorkflowDefinitionV2,
  snapshot: WorkflowSnapshot,
  signal: ResumeSignal,
  opts: EngineOptions,
): Promise<RunResult> {
  return runWorkflow(def, opts, snapshot.state, {
    snapshot,
    signal,
  });
}

/** 计算下一节点：默认顺序后继（映射到节点列表顺序）*/
function nextNodeAfter(
  map: Map<string, WorkflowNode>,
  node: WorkflowNode,
  state: WorkflowState,
): string | null {
  // 无显式边，使用节点定义顺序中的下一个
  const nodes = [...map.values()];
  const idx = nodes.findIndex((n) => n.id === node.id);
  if (idx === -1 || idx + 1 >= nodes.length) return null;
  return nodes[idx + 1].id;
}

function resolveDetail(
  state: WorkflowState,
  detailRef?: string,
): string | undefined {
  if (!detailRef) return undefined;
  if (detailRef.startsWith("{{") && detailRef.endsWith("}}")) {
    const v = state[detailRef.slice(2, -2).trim()];
    return typeof v === "string" ? v : JSON.stringify(v);
  }
  return detailRef;
}

function currentAfterSuspend(
  node: WorkflowNode,
  state: WorkflowState,
  sideEffectUnlocked: boolean,
): void {
  // 占位：保留节点停留信息
  state["__current_node"] = node.id;
  if (sideEffectUnlocked) state["__side_effect_unlocked"] = true;
}

function buildSnapshot(
  workflowId: string,
  instanceId: string,
  status: WorkflowStatus,
  state: WorkflowState,
  currentNodeId: string,
): WorkflowSnapshot {
  return {
    instanceId,
    workflowId,
    status,
    state,
    currentNodeId,
    cursor: 0,
    pendingResume: null,
  };
}