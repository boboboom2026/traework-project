"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { describeCron } from "@/app/api/agents/schedules/cron-utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Plus, Loader2, Trash2, Play, Clock, Calendar,
  Hash, User, Zap, CheckCircle2, XCircle, AlertCircle,
  FileText, Edit2, Check, RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
// 获取团队ID
const getTeamId = () => {
  if (typeof window === "undefined") return "";
  return localStorage.getItem("lastTeamId") || "";
};

const CRON_PRESETS: { label: string; value: string }[] = [
  { label: "每天 09:00", value: "0 9 * * *" },
  { label: "每天 09:00 (工作日)", value: "0 9 * * 1-5" },
  { label: "每小时", value: "0 * * * *" },
  { label: "每 30 分钟", value: "*/30 * * * *" },
  { label: "每 15 分钟", value: "*/15 * * * *" },
  { label: "每 5 分钟", value: "*/5 * * * *" },
  { label: "每天 00:00", value: "0 0 * * *" },
  { label: "每周一 09:00", value: "0 9 * * 1" },
  { label: "每月 1 日 09:00", value: "0 9 1 * *" },
];

const INTERVAL_PRESETS: { label: string; value: string }[] = [
  { label: "每 10 分钟", value: "600000" },
  { label: "每 30 分钟", value: "1800000" },
  { label: "每小时", value: "3600000" },
  { label: "每 2 小时", value: "7200000" },
  { label: "每 6 小时", value: "21600000" },
  { label: "每天", value: "86400000" },
];

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
  agent_id: string;
  agent_name?: string;
  target_name?: string;
  last_run_at: string | null;
  next_run_at: string | null;
  run_count: number;
  enabled: boolean;
  created_at: string;
}

interface Agent {
  id: string;
  name: string;
  avatar?: string;
}

interface Channel {
  id: string;
  name: string;
}

interface Member {
  id: string;
  user_id: string;
  user_name?: string;
  display_name?: string;
  nick_name?: string;
}

