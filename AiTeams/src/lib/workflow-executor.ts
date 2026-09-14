import { getSupabaseClient } from "@/storage/database/supabase-client";
import { evaluateCondition as evaluateConditionDeterministic } from "@/lib/workflow/condition";

// ========== 类型定义 ==========

export type StepType =
  | "llm_generate"   // LLM 生成
  | "tool_call"      // 工具调用
  | "human_review"   // 人工审批
  | "condition"      // 条件分支
  | "skill_call";    // 调用 Skill

export interface WorkflowStep {
  step_id: string;
  name: string;
  description?: string;
  type: StepType;
  input_template: string;
  output_key: string;
  tool_name?: string;
  /** 并行组标识：相同 group_id 的步骤并行执行 */
  parallel_group?: string;
  /** 条件分支配置 */
  condition?: {
    /** LLM 判断表达式，如 "result 中包含'通过'" */
    expression: string;
    /** 为真时跳转的 step_id */
    true_branch: string;
    /** 为假时跳转的 step_id */
    false_branch: string;
  };
  /** Skill 调用配置 */
  skill_config?: {
    skill_id: string;
    skill_name?: string;
  };
  /** 工具调用参数（key-value 对，支持 {{...}} 模板变量） */
  parameters?: Record<string, string>;
  config?: {
    temperature?: number;
    max_tokens?: number;
    model?: string;
  };
  /** LLM 生成步骤的提示词模板（type=llm_generate 时使用，支持 {{...}} 模板变量） */
  prompt?: string;
  /** 模型配置（type=llm_generate 时使用） */
  model_config?: {
    model?: string;
    temperature?: number;
    max_tokens?: number;
  };
  /** 人工审批配置（type=human_review 时使用，支持指定审批人 + 带内容的审批工单） */
  human_review_config?: {
    /** 审批人类型：指定用户 / 角色 / 上级 */
    approver_type: "user" | "role" | "manager";
    /** 指定审批人用户 id 列表（approver_type=user 时使用） */
    approver_ids?: string[];
    /** 指定角色名（approver_type=role 时使用） */
    role_name?: string;
    /** 是否需全部审批人同意（默认任一同意即可） */
    require_all?: boolean;
    /** 指向前面步骤的 output_key，作为审批工单正文（如 "draft"），支持 {{...}} 模板 */
    detail_ref?: string;
    /** 工单正文渲染类型 */
    detail_type?: "markdown" | "text" | "json";
    /** 审批通过后的动作语义（如 "publish"），供后续步骤/业务使用 */
    approve_action?: string;
    /** 驳回后的处理策略：end / restart / skip */
    on_reject?: "end" | "restart" | "skip";
  };
}

export interface WorkflowDefinition {
  id: string;
  name: string;
  description?: string;
  trigger_condition?: string;
  steps: WorkflowStep[];
}

export interface WorkflowEvent {
  type: "step_start" | "step_complete" | "step_error" | "waiting_human" | "workflow_complete" | "workflow_failed" | "branch_taken";
  step?: WorkflowStep;
  stepIndex?: number;
  totalSteps?: number;
  summary?: string;
  error?: string;
  message?: string;
  reason?: string;
  confirmOptions?: string[];
  result?: Record<string, unknown>;
  /** 条件分支命中信息 */
  branch?: { condition_step: string; taken_branch: "true" | "false"; target_step: string };
  /** 步骤完整产物（用于中间产物可见性） */
  output?: { key: string; content: unknown; content_type?: string };
  /** 审批工单正文（带内容的审批工单，如文章初稿） */
  detail?: string;
  /** 审批工单正文渲染类型 */
  detail_type?: "markdown" | "text" | "json";
  /** 审批任务 id 列表（指定审批人时落库生成） */
  task_ids?: string[];
  /** 审批被派发给哪些人（assignee 用户 id） */
  assignee?: string[];
}

export interface Checkpoint {
  sessionId: string;
  workflowId: string;
  stepIndex: number;
  context: Record<string, unknown>;
  status: string;
}

type EventCallback = (event: WorkflowEvent) => void | Promise<void>;

// ========== 执行引擎 ==========

