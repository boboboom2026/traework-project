"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Plus, Loader2, Trash2, Play, Clock, Calendar,
  Hash, User, Zap, CheckCircle2, XCircle, AlertCircle,
  FileText, Edit2, Check,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Schedule {
  id: string;
  name: string;
  description: string | null;
  schedule_type: "cron" | "every" | "at";
  cron_expr: string | null;
  interval_ms: number | null;
  at_time: string | null;
  timezone: string;
  trigger_msg: string;
  target_type: "channel" | "user";
  target_id: string;
  model_override: string | null;
  thinking_override: string | null;
  session_target: string;
  timeout_ms: number;
  delete_after_run: boolean;
  last_run_at: string | null;
  next_run_at: string | null;
  run_count: number;
  enabled: boolean;
  created_at: string;
}

interface ExecutionLog {
  id: string;
  schedule_id: string;
  status: "running" | "success" | "failed";
  trigger_msg: string | null;
  result_summary: string | null;
  error_message: string | null;
  duration_ms: number | null;
  started_at: string;
  completed_at: string | null;
}

interface Channel {
  id: string;
  name: string;
}

interface TeamMember {
  id: string;
  name: string;
}

interface AgentSchedulesTabProps {
  agentId?: string;
  teamId?: string;
}

const CRON_PRESETS = [
  { label: "每天 09:00", value: "0 9 * * *" },
  { label: "每天 18:00", value: "0 18 * * *" },
  { label: "工作日 09:00", value: "0 9 * * 1-5" },
  { label: "每周一 09:00", value: "0 9 * * 1" },
  { label: "每周五 17:00", value: "0 17 * * 5" },
  { label: "每小时", value: "0 * * * *" },
  { label: "每30分钟", value: "*/30 * * * *" },
  { label: "每月1日 09:00", value: "0 9 1 * *" },
];

const INTERVAL_PRESETS = [
  { label: "每5分钟", value: "300000" },
  { label: "每15分钟", value: "900000" },
  { label: "每30分钟", value: "1800000" },
  { label: "每1小时", value: "3600000" },
  { label: "每2小时", value: "7200000" },
  { label: "每6小时", value: "21600000" },
  { label: "每12小时", value: "43200000" },
  { label: "每24小时", value: "86400000" },
];

function formatScheduleDisplay(schedule: Schedule): string {
  if (schedule.schedule_type === "cron" && schedule.cron_expr) {
    const preset = CRON_PRESETS.find(p => p.value === schedule.cron_expr);
    return preset ? preset.label : `Cron: ${schedule.cron_expr}`;
  }
  if (schedule.schedule_type === "every" && schedule.interval_ms) {
    const preset = INTERVAL_PRESETS.find(p => p.value === String(schedule.interval_ms));
    return preset ? preset.label : `每 ${Math.round(schedule.interval_ms / 60000)} 分钟`;
  }
  if (schedule.schedule_type === "at" && schedule.at_time) {
    return new Date(schedule.at_time).toLocaleString("zh-CN");
  }
  return "未配置";
}