export default function SchedulesPage() {
  const [tid, setTid] = useState("");

  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editSchedule, setEditSchedule] = useState<Schedule | null>(null);
  const [logsDialog, setLogsDialog] = useState<{ open: boolean; scheduleId: string; scheduleName: string }>({ open: false, scheduleId: "", scheduleName: "" });
  const [logs, setLogs] = useState<any[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [triggeringIds, setTriggeringIds] = useState<Set<string>>(new Set());

  // 表单状态
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [triggerMsg, setTriggerMsg] = useState("");
  const [scheduleType, setScheduleType] = useState<"cron" | "every" | "at">("cron");
  const [cronPreset, setCronPreset] = useState("0 9 * * *");
  const [cronCustom, setCronCustom] = useState("");
  const [useCustomCron, setUseCustomCron] = useState(false);
  const [intervalPreset, setIntervalPreset] = useState("3600000");
  const [atTime, setAtTime] = useState("");
  const [agentId, setAgentId] = useState("");
  const [targetType, setTargetType] = useState<"channel" | "user">("channel");
  const [targetId, setTargetId] = useState("");
  const [enabled, setEnabled] = useState(true);

  // 初始化时从 localStorage 获取 teamId
  useEffect(() => {
    const id = getTeamId();
    if (id) setTid(id);
  }, []);

  // 加载数据
  const fetchSchedules = useCallback(async () => {
    if (!tid) return;
    try {
      const res = await fetch(`/api/agents/schedules?teamId=${tid}`);
      const data = await res.json();
      // 尝试解析不同格式的响应
      const list = Array.isArray(data) ? data : data?.schedules || data?.data || [];
      setSchedules(list);
    } catch (e) {
      console.error("获取调度任务列表失败", e);
    }
  }, [tid]);

  const fetchAgents = useCallback(async () => {
    if (!tid) return;
    try {
      const res = await fetch(`/api/agents?teamId=${tid}`);
      const data = await res.json();
      const list = data?.agents || data?.data || [];
      setAgents(list);
    } catch (e) {
      console.error("获取智能体列表失败", e);
    }
  }, [tid]);

  const fetchChannels = useCallback(async () => {
    if (!tid) return;
    try {
      const res = await fetch(`/api/channels?teamId=${tid}`);
      const data = await res.json();
      const list = data?.channels || data?.data || [];
      setChannels(list);
    } catch (e) {
      console.error("获取频道列表失败", e);
    }
  }, [tid]);

  const fetchMembers = useCallback(async () => {
    if (!tid) return;
    try {
      const res = await fetch(`/api/teams/members?teamId=${tid}`);
      const data = await res.json();
      const list = data?.members || data?.data || [];
      setMembers(list);
    } catch (e) {
      console.error("获取成员列表失败", e);
    }
  }, [tid]);

  // 用直接的 useEffect 依赖 tid 来加载数据
  useEffect(() => {
    if (!tid) return;
    setLoading(true);
    Promise.all([
      fetchSchedules(),
      fetchAgents(),
      fetchChannels(),
      fetchMembers(),
    ]).finally(() => setLoading(false));
  }, [tid, fetchSchedules, fetchAgents, fetchChannels, fetchMembers]);

  // 获取 agent 名称
  const getAgentName = (id: string) => agents.find(a => a.id === id)?.name || id;
  const getTargetName = (type: string, id: string) => {
    if (type === "channel") return channels.find(c => c.id === id)?.name || `#${id}`;
    const m = members.find(m => m.id === id || m.user_id === id);
    return m?.display_name || m?.nick_name || m?.user_name || id;
  };

  // 重置表单
  const resetForm = () => {
    setName("");
    setDescription("");
    setTriggerMsg("");
    setScheduleType("cron");
    setCronPreset("0 9 * * *");
    setCronCustom("");
    setUseCustomCron(false);
    setIntervalPreset("3600000");
    setAtTime("");
    setAgentId("");
    setTargetType("channel");
    setTargetId("");
    setEnabled(true);
  };

  // 打开编辑
  const openEdit = (s: Schedule) => {
    setEditSchedule(s);
    setName(s.name);
    setDescription(s.description || "");
    setTriggerMsg(s.trigger_msg);
    setScheduleType(s.schedule_type);
    setAgentId(s.agent_id);
    setTargetType(s.target_type);
    setTargetId(s.target_id);
    setEnabled(s.enabled);
    if (s.schedule_type === "cron") {
      const found = CRON_PRESETS.find(p => p.value === s.cron_expr);
      if (found) {
        setUseCustomCron(false);
        setCronPreset(s.cron_expr || "0 9 * * *");
      } else {
        setUseCustomCron(true);
        setCronCustom(s.cron_expr || "");
      }
    } else if (s.schedule_type === "every") {
      setIntervalPreset(String(s.interval_ms || 3600000));
    } else if (s.schedule_type === "at") {
      setAtTime(s.at_time ? new Date(s.at_time).toISOString().slice(0, 16) : "");
    }
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!name.trim()) { alert("请输入任务名称"); return; }
    if (!agentId) { alert("请选择执行智能体"); return; }
    if (!triggerMsg.trim()) { alert("请输入触发消息"); return; }
    if (!targetId) { alert("请选择推送目标"); return; }

    setSaving(true);
    try {
      const body: any = {
        teamId: tid,
        agentId: agentId,
        name: name.trim(),
        description: description.trim() || null,
        scheduleType: scheduleType,
        triggerMsg: triggerMsg.trim(),
        targetType: targetType,
        targetId: targetId,
        timezone: "Asia/Shanghai",
        enabled,
      };

      if (scheduleType === "cron") {
        body.cronExpr = useCustomCron ? cronCustom : cronPreset;
      } else if (scheduleType === "every") {
        body.intervalMs = parseInt(intervalPreset);
      } else if (scheduleType === "at") {
        body.atTime = new Date(atTime).toISOString();
      }

      const isEdit = !!editSchedule;
      const url = "/api/agents/schedules";
      const method = isEdit ? "PUT" : "POST";

      if (isEdit) {
        body.id = editSchedule.id;
      }

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "保存失败");
      }

      setDialogOpen(false);
      resetForm();
      setEditSchedule(null);
      fetchSchedules();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (s: Schedule) => {
    try {
      await fetch("/api/agents/schedules", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: s.id, enabled: !s.enabled, teamId: tid }),
      });
      fetchSchedules();
    } catch (e) {
      console.error("切换状态失败", e);
    }
  };

  const handleTrigger = async (s: Schedule) => {
    setTriggeringIds((prev) => new Set(prev).add(s.id));
    try {
      await fetch("/api/agents/schedules/trigger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scheduleId: s.id, teamId: tid }),
      });
      alert("已触发执行，请稍后查看日志");
    } catch (e) {
      console.error("触发失败", e);
    } finally {
      setTriggeringIds((prev) => {
        const next = new Set(prev);
        next.delete(s.id);
        return next;
      });
    }
  };

  const handleDelete = async (s: Schedule) => {
    if (!confirm(`确定删除自动化任务「${s.name}」吗？`)) return;
    try {
      await fetch(`/api/agents/schedules?id=${s.id}`, { method: "DELETE" });
      fetchSchedules();
    } catch (e) {
      console.error("删除失败", e);
    }
  };

  const openLogs = async (s: Schedule) => {
    setLogsDialog({ open: true, scheduleId: s.id, scheduleName: s.name });
    setLogsLoading(true);
    setLogs([]);
    try {
      const res = await fetch(`/api/agents/schedules/logs?schedule_id=${s.id}`);
      const data = await res.json();
      setLogs(Array.isArray(data) ? data : data?.logs || data?.data || []);
    } catch (e) {
      console.error("获取日志失败", e);
    } finally {
      setLogsLoading(false);
    }
  };

  const formatTime = (t: string | null) => {
    if (!t) return "-";
    try {
      return new Date(t).toLocaleString("zh-CN", { hour12: false });
    } catch {
      return t;
    }
  };

  const getScheduleDesc = (s: Schedule) => {
    if (s.schedule_type === "cron") return describeCron(s.cron_expr || "") || s.cron_expr || "定时执行";
    if (s.schedule_type === "every") return `每 ${Math.round(parseInt(String(s.interval_ms || 0)) / 60000)} 分钟`;
    if (s.schedule_type === "at") return formatTime(s.at_time);
    return "-";
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">自动化任务</h1>
          <p className="text-sm text-muted-foreground mt-1">
            配置定时任务，让智能体按计划自动执行工作并推送到频道或成员
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => { fetchSchedules(); fetchAgents(); fetchChannels(); fetchMembers(); }}
          >
            <RefreshCw className="w-4 h-4 mr-1" />
            刷新
          </Button>
          <Button
            onClick={() => { resetForm(); setEditSchedule(null); setDialogOpen(true); }}
          >
            <Plus className="w-4 h-4 mr-1" />
            新建自动化任务
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : schedules.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Clock className="w-12 h-12 text-muted-foreground/40 mb-4" />
            <p className="text-muted-foreground mb-2">暂无自动化任务</p>
            <p className="text-sm text-muted-foreground/60 mb-4">
              创建定时任务，让智能体自动收集信息、生成报告并推送到频道
            </p>
            <Button
              onClick={() => { resetForm(); setEditSchedule(null); setDialogOpen(true); }}
            >
              <Plus className="w-4 h-4 mr-1" />
              新建自动化任务
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm">
              共 {schedules.length} 个自动化任务
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[180px]">任务名称</TableHead>
                  <TableHead>调度时间</TableHead>
                  <TableHead>执行智能体</TableHead>
                  <TableHead>推送目标</TableHead>
                  <TableHead>下次执行</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {schedules.map(s => (
                  <TableRow key={s.id}>
                    <TableCell>
                      <div className="font-medium">{s.name}</div>
                      {s.description && (
                        <div className="text-xs text-muted-foreground truncate max-w-[200px]">
                          {s.description}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="font-mono text-xs">
                        {getScheduleDesc(s)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <Zap className="w-3.5 h-3.5 text-blue-500" />
                        <span className="text-sm">{getAgentName(s.agent_id)}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        {s.target_type === "channel" ? (
                          <Hash className="w-3.5 h-3.5 text-green-500" />
                        ) : (
                          <User className="w-3.5 h-3.5 text-purple-500" />
                        )}
                        <span className="text-sm">{getTargetName(s.target_type, s.target_id)}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatTime(s.next_run_at)}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={s.enabled ? "default" : "secondary"}
                        className={cn(
                          "text-xs cursor-pointer",
                          s.enabled && "bg-green-500/10 text-green-600 hover:bg-green-500/20"
                        )}
                        onClick={() => handleToggle(s)}
                      >
                        {s.enabled ? "已启用" : "已禁用"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="w-7 h-7"
                          title={triggeringIds.has(s.id) ? "执行中..." : "手动触发"}
                          onClick={() => handleTrigger(s)}
                          disabled={triggeringIds.has(s.id)}
                        >
                          {triggeringIds.has(s.id) ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Play className="w-3.5 h-3.5" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="w-7 h-7"
                          title="执行日志"
                          onClick={() => openLogs(s)}
                        >
                          <FileText className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="w-7 h-7"
                          title="编辑"
                          onClick={() => openEdit(s)}
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="w-7 h-7 text-destructive hover:text-destructive"
                          title="删除"
                          onClick={() => handleDelete(s)}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* 新建/编辑弹窗 */}
      <Dialog open={dialogOpen} onOpenChange={(v) => { setDialogOpen(v); if (!v) { resetForm(); setEditSchedule(null); } }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editSchedule ? "编辑自动化任务" : "新建自动化任务"}</DialogTitle>
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

            {/* 调度方式 */}
            <div className="space-y-1.5">
              <Label className="text-xs">调度方式</Label>
              <div className="flex gap-2">
                {[
                  { value: "cron" as const, label: "定时执行", icon: Clock },
                  { value: "every" as const, label: "间隔执行", icon: Zap },
                  { value: "at" as const, label: "一次性", icon: Calendar },
                ].map(item => (
                  <Button
                    key={item.value}
                    variant={scheduleType === item.value ? "default" : "outline"}
                    size="sm"
                    className="flex-1"
                    onClick={() => setScheduleType(item.value)}
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
                <Label className="text-xs">定时规则</Label>
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
                    placeholder="输入 Cron 表达式，如：0 9 * * *"
                    className="h-9 font-mono"
                  />
                )}
                <Button
                  variant="link"
                  size="sm"
                  className="h-auto p-0 text-xs"
                  onClick={() => { setUseCustomCron(!useCustomCron); }}
                >
                  {useCustomCron ? "← 使用预设" : "使用自定义 Cron 表达式 →"}
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
                placeholder="智能体收到这条消息后会执行任务，如：请收集今日AI行业最新动态，分析归纳后推送到频道"
                rows={3}
              />
            </div>

            {/* 选择智能体 */}
            <div className="space-y-1.5">
              <Label className="text-xs">执行智能体 <span className="text-destructive">*</span></Label>
              <Select value={agentId} onValueChange={setAgentId}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="选择智能体..." />
                </SelectTrigger>
                <SelectContent>
                  {agents.length === 0 ? (
                    <div className="px-2 py-4 text-center text-sm text-muted-foreground">
                      暂无可用智能体
                    </div>
                  ) : (
                    agents.map(a => (
                      <SelectItem key={a.id} value={a.id}>
                        <div className="flex items-center gap-2">
                          <Zap className="w-3.5 h-3.5 text-blue-500" />
                          {a.name}
                        </div>
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
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
              {targetType === "channel" ? (
                <Select value={targetId} onValueChange={setTargetId}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="选择频道..." />
                  </SelectTrigger>
                  <SelectContent>
                    {channels.length === 0 ? (
                      <div className="px-2 py-4 text-center text-sm text-muted-foreground">
                        暂无可用频道
                      </div>
                    ) : (
                      channels.map(c => (
                        <SelectItem key={c.id} value={c.id}>
                          <div className="flex items-center gap-2">
                            <Hash className="w-3.5 h-3.5 text-green-500" />
                            # {c.name}
                          </div>
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              ) : (
                <Select value={targetId} onValueChange={setTargetId}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="选择成员..." />
                  </SelectTrigger>
                  <SelectContent>
                    {members.length === 0 ? (
                      <div className="px-2 py-4 text-center text-sm text-muted-foreground">
                        暂无成员数据
                      </div>
                    ) : (
                      members.map(m => (
                        <SelectItem key={m.id} value={m.id}>
                          <div className="flex items-center gap-2">
                            <User className="w-3.5 h-3.5 text-purple-500" />
                            {m.display_name || m.nick_name || m.user_name || m.id}
                          </div>
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* 启用开关 */}
            <div className="flex items-center gap-2">
              <Switch
                checked={enabled}
                onCheckedChange={setEnabled}
                id="schedule-enabled"
              />
              <Label htmlFor="schedule-enabled" className="text-xs cursor-pointer">
                创建后立即启用
              </Label>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => { setDialogOpen(false); resetForm(); setEditSchedule(null); }}
              disabled={saving}
            >
              取消
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
              {editSchedule ? "保存修改" : "创建任务"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 执行日志弹窗 */}
      <Dialog
        open={logsDialog.open}
        onOpenChange={(v) => setLogsDialog(prev => ({ ...prev, open: v }))}
      >
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>执行日志 - {logsDialog.scheduleName}</DialogTitle>
            <DialogDescription>
              查看自动化任务的执行历史记录
            </DialogDescription>
          </DialogHeader>
          {logsLoading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : logs.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              暂无执行记录
            </div>
          ) : (
            <div className="space-y-2">
              {logs.map((log: any, i: number) => (
                <div key={log.id || i} className="flex items-start gap-3 p-3 rounded-lg border bg-card">
                  {log.status === "success" ? (
                    <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                  ) : log.status === "running" ? (
                    <Loader2 className="w-4 h-4 animate-spin text-blue-500 mt-0.5 shrink-0" />
                  ) : (
                    <XCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-xs",
                          log.status === "success" && "text-green-600",
                          log.status === "running" && "text-blue-600",
                          log.status === "failed" && "text-red-600"
                        )}
                      >
                        {log.status === "success" ? "成功" : log.status === "running" ? "执行中" : "失败"}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {formatTime(log.started_at || log.created_at)}
                      </span>
                      {log.duration_ms && (
                        <span className="text-xs text-muted-foreground">
                          耗时 {Math.round(log.duration_ms / 1000)}s
                        </span>
                      )}
                    </div>
                    {log.result_summary && (
                      <p className="text-sm mt-1 text-muted-foreground line-clamp-2">
                        {log.result_summary}
                      </p>
                    )}
                    {log.error_message && (
                      <p className="text-sm mt-1 text-red-500 line-clamp-2">
                        错误: {log.error_message}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}