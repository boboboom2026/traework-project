"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowDown,
  ArrowUp,
  Bot,
  BookOpen,
  GitBranch,
  ListChecks,
  Loader2,
  Plus,
  Save,
  Sparkles,
  Trash2,
  UserCheck,
  Wrench,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/use-auth";
import { apiJson, withTeamId } from "@/lib/api-client";
import { toast } from "sonner";
import type { WorkflowDefinitionV2, WorkflowNode } from "@/lib/workflow/types";

type NodeType = WorkflowNode["type"];

interface NodeMeta {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  defaultName: string;
}

const NODE_META: Record<NodeType, NodeMeta> = {
  llm_generate: { label: "AI 生成", icon: Sparkles, defaultName: "AI 生成" },
  tool_call: { label: "工具调用", icon: Wrench, defaultName: "工具调用" },
  skill_call: { label: "技能调用", icon: BookOpen, defaultName: "技能调用" },
  agent_call: { label: "智能体调用", icon: Bot, defaultName: "智能体调用" },
  condition: { label: "条件分支", icon: GitBranch, defaultName: "条件分支" },
  human_review: { label: "人工审批", icon: UserCheck, defaultName: "人工审批" },
  human_choice: { label: "人工选择", icon: ListChecks, defaultName: "人工选择" },
};

const NODE_TYPE_ORDER: NodeType[] = [
  "llm_generate",
  "agent_call",
  "tool_call",
  "skill_call",
  "condition",
  "human_review",
  "human_choice",
];