export class WorkflowExecutor {
  private workflow: WorkflowDefinition;
  private context: Record<string, unknown>;
  private stepIndex: number;
  private sessionId: string;
  private onEvent: EventCallback;
  private agentId?: string;
  private channelId?: string;
  private teamId?: string;
  private applicantId?: string;

  constructor(
    workflow: WorkflowDefinition,
    sessionId: string,
    onEvent: EventCallback,
    options?: { agentId?: string; channelId?: string; teamId?: string; applicantId?: string }
  ) {
    this.workflow = workflow;
    this.sessionId = sessionId;
    this.onEvent = onEvent;
    this.context = {};
    this.stepIndex = 0;
    this.agentId = options?.agentId;
    this.channelId = options?.channelId;
    this.teamId = options?.teamId;
    this.applicantId = options?.applicantId;
  }

  /** 开始执行工作流（支持断点恢复） */
  async execute(userInput: string): Promise<void> {
    this.context.user_input = userInput;

    const checkpoint = await this.loadCheckpoint();
    if (checkpoint) {
      this.stepIndex = checkpoint.stepIndex;
      this.context = { ...this.context, ...checkpoint.context };
    }

    await this.runSteps();
  }

  /** 恢复执行（人工审批后） */
  async resume(userResponse: string): Promise<void> {
    const currentStep = this.workflow.steps[this.stepIndex];
    if (currentStep) {
      this.context[currentStep.output_key] = userResponse;
    }
    this.stepIndex++;
    await this.runSteps();
  }

  /**
   * 从审批任务恢复执行（供审批 API 在 approve/reject 后调用）。
   * 读取审批任务中的上下文快照与断点，恢复后继续执行剩余步骤。
   */
  async resumeFromTask(task: {
    step_index: number;
    payload: { context?: Record<string, unknown>; output_key?: string };
    decision: "approved" | "rejected";
    note?: string;
  }): Promise<void> {
    // 恢复上下文快照
    if (task.payload?.context) {
      this.context = { ...this.context, ...task.payload.context };
    }
    this.stepIndex = task.step_index ?? this.stepIndex;

    const outputKey = task.payload?.output_key || this.workflow.steps[this.stepIndex]?.output_key || "approval_result";
    this.context[outputKey] = task.decision === "approved" ? "approved" : (task.note || "rejected");

    if (task.decision === "rejected") {
      // 驳回：发出错误事件标记该步骤失败，不继续执行后续步骤
      const step = this.workflow.steps[this.stepIndex];
      await this.emitEvent({
        type: "step_error",
        step,
        stepIndex: this.stepIndex,
        totalSteps: this.workflow.steps.length,
        error: `审批被驳回：${task.note || "无备注"}`,
      });
      await this.emitEvent({
        type: "workflow_failed",
        reason: `审批被驳回：${task.note || "无备注"}`,
        stepIndex: this.stepIndex,
      });
      return;
    }

    this.stepIndex++;
    await this.runSteps();
  }

  /**
   * 从 execute_workflow 工具恢复执行（由 LLM 的 resume 动作触发）。
   * 直接从 checkpoint 加载状态，设置审批结果，继续执行。
   */
  async resumeByDecision(decision: "approved" | "rejected", feedback?: string): Promise<{
    completed: boolean;
    result?: string;
    pausedAt?: string;
    context?: Record<string, unknown>;
  }> {
    const currentStep = this.workflow.steps[this.stepIndex];
    if (currentStep?.type === "human_review") {
      if (decision === "rejected") {
        this.context[currentStep.output_key] = feedback || "rejected";
        // 驳回：根据 on_reject 策略决定行为
        const onReject = currentStep.human_review_config?.on_reject || "end";
        if (onReject === "end") {
          await this.emitEvent({
            type: "step_error",
            step: currentStep,
            stepIndex: this.stepIndex,
            totalSteps: this.workflow.steps.length,
            error: `审批被驳回：${feedback || "无备注"}`,
          });
          await this.emitEvent({
            type: "workflow_failed",
            reason: `审批被驳回：${feedback || "无备注"}`,
            stepIndex: this.stepIndex,
          });
          await this.clearCheckpoint();
          return { completed: true, result: `工作流被驳回：${feedback || "无备注"}`, context: { ...this.context } };
        }
        // skip/restart 暂按继续下一步处理
      } else {
        this.context[currentStep.output_key] = "approved";
      }
    }

    this.stepIndex++;
    await this.runSteps();

    const steps = this.workflow.steps;
    if (this.stepIndex < steps.length) {
      const pausedStep = steps[this.stepIndex];
      return { completed: false, pausedAt: pausedStep.name, context: { ...this.context } };
    }

    const lastStep = steps[steps.length - 1];
    const result = this.context[lastStep?.output_key || ""] as string || "";
    return { completed: true, result, context: { ...this.context } };
  }

