"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { CheckCircle2, XCircle, Clock, FileText, User, Calendar, AlertCircle, ExternalLink, RefreshCw, Check, Ban, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

interface ApprovalTask {
  id: string;
  workflow_id: string;
  session_id: string;
  step_id: string;
  step_name: string;
  team_id: string;
  approver_id: string;
  applicant_id: string;
  status: "pending" | "approved" | "rejected" | "canceled";
  message: string;
  detail: string;
  detail_type: string;
  payload: Record<string, unknown>;
  created_at: string;
  decided_at: string | null;
}

function renderDetailContent(detail: string, type: string) {
  if (!detail) return <p className="text-sm text-muted-foreground italic">无内容</p>;
  if (type === "markdown") {
    // 轻量 markdown 渲染（同 workflow-progress 风格）
    const lines = detail.split("\n");
    return (
      <div className="space-y-2 text-sm leading-relaxed">
        {lines.map((line, i) => {
          const clean = line.replace(/^#{1,6}\s*/, "").trim();
          const heading = /^#{1,6}\s/.test(line);
          const isBullet = /^[-*]\s/.test(line.trim());
          const renderText = clean.replace(/\*\*(.+?)\*\*/g, "$1").replace(/`([^`]+)`/g, "$1");
          if (heading) {
            const level = (line.match(/^#+/) || [""])[0].length;
            const cls = level === 1 ? "text-base font-semibold" : level === 2 ? "text-sm font-semibold" : "text-[13px] font-medium";
            return <div key={i} className={cls}>{renderText}</div>;
          }
          if (isBullet) {
            return <div key={i} className="flex gap-1.5"><span className="text-muted-foreground">•</span><span>{renderText}</span></div>;
          }
          if (line.trim() === "") return <div key={i} className="h-2" />;
          return <div key={i}>{renderText}</div>;
        })}
      </div>
    );
  }
  if (type === "json") {
    try {
      return <pre className="text-xs bg-muted rounded-md p-3 overflow-x-auto border border-border">{JSON.stringify(JSON.parse(detail), null, 2)}</pre>;
    } catch {
      return <pre className="text-xs whitespace-pre-wrap">{detail}</pre>;
    }
  }
  return <p className="text-sm whitespace-pre-wrap">{detail}</p>;
}

export function ApprovalInbox() {
  const router = useRouter();
  const [tasks, setTasks] = useState<ApprovalTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTask, setSelectedTask] = useState<ApprovalTask | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [rejectNote, setRejectNote] = useState("");

  const fetchTasks = useCallback(async (filter?: string) => {
    setLoading(true);
    try {
      const token = localStorage.getItem("auth_token");
      const url = filter ? `/api/agents/workflows/approvals?status=${filter}` : "/api/agents/workflows/approvals";
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      const responseData = await res.json();
      setTasks(responseData?.data || responseData?.tasks || []);
    } catch (err) {
      console.error("获取审批任务失败:", err);
      toast.error("获取审批任务失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  const handleAction = async (taskId: string, action: "approve" | "reject", note?: string) => {
    setActionLoading(taskId);
    try {
      const token = localStorage.getItem("auth_token");
      const res = await fetch(`/api/agents/workflows/approvals/${taskId}/decide`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action, note }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "操作失败");
        return;
      }
      toast.success(action === "approve" ? "已审批通过" : "已驳回");
      setSelectedTask(null);
      setRejectNote("");
      fetchTasks();
    } catch (err) {
      toast.error("操作失败，请重试");
    } finally {
      setActionLoading(null);
    }
  };

  const statusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800"><Clock className="w-3 h-3 mr-1" />待审批</Badge>;
      case "approved":
        return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 dark:bg-green-950/30 dark:text-green-400 dark:border-green-800"><Check className="w-3 h-3 mr-1" />已通过</Badge>;
      case "rejected":
        return <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/20"><Ban className="w-3 h-3 mr-1" />已驳回</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const pendingCount = tasks.filter(t => t.status === "pending").length;

  return (
    <div className="flex h-full gap-4">
      {/* 左侧列表 */}
      <div className="w-80 shrink-0 border-r border-border pr-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold">审批待办</h3>
            {pendingCount > 0 && (
              <Badge variant="secondary" className="text-[10px] h-5">{pendingCount}</Badge>
            )}
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => fetchTasks()}
            disabled={loading}
          >
            <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} />
          </Button>
        </div>

        <ScrollArea className="h-[calc(100vh-280px)]">
          <div className="space-y-2 pr-2">
            {loading && tasks.length === 0 ? (
              <div className="flex items-center justify-center py-8 text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                加载中...
              </div>
            ) : tasks.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                <CheckCircle2 className="w-8 h-8 mb-2 text-green-500/50" />
                <span className="text-xs">暂无待审批任务</span>
              </div>
            ) : (
              tasks.map((task) => (
                <button
                  key={task.id}
                  type="button"
                  onClick={() => setSelectedTask(task)}
                  className={cn(
                    "w-full text-left p-2.5 rounded-lg border transition-colors",
                    selectedTask?.id === task.id
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/30 hover:bg-accent/50"
                  )}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium truncate max-w-[160px]">
                      {task.step_name || "审批步骤"}
                    </span>
                    {statusBadge(task.status)}
                  </div>
                  <p className="text-[11px] text-muted-foreground truncate">
                    {task.message || "待审批"}
                  </p>
                  <div className="flex items-center gap-2 mt-1 text-[10px] text-muted-foreground">
                    <Calendar className="w-3 h-3" />
                    {new Date(task.created_at).toLocaleString("zh-CN", {
                      month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
                    })}
                  </div>
                </button>
              ))
            )}
          </div>
        </ScrollArea>
      </div>

      {/* 右侧详情 */}
      <div className="flex-1 min-w-0">
        {!selectedTask ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <FileText className="w-12 h-12 mb-3 opacity-30" />
            <p className="text-sm">选择一个审批任务查看详情</p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* 头信息 */}
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-semibold">{selectedTask.step_name || "审批步骤"}</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {selectedTask.message || "请审批以下内容"}
                </p>
              </div>
              {statusBadge(selectedTask.status)}
            </div>

            {/* 元信息 */}
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                创建时间: {new Date(selectedTask.created_at).toLocaleString("zh-CN")}
              </span>
              {selectedTask.decided_at && (
                <span className="flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" />
                  处理时间: {new Date(selectedTask.decided_at).toLocaleString("zh-CN")}
                </span>
              )}
            </div>

            <Separator />

            {/* 审批工单正文（完整产物） */}
            <div className="rounded-lg border border-border bg-card">
              <div className="flex items-center justify-between px-3 py-2 border-b border-border">
                <span className="text-xs font-medium flex items-center gap-1">
                  <FileText className="w-3.5 h-3.5" />
                  审批工单内容
                </span>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-6 w-6"
                  onClick={() => {
                    if (navigator.clipboard) {
                      navigator.clipboard.writeText(selectedTask.detail || "");
                      toast.success("已复制");
                    }
                  }}
                >
                  <ExternalLink className="w-3 h-3" />
                </Button>
              </div>
              <div className="p-3 max-h-[50vh] overflow-y-auto">
                {renderDetailContent(selectedTask.detail || "", selectedTask.detail_type || "markdown")}
              </div>
            </div>

            {/* 操作按钮（仅待审批） */}
            {selectedTask.status === "pending" && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    className="h-8 text-xs"
                    onClick={() => handleAction(selectedTask.id, "approve")}
                    disabled={actionLoading === selectedTask.id}
                  >
                    {actionLoading === selectedTask.id ? (
                      <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                    ) : (
                      <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                    )}
                    审批通过
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    className="h-8 text-xs"
                    onClick={() => {
                      if (rejectNote.trim()) {
                        handleAction(selectedTask.id, "reject", rejectNote);
                      } else {
                        toast.error("请填写驳回原因");
                      }
                    }}
                    disabled={actionLoading === selectedTask.id || !rejectNote.trim()}
                  >
                    <XCircle className="w-3.5 h-3.5 mr-1" />
                    驳回
                  </Button>
                </div>
                <Textarea
                  placeholder="驳回原因（必填）"
                  className="text-xs min-h-[60px]"
                  value={rejectNote}
                  onChange={(e) => setRejectNote(e.target.value)}
                />
              </div>
            )}

            {/* 已处理展示 */}
            {selectedTask.status === "rejected" && (
              <div className="p-3 rounded-lg bg-destructive/5 border border-destructive/20">
                <p className="text-xs text-destructive font-medium">驳回原因</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {selectedTask.payload?.note as string || "未提供原因"}
                </p>
              </div>
            )}
            {selectedTask.status === "approved" && (
              <div className="p-3 rounded-lg bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800">
                <p className="text-xs text-green-700 dark:text-green-400 font-medium flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  已审批通过
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}