function genId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `n_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function makeNode(type: NodeType): WorkflowNode {
  const meta = NODE_META[type];
  const base: WorkflowNode = {
    id: genId(),
    name: meta.defaultName,
    type,
  };
  switch (type) {
    case "llm_generate":
      base.input_template = "";
      base.output_key = "result";
      base.model_config = {};
      break;
    case "tool_call":
    case "skill_call":
    case "agent_call":
      base.target = "";
      base.input_template = "";
      base.output_key = "result";
      if (type === "agent_call") base.side_effect = false;
      break;
    case "condition":
      base.condition = { expression: "", true_branch: "" };
      break;
    case "human_review":
      base.human_review_config = {
        approver_type: "manager",
        approver_ids: [],
        require_all: false,
      };
      base.output_key = "approval";
      break;
    case "human_choice":
      base.human_choice_config = { options: [{ label: "选项一", value: "option_1", next_step: "" }] };
      base.output_key = "choice";
      break;
  }
  return base;
}

interface SelectOption {
  id: string;
  name: string;
}

export default function TaskEditPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const taskId = params.id;
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [nodes, setNodes] = useState<WorkflowNode[]>([]);

  const [agents, setAgents] = useState<SelectOption[]>([]);
  const [tools, setTools] = useState<SelectOption[]>([]);
  const [skills, setSkills] = useState<SelectOption[]>([]);

  const isNew = taskId === "new";

  useEffect(() => {
    if (!user?.currentTeamId) return;
    void loadTask();
    void loadOptions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.currentTeamId, taskId]);

  async function loadTask(): Promise<void> {
    setLoading(true);
    try {
      if (isNew) {
        setName("未命名任务");
        setNodes([]);
        setLoading(false);
        return;
      }
      const json = await apiJson<{ data?: Array<{
        id: string;
        name: string;
        description: string | null;
        definition: WorkflowDefinitionV2 | null;
      }> }>(withTeamId("/api/tasks", user?.currentTeamId));
      const list = json.data ?? [];
      const task = list.find((t) => t.id === taskId);
      if (task) {
        setName(task.name);
        setDescription(task.description ?? "");
        setNodes(task.definition?.nodes ?? []);
      } else {
        toast.error("任务不存在或不属于当前团队");
      }
    } catch (e) {
      console.error("加载任务失败", e);
      toast.error(e instanceof Error ? e.message : "加载任务失败");
    } finally {
      setLoading(false);
    }
  }

  async function loadOptions(): Promise<void> {
    try {
      const [agentsRes, toolsRes, skillsRes] = await Promise.all([
        fetch("/api/agents"),
        fetch("/api/agent-skills"),
        fetch("/api/skills/definitions"),
      ]);
      const agentsJson = await agentsRes.json().catch(() => ({ data: [] }));
      const toolsJson = await toolsRes.json().catch(() => ({ data: [] }));
      const skillsJson = await skillsRes.json().catch(() => ({ data: [] }));
      setAgents(((agentsJson.data ?? []) as Array<{ id: string; name: string }>).map((a) => ({ id: a.id, name: a.name })));
      setTools(((toolsJson.data ?? []) as Array<{ id: string; name: string }>).map((t) => ({ id: t.id, name: t.name })));
      setSkills(((skillsJson.data ?? []) as Array<{ id: string; name: string }>).map((s) => ({ id: s.id, name: s.name })));
    } catch (e) {
      console.error("加载选项失败", e);
    }
  }

  const updateNode = useCallback((index: number, patch: Partial<WorkflowNode>): void => {
    setNodes((prev) => prev.map((n, i) => (i === index ? { ...n, ...patch } : n)));
  }, []);

  const addNode = useCallback((type: NodeType): void => {
    setNodes((prev) => [...prev, makeNode(type)]);
  }, []);

  const removeNode = useCallback((index: number): void => {
    setNodes((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const moveNode = useCallback((index: number, dir: -1 | 1): void => {
    setNodes((prev) => {
      const next = [...prev];
      const target = index + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }, []);

  async function onSave(): Promise<void> {
    if (!name.trim()) {
      toast.error("请输入任务名称");
      return;
    }
    if (nodes.length === 0) {
      toast.error("请至少添加一个节点");
      return;
    }
    setSaving(true);
    try {
      const definition: WorkflowDefinitionV2 = {
        id: isNew ? "" : taskId,
        name: name.trim(),
        description: description.trim() || undefined,
        nodes,
        entry_node: nodes[0]?.id ?? "",
      };
      const url = "/api/tasks";
      const method = isNew ? "POST" : "PUT";
      const json = await apiJson<{ data?: { id?: string } }>(url, {
        method,
        body: JSON.stringify(
          isNew
            ? { name: name.trim(), description, definition, teamId: user?.currentTeamId }
            : { id: taskId, name: name.trim(), description, definition, teamId: user?.currentTeamId },
        ),
      });
      toast.success("保存成功");
      if (isNew && json.data?.id) {
        router.replace(`/tasks/${json.data.id}/edit`);
      }
    } catch (e) {
      console.error("保存失败", e);
      toast.error(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  const nodeOptions = useMemo(() => nodes.map((n) => ({ id: n.id, name: n.name })), [nodes]);

  function renderCommonFields(index: number, node: WorkflowNode): React.ReactNode {
    return (
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">节点名称</Label>
          <Input value={node.name} onChange={(e) => updateNode(index, { name: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">输出字段 key</Label>
          <Input value={node.output_key ?? ""} placeholder="result" onChange={(e) => updateNode(index, { output_key: e.target.value })} />
        </div>
        {"input_template" in node && (
          <div className="col-span-2 space-y-1.5">
            <Label className="text-xs text-muted-foreground">输入模板（支持 {"{{上游key}}"} 引用）</Label>
            <Textarea
              rows={3}
              value={node.input_template ?? ""}
              placeholder="对 {{draft.text}} 进行处理..."
              onChange={(e) => updateNode(index, { input_template: e.target.value })}
            />
          </div>
        )}
      </div>
    );
  }

  function renderModelFields(index: number, node: WorkflowNode): React.ReactNode {
    const mc = node.model_config ?? {};
    return (
      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">模型</Label>
          <Input value={mc.model ?? ""} placeholder="默认模型" onChange={(e) => updateNode(index, { model_config: { ...mc, model: e.target.value } })} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">温度</Label>
          <Input type="number" step="0.1" value={mc.temperature ?? ""} placeholder="0.7" onChange={(e) => updateNode(index, { model_config: { ...mc, temperature: Number(e.target.value) } })} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">最大 token</Label>
          <Input type="number" value={mc.max_tokens ?? ""} placeholder="不限制" onChange={(e) => updateNode(index, { model_config: { ...mc, max_tokens: Number(e.target.value) } })} />
        </div>
      </div>
    );
  }

  function renderTargetSelect(index: number, node: WorkflowNode, options: SelectOption[], placeholder: string): React.ReactNode {
    return (
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">{placeholder}</Label>
        <Select value={node.target ?? ""} onValueChange={(v) => updateNode(index, { target: v })}>
          <SelectTrigger>
            <SelectValue placeholder={`选择${placeholder}`} />
          </SelectTrigger>
          <SelectContent>
            {options.map((o) => (
              <SelectItem key={o.id} value={o.id}>
                {o.name}
              </SelectItem>
            ))}
            {options.length === 0 && <div className="px-2 py-1.5 text-xs text-muted-foreground">暂无可选项</div>}
          </SelectContent>
        </Select>
      </div>
    );
  }

  function renderCondition(index: number, node: WorkflowNode): React.ReactNode {
    const cond = node.condition;
    return (
      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">条件表达式（确定性语法）</Label>
          <Textarea
            rows={2}
            value={cond?.expression ?? ""}
            placeholder='例如 {{order.status}} == "success" 或 contains({{draft.text}}, "通过")'
            onChange={(e) => updateNode(index, { condition: { ...(cond ?? { expression: "", true_branch: "" }), expression: e.target.value } })}
          />
          <p className="text-[11px] text-muted-foreground">支持 {"{{path}}"}、==/!=/&gt;/&lt;/&gt;=/&lt;=、&amp;&amp;/||/!、contains()/is_empty()</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">为真 → 跳转到</Label>
            <BranchSelect value={cond?.true_branch ?? ""} nodes={nodeOptions} excludeId={node.id} onChange={(v) => updateNode(index, { condition: { ...(cond ?? { expression: "", true_branch: "" }), true_branch: v } })} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">为假 → 跳转到（空=结束）</Label>
            <BranchSelect value={cond?.false_branch ?? ""} nodes={nodeOptions} excludeId={node.id} onChange={(v) => updateNode(index, { condition: { ...(cond ?? { expression: "", true_branch: "" }), false_branch: v } })} allowEmpty />
          </div>
        </div>
      </div>
    );
  }

  function renderHumanReview(index: number, node: WorkflowNode): React.ReactNode {
    const cfg = node.human_review_config;
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">审批人类型</Label>
            <Select value={cfg?.approver_type ?? "manager"} onValueChange={(v: "user" | "role" | "manager") => updateNode(index, { human_review_config: { ...(cfg ?? { approver_type: "manager" }), approver_type: v } })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="manager">上级/负责人</SelectItem>
                <SelectItem value="user">指定成员</SelectItem>
                <SelectItem value="role">指定角色</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {cfg?.approver_type === "role" && (
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">角色名</Label>
              <Input value={cfg?.role_name ?? ""} placeholder="如 财务" onChange={(e) => updateNode(index, { human_review_config: { ...(cfg ?? { approver_type: "role" }), role_name: e.target.value } })} />
            </div>
          )}
        </div>
        {cfg?.approver_type === "user" && (
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">审批人 ID（逗号分隔）</Label>
            <Input value={(cfg?.approver_ids ?? []).join(",")} placeholder="user_id_1,user_id_2" onChange={(e) => updateNode(index, { human_review_config: { ...(cfg ?? { approver_type: "user" }), approver_ids: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) } })} />
          </div>
        )}
        <div className="flex items-center gap-2">
          <Switch checked={cfg?.require_all ?? false} onCheckedChange={(v) => updateNode(index, { human_review_config: { ...(cfg ?? { approver_type: "manager" }), require_all: v } })} />
          <Label className="text-xs text-muted-foreground">需要全部审批人通过（否则任一即可）</Label>
        </div>
      </div>
    );
  }

  function renderHumanChoice(index: number, node: WorkflowNode): React.ReactNode {
    const options = node.human_choice_config?.options ?? [];
    return (
      <div className="space-y-3">
        <Label className="text-xs text-muted-foreground">选项（每个选项指向一个后续节点）</Label>
        {options.map((opt, optIndex) => (
          <div key={optIndex} className="grid grid-cols-[1fr_1fr_2fr_auto] gap-2 items-center">
            <Input value={opt.label} placeholder="标签" onChange={(e) => updateChoiceOption(index, optIndex, { label: e.target.value })} />
            <Input value={opt.value} placeholder="值" onChange={(e) => updateChoiceOption(index, optIndex, { value: e.target.value })} />
            <BranchSelect value={opt.next_step} nodes={nodeOptions} excludeId={node.id} onChange={(v) => updateChoiceOption(index, optIndex, { next_step: v })} />
            <Button type="button" variant="ghost" size="icon" onClick={() => removeChoiceOption(index, optIndex)}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
        <Button type="button" variant="outline" size="sm" onClick={() => addChoiceOption(index)}>
          <Plus className="mr-1 h-3.5 w-3.5" /> 添加选项
        </Button>
      </div>
    );
  }

  function updateChoiceOption(index: number, optIndex: number, patch: Partial<{ label: string; value: string; next_step: string }>): void {
    updateNode(index, {
      human_choice_config: {
        ...(nodes[index].human_choice_config ?? { options: [] }),
        options: (nodes[index].human_choice_config?.options ?? []).map((o, i) => (i === optIndex ? { ...o, ...patch } : o)),
      },
    });
  }

  function addChoiceOption(index: number): void {
    const cur = nodes[index].human_choice_config?.options ?? [];
    updateNode(index, {
      human_choice_config: {
        ...(nodes[index].human_choice_config ?? { options: [] }),
        options: [...cur, { label: `选项${cur.length + 1}`, value: `option_${cur.length + 1}`, next_step: "" }],
      },
    });
  }

  function removeChoiceOption(index: number, optIndex: number): void {
    const cur = nodes[index].human_choice_config?.options ?? [];
    updateNode(index, {
      human_choice_config: { ...(nodes[index].human_choice_config ?? { options: [] }), options: cur.filter((_, i) => i !== optIndex) },
    });
  }

  function renderNodeConfig(index: number, node: WorkflowNode): React.ReactNode {
    switch (node.type) {
      case "llm_generate":
        return (
          <div className="space-y-3">
            {renderCommonFields(index, node)}
            {renderModelFields(index, node)}
          </div>
        );
      case "tool_call":
        return (
          <div className="space-y-3">
            {renderTargetSelect(index, node, tools, "工具")}
            {renderCommonFields(index, node)}
            <p className="text-[11px] text-muted-foreground">工具参数请在「输入模板」中填写 JSON，例如 {"{\"keyword\": \"{{query}}\"}"}</p>
          </div>
        );
      case "skill_call":
        return (
          <div className="space-y-3">
            {renderTargetSelect(index, node, skills, "技能")}
            {renderCommonFields(index, node)}
          </div>
        );
      case "agent_call":
        return (
          <div className="space-y-3">
            {renderTargetSelect(index, node, agents, "智能体")}
            {renderCommonFields(index, node)}
            <div className="flex items-center gap-2">
              <Switch checked={node.side_effect ?? false} onCheckedChange={(v) => updateNode(index, { side_effect: v })} />
              <Label className="text-xs text-muted-foreground">有副作用（写外部系统，需前驱审批通过）</Label>
            </div>
          </div>
        );
      case "condition":
        return renderCondition(index, node);
      case "human_review":
        return renderHumanReview(index, node);
      case "human_choice":
        return renderHumanChoice(index, node);
      default:
        return null;
    }
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b px-6 py-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.push("/tasks")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="text-sm font-medium">{isNew ? "新建任务" : "任务编排"}</div>
            <div className="text-xs text-muted-foreground">按节点顺序推进，条件/选择节点可显式跳转</div>
          </div>
        </div>
        <Button onClick={onSave} disabled={saving}>
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          保存
        </Button>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">任务名称</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="任务名称" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">描述</Label>
            <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="任务描述（可选）" />
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-medium">流程节点</Label>
            <div className="flex flex-wrap gap-1">
              {NODE_TYPE_ORDER.map((type) => {
                const meta = NODE_META[type];
                const Icon = meta.icon;
                return (
                  <Button key={type} type="button" variant="outline" size="sm" onClick={() => addNode(type)}>
                    <Icon className="mr-1 h-3.5 w-3.5" /> {meta.label}
                  </Button>
                );
              })}
            </div>
          </div>

          {nodes.length === 0 ? (
            <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
              还没有节点，点击上方按钮添加第一个节点
            </div>
          ) : (
            <div className="space-y-3">
              {nodes.map((node, index) => {
                const meta = NODE_META[node.type];
                const Icon = meta.icon;
                return (
                  <div key={node.id} className="rounded-lg border bg-card p-4 shadow-sm">
                    <div className="mb-3 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Icon className="h-4 w-4 text-primary" />
                        <Badge variant="secondary">{meta.label}</Badge>
                        <span className="text-xs text-muted-foreground">#{index + 1}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button type="button" variant="ghost" size="icon" disabled={index === 0} onClick={() => moveNode(index, -1)}>
                          <ArrowUp className="h-4 w-4" />
                        </Button>
                        <Button type="button" variant="ghost" size="icon" disabled={index === nodes.length - 1} onClick={() => moveNode(index, 1)}>
                          <ArrowDown className="h-4 w-4" />
                        </Button>
                        <Button type="button" variant="ghost" size="icon" onClick={() => removeNode(index)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                    {renderNodeConfig(index, node)}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function BranchSelect(props: { value: string; nodes: Array<{ id: string; name: string }>; excludeId: string; onChange: (v: string) => void; allowEmpty?: boolean }): React.ReactElement {
  const { value, nodes, excludeId, onChange, allowEmpty } = props;
  const options = nodes.filter((n) => n.id !== excludeId);
  return (
    <Select value={value || "none"} onValueChange={(v) => onChange(v === "none" ? "" : v)}>
      <SelectTrigger>
        <SelectValue placeholder={allowEmpty ? "结束" : "选择目标节点"} />
      </SelectTrigger>
      <SelectContent>
        {allowEmpty && <SelectItem value="none">结束流程</SelectItem>}
        {options.map((o) => (
          <SelectItem key={o.id} value={o.id}>
            {o.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}