  /** 交互式执行（遇到 human_review 会暂停等待审批） */
  async executeInteractive(userInput: string): Promise<{
    completed: boolean;
    result?: string;
    pausedAt?: string;
    context?: Record<string, unknown>;
  }> {
    this.context.user_input = userInput;
    this.context.applicant_id = this.applicantId;
    this.context.team_id = this.teamId;

    await this.runSteps();

    const steps = this.workflow.steps;
    // 如果还有未执行的步骤，说明暂停在 human_review
    if (this.stepIndex < steps.length) {
      const currentStep = steps[this.stepIndex];
      return { completed: false, pausedAt: currentStep.name, context: { ...this.context } };
    }

    // 工作流全部完成
    const lastStep = steps[steps.length - 1];
    const result = this.context[lastStep?.output_key || ""] as string || "";
    return { completed: true, result, context: { ...this.context } };
  }

  /** 一次性执行（不暂停，人工审批自动确认） */
  async executeWorkflowOnce(userInput: string): Promise<string> {
    this.context.user_input = userInput;
    let finalResult = "";
    let hasError = false;
    const steps = this.workflow.steps;

    let i = 0;
    while (i < steps.length) {
      const step = steps[i];

      // 检测并行组：收集同组步骤并行执行
      if (step.parallel_group) {
        const groupSteps: WorkflowStep[] = [step];
        const groupIndices: number[] = [i];
        let j = i + 1;
        while (j < steps.length && steps[j].parallel_group === step.parallel_group) {
          groupSteps.push(steps[j]);
          groupIndices.push(j);
          j++;
        }

        // 推送所有步骤开始事件
        for (let k = 0; k < groupSteps.length; k++) {
          await this.emitEvent({
            type: "step_start",
            step: groupSteps[k],
            stepIndex: groupIndices[k],
            totalSteps: steps.length,
          });
        }

        // 并行执行
        const results = await Promise.allSettled(
          groupSteps.map(s => this.executeStepByType(s))
        );

        for (let k = 0; k < groupSteps.length; k++) {
          const r = results[k];
          if (r.status === "fulfilled") {
            this.context[groupSteps[k].output_key] = r.value;
            finalResult = typeof r.value === "string" ? r.value : JSON.stringify(r.value);
            await this.emitEvent({
              type: "step_complete",
              step: groupSteps[k],
              stepIndex: groupIndices[k],
              totalSteps: steps.length,
              summary: this.getStepSummary(groupSteps[k], r.value),
              output: {
                key: groupSteps[k].output_key,
                content: r.value,
                content_type: "text",
              },
            });
          } else {
            hasError = true;
            const errMsg = r.reason instanceof Error ? r.reason.message : String(r.reason);
            await this.emitEvent({
              type: "step_error",
              step: groupSteps[k],
              stepIndex: groupIndices[k],
              totalSteps: steps.length,
              error: errMsg,
            });
          }
        }

        i = j; // 跳过并行组
        if (hasError) break;
        continue;
      }

      // 非并行步骤
      await this.emitEvent({
        type: "step_start",
        step,
        stepIndex: i,
        totalSteps: steps.length,
      });

      try {
        // 条件分支步骤
        if (step.type === "condition") {
          const branchResult = await this.evaluateCondition(step);
          this.context[step.output_key] = branchResult.taken;

          await this.emitEvent({
            type: "branch_taken",
            step,
            stepIndex: i,
            totalSteps: steps.length,
            branch: {
              condition_step: step.step_id,
              taken_branch: branchResult.taken ? "true" : "false",
              target_step: branchResult.taken ? step.condition!.true_branch : step.condition!.false_branch,
            },
          });

          // 跳转到目标步骤
          const targetId = branchResult.taken ? step.condition!.true_branch : step.condition!.false_branch;
          const targetIdx = steps.findIndex(s => s.step_id === targetId);
          if (targetIdx >= 0) {
            i = targetIdx;
            continue;
          }
          // 目标未找到，继续下一步
          i++;
          continue;
        }

        // 人工审批（一次性模式：创建审批任务 + 投递通知，本次以占位结果继续）
        if (step.type === "human_review") {
          const approval = await this.createApprovalTasks(step);
          this.context[step.output_key] = "approved";

          await this.emitEvent({
            type: "waiting_human",
            step,
            stepIndex: i,
            totalSteps: steps.length,
            message: step.human_review_config?.detail_ref
              ? `${step.name || "人工审批"}已派发给指定审批人，等待处理...`
              : "等待人工审批...",
            detail: approval?.detail ?? "",
            detail_type: step.human_review_config?.detail_type || "markdown",
            task_ids: approval?.task_ids,
            assignee: approval?.assignee,
            confirmOptions: ["确认", "修改", "取消"],
          });

          await this.emitEvent({
            type: "step_complete",
            step,
            stepIndex: i,
            totalSteps: steps.length,
            summary: `已派发审批 (${(approval?.assignee?.length || 0)}人)`,
            output: {
              key: step.output_key,
              content: approval?.detail ?? "",
              content_type: step.human_review_config?.detail_type || "markdown",
            },
          });
          i++;
          continue;
        }

        const result = await this.executeStepByType(step);
        this.context[step.output_key] = result;
        finalResult = typeof result === "string" ? result : JSON.stringify(result);

        await this.emitEvent({
          type: "step_complete",
          step,
          stepIndex: i,
          totalSteps: steps.length,
          summary: this.getStepSummary(step, result),
          output: {
            key: step.output_key,
            content: result,
            content_type: "text",
          },
        });
      } catch (error) {
        hasError = true;
        const errorMessage = error instanceof Error ? error.message : String(error);
        finalResult = `步骤「${step.name}」执行失败: ${errorMessage}`;
        await this.emitEvent({
          type: "step_error",
          step,
          stepIndex: i,
          totalSteps: steps.length,
          error: errorMessage,
        });
        break;
      }

      i++;
    }

    await this.clearCheckpoint();

    if (!hasError) {
      await this.emitEvent({
        type: "workflow_complete",
        result: this.context as Record<string, unknown>,
      });
    }

    return finalResult;
  }