function formatTimeAgo(dateStr: string | null): string {
  if (!dateStr) return "从未";
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  if (diff < 60000) return "刚刚";
  if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`;
  return `${Math.floor(diff / 86400000)} 天前`;
}

export function AgentSchedulesTab({ agentId, teamId }: AgentSchedulesTabProps) {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<Schedule | null>(null);
  const [showLogsDialog, setShowLogsDialog] = useState(false);
  const [logsSchedule, setLogsSchedule] = useState<Schedule | null>(null);
  const [logs, setLogs] = useState<ExecutionLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [members, setMembers] = useState<TeamMember[]>([]);

  const loadSchedules = useCallback(async () => {
    if (!agentId || !teamId) return;
    try {
      const res = await fetch(`/api/agents/schedules?teamId=${teamId}&agentId=${agentId}`);
      if (res.ok) {
        const data = await res.json();
        setSchedules(data.schedules || []);
      }
    } catch (err) {
      console.error("Failed to load schedules:", err);
    } finally {
      setLoading(false);
    }
  }, [agentId, teamId]);

  const loadChannels = useCallback(async () => {
    if (!teamId) return;
    try {
      const res = await fetch(`/api/channels?teamId=${teamId}`);
      if (res.ok) {
        const data = await res.json();
        setChannels(data.channels || []);
      }
    } catch (err) {
      console.error("Failed to load channels:", err);
    }
  }, [teamId]);

  const loadMembers = useCallback(async () => {
    if (!teamId) return;
    try {
      const res = await fetch(`/api/teams/members?teamId=${teamId}`);
      if (res.ok) {
        const data = await res.json();
        setMembers(data.members || []);
      }
    } catch (err) {
      console.error("Failed to load members:", err);
    }
  }, [teamId]);

  useEffect(() => {
    loadSchedules();
    loadChannels();
    loadMembers();
  }, [loadSchedules, loadChannels, loadMembers]);

  const handleToggle = async (schedule: Schedule) => {
    try {
      const res = await fetch("/api/agents/schedules", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: schedule.id,
          enabled: !schedule.enabled,
        }),
      });
      if (res.ok) {
        setSchedules(prev => prev.map(s => s.id === schedule.id ? { ...s, enabled: !s.enabled } : s));
      }
    } catch (err) {
      console.error("Failed to toggle schedule:", err);
    }
  };

  const handleDelete = async (scheduleId: string) => {
    if (!confirm("确定删除此自动化任务？")) return;
    try {
      const res = await fetch(`/api/agents/schedules?id=${scheduleId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setSchedules(prev => prev.filter(s => s.id !== scheduleId));
      }
    } catch (err) {
      console.error("Failed to delete schedule:", err);
    }
  };

  const handleTrigger = async (schedule: Schedule) => {
    try {
      const res = await fetch("/api/agents/schedules/trigger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scheduleId: schedule.id }),
      });
      if (res.ok) {
        const data = await res.json();
        alert(`任务已触发\n执行ID: ${data.logId}\n\n智能体正在处理中...`);
      } else {
        const data = await res.json();
        alert(`触发失败: ${data.error}`);
      }
    } catch (err) {
      console.error("Failed to trigger schedule:", err);
      alert("触发失败");
    }
  };

  const handleViewLogs = async (schedule: Schedule) => {
    setLogsSchedule(schedule);
    setShowLogsDialog(true);
    setLogsLoading(true);
    try {
      const res = await fetch(`/api/agents/schedules/logs?scheduleId=${schedule.id}&limit=20`);
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs || []);
      }
    } catch (err) {
      console.error("Failed to load logs:", err);
    } finally {
      setLogsLoading(false);
    }
  };

  const handleSave = async (data: Partial<Schedule>) => {
    const isEdit = !!editingSchedule;
    const body = { ...data, agentId, teamId };
    if (isEdit) body.id = editingSchedule!.id;

    try {
      const res = await fetch("/api/agents/schedules", {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        setShowCreateDialog(false);
        setEditingSchedule(null);
        loadSchedules();
      } else {
        const data = await res.json();
        alert(`保存失败: ${data.error}`);
      }
    } catch (err) {
      console.error("Failed to save schedule:", err);
      alert("保存失败");
    }
  };

  if (!agentId) {
    return (
      <div className="text-center py-8 text-muted-foreground text-sm">
        请先选择或创建一个智能体
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium">自动化任务</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            定时触发智能体执行任务，结果自动推送到频道或成员
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => { setEditingSchedule(null); setShowCreateDialog(true); }}
        >
          <Plus className="w-3.5 h-3.5 mr-1" />
          新建任务
        </Button>
      </div>

      {schedules.length === 0 ? (
        <div className="text-center py-12 border border-dashed rounded-lg">
          <Clock className="w-8 h-8 mx-auto text-muted-foreground/50 mb-3" />
          <p className="text-sm text-muted-foreground">暂无自动化任务</p>
          <p className="text-xs text-muted-foreground/70 mt-1">
            创建定时任务，让智能体自动执行工作
          </p>
          <Button
            size="sm"
            variant="outline"
            className="mt-4"
            onClick={() => { setEditingSchedule(null); setShowCreateDialog(true); }}
          >
            <Plus className="w-3.5 h-3.5 mr-1" />
            创建第一个任务
          </Button>
        </div>
      ) : (
        <ScrollArea className="h-[400px]">
          <div className="space-y-2">
            {schedules.map(schedule => (
              <div
                key={schedule.id}
                className={cn(
                  "p-3 rounded-lg border transition-colors",
                  schedule.enabled ? "border-border bg-card" : "border-border/50 bg-muted/30 opacity-60"
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium truncate">{schedule.name}</span>
                      <Badge variant={schedule.enabled ? "default" : "secondary"} className="text-[10px] px-1.5 py-0 h-4">
                        {schedule.enabled ? "运行中" : "已暂停"}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {formatScheduleDisplay(schedule)}
                      </span>
                      <span className="flex items-center gap-1">
                        {schedule.target_type === "channel" ? <Hash className="w-3 h-3" /> : <User className="w-3 h-3" />}
                        {schedule.target_type === "channel"
                          ? channels.find(c => c.id === schedule.target_id)?.name || "未知频道"
                          : members.find(m => m.id === schedule.target_id)?.name || "未知成员"}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground/80 mt-1 line-clamp-1">
                      {schedule.trigger_msg}
                    </p>
                    <div className="flex items-center gap-3 mt-1.5 text-[10px] text-muted-foreground/60">
                      <span>已执行 {schedule.run_count} 次</span>
                      <span>上次: {formatTimeAgo(schedule.last_run_at)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Switch
                      checked={schedule.enabled}
                      onCheckedChange={() => handleToggle(schedule)}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => handleTrigger(schedule)}
                      title="手动触发"
                    >
                      <Play className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => handleViewLogs(schedule)}
                      title="执行日志"
                    >
                      <FileText className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => { setEditingSchedule(schedule); setShowCreateDialog(true); }}
                      title="编辑"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive hover:text-destructive"
                      onClick={() => handleDelete(schedule.id)}
                      title="删除"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      )}

      {/* 创建/编辑任务弹窗 */}
      <ScheduleFormDialog
        open={showCreateDialog}
        onOpenChange={(open) => { setShowCreateDialog(open); if (!open) setEditingSchedule(null); }}
        schedule={editingSchedule}
        channels={channels}
        members={members}
        onSave={handleSave}
      />

      {/* 执行日志弹窗 */}
      <Dialog open={showLogsDialog} onOpenChange={setShowLogsDialog}>
        <DialogContent className="max-w-lg max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>执行日志</DialogTitle>
            <DialogDescription>
              {logsSchedule?.name} - 最近执行记录
            </DialogDescription>
          </DialogHeader>
          {logsLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : logs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              暂无执行记录
            </div>
          ) : (
            <ScrollArea className="h-[400px]">
              <div className="space-y-2">
                {logs.map(log => (
                  <div key={log.id} className="p-3 rounded-lg border text-sm">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {log.status === "success" && <CheckCircle2 className="w-4 h-4 text-green-500" />}
                        {log.status === "failed" && <XCircle className="w-4 h-4 text-destructive" />}
                        {log.status === "running" && <Loader2 className="w-4 h-4 animate-spin text-blue-500" />}
                        <span className="font-medium">
                          {log.status === "success" ? "成功" : log.status === "failed" ? "失败" : "执行中"}
                        </span>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {new Date(log.started_at).toLocaleString("zh-CN")}
                      </span>
                    </div>
                    {log.duration_ms != null && (
                      <div className="text-xs text-muted-foreground mt-1">
                        耗时: {(log.duration_ms / 1000).toFixed(1)}s
                      </div>
                    )}
                    {log.result_summary && (
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                        {log.result_summary}
                      </p>
                    )}
                    {log.error_message && (
                      <p className="text-xs text-destructive mt-1">
                        {log.error_message}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// 表单弹窗组件
interface ScheduleFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  schedule: Schedule | null;
  channels: Channel[];
  members: TeamMember[];
  onSave: (data: Partial<Schedule>) => void;
}

function ScheduleFormDialog({ open, onOpenChange, schedule, channels, members, onSave }: ScheduleFormDialogProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [scheduleType, setScheduleType] = useState<"cron" | "every" | "at">("cron");
  const [cronPreset, setCronPreset] = useState("0 9 * * *");
  const [cronCustom, setCronCustom] = useState("");
  const [useCustomCron, setUseCustomCron] = useState(false);
  const [intervalPreset, setIntervalPreset] = useState("3600000");
  const [atTime, setAtTime] = useState("");
  const [triggerMsg, setTriggerMsg] = useState("");
  const [targetType, setTargetType] = useState<"channel" | "user">("channel");
  const [targetId, setTargetId] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (schedule) {
      setName(schedule.name);
      setDescription(schedule.description || "");
      setScheduleType(schedule.schedule_type);
      setCronPreset(schedule.cron_expr || "0 9 * * *");
      setCronCustom(schedule.cron_expr || "");
      setIntervalPreset(String(schedule.interval_ms || "3600000"));
      setAtTime(schedule.at_time ? new Date(schedule.at_time).toISOString().slice(0, 16) : "");
      setTriggerMsg(schedule.trigger_msg);
      setTargetType(schedule.target_type);
      setTargetId(schedule.target_id);
      setEnabled(schedule.enabled);
      setUseCustomCron(!CRON_PRESETS.some(p => p.value === schedule.cron_expr));
    } else {
      setName("");
      setDescription("");
      setScheduleType("cron");
      setCronPreset("0 9 * * *");
      setCronCustom("");
      setIntervalPreset("3600000");
      setAtTime("");
      setTriggerMsg("");
      setTargetType("channel");
      setTargetId("");
      setEnabled(true);
      setUseCustomCron(false);
    }
  }, [schedule, open]);

  const handleSave = async () => {
    if (!name.trim()) { alert("请输入任务名称"); return; }
    if (!triggerMsg.trim()) { alert("请输入触发消息"); return; }
    if (!targetId) { alert("请选择推送目标"); return; }

    setSaving(true);
    try {
      const data: Partial<Schedule> = {
        name: name.trim(),
        description: description.trim() || null,
        schedule_type: scheduleType,
        trigger_msg: triggerMsg.trim(),
        target_type: targetType,
        target_id: targetId,
        enabled,
        timezone: "Asia/Shanghai",
      };

      if (scheduleType === "cron") {
        data.cron_expr = useCustomCron ? cronCustom : cronPreset;
      } else if (scheduleType === "every") {
        data.interval_ms = parseInt(intervalPreset);
      } else if (scheduleType === "at") {
        data.at_time = new Date(atTime).toISOString();
      }

      await onSave(data);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{schedule ? "编辑自动化任务" : "新建自动化任务"}</DialogTitle>
          <DialogDescription>
            配置定时任务，让智能体按计划自动执行工作
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* 任务名称 */}
          <div className="space-y-1.5">
            <Label className="text-xs">任务名称 <span className="text-destructive">*</span></Label>
            <Input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="如：AI日报收集"
              className="h-9"
            />
          </div>

          {/* 描述 */}
          <div className="space-y-1.5">
            <Label className="text-xs">描述</Label>
            <Input
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="简要描述任务目的"
              className="h-9"
            />
          </div>

          {/* 调度类型 */}
          <div className="space-y-1.5">
            <Label className="text-xs">调度方式</Label>
            <div className="flex gap-2">
              {[
                { value: "cron", label: "定时执行", icon: Clock },
                { value: "every", label: "间隔执行", icon: Zap },
                { value: "at", label: "一次性", icon: Calendar },
              ].map(item => (
                <Button
                  key={item.value}
                  variant={scheduleType === item.value ? "default" : "outline"}
                  size="sm"
                  className="flex-1"
                  onClick={() => setScheduleType(item.value as any)}
                >
                  <item.icon className="w-3.5 h-3.5 mr-1" />
                  {item.label}
                </Button>
              ))}
            </div>
          </div>

          {/* 调度配置 */}
          {scheduleType === "cron" && (
            <div className="space-y-1.5">
              <Label className="text-xs">执行时间</Label>
              {!useCustomCron ? (
                <Select value={cronPreset} onValueChange={setCronPreset}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CRON_PRESETS.map(p => (
                      <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  value={cronCustom}
                  onChange={e => setCronCustom(e.target.value)}
                  placeholder="0 9 * * 1-5"
                  className="h-9 font-mono"
                />
              )}
              <Button
                variant="ghost"
                size="sm"
                className="text-xs h-6 px-2"
                onClick={() => setUseCustomCron(!useCustomCron)}
              >
                {useCustomCron ? "使用预设" : "自定义 Cron 表达式"}
              </Button>
            </div>
          )}

          {scheduleType === "every" && (
            <div className="space-y-1.5">
              <Label className="text-xs">执行间隔</Label>
              <Select value={intervalPreset} onValueChange={setIntervalPreset}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {INTERVAL_PRESETS.map(p => (
                    <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {scheduleType === "at" && (
            <div className="space-y-1.5">
              <Label className="text-xs">执行时间</Label>
              <Input
                type="datetime-local"
                value={atTime}
                onChange={e => setAtTime(e.target.value)}
                className="h-9"
              />
            </div>
          )}

          {/* 触发消息 */}
          <div className="space-y-1.5">
            <Label className="text-xs">触发消息 <span className="text-destructive">*</span></Label>
            <Textarea
              value={triggerMsg}
              onChange={e => setTriggerMsg(e.target.value)}
              placeholder="智能体收到此消息后会自动执行任务，如：请收集今日AI行业最新动态，分析归纳后推送到频道"
              rows={3}
              className="text-sm"
            />
          </div>

          {/* 推送目标 */}
          <div className="space-y-1.5">
            <Label className="text-xs">推送目标 <span className="text-destructive">*</span></Label>
            <div className="flex gap-2 mb-2">
              <Button
                variant={targetType === "channel" ? "default" : "outline"}
                size="sm"
                className="flex-1"
                onClick={() => { setTargetType("channel"); setTargetId(""); }}
              >
                <Hash className="w-3.5 h-3.5 mr-1" />
                频道
              </Button>
              <Button
                variant={targetType === "user" ? "default" : "outline"}
                size="sm"
                className="flex-1"
                onClick={() => { setTargetType("user"); setTargetId(""); }}
              >
                <User className="w-3.5 h-3.5 mr-1" />
                成员
              </Button>
            </div>
            <Select value={targetId} onValueChange={setTargetId}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder={targetType === "channel" ? "选择频道" : "选择成员"} />
              </SelectTrigger>
              <SelectContent>
                {targetType === "channel"
                  ? channels.map(c => (
                    <SelectItem key={c.id} value={c.id}># {c.name}</SelectItem>
                  ))
                  : members.map(m => (
                    <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                  ))
                }
              </SelectContent>
            </Select>
          </div>

          {/* 启用开关 */}
          <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
            <div>
              <Label className="text-sm font-medium">创建后启用</Label>
              <p className="text-xs text-muted-foreground">启用后任务将按计划自动执行</p>
            </div>
            <Switch checked={enabled} onCheckedChange={setEnabled} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Check className="w-4 h-4 mr-1.5" />}
            {schedule ? "保存修改" : "创建任务"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
