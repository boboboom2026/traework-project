"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Bot,
  CheckCircle2,
  ChevronDown,
  Circle,
  Loader2,
  Play,
  RefreshCw,
  Wand2,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/use-auth";
import { apiJson, withTeamId } from "@/lib/api-client";
import { toast } from "sonner";
import type { WorkflowDefinitionV2, WorkflowNode, WorkflowSnapshot, WorkflowState } from "@/lib/workflow/types";

interface RunRecord {
  id: string;
  status: string;
  current_node_id: string | null;
  snapshot: WorkflowSnapshot | null;
  result: string | null;
  error: string | null;
  created_at: string;
  completed_at: string | null;
}

/** 提取模板中的变量根名，如 `{{user_input}}` → user_input，`{{input.topic}}` → topic */
function extractInputKeys(template?: string | null): string[] {
  if (!template) return [];
  const keys = new Set<string>();
  for (const match of template.matchAll(/\{\{\s*([A-Za-z0-9_$]+(?:\.[A-Za-z0-9_$]+)*)\s*\}\}/g)) {
    const segments = match[1].split(".");
    // `input.xxx` 表示从初始输入取值；裸 `input` 表示整个输入对象，不作为必填键
    if (segments[0] === "input") {
      if (segments.length > 1) keys.add(segments[1]);
      continue;
    }
    keys.add(segments[0]);
  }
  return [...keys];
}

/** 入口节点提示词中引用、但不由任何上游节点产出 → 必须由「初始输入」提供 */
function requiredInputKeys(nodes: WorkflowNode[], entryNodeId?: string): string[] {
  const entry = nodes.find((n) => n.id === entryNodeId) ?? nodes[0];
  if (!entry) return [];
  // 入口节点没有上游节点，提示词里引用的变量只能来自「初始输入」
  return extractInputKeys(entry.input_template);
}

const STATUS_META: Record<string, { label: string; className: string }> = {
  pending: { label: "待运行", className: "bg-muted text-muted-foreground" },
  running: { label: "运行中", className: "bg-blue-500/15 text-blue-600" },
  awaiting_human: { label: "待人工处理", className: "bg-amber-500/15 text-amber-600" },
  completed: { label: "已完成", className: "bg-emerald-500/15 text-emerald-600" },
  failed: { label: "失败", className: "bg-destructive/15 text-destructive" },
  canceled: { label: "已取消", className: "bg-muted text-muted-foreground" },
};