  /** 获取执行状态 */
  async getStatus(): Promise<{ status: string; stepIndex: number; totalSteps: number; context: Record<string, unknown> } | null> {
    const checkpoint = await this.loadCheckpoint();
    if (!checkpoint) return null;
    return {
      status: checkpoint.status,
      stepIndex: checkpoint.stepIndex,
      totalSteps: this.workflow.steps.length,
      context: checkpoint.context,
    };
  }

  // ========== 交互式执行（支持暂停/恢复） ==========

  private async runSteps(): Promise<void> {
    const steps = this.workflow.steps;

    while (this.stepIndex < steps.length) {
      const step = steps[this.stepIndex];

      // 并行组
      if (step.parallel_group) {
        const groupSteps: WorkflowStep[] = [step];
        const groupIndices: number[] = [this.stepIndex];
        let j = this.stepIndex + 1;
        while (j < steps.length && steps[j].parallel_group === step.parallel_group) {
          groupSteps.push(steps[j]);
          groupIndices.push(j);
          j++;
        }

        for (let k = 0; k < groupSteps.length; k++) {
          await this.emitEvent({
            type: "step_start",
            step: groupSteps[k],
            stepIndex: groupIndices[k],
            totalSteps: steps.length,
          });
        }

        const results = await Promise.allSettled(
          groupSteps.map(s => this.executeStepByType(s))
        );

        for (let k = 0; k < groupSteps.length; k++) {
          const r = results[k];
          if (r.status === "fulfilled") {
            this.context[groupSteps[k].output_key] = r.value;
            await this.emitEvent({
              type: "step_complete",
              step: groupSteps[k],
              stepIndex: groupIndices[k],
              totalSteps: steps.length,
              summary: this.getStepSummary(groupSteps[k], r.value),
              output: {
                key: groupSteps[k].output_key,
                content: r.value,
                content_type: "text",
              },
            });
          } else {
            const errMsg = r.reason instanceof Error ? r.reason.message : String(r.reason);
            await this.emitEvent({
              type: "step_error",
              step: groupSteps[k],
              stepIndex: groupIndices[k],
              totalSteps: steps.length,
              error: errMsg,
            });
            await this.saveCheckpoint(groupIndices[k]);
            return;
          }
        }

        this.stepIndex = j;
        continue;
      }

      // 条件分支
      if (step.type === "condition") {
        await this.emitEvent({
          type: "step_start",
          step,
          stepIndex: this.stepIndex,
          totalSteps: steps.length,
        });

        try {
          const branchResult = await this.evaluateCondition(step);
          this.context[step.output_key] = branchResult.taken;

          await this.emitEvent({
            type: "branch_taken",
            step,
            stepIndex: this.stepIndex,
            totalSteps: steps.length,
            branch: {
              condition_step: step.step_id,
              taken_branch: branchResult.taken ? "true" : "false",
              target_step: branchResult.taken ? step.condition!.true_branch : step.condition!.false_branch,
            },
          });

          const targetId = branchResult.taken ? step.condition!.true_branch : step.condition!.false_branch;
          const targetIdx = steps.findIndex(s => s.step_id === targetId);
          if (targetIdx >= 0) {
            this.stepIndex = targetIdx;
            continue;
          }
          this.stepIndex++;
          continue;
        } catch (error) {
          const errMsg = error instanceof Error ? error.message : String(error);
          await this.emitEvent({
            type: "step_error",
            step,
            stepIndex: this.stepIndex,
            totalSteps: steps.length,
            error: errMsg,
          });
          await this.saveCheckpoint(this.stepIndex);
          return;
        }
      }

      // 人工审批 → 创建审批任务 + 暂停
      if (step.type === "human_review") {
        await this.emitEvent({
          type: "step_start",
          step,
          stepIndex: this.stepIndex,
          totalSteps: steps.length,
        });
        await this.saveCheckpoint(this.stepIndex);
        const approval = await this.createApprovalTasks(step);
        this.context[step.output_key] = "pending_approval";
        await this.emitEvent({
          type: "waiting_human",
          step,
          message: step.human_review_config?.detail_ref
            ? `${step.name || "人工审批"}已派发给指定审批人，等待处理...`
            : this.fillTemplate(step.input_template),
          detail: approval?.detail ?? this.fillTemplate(step.input_template),
          detail_type: step.human_review_config?.detail_type || "markdown",
          task_ids: approval?.task_ids,
          assignee: approval?.assignee,
          confirmOptions: ["确认", "修改", "取消"],
        });
        return;
      }

      // 普通步骤
      await this.emitEvent({
        type: "step_start",
        step,
        stepIndex: this.stepIndex,
        totalSteps: steps.length,
      });

      try {
        const result = await this.executeStepByType(step);
        this.context[step.output_key] = result;

        await this.emitEvent({
          type: "step_complete",
          step,
          stepIndex: this.stepIndex,
          totalSteps: steps.length,
          summary: this.getStepSummary(step, result),
          output: {
            key: step.output_key,
            content: result,
            content_type: "text",
          },
        });
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        await this.emitEvent({
          type: "step_error",
          step,
          stepIndex: this.stepIndex,
          totalSteps: steps.length,
          error: errMsg,
        });
        await this.saveCheckpoint(this.stepIndex);
        return;
      }

      this.stepIndex++;
    }

    await this.clearCheckpoint();
    await this.emitEvent({
      type: "workflow_complete",
      result: this.context as Record<string, unknown>,
    });
  }

