"use client";

import { useState, useCallback, useMemo } from "react";
import {
  Brain,
  Wrench,
  UserCheck,
  GitBranch,
  Plus,
  Trash2,
  Copy,
  ChevronDown,
  ChevronUp,
  GripVertical,
  Layers,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { WorkflowDefinition, WorkflowStep, StepType } from "@/lib/workflow-executor";

interface WorkflowEditorProps {
  workflow: WorkflowDefinition;
  onChange: (workflow: WorkflowDefinition) => void;
  readOnly?: boolean;
  /** 可选的 Skill 列表，用于 skill_call 步骤选择 */
  skills?: { id: string; name: string }[];
}

const stepTypeIcons: Record<StepType, React.ReactNode> = {
  llm_generate: <Brain className="w-3.5 h-3.5 text-blue-500" />,
  tool_call: <Wrench className="w-3.5 h-3.5 text-green-500" />,
  human_review: <UserCheck className="w-3.5 h-3.5 text-orange-500" />,
  condition: <GitBranch className="w-3.5 h-3.5 text-amber-500" />,
  skill_call: <Sparkles className="w-3.5 h-3.5 text-purple-500" />,
};

const stepTypeLabels: Record<StepType, string> = {
  llm_generate: "AI 生成",
  tool_call: "工具调用",
  human_review: "人工审批",
  condition: "条件分支",
  skill_call: "调用技能",
};

let stepIdCounter = 0;
function generateStepId(): string {
  stepIdCounter += 1;
  return `step_${Date.now()}_${stepIdCounter}`;
}

export function WorkflowEditor({ workflow, onChange, readOnly = false, skills = [] }: WorkflowEditorProps) {
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set());
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const toggleExpand = useCallback((stepId: string) => {
    setExpandedSteps((prev) => {
      const next = new Set(prev);
      if (next.has(stepId)) {
        next.delete(stepId);
      } else {
        next.add(stepId);
      }
      return next;
    });
  }, []);

  const updateStep = useCallback(
    (index: number, updates: Partial<WorkflowStep>) => {
      const newSteps = [...workflow.steps];
      newSteps[index] = { ...newSteps[index], ...updates };
      onChange({ ...workflow, steps: newSteps });
    },
    [workflow, onChange]
  );

  const removeStep = useCallback(
    (index: number) => {
      const newSteps = workflow.steps.filter((_, i) => i !== index);
      onChange({ ...workflow, steps: newSteps });
    },
    [workflow, onChange]
  );

  const addStep = useCallback(
    (type: StepType = "llm_generate", afterIndex?: number) => {
      const newStep: WorkflowStep = {
        step_id: generateStepId(),
        name: "",
        type,
        input_template: type === "condition" ? "" : "执行{{user_input}}",
        output_key: `result_${workflow.steps.length + 1}`,
        description: "",
        ...(type === "condition"
          ? {
              condition: {
                expression: "",
                true_branch: "",
                false_branch: "",
              },
            }
          : {}),
        ...(type === "skill_call"
          ? {
              skill_config: {
                skill_id: "",
              },
            }
          : {}),
      };
      const newSteps = [...workflow.steps];
      if (afterIndex !== undefined) {
        newSteps.splice(afterIndex + 1, 0, newStep);
      } else {
        newSteps.push(newStep);
      }
      onChange({ ...workflow, steps: newSteps });
      setExpandedSteps((prev) => {
        const next = new Set(prev);
        next.add(newStep.step_id);
        return next;
      });
    },
    [workflow, onChange]
  );

  const moveStep = useCallback(
    (from: number, to: number) => {
      if (to < 0 || to >= workflow.steps.length) return;
      const newSteps = [...workflow.steps];
      const [moved] = newSteps.splice(from, 1);
      newSteps.splice(to, 0, moved);
      onChange({ ...workflow, steps: newSteps });
    },
    [workflow, onChange]
  );

  const duplicateStep = useCallback(
    (index: number) => {
      const original = workflow.steps[index];
      const newStep: WorkflowStep = {
        ...original,
        step_id: generateStepId(),
        name: original.name + " (副本)",
      };
      const newSteps = [...workflow.steps];
      newSteps.splice(index + 1, 0, newStep);
      onChange({ ...workflow, steps: newSteps });
    },
    [workflow, onChange]
  );

  // 获取并行组标识
  const getParallelGroupLabel = useMemo(() => {
    const groupMap = new Map<string, number>();
    let groupCounter = 0;
    return (step: WorkflowStep, index: number): string | null => {
      if (!step.parallel_group) return null;
      if (!groupMap.has(step.parallel_group)) {
        groupMap.set(step.parallel_group, ++groupCounter);
      }
      return `P${groupMap.get(step.parallel_group)}`;
    };
  }, []);

  // 添加并行组
  const addParallelGroup = useCallback(
    (startIndex: number) => {
      const groupId = `parallel_${Date.now()}`;
      const newSteps = [...workflow.steps];
      // 标记当前步骤和下一步为并行
      if (startIndex < newSteps.length) {
        newSteps[startIndex] = { ...newSteps[startIndex], parallel_group: groupId };
      }
      if (startIndex + 1 < newSteps.length) {
        newSteps[startIndex + 1] = { ...newSteps[startIndex + 1], parallel_group: groupId };
      }
      onChange({ ...workflow, steps: newSteps });
    },
    [workflow, onChange]
  );

  return (
    <div className="space-y-3">
      {/* Workflow metadata */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs">工作流名称</Label>
          <Input
            value={workflow.name}
            onChange={(e) => onChange({ ...workflow, name: e.target.value })}
            placeholder="工作流名称"
            className="h-8 text-sm"
            readOnly={readOnly}
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">触发条件</Label>
          <Input
            value={workflow.trigger_condition}
            onChange={(e) => onChange({ ...workflow, trigger_condition: e.target.value })}
            placeholder="如：分析、报告、研究（留空则 LLM 自动判断）"
            className="h-8 text-sm"
            readOnly={readOnly}
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">描述</Label>
        <Input
          value={workflow.description}
          onChange={(e) => onChange({ ...workflow, description: e.target.value })}
          placeholder="工作流描述"
          className="h-8 text-sm"
          readOnly={readOnly}
        />
      </div>

      {/* Steps */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label className="text-xs">步骤列表（{workflow.steps.length} 步）</Label>
          {!readOnly && (
            <div className="flex items-center gap-1">
              <Select onValueChange={(v) => addStep(v as StepType)}>
                <SelectTrigger className="h-7 w-28 text-xs">
                  <Plus className="w-3 h-3 mr-1" />
                  <SelectValue placeholder="添加步骤" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="llm_generate">AI 生成</SelectItem>
                  <SelectItem value="tool_call">工具调用</SelectItem>
                  <SelectItem value="human_review">人工审批</SelectItem>
                  <SelectItem value="condition">条件分支</SelectItem>
                  <SelectItem value="skill_call">调用技能</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <div className="space-y-1.5">
          {workflow.steps.map((step, index) => {
            const isExpanded = expandedSteps.has(step.step_id);
            const parallelLabel = getParallelGroupLabel(step, index);
            return (
              <Card
                key={step.step_id}
                className={`relative border ${dragIndex === index ? "ring-2 ring-primary" : ""} ${
                  step.type === "condition" ? "border-amber-200 dark:border-amber-800" : ""
                }`}
              >
                <CardContent className="p-2.5">
                  {/* Step header */}
                  <div className="flex items-center gap-2">
                    {/* Drag handle */}
                    {!readOnly && (
                      <button
                        className="cursor-grab text-muted-foreground hover:text-foreground flex-shrink-0"
                        onMouseDown={() => setDragIndex(index)}
                        title="拖拽排序"
                      >
                        <GripVertical className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {/* Step number */}
                    <span className="w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[10px] font-medium flex-shrink-0">
                      {index + 1}
                    </span>
                    {/* Parallel group indicator */}
                    {parallelLabel && (
                      <span className="flex items-center gap-0.5 px-1 py-0.5 rounded bg-purple-50 text-purple-600 dark:bg-purple-900/20 dark:text-purple-400 text-[10px] flex-shrink-0">
                        <Layers className="w-2.5 h-2.5" /> {parallelLabel}
                      </span>
                    )}
                    {/* Type icon */}
                    {stepTypeIcons[step.type]}
                    {/* Name */}
                    {readOnly ? (
                      <span className="text-sm font-medium">{step.name || stepTypeLabels[step.type]}</span>
                    ) : (
                      <Input
                        value={step.name}
                        onChange={(e) => updateStep(index, { name: e.target.value })}
                        placeholder="步骤名称"
                        className="h-7 text-sm flex-1 min-w-0"
                      />
                    )}
                    {/* Condition badge */}
                    {step.type === "condition" && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 flex-shrink-0">
                        IF
                      </span>
                    )}
                    {/* Skill badge */}
                    {step.type === "skill_call" && step.skill_config?.skill_name && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400 flex-shrink-0">
                        {step.skill_config.skill_name}
                      </span>
                    )}
                    {/* Actions */}
                    {!readOnly && (
                      <div className="flex items-center gap-0.5 flex-shrink-0">
                        <button
                          onClick={() => toggleExpand(step.step_id)}
                          className="p-1 text-muted-foreground hover:text-foreground"
                          title={isExpanded ? "收起" : "展开"}
                        >
                          {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                        </button>
                        <button
                          onClick={() => duplicateStep(index)}
                          className="p-1 text-muted-foreground hover:text-foreground"
                          title="复制步骤"
                        >
                          <Copy className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => removeStep(index)}
                          className="p-1 text-muted-foreground hover:text-destructive"
                          title="删除步骤"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Expanded detail */}
                  {isExpanded && !readOnly && (
                    <div className="mt-2.5 pl-7 space-y-2 border-t pt-2">
                      <div className="grid grid-cols-3 gap-2">
                        <div className="space-y-1">
                          <Label className="text-[10px] text-muted-foreground">步骤类型</Label>
                          <Select
                            value={step.type}
                            onValueChange={(v) => {
                              const newType = v as StepType;
                              const updates: Partial<WorkflowStep> = { type: newType };
                              if (newType === "condition" && !step.condition) {
                                updates.condition = { expression: "", true_branch: "", false_branch: "" };
                              }
                              if (newType === "skill_call" && !step.skill_config) {
                                updates.skill_config = { skill_id: "" };
                              }
                              updateStep(index, updates);
                            }}
                          >
                            <SelectTrigger className="h-7 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="llm_generate">AI 生成</SelectItem>
                              <SelectItem value="tool_call">工具调用</SelectItem>
                              <SelectItem value="human_review">人工审批</SelectItem>
                              <SelectItem value="condition">条件分支</SelectItem>
                              <SelectItem value="skill_call">调用技能</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[10px] text-muted-foreground">输出键名</Label>
                          <Input
                            value={step.output_key}
                            onChange={(e) => updateStep(index, { output_key: e.target.value })}
                            placeholder="result_1"
                            className="h-7 text-xs"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[10px] text-muted-foreground">并行组</Label>
                          <div className="flex items-center gap-1.5 h-7">
                            {step.parallel_group ? (
                              <>
                                <span className="text-xs text-purple-600 dark:text-purple-400 flex items-center gap-1">
                                  <Layers className="w-3 h-3" /> {step.parallel_group.slice(-4)}
                                </span>
                                <button
                                  onClick={() => updateStep(index, { parallel_group: undefined })}
                                  className="text-[10px] text-muted-foreground hover:text-destructive underline"
                                >
                                  取消
                                </button>
                              </>
                            ) : (
                              <button
                                onClick={() => addParallelGroup(index)}
                                className="text-[10px] text-muted-foreground hover:text-purple-600 underline"
                                disabled={index + 1 >= workflow.steps.length}
                                title="需要至少两个步骤才能创建并行组"
                              >
                                加入并行组
                              </button>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Skill selection for skill_call type */}
                      {step.type === "skill_call" && (
                        <div className="space-y-1">
                          <Label className="text-[10px] text-muted-foreground">选择技能</Label>
                          <Select
                            value={step.skill_config?.skill_id || ""}
                            onValueChange={(v) => {
                              const selectedSkill = skills.find((s) => s.id === v);
                              updateStep(index, {
                                skill_config: {
                                  skill_id: v,
                                  skill_name: selectedSkill?.name || "",
                                },
                              });
                            }}
                          >
                            <SelectTrigger className="h-7 text-xs">
                              <SelectValue placeholder="选择一个技能" />
                            </SelectTrigger>
                            <SelectContent>
                              {skills.map((s) => (
                                <SelectItem key={s.id} value={s.id}>
                                  {s.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}

                      {/* Condition branch configuration */}
                      {step.type === "condition" && step.condition && (
                        <div className="space-y-1.5 border-l-2 border-amber-200 pl-3">
                          <Label className="text-[10px] text-muted-foreground">条件表达式（确定性语法）</Label>
                          <Textarea
                            value={step.condition.expression}
                            onChange={(e) =>
                              updateStep(index, {
                                condition: { ...step.condition!, expression: e.target.value },
                              })
                            }
                            placeholder={'如：{{result.status}} == "approved" 或 contains({{draft.text}}, "通过")。支持 ==/!=/>/</>=/<=、&&/||/!、contains()/is_empty()。'}
                            className="h-14 text-xs"
                          />
                          <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-1">
                              <Label className="text-[10px] text-green-600">满足条件 → 跳转到</Label>
                              <Select
                                value={step.condition.true_branch}
                                onValueChange={(v) =>
                                  updateStep(index, {
                                    condition: { ...step.condition!, true_branch: v },
                                  })
                                }
                              >
                                <SelectTrigger className="h-7 text-xs">
                                  <SelectValue placeholder="选择步骤" />
                                </SelectTrigger>
                                <SelectContent>
                                  {workflow.steps
                                    .filter((s) => s.step_id !== step.step_id)
                                    .map((s, si) => (
                                      <SelectItem key={s.step_id} value={s.step_id}>
                                        {workflow.steps.indexOf(s) + 1}. {s.name || stepTypeLabels[s.type]}
                                      </SelectItem>
                                    ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-1">
                              <Label className="text-[10px] text-red-600">不满足 → 跳转到</Label>
                              <Select
                                value={step.condition.false_branch}
                                onValueChange={(v) =>
                                  updateStep(index, {
                                    condition: { ...step.condition!, false_branch: v },
                                  })
                                }
                              >
                                <SelectTrigger className="h-7 text-xs">
                                  <SelectValue placeholder="选择步骤" />
                                </SelectTrigger>
                                <SelectContent>
                                  {workflow.steps
                                    .filter((s) => s.step_id !== step.step_id)
                                    .map((s) => (
                                      <SelectItem key={s.step_id} value={s.step_id}>
                                        {workflow.steps.indexOf(s) + 1}. {s.name || stepTypeLabels[s.type]}
                                      </SelectItem>
                                    ))}
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                        </div>
                      )}

                      <div className="space-y-1">
                        <Label className="text-[10px] text-muted-foreground">输入模板</Label>
                        <Textarea
                          value={step.input_template}
                          onChange={(e) => updateStep(index, { input_template: e.target.value })}
                          placeholder="执行{{user_input}}"
                          className="h-16 text-xs"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px] text-muted-foreground">描述（可选）</Label>
                        <Input
                          value={step.description || ""}
                          onChange={(e) => updateStep(index, { description: e.target.value })}
                          placeholder="步骤描述"
                          className="h-7 text-xs"
                        />
                      </div>

                      {/* 审批配置（human_review 特有） */}
                      {step.type === "human_review" && (
                        <div className="space-y-2 border-l-2 border-blue-200 pl-3 pt-1">
                          <Label className="text-[10px] text-blue-600 font-semibold">审批配置</Label>
                          <div className="space-y-1">
                            <Label className="text-[10px] text-muted-foreground">审批人类型</Label>
                            <Select
                              value={step.human_review_config?.approver_type || "user"}
                              onValueChange={(v) =>
                                updateStep(index, {
                                  human_review_config: {
                                    ...step.human_review_config,
                                    approver_type: v as "user" | "role" | "manager",
                                    approver_ids: v !== "user" ? [] : step.human_review_config?.approver_ids || [],
                                    role_name: v !== "role" ? undefined : step.human_review_config?.role_name || "",
                                  },
                                })
                              }
                            >
                              <SelectTrigger className="h-7 text-xs">
                                <SelectValue placeholder="选择审批人类型" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="user">指定成员</SelectItem>
                                <SelectItem value="manager">管理员</SelectItem>
                                <SelectItem value="role">指定角色</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          {step.human_review_config?.approver_type === "user" && (
                            <div className="space-y-1">
                              <Label className="text-[10px] text-muted-foreground">审批人ID（逗号分隔）</Label>
                              <Input
                                value={step.human_review_config?.approver_ids?.join(",") || ""}
                                onChange={(e) =>
                                  updateStep(index, {
                                    human_review_config: {
                                      ...step.human_review_config!,
                                      approver_ids: e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
                                    },
                                  })
                                }
                                placeholder="user-id-1,user-id-2"
                                className="h-7 text-xs"
                              />
                            </div>
                          )}
                          {step.human_review_config?.approver_type === "role" && (
                            <div className="space-y-1">
                              <Label className="text-[10px] text-muted-foreground">角色名称</Label>
                              <Input
                                value={step.human_review_config?.role_name || ""}
                                onChange={(e) =>
                                  updateStep(index, {
                                    human_review_config: {
                                      ...step.human_review_config!,
                                      role_name: e.target.value,
                                    },
                                  })
                                }
                                placeholder="admin"
                                className="h-7 text-xs"
                              />
                            </div>
                          )}
                          <div className="space-y-1">
                            <Label className="text-[10px] text-muted-foreground">产物引用变量</Label>
                            <Input
                              value={step.human_review_config?.detail_ref || ""}
                              onChange={(e) =>
                                updateStep(index, {
                                  human_review_config: {
                                    ...step.human_review_config!,
                                    detail_ref: e.target.value,
                                  },
                                })
                              }
                              placeholder="如：draft（指向前面步骤的 output_key）"
                              className="h-7 text-xs"
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-[10px] text-muted-foreground">渲染类型</Label>
                            <Select
                              value={step.human_review_config?.detail_type || "markdown"}
                              onValueChange={(v) =>
                                updateStep(index, {
                                  human_review_config: {
                                    ...step.human_review_config!,
                                    detail_type: v as "markdown" | "text" | "json",
                                  },
                                })
                              }
                            >
                              <SelectTrigger className="h-7 text-xs">
                                <SelectValue placeholder="选择渲染类型" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="markdown">Markdown</SelectItem>
                                <SelectItem value="text">纯文本</SelectItem>
                                <SelectItem value="json">JSON</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="flex items-center gap-2">
                            <Checkbox
                              id={`require-all-${index}`}
                              checked={step.human_review_config?.require_all || false}
                              onCheckedChange={(v) =>
                                updateStep(index, {
                                  human_review_config: {
                                    ...step.human_review_config!,
                                    require_all: v === true,
                                  },
                                })
                              }
                            />
                            <Label htmlFor={`require-all-${index}`} className="text-[10px] text-muted-foreground">
                              需全部审批人同意（默认任一同意即可）
                            </Label>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-[10px] text-muted-foreground">驳回策略</Label>
                            <Select
                              value={step.human_review_config?.on_reject || "end"}
                              onValueChange={(v) =>
                                updateStep(index, {
                                  human_review_config: {
                                    ...step.human_review_config!,
                                    on_reject: v as "end" | "restart" | "skip",
                                  },
                                })
                              }
                            >
                              <SelectTrigger className="h-7 text-xs">
                                <SelectValue placeholder="选择驳回策略" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="end">结束工作流</SelectItem>
                                <SelectItem value="restart">重试（重新生成）</SelectItem>
                                <SelectItem value="skip">跳过继续</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Expanded view for readOnly */}
                  {isExpanded && readOnly && (
                    <div className="mt-2.5 pl-7 space-y-1 border-t pt-2 text-xs text-muted-foreground">
                      <div>类型: {stepTypeLabels[step.type]}</div>
                      <div>输入: {step.input_template}</div>
                      <div>输出键: {step.output_key}</div>
                      {step.description && <div>描述: {step.description}</div>}
                      {step.parallel_group && <div className="text-purple-500">⚡ 并行组: {step.parallel_group}</div>}
                      {step.type === "condition" && step.condition && (
                        <div className="text-amber-600">
                          🔀 条件: {step.condition.expression}
                          <br />
                          ✓ 满足 → 步骤 {workflow.steps.findIndex((s) => s.step_id === step.condition!.true_branch) + 1}
                          <br />
                          ✗ 不满足 → 步骤 {workflow.steps.findIndex((s) => s.step_id === step.condition!.false_branch) + 1}
                        </div>
                      )}
                      {step.type === "skill_call" && step.skill_config && (
                        <div className="text-purple-600">
                          ✨ 调用技能: {step.skill_config.skill_name || step.skill_config.skill_id}
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Drop zone for reordering */}
      {!readOnly && dragIndex !== null && (
        <div className="flex gap-1 flex-wrap">
          {workflow.steps.map((_, index) => (
            <button
              key={index}
              className="px-2 py-1 text-xs border rounded hover:bg-accent"
              onClick={() => {
                moveStep(dragIndex, index);
                setDragIndex(null);
              }}
            >
              移到第 {index + 1} 位
            </button>
          ))}
          <button
            className="px-2 py-1 text-xs border rounded hover:bg-accent text-muted-foreground"
            onClick={() => setDragIndex(null)}
          >
            取消
          </button>
        </div>
      )}
    </div>
  );
}
