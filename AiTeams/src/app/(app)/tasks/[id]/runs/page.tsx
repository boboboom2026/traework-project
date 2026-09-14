"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/use-auth";
import { apiJson } from "@/lib/api-client";
import { toast } from "sonner";

interface RunRecord {
  id: string;
  status: string;
  current_node_id: string | null;
  snapshot: Record<string, unknown> | null;
  result: string | null;
  error: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

const STATUS_META: Record<string, { label: string; className: string }> = {
  pending: { label: "待运行", className: "bg-muted text-muted-foreground" },
  running: { label: "运行中", className: "bg-blue-500/15 text-blue-600" },
  awaiting_human: { label: "待人工处理", className: "bg-amber-500/15 text-amber-600" },
  completed: { label: "已完成", className: "bg-emerald-500/15 text-emerald-600" },
  failed: { label: "失败", className: "bg-destructive/15 text-destructive" },
  canceled: { label: "已取消", className: "bg-muted text-muted-foreground" },
};

function fmtTime(iso: string | null): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleString("zh-CN", { hour12: false });
}

function fmtDuration(a: string | null, b: string | null): string {
  if (!a || !b) return "-";
  const ms = new Date(b).getTime() - new Date(a).getTime();
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}min`;
}

export default function TaskRunsPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const taskId = params.id;
  const { user } = useAuth();

  const [runs, setRuns] = useState<RunRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    try {
      // 不再吞掉错误：401/403/500 都需要让用户看到原因
      const json = await apiJson<{ data?: RunRecord[] }>(`/api/tasks/${taskId}/runs?limit=50`);
      setRuns(json.data ?? []);
    } catch (e) {
      console.error("加载运行记录失败", e);
      toast.error(e instanceof Error ? e.message : "加载运行记录失败");
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  useEffect(() => {
    if (user?.currentTeamId) void load();
  }, [user?.currentTeamId, load]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b px-6 py-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.push(`/tasks/${taskId}/run`)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="text-sm font-medium">运行记录</div>
            <div className="text-xs text-muted-foreground">共 {runs.length} 条</div>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={() => void load()}>
          刷新
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-4">
        {loading ? (
          <p className="text-sm text-muted-foreground">加载中…</p>
        ) : runs.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
            暂无运行记录，去执行页运行第一个任务
          </div>
        ) : (
          <div className="space-y-2">
            {runs.map((run) => {
              const meta = STATUS_META[run.status] ?? STATUS_META.pending;
              const isOpen = expanded === run.id;
              const snapshot = run.snapshot;
              const snapshotObj = snapshot && typeof snapshot === "object" ? (snapshot as Record<string, unknown>) : null;
              const stateRaw = snapshotObj?.state;
              const state = stateRaw && typeof stateRaw === "object" ? (stateRaw as Record<string, unknown>) : null;
              return (
                <div key={run.id} className="rounded-lg border bg-card">
                  <button
                    type="button"
                    className="flex w-full items-center gap-3 px-4 py-3 text-left"
                    onClick={() => setExpanded(isOpen ? null : run.id)}
                  >
                    <ChevronRight className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${isOpen ? "rotate-90" : ""}`} />
                    <Badge className={meta.className}>{meta.label}</Badge>
                    <span className="font-mono text-xs text-muted-foreground">#{run.id.slice(0, 8)}</span>
                    <span className="flex-1 truncate text-xs text-muted-foreground">
                      当前节点：{run.current_node_id ? run.current_node_id : "-"}
                    </span>
                    <span className="text-xs text-muted-foreground">{fmtTime(run.created_at)}</span>
                    <span className="text-xs text-muted-foreground">耗时 {fmtDuration(run.started_at, run.completed_at)}</span>
                  </button>

                  {isOpen && (
                    <div className="space-y-3 border-t px-4 py-3">
                      {run.error && (
                        <div className="rounded-md bg-destructive/5 p-3 text-sm text-destructive">{run.error}</div>
                      )}
                      {state && (
                        <div>
                          <div className="mb-1 text-xs font-medium text-muted-foreground">运行状态（state）</div>
                          <pre className="max-h-64 overflow-y-auto rounded-md bg-muted p-3 text-xs whitespace-pre-wrap break-all">
                            {JSON.stringify(state, null, 2)}
                          </pre>
                        </div>
                      )}
                      {run.result && (
                        <div>
                          <div className="mb-1 text-xs font-medium text-muted-foreground">结果</div>
                          <pre className="max-h-64 overflow-y-auto rounded-md bg-muted p-3 text-xs whitespace-pre-wrap break-all">
                            {(() => {
                              try {
                                return JSON.stringify(JSON.parse(run.result), null, 2);
                              } catch {
                                return run.result;
                              }
                            })()}
                          </pre>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}