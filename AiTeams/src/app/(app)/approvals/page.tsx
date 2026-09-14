"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import {
  ClipboardCheck, Loader2, CheckCircle2, XCircle, Clock, Send,
  User, FileText, ArrowRight, RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";

const getTeamId = () => {
  if (typeof window === "undefined") return "";
  return localStorage.getItem("lastTeamId") || "";
};

const getToken = () => {
  if (typeof window === "undefined") return "";
  return localStorage.getItem("auth_token") || "";
};

interface ApprovalTask {
  id: string;
  team_id: string;
  agent_id?: string;
  session_id?: string;
  creator_id: string;
  assignee_id?: string;
  title: string;
  task_type?: string;
  description?: string;
  draft?: unknown;
  status: "pending" | "approved" | "rejected";
  flow?: any[];
  source_id?: string;
  creator_name?: string;
  assignee_name?: string;
  created_at: string;
  completed_at?: string;
}

const statusMap: Record<string, { label: string; cls: string; icon: React.ReactNode }> = {
  pending: { label: "待审批", cls: "bg-amber-100 text-amber-700 border-amber-200", icon: <Clock className="w-3 h-3" /> },
  approved: { label: "已通过", cls: "bg-emerald-100 text-emerald-700 border-emerald-200", icon: <CheckCircle2 className="w-3 h-3" /> },
  rejected: { label: "已驳回", cls: "bg-rose-100 text-rose-700 border-rose-200", icon: <XCircle className="w-3 h-3" /> },
};

function renderDraft(draft: unknown): string {
  if (!draft) return "";
  if (typeof draft === "string") return draft;
  try {
    return JSON.stringify(draft, null, 2);
  } catch {
    return String(draft);
  }
}

function DraftPreview({ draft }: { draft?: unknown }) {
  const text = renderDraft(draft).trim();
  if (!text) return <p className="text-sm text-muted-foreground">无数据</p>;
  if (typeof draft === "string" || (draft && typeof draft === "object" && !isLooseTable(draft as any))) {
    return (
      <pre className="text-xs text-foreground/80 whitespace-pre-wrap bg-muted/50 p-3 rounded-md max-h-64 overflow-auto">
        {text}
      </pre>
    );
  }
  return null;
}

function isLooseTable(obj: Record<string, unknown>): boolean {
  return Array.isArray(obj) || !!obj.items || !!obj.rows;
}