  // ========== 步骤执行 ==========

  private async executeStepByType(step: WorkflowStep): Promise<unknown> {
    switch (step.type) {
      case "llm_generate":
        return this.executeLLMStep(step);
      case "tool_call":
        return this.executeToolStep(step);
      case "skill_call":
        return this.executeSkillStep(step);
      case "human_review":
        return "confirmed";
      case "condition":
        return (await this.evaluateCondition(step)).taken;
      default:
        return this.executeLLMStep(step);
    }
  }

  /** LLM 生成步骤 */
  private async executeLLMStep(step: WorkflowStep): Promise<string> {
    const prompt = this.fillTemplate(step.prompt || step.input_template || "");
    const { LLMClient } = await import("coze-coding-dev-sdk");
    const Config = (await import("coze-coding-dev-sdk")).Config;

    const config = new Config();
    const llmClient = new LLMClient(config);

    const model = step.model_config?.model || step.config?.model || "doubao-seed-2-0-pro-260215";
    const temperature = step.model_config?.temperature ?? step.config?.temperature ?? 0.3;

    const response = await llmClient.invoke(
      [
        {
          role: "system",
          content: `你是一个工作流执行引擎。请严格按照以下任务执行，只输出结果，不要额外解释。\n\n当前步骤：${step.name}\n描述：${step.description || ""}`,
        },
        { role: "user", content: prompt },
      ],
      { model, temperature }
    );

    return response.content || "";
  }

