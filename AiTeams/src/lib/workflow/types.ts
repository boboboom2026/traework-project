// ========== 确定性工作流内核：类型定义 ==========
//
// 设计原则（对齐行业状态机模型，如 LangGraph）：
//   - 流程流转、分支、挂起/恢复全部由代码状态机掌控
//   - LLM 只作为"节点处理器"：在某个节点内部，给定 context 做一次产出计算
//   - LLM 永远看不到、更不掌控完整流程
//   - 有副作用的节点受"副作用闸门"保护：未通过人工确认前不会执行

export type WorkflowStepType =
  | "llm_generate" // LLM 生成（节点内处理器）
  | "tool_call" // 工具调用（可为有副作用动作）
  | "human_review" // 人工审批（真正挂起，等待恢复信号）
  | "human_choice" // 人工分支选择（真正挂起，返回所选分支）
  | "condition" // 确定性条件分支（代码判断，非 LLM）
  | "skill_call" // 调用 Skill
  | "agent_call"; // 委托给指定智能体执行（多智能体编排，agent 作为节点处理器）

export type WorkflowStatus =
  | "pending" // 已创建，尚未开始
  | "running" // 执行中
  | "awaiting_human" // 已挂起，等待人工审批/选择
  | "completed" // 正常结束
  | "failed" // 失败
  | "canceled"; // 已取消

// ========== 节点定义 ==========

export interface ConditionalEdge {
  /**
   * 确定性表达式字符串，求值结果必须为 boolean。
   * 支持：{{路径}} 变量、==/!=/>/</>=/<= 、&&/||/!、
   * 白名单函数 contains(a,b)/is_empty(a)/true/false/数字/字符串字面量。
   * 例如：`{{result.status}} == "approved"` 或 `contains({{draft.text}}, "通过")`
   */
  expression: string;
  true_branch: string; // 为真跳转 step_id
  false_branch?: string; // 为假跳转 step_id（缺省则结束）
}

export interface HumanReviewConfig {
  approver_type: "user" | "role" | "manager";
  approver_ids?: string[];
  role_name?: string;
  require_all?: boolean;
  detail_ref?: string;
  detail_type?: "markdown" | "text" | "json";
  approve_action?: string;
  on_reject?: "end" | "restart" | "skip";
}

export interface HumanChoiceConfig {
  /** 候选分支选项，每项对应一个 step_id */
  options: Array<{ label: string; value: string; next_step: string }>;
  detail_ref?: string;
}

export interface WorkflowNode {
  id: string;
  name: string;
  description?: string;
  type: WorkflowStepType;
  /** 输入模板：支持 {{path}} 引用上游输出 */
  input_template?: string;
  /** 本节点输出写入 state 的 key */
  output_key?: string;
  /** tool_call / skill_call 的目标 */
  target?: string;
  /** llm 节点模型配置 */
  model_config?: {
    model?: string;
    temperature?: number;
    max_tokens?: number;
  };
  /** 条件分支（type=condition）*/
  condition?: ConditionalEdge;
  /** 人工审批配置（type=human_review）*/
  human_review_config?: HumanReviewConfig;
  /** 人工选择配置（type=human_choice）*/
  human_choice_config?: HumanChoiceConfig;
  /**
   * 是否有副作用（写入外部系统/数据库）。
   * 引擎保证：side_effect=true 的节点，前驱必须已有人工审批通过，否则拦截。
   */
  side_effect?: boolean;
  /** 并行组标识：相同 group_id 的节点可并行执行 */
  parallel_group?: string;
}

export interface WorkflowDefinitionV2 {
  id: string;
  name: string;
  description?: string;
  nodes: WorkflowNode[];
  /** 入口节点 id */
  entry_node: string;
}

// ========== 状态与执行 ==========

/** 共享 state：贯穿全部节点的数据容器，显式字段 */
export type WorkflowState = Record<string, unknown>;

/** 节点执行输入 */
export interface NodeContext {
  state: WorkflowState;
  node: WorkflowNode;
  env: {
    teamId: string;
    agentId?: string;
    workflowId: string;
    instanceId: string;
  };
}

/** 节点执行结果（三种可判定的分支）*/
export type NodeResult =
  | { kind: "ok"; output: Record<string, unknown> }
  | {
      kind: "suspend";
      wait: "human_review" | "human_choice";
      payload: Record<string, unknown>;
    }
  | { kind: "branch"; key: string; value: string }
  | { kind: "error"; message: string };

/** 人工挂起时的对外呈现负载 */
export interface SuspensionPayload {
  nodeId: string;
  nodeName: string;
  detail?: string;
  options?: Array<{ label: string; value: string }>;
  approverIds?: string[];
  approverType?: "user" | "role" | "manager";
  requireAll?: boolean;
}

/** 恢复信号（来自审批中心/前端按钮）*/
export interface ResumeSignal {
  /** approved / rejected / choice */
  decision: "approved" | "rejected" | "choice";
  /** 若是 choice，携带用户所选分支 value */
  choiceValue?: string;
  comment?: string;
  actorId?: string;
}

/** 执行快照（可完整恢复，而非"重跑该步"）*/
export interface WorkflowSnapshot {
  instanceId: string;
  workflowId: string;
  status: WorkflowStatus;
  state: WorkflowState;
  /** 即将执行/已停下的节点 id */
  currentNodeId: string;
  /** 游标：在节点列表中的位置（冗余，便于展示）*/
  cursor: number;
  /** 待恢复时附带的人工决策 */
  pendingResume?: ResumeSignal | null;
}