export default function ApprovalsPage() {
  const router = useRouter();
  const [tid, setTid] = useState("");
  const [tab, setTab] = useState<"assigned" | "mine" | "all">("assigned");
  const [tasks, setTasks] = useState<ApprovalTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<ApprovalTask | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [actionDialog, setActionDialog] = useState<{ type: "approve" | "reject" | "forward"; task: ApprovalTask } | null>(null);
  const [comment, setComment] = useState("");
  const [assigneeName, setAssigneeName] = useState("");
  const [members, setMembers] = useState<{ id: string; name: string }[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const loadTasks = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ role: tab });
      if (tid) params.set("team_id", tid);
      const res = await fetch(`/api/approvals?${params}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const data = await res.json();
      if (data.success) setTasks(data.data || []);
    } catch {
      setTasks([]);
    } finally {
      setLoading(false);
    }
  }, [tab, tid]);

  useEffect(() => {
    setTid(getTeamId());
  }, []);

  useEffect(() => {
    if (tid) loadTasks();
  }, [tid, tab, loadTasks]);

  // 加载团队成员（用于转交审批人）
  const loadMembers = useCallback(async () => {
    if (!tid) return;
    try {
      const res = await fetch(`/api/teams/members?teamId=${tid}`);
      const data = await res.json();
      const list = Array.isArray(data) ? data : data?.data || [];
      setMembers(list.map((m: any) => ({
        id: m.user_id || m.id,
        name: m.user_name || m.nick_name || m.display_name || m.name || m.id,
      })));
    } catch {
      setMembers([]);
    }
  }, [tid]);

  useEffect(() => {
    if (tid) loadMembers();
  }, [tid, loadMembers]);

  const openDetail = async (id: string) => {
    setDetailOpen(true);
    setDetailLoading(true);
    setDetail(null);
    try {
      const res = await fetch(`/api/approvals/${id}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const data = await res.json();
      if (data.success) setDetail(data.data);
    } catch {
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  };

  const submitAction = async () => {
    if (!actionDialog) return;
    setSubmitting(true);
    try {
      const body: any = { action: actionDialog.type, comment: comment || undefined };
      if (actionDialog.type === "forward") body.assignee_id = assigneeName;
      const res = await fetch(`/api/approvals/${actionDialog.task.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.success) {
        setActionDialog(null);
        setComment("");
        setAssigneeName("");
        setDetailOpen(false);
        loadTasks();
      } else {
        alert(data.error || "操作失败");
      }
    } catch {
      alert("网络错误");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ClipboardCheck className="w-6 h-6 text-primary" />
            审批中心
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            智能体完成任务后提交审批流转，支持通过 / 驳回 / 转交指定人审批
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={loadTasks}>
          <RefreshCw className="w-4 h-4 mr-1" /> 刷新
        </Button>
      </div>

      {/* Tab 切换 */}
      <div className="flex gap-1 mb-4 border-b">
        {([
          { key: "assigned", label: "待我审批" },
          { key: "mine", label: "我发起的" },
          { key: "all", label: "全部" },
        ] as const).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px",
              tab === t.key
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* 任务列表 */}
      <div className="space-y-3">
        {loading && (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        )}
        {!loading && tasks.length === 0 && (
          <div className="text-center py-16 text-muted-foreground">
            <ClipboardCheck className="w-12 h-12 mx-auto mb-3 opacity-40" />
            暂无审批任务
          </div>
        )}
        {!loading && tasks.map((task) => {
          const st = statusMap[task.status] || statusMap.pending;
          return (
            <Card key={task.id} className="hover:shadow-sm transition-shadow cursor-pointer" onClick={() => openDetail(task.id)}>
              <CardContent className="p-4 flex items-center justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant="outline" className={cn("gap-1", st.cls)}>{st.icon}{st.label}</Badge>
                    {task.task_type && (
                      <Badge variant="secondary" className="text-[11px]">{task.task_type}</Badge>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {new Date(task.created_at).toLocaleString()}
                    </span>
                  </div>
                  <h3 className="font-medium truncate">{task.title}</h3>
                  {task.description && (
                    <p className="text-sm text-muted-foreground line-clamp-1 mt-0.5">{task.description}</p>
                  )}
                  <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <User className="w-3 h-3" />
                      发起: {task.creator_name || task.creator_id.slice(0, 6)}
                    </span>
                    {task.assignee_name && (
                      <span className="inline-flex items-center gap-1">
                        <ArrowRight className="w-3 h-3" />
                        审批人: {task.assignee_name}
                      </span>
                    )}
                    {task.status === "pending" && task.assignee_name && (
                      <span className="inline-flex items-center gap-1 text-primary">
                        <Clock className="w-3 h-3" /> 待{task.assignee_name}审批
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {task.status === "pending" && (
                    <>
                      <Button size="sm" variant="destructive" onClick={(e) => { e.stopPropagation(); setActionDialog({ type: "reject", task }); }}>
                        驳回
                      </Button>
                      <Button size="sm" onClick={(e) => { e.stopPropagation(); setActionDialog({ type: "approve", task }); }}>
                        <CheckCircle2 className="w-4 h-4 mr-1" /> 通过
                      </Button>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* 详情弹窗 */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{detail?.title || "审批任务"}</DialogTitle>
            {detail?.task_type && <DialogDescription>类型：{detail.task_type}</DialogDescription>}
          </DialogHeader>
          {detailLoading && <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>}
          {!detailLoading && detail && (
            <div className="space-y-4">
              <div className="flex items-center gap-4 text-sm">
                <Badge variant="outline" className={cn("gap-1", (statusMap[detail.status] || statusMap.pending).cls)}>
                  {(statusMap[detail.status] || statusMap.pending).icon}
                  {(statusMap[detail.status] || statusMap.pending).label}
                </Badge>
                <span className="text-muted-foreground">发起：{detail.creator_name || "—"}</span>
                <span className="text-muted-foreground">审批人：{detail.assignee_name || "—"}</span>
              </div>
              {detail.description && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">描述</p>
                  <p className="text-sm text-foreground/80">{detail.description}</p>
                </div>
              )}
              {(detail.draft !== null && detail.draft !== undefined) && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">任务数据</p>
                  <DraftPreview draft={detail.draft} />
                </div>
              )}
              {detail.flow && detail.flow.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">流转记录</p>
                  <div className="space-y-2">
                    {detail.flow.map((f: any, i: number) => (
                      <div key={i} className="flex items-start gap-2 text-sm">
                        <div className="mt-1.5 w-2 h-2 rounded-full bg-primary shrink-0" />
                        <div>
                          <span className="font-medium">{f.name || f.user_id?.slice(0, 6)}</span>
                          <span className="text-muted-foreground mx-1">
                            {f.action === "submit" ? "提交" : f.action === "approve" ? "通过" : f.action === "reject" ? "驳回" : "转交"}
                          </span>
                          {f.comment && <span className="text-foreground/80">：{f.comment}</span>}
                          <span className="text-xs text-muted-foreground block mt-0.5">
                            {new Date(f.time).toLocaleString()}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {detail.status === "pending" && (
                <div className="flex items-center gap-2 pt-2 border-t">
                  <Button size="sm" variant="destructive" onClick={() => setActionDialog({ type: "reject", task: detail })}>
                    <XCircle className="w-4 h-4 mr-1" /> 驳回
                  </Button>
                  <Button size="sm" onClick={() => setActionDialog({ type: "approve", task: detail })}>
                    <CheckCircle2 className="w-4 h-4 mr-1" /> 通过
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setActionDialog({ type: "forward", task: detail })}>
                    <Send className="w-4 h-4 mr-1" /> 转交指定人
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* 操作弹窗 */}
      <Dialog open={!!actionDialog} onOpenChange={(o) => { if (!o) setActionDialog(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {actionDialog?.type === "approve" ? "通过审批" : actionDialog?.type === "reject" ? "驳回审批" : "转交指定人审批"}
            </DialogTitle>
            <DialogDescription>{actionDialog?.task.title}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {actionDialog?.type === "forward" && (
              <div className="space-y-2">
                <label className="text-sm font-medium">审批人</label>
                <Select value={assigneeName} onValueChange={setAssigneeName}>
                  <SelectTrigger>
                    <SelectValue placeholder="选择审批人" />
                  </SelectTrigger>
                  <SelectContent>
                    {members.map((m) => (
                      <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-2">
              <label className="text-sm font-medium">
                {actionDialog?.type === "approve" ? "审批意见（可选）" : actionDialog?.type === "reject" ? "驳回原因 / 修改意见 *" : "转交说明（可选）"}
              </label>
              <Textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder={actionDialog?.type === "forward" ? "如：请仓管核对库存后确认" : "请输入内容…"}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setActionDialog(null)}>取消</Button>
            <Button
              onClick={submitAction}
              disabled={submitting || (actionDialog?.type === "forward" && !assigneeName) || (actionDialog?.type === "reject" && !comment.trim())}
            >
              {submitting && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
              确认{actionDialog?.type === "approve" ? "通过" : actionDialog?.type === "reject" ? "驳回" : "转交"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}