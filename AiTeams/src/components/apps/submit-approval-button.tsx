"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, CheckCircle2, XCircle, Hourglass, Send } from "lucide-react";

interface TeamMember {
  id: string;
  name: string;
  avatar?: string;
}

interface ApproveTask {
  id: string;
  title: string;
  status: string;
  comment?: string | null;
  assignee_id?: string | null;
  assignee_name?: string | null;
  creator_name?: string | null;
}

interface SubmitApprovalButtonProps {
  teamId: string;
  userId: string;
  sessionId?: string;
  /** 关联消息ID，用于查询该消息对应审批任务的状态 */
  sourceId?: string;
  title?: string;
  draft?: Record<string, unknown>;
  taskType?: string;
  description?: string;
  /** 操作后回调（向对话注入"已通过/已驳回"消息以驱动LLM继续） */
  onActionTaken?: (message: string) => void;
  /** 审批状态变化回调（用于刷新列表） */
  onStatusChange?: () => void;
  /** 仅当存在关联审批任务时才渲染（用于"仅审批消息展示按钮"场景） */
  hideWhenNoTask?: boolean;
}

type Mode = "idle" | "needsAssignee" | "needsComment";

/** 从 localStorage 读取登录 token，构造带鉴权的 headers */
function authHeaders(json = false): Record<string, string> {
  const headers: Record<string, string> = {};
  const token = typeof window !== "undefined" ? window.localStorage.getItem("auth_token") : null;
  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (json) headers["Content-Type"] = "application/json";
  return headers;
}