  /** 工具调用步骤 */
  private async executeToolStep(step: WorkflowStep): Promise<unknown> {
    const toolName = step.tool_name || "";

    try {
      const client = getSupabaseClient();
      const { data: tools } = await client
        .from("tools")
        .select("*")
        .or(`name.eq.${toolName},action.eq.${toolName}`)
        .limit(1);

      if (tools && tools.length > 0) {
        // 构建参数：优先使用 step.parameters（已填充模板变量），再回退到 input_template
        let params: Record<string, unknown> = { ...this.context };
        if (step.parameters && typeof step.parameters === "object") {
          params = {};
          for (const [key, val] of Object.entries(step.parameters)) {
            params[key] = typeof val === "string" ? this.fillTemplate(val) : val;
          }
        } else if (step.input_template) {
          const filled = this.fillTemplate(step.input_template).trim();
          // 尝试解析 JSON 格式的 input_template
          try {
            const parsed = JSON.parse(filled);
            if (typeof parsed === "object" && parsed !== null) {
              params = parsed as Record<string, unknown>;
            } else {
              params.input = filled;
            }
          } catch {
            params.input = filled;
          }
        }
        const { executeToolAction } = await import("@/lib/agents/skill-actions");
        return await executeToolAction(tools[0], params, { agentId: this.agentId || "", teamId: this.teamId || "" });
      }
      return this.executeLLMStep(step);
    } catch {
      return this.executeLLMStep(step);
    }
  }

  /** Skill 调用步骤：调用已定义的 Skill（SOP）执行 */
  private async executeSkillStep(step: WorkflowStep): Promise<unknown> {
    const skillId = step.skill_config?.skill_id;
    if (!skillId) {
      throw new Error(`步骤「${step.name}」未配置 skill_id`);
    }

    const client = getSupabaseClient();
    const { data: skill } = await client
      .from("skills")
      .select("*")
      .eq("id", skillId)
      .single();

    if (!skill) {
      throw new Error(`步骤「${step.name}」引用的 Skill(${skillId}) 不存在`);
    }

    const { SkillExecutor } = await import("@/lib/skill-executor");
    const skillInput = this.fillTemplate(step.input_template) || String(this.context.user_input || "");

    const executor = new SkillExecutor(
      skill as any,
      `${this.sessionId}-${step.step_id}`,
      async () => {} // 工作流内嵌 Skill 不单独推送事件
    );

    const result = await executor.execute(skillInput);
    return (result.result as string) || JSON.stringify(result, null, 2);
  }

  /** 条件分支：用 LLM 判断条件是否成立 */
  private async evaluateCondition(step: WorkflowStep): Promise<{ taken: boolean }> {
    if (!step.condition?.expression) {
      return { taken: false };
    }

    // 确定性求值：替代"用 LLM 判断自然语言条件"的脆弱做法。
    // 表达式必须是受控的结构化语法（如 `{{result.status}} == "approved"` 或
    // `contains({{draft.text}}, "通过")`）。无法求值/非布尔结果会显式抛错，
    // 由上层 try-catch 捕获并转成 step_error，而不是让模型猜一个 true/false。
    const taken = evaluateConditionDeterministic(
      step.condition.expression,
      this.context,
    );
    return { taken };
  }