export default function TaskRunPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const taskId = params.id;
  const { user } = useAuth();

  const [task, setTask] = useState<{ name: string; definition: WorkflowDefinitionV2 | null } | null>(null);
  const [run, setRun] = useState<RunRecord | null>(null);
  const [running, setRunning] = useState(false);
  const [inputText, setInputText] = useState("{}");
  const [comment, setComment] = useState("");

  const definition = task?.definition;
  const nodes = definition?.nodes ?? [];

  // 入口节点提示词里引用的变量 = 必须在「初始输入」里提供的 key
  const inputKeys = useMemo(
    () => requiredInputKeys(nodes, definition?.entry_node),
    [nodes, definition?.entry_node],
  );

  const inputPlaceholder = inputKeys.length
    ? JSON.stringify(Object.fromEntries(inputKeys.map((key) => [key, "..."])), null, 0)
    : "{}";

  const inputExample = useMemo(
    () => `{\n${inputKeys.map((key) => `  "${key}": ""`).join(",\n")}\n}`,
    [inputKeys],
  );

  const loadTask = useCallback(async (): Promise<void> => {
    try {
      const json = await apiJson<{ data?: Array<{ id: string; name: string; definition: WorkflowDefinitionV2 | null }> }>(
        withTeamId("/api/tasks", user?.currentTeamId),
      );
      const list = json.data ?? [];
      const found = list.find((t) => t.id === taskId);
      if (found) setTask({ name: found.name, definition: found.definition ?? null });
    } catch (e) {
      console.error("加载任务失败", e);
      toast.error(e instanceof Error ? e.message : "加载任务失败");
    }
  }, [taskId, user?.currentTeamId]);

  useEffect(() => {
    if (user?.currentTeamId) void loadTask();
  }, [user?.currentTeamId, loadTask]);

  async function onRun(): Promise<void> {
    let input: Record<string, unknown> = {};
    try {
      const parsed: unknown = JSON.parse(inputText || "{}");
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        toast.error("初始输入需为 JSON 对象");
        return;
      }
      input = parsed as Record<string, unknown>;
    } catch {
      toast.error("初始输入需为合法 JSON");
      return;
    }

    // 入口节点提示词里引用的变量必须填值，否则模型拿不到指令会输出无关内容
    const missing = inputKeys.filter((key) => {
      const value = input[key];
      if (value === undefined || value === null) return true;
      return typeof value === "string" && value.trim() === "";
    });
    if (missing.length > 0) {
      toast.error(`请先填写初始输入：${missing.join("、")}`);
      return;
    }

    setRunning(true);
    try {
      const json = await apiJson<{ data: RunRecord }>(`/api/tasks/${taskId}/run`, {
        method: "POST",
        body: JSON.stringify({ input }),
      });
      setRun(json.data);
      setComment("");
    } catch (e) {
      console.error("运行任务失败", e);
      toast.error(e instanceof Error ? e.message : "运行失败");
    } finally {
      setRunning(false);
    }
  }

  async function onResume(signal: Record<string, unknown>): Promise<void> {
    if (!run) return;
    setRunning(true);
    try {
      const json = await apiJson<{ data: RunRecord }>(`/api/tasks/${taskId}/resume`, {
        method: "POST",
        body: JSON.stringify({ runId: run.id, signal }),
      });
      setRun(json.data);
      setComment("");
    } catch (e) {
      console.error("处理失败", e);
      toast.error(e instanceof Error ? e.message : "处理失败");
    } finally {
      setRunning(false);
    }
  }

  const currentNodeId = run?.current_node_id;
  const snapshot = run?.snapshot;

  const hangingNode = snapshot && currentNodeId ? nodes.find((n) => n.id === currentNodeId) : undefined;

  const nodeIndex = (id: string): number => nodes.findIndex((n) => n.id === id);

  function renderNodeList(): React.ReactNode {
    return (
      <div className="space-y-1.5">
        {nodes.map((node, i) => {
          const isCurrent = node.id === currentNodeId;
          const isDone = currentNodeId ? nodeIndex(node.id) < nodeIndex(currentNodeId) : false;
          const isFailed = run?.status === "failed" && isCurrent;
          return (
            <div key={node.id} className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-sm ${isCurrent ? "bg-muted" : ""}`}>
              {isDone ? (
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
              ) : isFailed ? (
                <XCircle className="h-3.5 w-3.5 text-destructive" />
              ) : isCurrent ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
              ) : (
                <Circle className="h-3.5 w-3.5 text-muted-foreground/40" />
              )}
              <span className="text-xs text-muted-foreground w-5">{i + 1}</span>
              <span>{node.name}</span>
              <Badge variant="outline" className="text-[10px]">
                {node.type}
              </Badge>
            </div>
          );
        })}
      </div>
    );
  }

  function renderResult(): React.ReactNode {
    if (!run) {
      return (
        <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          点击「运行」启动一个任务实例
        </div>
      );
    }

    const meta = STATUS_META[run.status] ?? STATUS_META.pending;

    if (run.status === "completed") {
      let result = run.result;
      try {
        if (result) result = JSON.stringify(JSON.parse(result), null, 2);
      } catch {
        /* keep raw */
      }
      return (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Badge className={meta.className}>{meta.label}</Badge>
            <span className="text-xs text-muted-foreground">运行 #{run.id.slice(0, 8)}</span>
          </div>
          <div className="rounded-lg border bg-card p-4">
            <Label className="mb-2 block text-xs text-muted-foreground">最终结果</Label>
            <pre className="whitespace-pre-wrap break-all text-sm">{result ?? "(空)"}</pre>
          </div>
        </div>
      );
    }

    if (run.status === "failed") {
      return (
        <div className="space-y-3">
          <Badge className={meta.className}>{meta.label}</Badge>
          <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
            {run.error ?? "任务执行失败"}
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Badge className={meta.className}>{meta.label}</Badge>
          {run.status === "running" && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
        </div>
        {run.status !== "awaiting_human" && (
          <div className="text-sm text-muted-foreground">任务启动中…</div>
        )}
      </div>
    );
  }

  function renderHumanCard(): React.ReactNode {
    if (!hangingNode) return null;
    const state = snapshot?.state ?? {};

    if (hangingNode.type === "human_review") {
      const cfg = hangingNode.human_review_config;
      return (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
          <div className="mb-3 flex items-center gap-2">
            <Badge className="bg-amber-500/15 text-amber-600">待审批</Badge>
            <span className="text-sm font-medium">{hangingNode.name}</span>
          </div>
          <div className="mb-3 rounded-md bg-card p-3">
            <Label className="mb-1 block text-xs text-muted-foreground">待审批内容</Label>
            <pre className="max-h-48 overflow-y-auto whitespace-pre-wrap break-all text-xs">{JSON.stringify(state, null, 2)}</pre>
          </div>
          {cfg && (
            <p className="mb-3 text-xs text-muted-foreground">
              审批方式：{cfg.approver_type === "manager" ? "上级/负责人" : cfg.approver_type === "role" ? `角色 ${cfg.role_name ?? ""}` : `${(cfg.approver_ids ?? []).length} 名指定成员`}
              {cfg.require_all ? "（需全部通过）" : "（任一通过）"}
            </p>
          )}
          <Textarea rows={2} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="审批意见（可选）" className="mb-3" />
          <div className="flex gap-2">
            <Button disabled={running} onClick={() => onResume({ decision: "approved", comment: comment || undefined })}>
              <CheckCircle2 className="mr-1.5 h-4 w-4" /> 通过
            </Button>
            <Button variant="destructive" disabled={running} onClick={() => onResume({ decision: "rejected", comment: comment || undefined })}>
              <XCircle className="mr-1.5 h-4 w-4" /> 驳回
            </Button>
          </div>
        </div>
      );
    }

    if (hangingNode.type === "human_choice") {
      const options = hangingNode.human_choice_config?.options ?? [];
      return (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
          <div className="mb-3 flex items-center gap-2">
            <Badge className="bg-amber-500/15 text-amber-600">待选择</Badge>
            <span className="text-sm font-medium">{hangingNode.name}</span>
          </div>
          <div className="mb-3 rounded-md bg-card p-3">
            <Label className="mb-1 block text-xs text-muted-foreground">当前数据</Label>
            <pre className="max-h-40 overflow-y-auto whitespace-pre-wrap break-all text-xs">{JSON.stringify(state, null, 2)}</pre>
          </div>
          <div className="flex flex-wrap gap-2">
            {options.map((opt) => (
              <Button key={opt.value} disabled={running} onClick={() => onResume({ decision: "choice", choiceValue: opt.value })}>
                {opt.label}
              </Button>
            ))}
          </div>
        </div>
      );
    }

    return null;
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b px-6 py-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.push("/tasks")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="text-sm font-medium">执行任务</div>
            <div className="text-xs text-muted-foreground">{task?.name ?? "..."}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => router.push(`/tasks/${taskId}/runs`)}>
            运行记录
          </Button>
          <Button size="sm" onClick={onRun} disabled={running || !definition}>
            {running ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Play className="mr-1.5 h-4 w-4" />}
            运行
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-4">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[280px_1fr]">
          <div className="space-y-3">
            <div className="rounded-lg border bg-card p-4">
              <div className="mb-2 flex items-center gap-2">
                <Bot className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">流程概览</span>
              </div>
              {nodes.length === 0 ? (
                <p className="text-xs text-muted-foreground">暂无节点，请先到编排页配置</p>
              ) : (
                renderNodeList()
              )}
            </div>
            <div className="rounded-lg border bg-card p-4">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-medium">初始输入</span>
                {inputKeys.length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-[11px]"
                    onClick={() => setInputText(inputExample)}
                  >
                    <Wand2 className="mr-1 h-3 w-3" /> 填入模板
                  </Button>
                )}
              </div>
              <Textarea
                rows={5}
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder={inputPlaceholder}
                className="font-mono text-xs"
              />
              {inputKeys.length > 0 ? (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  JSON 格式。首个节点需要变量：
                  {inputKeys.map((key) => (
                    <code key={key} className="mx-0.5 rounded bg-muted px-1 py-0.5 font-mono text-[10px]">
                      {key}
                    </code>
                  ))}
                  ，为空时无法生成有效内容。
                </p>
              ) : (
                <p className="mt-1 text-[11px] text-muted-foreground">JSON 格式，可留空</p>
              )}
            </div>
          </div>

          <div className="space-y-3">
            {renderResult()}
            {renderHumanCard()}
            {run && run.status === "awaiting_human" && (
              <Button variant="ghost" size="sm" disabled={running} onClick={async () => {
                try {
                  const json = await apiJson<{ data?: RunRecord[] }>(`/api/tasks/${taskId}/runs?runId=${run.id}`);
                  const runList = json.data ?? [];
                  if (runList[0]) setRun(runList[0]);
                } catch (e) {
                  console.error("刷新状态失败", e);
                  toast.error(e instanceof Error ? e.message : "刷新状态失败");
                }
              }}>
                <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> 刷新状态
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}