export function SubmitApprovalButton({
  teamId,
  userId,
  sessionId,
  sourceId,
  title = "方案审批",
  draft,
  taskType = "方案审批",
  description = "智能体生成的方案，等待审批确认",
  onActionTaken,
  onStatusChange,
  hideWhenNoTask = false,
}: SubmitApprovalButtonProps) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("idle");
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [assigneeId, setAssigneeId] = useState("");
  const [comment, setComment] = useState("");
  const [loading, setLoading] = useState(false);
  const [actionLabel, setActionLabel] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // 审批任务状态：null=未查询到，pending/approved/rejected 由后端返回
  const [task, setTask] = useState<ApproveTask | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);

  // 根据 sourceId 查询本条消息的审批任务状态
  const fetchStatus = useCallback(async () => {
    if (!sourceId || !teamId) return;
    setStatusLoading(true);
    try {
      const res = await fetch(
        `/api/approvals?team_id=${encodeURIComponent(teamId)}&source_id=${encodeURIComponent(sourceId)}&user_id=${encodeURIComponent(userId)}`,
        { headers: authHeaders() }
      );
      const data = await res.json();
      if (data?.success) {
        const tasks: ApproveTask[] = data?.data || [];
        // 取最新的一条
        setTask(tasks[0] || null);
      }
    } catch (e) {
      console.error("查询审批状态失败:", e);
    } finally {
      setStatusLoading(false);
    }
  }, [sourceId, teamId]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  // 加载团队可审批成员（排除自己后可含自己，由后端/前端控制）
  const loadMembers = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/teams/list?includeMembers=1`,
        { headers: authHeaders() }
      );
      // 若此接口不适用，退到团队成员接口
      const data = await res.json();
      if (data?.success && data?.teams) {
        const t = data.teams.find((x: any) => x.id === teamId);
        if (t?.members) {
          setMembers(t.members);
          return;
        }
      }
      // 备用：成员接口
      const mres = await fetch(
        `/api/teams/members`
      );
      const mdata = await mres.json();
      const list: TeamMember[] = mdata?.members || mdata?.data || [];
      setMembers(list);
    } catch (e) {
      console.error("加载成员失败:", e);
    }
  }, [teamId]);

  const openDialog = async (m: Mode, label: string) => {
    setMode(m);
    setActionLabel(label);
    setComment("");
    setAssigneeId("");
    setOpen(true);
    loadMembers();
  };

  const handleSubmit = async () => {
    if (!teamId || !userId) return;
    if (mode === "needsAssignee" && !assigneeId) return;
    if (mode === "needsComment" && !comment.trim()) return;

    setSubmitting(true);
    const action =
      mode === "needsAssignee"
        ? null
        : mode === "needsComment"
        ? "reject"
        : "approve";

    try {
      let res: Response;
      if (task?.id) {
        // 已存在由智能体创建的审批任务：直接对该任务执行动作，避免重复创建任务
        const actionName = mode === "needsAssignee" ? "forward" : mode === "needsComment" ? "reject" : "approve";
        res = await fetch(`/api/approvals/${encodeURIComponent(task.id)}`, {
          method: "POST",
          headers: authHeaders(true),
          body: JSON.stringify({
            action: actionName,
            comment: comment || undefined,
            assignee_id: mode === "needsAssignee" ? assigneeId : undefined,
            user_id: userId,
          }),
        });
      } else {
        // 无既有任务：回退到"创建 + 动作"（兼容旧流程）
        const payload: any = {
          title,
          team_id: teamId,
          user_id: userId,
          assignee_id: mode === "needsAssignee" ? assigneeId : undefined,
          action,
          comment: mode === "needsComment" || mode === "idle" ? comment || undefined : undefined,
          source_id: sourceId,
          session_id: sessionId,
          draft,
          task_type: taskType,
          description,
        };
        res = await fetch("/api/approvals", {
          method: "POST",
          headers: authHeaders(true),
          body: JSON.stringify(payload),
        });
      }
      const data = await res.json();
      if (!res.ok) {
        alert(data?.error || "提交失败");
        return;
      }

      const finalStatus = data?.data?.status || (action === "reject" ? "rejected" : action === "approve" ? "approved" : "pending");

      // 通知对话：驱动LLM继续执行后续步骤
      if (onActionTaken) {
        if (finalStatus === "approved") {
          if (comment?.trim()) {
            onActionTaken(`方案已审批通过。用户指示下一步要做的事情：${comment.trim()}。请按此指示继续执行。`);
          } else {
            onActionTaken(`方案已审批通过。未提供下一步指示，视为任务结束。`);
          }
        } else if (finalStatus === "rejected") {
          onActionTaken(`方案被驳回，修改意见：${comment || "请修改后重新提交"}`);
        } else if (mode === "needsAssignee") {
          const target = members.find((mm) => mm.id === assigneeId)?.name || "指定审批人";
          onActionTaken(`已提交${target}审批，请等待审批结果。`);
        }
      }

      setOpen(false);
      onStatusChange?.();
      fetchStatus();
    } catch (e) {
      console.error(e);
      alert("提交失败");
    } finally {
      setSubmitting(false);
    }
  };

  // ===== 状态渲染 =====
  // 已通过
  if (task?.status === "approved") {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-emerald-200/60 bg-emerald-50/60 px-3 py-2 text-sm">
        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
        <span className="text-emerald-700 font-medium">已通过</span>
        {task.comment ? (
          <span className="text-emerald-700/70 truncate">· {task.comment}</span>
        ) : null}
      </div>
    );
  }

  // 已驳回
  if (task?.status === "rejected") {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-rose-200/60 bg-rose-50/60 px-3 py-2 text-sm">
        <XCircle className="h-4 w-4 text-rose-600 shrink-0" />
        <span className="text-rose-700 font-medium">已驳回</span>
        {task.comment ? (
          <span className="text-rose-700/70 truncate">· {task.comment}</span>
        ) : null}
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto h-7 px-2 text-xs text-rose-700 hover:bg-rose-100"
          onClick={() => openDialog("needsComment", "重新提交并附修改意见")}
        >
          重新提交
        </Button>
      </div>
    );
  }

  // 待他人审批：显示状态，隐藏操作按钮（但若审批人就是当前用户，仍需显示操作按钮）
  if (task?.status === "pending" && task.assignee_id && task.assignee_id !== userId) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-amber-200/60 bg-amber-50/60 px-3 py-2 text-sm">
        <Hourglass className="h-4 w-4 text-amber-600 shrink-0" />
        <span className="text-amber-700 font-medium">审批中</span>
        <span className="text-amber-700/70 truncate">· 待 {task.assignee_name || "对方"} 处理</span>
      </div>
    );
  }

  // 当要求"仅审批消息展示"且未关联到审批任务时，不渲染任何内容（普通回复不显示操作按钮）
  if (hideWhenNoTask && !task) {
    return null;
  }

  // 无任务（或加载中）：显示三个操作按钮
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        variant="outline"
        size="sm"
        className="h-7 px-3 text-xs text-emerald-700 border-emerald-200 hover:bg-emerald-50"
        disabled={statusLoading}
        onClick={() => openDialog("idle", "确认通过")}
      >
        <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
        确认通过
      </Button>
      <Button
        variant="outline"
        size="sm"
        className="h-7 px-3 text-xs text-amber-700 border-amber-200 hover:bg-amber-50"
        disabled={statusLoading}
        onClick={() => openDialog("needsComment", "提修改意见")}
      >
        提修改意见
      </Button>
      <Button
        variant="outline"
        size="sm"
        className="h-7 px-3 text-xs text-blue-700 border-blue-200 hover:bg-blue-50"
        disabled={statusLoading}
        onClick={() => openDialog("needsAssignee", "转审批")}
      >
        转审批
      </Button>

      {/* 弹窗 */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[420px] z-[70]">
          <DialogHeader>
            <DialogTitle>{actionLabel}</DialogTitle>
            <DialogDescription>
              {mode === "idle"
                ? "确认该方案通过审批？"
                : mode === "needsComment"
                ? "请填写修改意见，方案将退回发起人。"
                : "请选择要转交的审批人。"}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3">
            {mode === "needsAssignee" && (
              <Select
                value={assigneeId}
                onValueChange={setAssigneeId}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="选择审批人" />
                </SelectTrigger>
                <SelectContent position="popper" className="z-[80]">
                  {members.length === 0 ? (
                    <div className="px-2 py-1.5 text-sm text-muted-foreground">
                      暂无其他成员
                    </div>
                  ) : (
                    members.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.name}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            )}

            {mode === "needsComment" && (
              <Textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="请输入修改意见（必填）"
                rows={3}
              />
            )}

            {mode === "idle" && (
              <div className="grid gap-1.5">
                <Textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="填写下一步要做的事情（选填，不填则表示任务结束）"
                  rows={3}
                />
                <p className="text-xs text-muted-foreground">
                  审批通过后，将把你指示的下一步发送给智能体继续执行；不填写则视为任务结束。
                </p>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
              取消
            </Button>
            <Button
              size="sm"
              disabled={
                submitting ||
                (mode === "needsAssignee" && !assigneeId) ||
                (mode === "needsComment" && !comment.trim())
              }
              onClick={handleSubmit}
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4 mr-1" />
              )}
              提交
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}