  // ========== 工具方法 ==========

  private fillTemplate(template: string): string {
    return template.replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, (_, key: string) => {
      // 支持嵌套 key 如 result.field
      const parts = key.split(".");
      let value: unknown = this.context;
      for (const part of parts) {
        if (value === undefined || value === null) return `{{${key}}}`;
        value = (value as Record<string, unknown>)[part];
      }
      if (value === undefined || value === null) return `{{${key}}}`;
      if (typeof value === "object") return JSON.stringify(value);
      return String(value);
    });
  }

  private getStepSummary(step: WorkflowStep, result: unknown): string {
    const resultStr = typeof result === "string" ? result : JSON.stringify(result);
    return resultStr.length > 100 ? resultStr.substring(0, 100) + "..." : resultStr;
  }

  private async emitEvent(event: WorkflowEvent): Promise<void> {
    await this.onEvent(event);
  }

  // ========== 审批任务 ==========

  /**
   * 为人工审批步骤创建审批任务，并投递通知给指定审批人。
   * 返回：{ task_ids, assignee, detail }，若无法解析审批人则返回 null。
   */
  private async createApprovalTasks(step: WorkflowStep): Promise<{ task_ids: string[]; assignee: string[]; detail: string } | null> {
    try {
      const config = step.human_review_config;
      const approverIds = await this.resolveApprovers(config);
      if (approverIds.length === 0) {
        console.warn(`[workflow] 步骤「${step.name}」未解析到审批人，跳过审批任务创建`);
        return null;
      }

      // 生成审批工单正文：优先 detail_ref 指向的产物，否则用 input_template 模板
      const detail = this.buildApprovalDetail(step);

      const client = getSupabaseClient();
      const taskIds: string[] = [];

      for (const approverId of approverIds) {
        const { data: task } = await client
          .from("workflow_approval_tasks")
          .insert({
            workflow_id: this.workflow.id,
            session_id: this.sessionId,
            step_index: this.stepIndex,
            step_id: step.step_id,
            step_name: step.name,
            team_id: this.teamId || null,
            approver_id: approverId,
            applicant_id: this.applicantId || null,
            status: "pending",
            message: step.description || step.name || "",
            detail,
            detail_type: config?.detail_type || "markdown",
            payload: { context: this.context, output_key: step.output_key },
          })
          .select("id")
          .single();

        if (task?.id) {
          taskIds.push(task.id);
        }

        // 投递系统通知给审批人
        await client.from("system_notifications").insert({
          team_id: this.teamId || null,
          user_id: approverId,
          scope: "user",
          type: "workflow_approval",
          title: `【审批】${this.workflow.name} · ${step.name || "人工审批"}`,
          content: `你有一条待审批的工作流任务：「${step.name || step.description || "人工审批"}」，请尽快处理。`,
          link: `/apps?tab=approvals`,
        });
      }

      return { task_ids: taskIds, assignee: approverIds, detail };
    } catch (error) {
      console.error("[workflow] 创建审批任务失败:", error);
      return null;
    }
  }

  /** 解析审批人 id 列表 */
  private async resolveApprovers(config?: WorkflowStep["human_review_config"]): Promise<string[]> {
    const client = getSupabaseClient();

    // 指定用户
    if (config?.approver_type === "user") {
      const ids = (config.approver_ids || []).filter(Boolean);
      // 解析模板变量（如 {{initiator_id}} → this.applicantId）
      const resolved = ids.map(id => {
        if (id.includes("{{initiator_id}}")) return this.applicantId || "";
        return id;
      });
      return resolved.filter(Boolean);
    }

    // 指定角色 / 上级（默认团队管理员）→ 查询 team_members
    if (this.teamId) {
      let roleFilter: string | undefined;
      if (config?.approver_type === "role" && config.role_name) {
        roleFilter = config.role_name;
      } else {
        // manager 或未明确指定 → 团队 owner/admin 作为审批人
        roleFilter = "owner";
      }

      const { data } = await client
        .from("team_members")
        .select("user_id, role")
        .eq("team_id", this.teamId);

      const ids = (data || [])
        .map((m) => {
          const role = (m as { role?: string }).role;
          if (roleFilter === "owner") {
            return role === "owner" || role === "admin" ? m.user_id : null;
          }
          return role === roleFilter ? m.user_id : null;
        })
        .filter(Boolean) as string[];

      if (ids.length > 0) return ids;
    }

    return [];
  }

  /** 构建审批工单正文（带内容的审批工单） */
  private buildApprovalDetail(step: WorkflowStep): string {
    const config = step.human_review_config;
    if (config?.detail_ref) {
      // detail_ref 指向 context 中某个 output_key，如 "draft"
      const value = this.context[config.detail_ref];
      if (typeof value === "string") return value;
      if (value !== undefined && value !== null) return JSON.stringify(value, null, 2);
    }
    return this.fillTemplate(step.input_template);
  }

  // ========== Checkpoint ==========

  private async saveCheckpoint(stepIndex: number): Promise<void> {
    try {
      const client = getSupabaseClient();
      const { data: existing } = await client
        .from("workflow_checkpoints")
        .select("id")
        .eq("session_id", this.sessionId)
        .maybeSingle();

      if (existing) {
        await client
          .from("workflow_checkpoints")
          .update({
            step_index: stepIndex,
            context: this.context,
            status: "paused",
            updated_at: new Date().toISOString(),
          })
          .eq("id", existing.id);
      } else {
        await client.from("workflow_checkpoints").insert({
          session_id: this.sessionId,
          workflow_id: this.workflow.id,
          step_index: stepIndex,
          context: this.context,
          status: "paused",
        });
      }
    } catch (error) {
      console.error("保存 checkpoint 失败:", error);
    }
  }

  private async loadCheckpoint(): Promise<Checkpoint | null> {
    try {
      const client = getSupabaseClient();
      const { data } = await client
        .from("workflow_checkpoints")
        .select("*")
        .eq("session_id", this.sessionId)
        .eq("status", "paused")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!data) return null;

      return {
        sessionId: data.session_id,
        workflowId: data.workflow_id,
        stepIndex: data.step_index,
        context: data.context as Record<string, unknown>,
        status: data.status,
      };
    } catch (error) {
      console.error("加载 checkpoint 失败:", error);
      return null;
    }
  }

  private async clearCheckpoint(): Promise<void> {
    try {
      const client = getSupabaseClient();
      await client
        .from("workflow_checkpoints")
        .update({ status: "completed", updated_at: new Date().toISOString() })
        .eq("session_id", this.sessionId);
    } catch (error) {
      console.error("清除 checkpoint 失败:", error);
    }
  }

  // ========== 静态方法 ==========

  /** 根据 agent 和用户输入判断是否触发工作流并执行 */
  static async tryExecute(
    agentId: string,
    workflowId: string | null | undefined,
    userInput: string,
    sessionId: string
  ): Promise<{ triggered: boolean; result?: string }> {
    if (!workflowId) return { triggered: false };

    try {
      const client = getSupabaseClient();
      const { data: workflow } = await client
        .from("agent_workflows")
        .select("*")
        .eq("id", workflowId)
        .eq("is_active", true)
        .single();

      if (!workflow) return { triggered: false };

      // 使用 LLM 意图判断触发条件（与 Skill 触发一致）
      const condition = workflow.trigger_condition || "";
      if (condition) {
        const { matchSkillByIntent } = await import("@/lib/skill-executor");
        // 将工作流当作一个"技能"来做意图判断
        const matched = await matchSkillByIntent(
          [{
            id: workflow.id,
            name: workflow.name,
            description: workflow.description || "",
            trigger_condition: condition,
            is_executable: true,
            team_id: "",
          }],
          userInput
        );
        if (!matched) return { triggered: false };
      }

      const executor = new WorkflowExecutor(
        {
          id: workflow.id,
          name: workflow.name,
          description: workflow.description,
          trigger_condition: workflow.trigger_condition,
          steps: workflow.steps as WorkflowStep[],
        },
        sessionId,
        () => {},
        { agentId }
      );

      const result = await executor.executeWorkflowOnce(userInput);
      return { triggered: true, result };
    } catch {
      return { triggered: false };
    }
  }
}
