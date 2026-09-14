"use client";

import React from "react";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import {
  ArrowLeft, Bot, MessageCircle, TrendingUp, Star,
  Clock, CheckCircle2, AlertCircle, BookOpen, Wrench,
  Server, Database, Zap, Sparkles, ChevronRight,
  ThumbsUp, ThumbsDown, GraduationCap, Activity,
  Target, Brain, Gauge, BarChart3, LineChart,
  Filter, ListOrdered, Search, ChevronLeft,
  ChevronDown, ChevronUp, Send, Upload, Loader2, Briefcase as BriefcaseIcon,
  XCircle, FileText, Lightbulb, AlertTriangle,
  Sliders, MessageSquare, Settings2,
  User, Pencil, Shield, Check, X, ShieldCheck, Info, Handshake,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ==================== 类型定义 ====================
interface ProfileData {
  identity: {
    id: string;
    name: string;
    description: string;
    avatar: string;
    status: string;
    greeting: string;
    userGuidance: string;
    position: { id: string; name: string; icon: string; color: string } | null;
    createdAt: string;
    skillIds: string[];
    toolIds: string[];
    ragDatasetIds: string[];
    mcpServiceIds: string[];
    roleIdentity: string;
    boundaries: Array<{ action: string; permission: string }>;
  };
  scores: {
    overall: number;
    level: { name: string; color: string; rank: number };
    dimensions: {
      completionRate: number;
      satisfaction: number;
      speed: number;
      skillMastery: number;
      knowledge: number;
    };
  };
  statistics: {
    totalTasks: number;
    completedTasks: number;
    successRate: number;
    avgRating: number;
    feedbackCount: number;
    avgDurationMs: number;
    skillsCount: number;
    toolsCount: number;
    knowledgeCount: number;
  };
  trend: {
    daily: Array<{
      date: string;
      tasks: number;
      successRate: number;
      avgRating: number;
    }>;
  };
  recentFeedbacks: Array<{
    rating: number;
    tags: string[];
    correction: string | null;
    comment: string | null;
    user: { name: string; avatar: string } | null;
    createdAt: string;
  }>;
  trainingHistory: Array<{
    type: string;
    content: string;
    sourceType: string;
    createdAt: string;
  }>;
  skills: Array<{
    id: string;
    name: string;
    content: string;
  }>;
  taskRecords: Array<{
    id: string;
    taskType: string;
    source: string;
    inputSummary: string;
    outputSummary: string | null;
    executionTimeMs: number | null;
    status: string;
    rating: number | null;
    feedbackText: string | null;
    correction: string | null;
    tags: string | null;
    createdAt: string;
  }>;
}

// ==================== 等级徽章组件 ====================
function LevelBadge({ level, score }: { level: ProfileData["scores"]["level"]; score: number }) {
  const colors: Record<number, { bg: string; border: string; text: string }> = {
    0: { bg: "bg-gray-100 dark:bg-gray-800/50", border: "border-gray-300 dark:border-gray-600", text: "text-gray-500" },
    1: { bg: "bg-gray-100 dark:bg-gray-800/50", border: "border-gray-300 dark:border-gray-600", text: "text-gray-500" },
    2: { bg: "bg-emerald-50 dark:bg-emerald-900/20", border: "border-emerald-300 dark:border-emerald-700", text: "text-emerald-600 dark:text-emerald-400" },
    3: { bg: "bg-blue-50 dark:bg-blue-900/20", border: "border-blue-300 dark:border-blue-700", text: "text-blue-600 dark:text-blue-400" },
    4: { bg: "bg-amber-50 dark:bg-amber-900/20", border: "border-amber-300 dark:border-amber-700", text: "text-amber-600 dark:text-amber-400" },
    5: { bg: "bg-purple-50 dark:bg-purple-900/20", border: "border-purple-300 dark:border-purple-700", text: "text-purple-600 dark:text-purple-400" },
  };
  const c = colors[level.rank] || colors[0];

  return (
    <div className={cn("flex items-center gap-2.5 px-3 py-1.5 rounded-full border", c.bg, c.border)}>
      <div className={cn("w-2 h-2 rounded-full", c.text)} />
      <span className={cn("text-xs font-semibold", c.text)}>{level.name}</span>
      <span className={cn("text-[10px] opacity-70", c.text)}>{score}分</span>
    </div>
  );
}

// ==================== 能力雷达图组件（纯 CSS/SVG） ====================
function RadarChart({ dimensions }: { dimensions: ProfileData["scores"]["dimensions"] }) {
  const labels = [
    { key: "completionRate", label: "任务完成率" },
    { key: "satisfaction", label: "用户满意度" },
    { key: "speed", label: "响应速度" },
    { key: "skillMastery", label: "技能掌握度" },
    { key: "knowledge", label: "知识覆盖度" },
  ];

  const values = labels.map(l => (dimensions as Record<string, number>)[l.key] / 100);
  const cx = 120, cy = 120, r = 80;
  const angles = [0, 72, 144, 216, 288].map(a => (a - 90) * Math.PI / 180);

  const points = values.map((v, i) => {
    const x = cx + r * v * Math.cos(angles[i]);
    const y = cy + r * v * Math.sin(angles[i]);
    return `${x},${y}`;
  }).join(" ");

  const gridLevels = [0.2, 0.4, 0.6, 0.8, 1.0];

  return (
    <svg viewBox="0 0 240 240" className="w-full max-w-[240px] h-auto">
      {/* 网格 */}
      {gridLevels.map(level => (
        <polygon
          key={level}
          points={angles.map(a => {
            const x = cx + r * level * Math.cos(a);
            const y = cy + r * level * Math.sin(a);
            return `${x},${y}`;
          }).join(" ")}
          fill="none"
          stroke="hsl(var(--border))"
          strokeWidth={1}
          className="opacity-50"
        />
      ))}
      {/* 轴线 */}
      {angles.map((a, i) => (
        <line
          key={i}
          x1={cx} y1={cy}
          x2={cx + r * Math.cos(a)} y2={cy + r * Math.sin(a)}
          stroke="hsl(var(--border))"
          strokeWidth={1}
          className="opacity-30"
        />
      ))}
      {/* 数据区域 */}
      <polygon
        points={points}
        fill="hsl(var(--primary))"
        fillOpacity={0.15}
        stroke="hsl(var(--primary))"
        strokeWidth={2}
      />
      {/* 数据点 */}
      {values.map((v, i) => {
        const x = cx + r * v * Math.cos(angles[i]);
        const y = cy + r * v * Math.sin(angles[i]);
        return <circle key={i} cx={x} cy={y} r={3} fill="hsl(var(--primary))" />;
      })}
      {/* 标签 */}
      {labels.map((l, i) => {
        const labelR = r + 28;
        const x = cx + labelR * Math.cos(angles[i]);
        const y = cy + labelR * Math.sin(angles[i]);
        const val = (dimensions as Record<string, number>)[l.key];
        return (
          <g key={i}>
            <text
              x={x} y={y - 1}
              textAnchor="middle"
              dominantBaseline="middle"
              className="fill-muted-foreground text-[8px]"
            >
              {l.label}
            </text>
            <text
              x={x} y={y + 10}
              textAnchor="middle"
              dominantBaseline="middle"
              className="fill-foreground text-[9px] font-bold"
            >
              {val}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ==================== 趋势图组件（纯 CSS/SVG） ====================
function TrendChart({ data, dataKey, color, label }: {
  data: ProfileData["trend"]["daily"];
  dataKey: "tasks" | "successRate" | "avgRating";
  color: string;
  label: string;
}) {
  if (data.length === 0) return <div className="text-sm text-muted-foreground text-center py-8">暂无数据</div>;

  const maxVal = Math.max(...data.map(d => d[dataKey] as number), 1);
  const w = data.length * 8;
  const h = 120;
  const barW = 4;

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${Math.max(w, 200)} ${h}`} className="w-full h-auto" preserveAspectRatio="none">
        {/* 网格线 */}
        {[0, 0.25, 0.5, 0.75, 1].map((level, i) => (
          <line
            key={i}
            x1={0} y1={h * (1 - level)}
            x2={Math.max(w, 200)} y2={h * (1 - level)}
            stroke="hsl(var(--border))"
            strokeWidth={0.5}
            className="opacity-30"
          />
        ))}
        {/* 柱状图 */}
        {data.map((d, i) => {
          const val = (d[dataKey] as number) || 0;
          const barH = (val / maxVal) * (h - 10);
          const x = i * 8 + 2;
          const y = h - 5 - barH;
          return (
            <rect
              key={i}
              x={x} y={y}
              width={barW} height={barH}
              fill={color}
              rx={1}
              className="hover:opacity-80 transition-opacity cursor-pointer"
            >
              <title>{d.date}: {val}</title>
            </rect>
          );
        })}
      </svg>
      <div className="flex items-center gap-1.5 mt-1">
        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
        <span className="text-[10px] text-muted-foreground">{label}</span>
      </div>
    </div>
  );
}

// ==================== 星级评分 ====================
function StarRating({ rating, size = "sm" }: { rating: number; size?: "sm" | "xs" }) {
  const sizeClass = size === "sm" ? "w-3.5 h-3.5" : "w-3 h-3";
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map(i => (
        <Star
          key={i}
          className={cn(
            sizeClass,
            i <= Math.round(rating) ? "fill-amber-400 text-amber-400" : "fill-none text-muted-foreground/30"
          )}
        />
      ))}
    </div>
  );
}

// ==================== 时间格式化 ====================
function formatTime(dateStr: string) {
  const d = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes}分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}小时前`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}天前`;
  return d.toLocaleDateString("zh-CN", { month: "short", day: "numeric" });
}

// ==================== 主页面 ====================
export default function AgentProfilePage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const teamId = user?.currentTeamId || "";
  const agentId = params.id as string;

  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("overview");
  const [showWorkForm, setShowWorkForm] = useState(false);
  const [workTitle, setWorkTitle] = useState("");
  const [workContent, setWorkContent] = useState("");
  const [submittingWork, setSubmittingWork] = useState(false);
  const [submitResult, setSubmitResult] = useState<{ success: boolean; message: string } | null>(null);
  const [showSkillPanel, setShowSkillPanel] = useState(false);
  const [proposals, setProposals] = useState<SkillProposal[]>([]);
  const [proposalsLoading, setProposalsLoading] = useState(false);
  const [generatingProposal, setGeneratingProposal] = useState(false);
  const [proposalResult, setProposalResult] = useState<{ success: boolean; message: string } | null>(null);
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [applyingIds, setApplyingIds] = useState<string[]>([]);

  interface SkillProposal {
    id: string;
    action: string;
    title: string;
    reason: string | null;
    old_content: string | null;
    new_content: string | null;
    new_description: string | null;
    confidence: string;
    evidence: any;
    data_sources: any;
    status: string;
    review_comment: string | null;
    created_at: string;
    reviewed_at: string | null;
  }

  interface OptimizeProposal {
    id: string;
    optimize_type: string;
    field_name: string;
    old_value: string | null;
    new_value: string | null;
    reason: string | null;
    confidence: string;
    source: string;
    status: string;
    session_id: string | null;
    created_at: string;
    evidence?: { source: string; content: string }[];
  }

  const loadProfile = useCallback(async () => {
    if (!teamId || !agentId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/agents/${agentId}/profile?teamId=${teamId}`);
      const data = await res.json();
      if (data.success && data.profile) {
        setProfile(data.profile);
      } else {
        setError(data.error || "加载失败");
      }
    } catch (e) {
      console.error("加载档案失败:", e);
      setError("加载失败，请检查网络连接");
    } finally {
      setLoading(false);
    }
  }, [teamId, agentId]);

  useEffect(() => { loadProfile(); }, [loadProfile]);

  const handleSubmitWork = async () => {
    if (!workContent.trim()) return;
    setSubmittingWork(true);
    setSubmitResult(null);
    try {
      const res = await fetch("/api/agents/training/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId: agentId as string,
          teamId,
          workTitle: workTitle.trim() || undefined,
          workContent: workContent.trim(),
        }),
      });
      const data = await res.json();
      if (data.success) {
        setSubmitResult({ success: true, message: "工作记录已投喂，智能体正在学习..." });
        setWorkTitle("");
        setWorkContent("");
        setShowWorkForm(false);
        loadProfile(); // 刷新培训记录
      } else {
        setSubmitResult({ success: false, message: data.error || "投喂失败" });
      }
    } catch {
      setSubmitResult({ success: false, message: "网络错误，请重试" });
    } finally {
      setSubmittingWork(false);
    }
  };

  const loadProposals = useCallback(async () => {
    if (!teamId || !agentId) return;
    setProposalsLoading(true);
    try {
      const res = await fetch(`/api/agents/skill-proposals?agentId=${agentId}&teamId=${teamId}`);
      const data = await res.json();
      if (data.success) {
        setProposals(data.proposals || []);
      }
    } catch (e) {
      console.error("加载技能建议失败:", e);
    } finally {
      setProposalsLoading(false);
    }
  }, [teamId, agentId]);

  useEffect(() => { if (showSkillPanel) loadProposals(); }, [showSkillPanel, loadProposals]);

  const handleGenerateProposal = async () => {
    setGeneratingProposal(true);
    setProposalResult(null);
    try {
      const res = await fetch("/api/agents/skill-proposals/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId, teamId }),
      });
      const data = await res.json();
      if (data.success) {
        setProposalResult({ success: true, message: `分析完成！${data.proposals ? `生成了 ${data.proposals.length} 条技能建议` : ""}` });
        await loadProposals();
      } else {
        setProposalResult({ success: false, message: data.error || "分析失败" });
      }
    } catch {
      setProposalResult({ success: false, message: "网络错误，请重试" });
    } finally {
      setGeneratingProposal(false);
    }
  };

  const handleApproveProposal = async (proposalId: string) => {
    setReviewingId(proposalId);
    try {
      const res = await fetch(`/api/agents/skill-proposals/${proposalId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamId, action: "approve" }),
      });
      const data = await res.json();
      if (data.success) {
        setProposalResult({ success: true, message: "技能已更新！" });
        await loadProposals();
        loadProfile();
      } else {
        setProposalResult({ success: false, message: data.error || "审批失败" });
      }
    } catch {
      setProposalResult({ success: false, message: "网络错误，请重试" });
    } finally {
      setReviewingId(null);
    }
  };

  const handleRejectProposal = async (proposalId: string) => {
    setReviewingId(proposalId);
    try {
      const res = await fetch(`/api/agents/skill-proposals/${proposalId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamId, action: "reject" }),
      });
      const data = await res.json();
      if (data.success) {
        setProposalResult({ success: true, message: "已驳回" });
        await loadProposals();
      } else {
        setProposalResult({ success: false, message: data.error || "操作失败" });
      }
    } catch {
      setProposalResult({ success: false, message: "网络错误，请重试" });
    } finally {
      setReviewingId(null);
    }
  };

  const [showOptimizePanel, setShowOptimizePanel] = useState(false);
  const [optimizeProposals, setOptimizeProposals] = useState<OptimizeProposal[]>([]);
  const [optimizeLoading, setOptimizeLoading] = useState(false);
  const [optimizing, setOptimizing] = useState(false);
  const [optimizeResult, setOptimizeResult] = useState<{ success: boolean; message: string } | null>(null);
  const [applyingOptimize, setApplyingOptimize] = useState<string | null>(null);

  const loadOptimizeProposals = useCallback(async () => {
    if (!teamId || !agentId) return;
    setOptimizeLoading(true);
    try {
      const res = await fetch(`/api/agents/optimize?agentId=${agentId}&teamId=${teamId}`);
      const data = await res.json();
      if (data.success) setOptimizeProposals(data.proposals || []);
    } catch (e) {
      console.error("加载优化建议失败:", e);
    } finally {
      setOptimizeLoading(false);
    }
  }, [teamId, agentId]);

  useEffect(() => { if (showOptimizePanel) loadOptimizeProposals(); }, [showOptimizePanel, loadOptimizeProposals]);

  const handleGenerateOptimization = async () => {
    setOptimizing(true);
    setOptimizeResult(null);
    try {
      const res = await fetch("/api/agents/optimize/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId, teamId }),
      });
      const data = await res.json();
      if (data.success) {
        setOptimizeResult({ success: true, message: `分析完成！生成了 ${data.proposals?.length || 0} 条优化建议` });
        await loadOptimizeProposals();
      } else {
        setOptimizeResult({ success: false, message: data.error || "分析失败" });
      }
    } catch {
      setOptimizeResult({ success: false, message: "网络错误，请重试" });
    } finally {
      setOptimizing(false);
    }
  };

  const handleApplyOptimization = async (proposalId: string) => {
    setApplyingOptimize(proposalId);
    try {
      const res = await fetch("/api/agents/optimize/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId, teamId, proposalIds: [proposalId] }),
      });
      const data = await res.json();
      if (data.success) {
        setOptimizeResult({ success: true, message: "优化已应用！" });
        await loadOptimizeProposals();
        loadProfile();
      } else {
        setOptimizeResult({ success: false, message: data.error || "应用失败" });
      }
    } catch {
      setOptimizeResult({ success: false, message: "网络错误，请重试" });
    } finally {
      setApplyingOptimize(null);
    }
  };
  const handleRejectOptimization = async (proposalId: string) => {
    const reason = window.prompt("请输入驳回理由（可选）：");
    setApplyingOptimize(proposalId);
    try {
      const res = await fetch("/api/agents/optimize/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId, teamId, proposalIds: [proposalId], action: "reject", reviewComment: reason || undefined }),
      });
      const data = await res.json();
      if (data.success) {
        setOptimizeResult({ success: true, message: "已驳回" });
        await loadOptimizeProposals();
      } else {
        setOptimizeResult({ success: false, message: data.error || "操作失败" });
      }
    } catch {
      setOptimizeResult({ success: false, message: "网络错误，请重试" });
    } finally {
      setApplyingOptimize(null);
    }
  };
  if (loading) {
    return (
      <div className="p-6 space-y-6 max-w-5xl mx-auto">
        <div className="flex items-center gap-4 mb-6">
          <Skeleton className="w-10 h-10 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="w-32 h-5" />
            <Skeleton className="w-20 h-3" />
          </div>
        </div>
        <div className="grid grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3">
        <AlertCircle className="w-10 h-10 text-destructive" />
        <p className="text-sm text-destructive">{error || "加载失败"}</p>
        <Button variant="outline" onClick={loadProfile}>重新加载</Button>
      </div>
    );
  }

  const { identity: agent, scores, statistics, trend, recentFeedbacks, trainingHistory, skills, taskRecords } = profile;

  const statusInfo = agent.status === "disabled"
    ? { label: "已停用", color: "bg-muted text-muted-foreground" }
    : skills.length < 2
      ? { label: "待培训", color: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" }
      : { label: "活跃", color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" };

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-5xl mx-auto p-6 space-y-6">
        {/* ============ 顶部导航 ============ */}
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <button onClick={() => router.push("/members")} className="hover:text-foreground transition-colors">
            数字成员
          </button>
          <ChevronRight className="w-3 h-3" />
          <span className="text-foreground font-medium">{agent.name}</span>
        </div>

        {/* ============ 头部信息卡片 ============ */}
        <Card className="p-6">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-5">
              <Avatar className="w-16 h-16 rounded-xl">
                <AvatarImage src={agent.avatar} />
                <AvatarFallback className="rounded-xl bg-primary/10 text-primary text-lg font-bold">
                  {agent.name.slice(0, 2)}
                </AvatarFallback>
              </Avatar>
              <div>
                <div className="flex items-center gap-3 mb-1.5">
                  <h1 className="text-xl font-bold text-foreground">{agent.name}</h1>
                  <LevelBadge level={scores.level} score={scores.overall} />
                </div>
                <div className="flex items-center gap-3 text-sm">
                  {agent.position && (
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      <BriefcaseIcon className="w-3.5 h-3.5" />
                      {agent.position.name}
                    </span>
                  )}
                  <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-medium", statusInfo.color)}>
                    {statusInfo.label}
                  </span>
                  <span className="text-muted-foreground text-xs">
                    创建于 {new Date(agent.createdAt).toLocaleDateString("zh-CN")}
                  </span>
                </div>
                {agent.description && (
                  <p className="text-sm text-muted-foreground mt-2">{agent.description}</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => { setShowOptimizePanel(true); }}
              >
                <Sliders className="w-3.5 h-3.5 mr-1.5" />
                优化智能体
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => { setShowSkillPanel(true); }}
              >
                <Sparkles className="w-3.5 h-3.5 mr-1.5" />
                生成技能
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => router.push(`/dms?chatWithAgent=${agent.id}`)}
              >
                <MessageCircle className="w-3.5 h-3.5 mr-1.5" />
                对话
              </Button>
            </div>
          </div>
        </Card>

        {/* ============ 角色身份卡片 ============ */}
        {agent.roleIdentity && (
          <Card className="p-5 border-l-4 border-l-primary/60">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <h3 className="text-sm font-semibold flex items-center gap-2 mb-2">
                  <User className="w-4 h-4 text-primary" />
                  角色身份（Role Identity）
                </h3>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">
                  {agent.roleIdentity}
                </p>
              </div>
              <Button variant="ghost" size="sm" className="shrink-0 ml-4" onClick={() => {/* 编辑身份 */}}>
                <Pencil className="w-3.5 h-3.5 mr-1" />
                编辑
              </Button>
            </div>
          </Card>
        )}

        {/* ============ 权限边界卡片 ============ */}
        <Card className="p-5">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <h3 className="text-sm font-semibold flex items-center gap-2 mb-2">
                <Shield className="w-4 h-4 text-primary" />
                权限边界（Boundaries）
              </h3>
              <div className="flex flex-wrap gap-3">
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 text-xs font-medium">
                  <Check className="w-3 h-3" />
                  查询数据
                </span>
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 text-xs font-medium">
                  <Check className="w-3 h-3" />
                  生成报表
                </span>
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400 text-xs font-medium">
                  <X className="w-3 h-3" />
                  修改数据库
                </span>
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 text-xs font-medium">
                  <AlertTriangle className="w-3 h-3" />
                  导出需审批
                </span>
              </div>
              <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                  Prompt注入检测 · 已开启
                </span>
                <span className="flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                  工具审批 · 自动审批
                </span>
              </div>
            </div>
          </div>
        </Card>

        {/* ============ 统计卡片 ============ */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            icon={<Activity className="w-4 h-4" />}
            label="总任务数"
            value={statistics.totalTasks.toString()}
            sub={`完成 ${statistics.completedTasks}`}
            color="text-blue-500"
          />
          <StatCard
            icon={<TrendingUp className="w-4 h-4" />}
            label="成功率"
            value={`${statistics.successRate}%`}
            sub={`${statistics.totalTasks} 次处理`}
            color="text-emerald-500"
          />
          <StatCard
            icon={<Star className="w-4 h-4" />}
            label="用户评分"
            value={statistics.avgRating > 0 ? statistics.avgRating.toFixed(1) : "-"}
            sub={`${statistics.feedbackCount} 条评价`}
            color="text-amber-500"
          />
          <StatCard
            icon={<Clock className="w-4 h-4" />}
            label="平均响应"
            value={statistics.avgDurationMs > 0 ? `${(statistics.avgDurationMs / 1000).toFixed(1)}s` : "-"}
            sub="处理时长"
            color="text-purple-500"
          />
        </div>

        {/* ============ 主内容 Tab ============ */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid grid-cols-6 w-full max-w-2xl">
            <TabsTrigger value="overview">能力概览</TabsTrigger>
            <TabsTrigger value="growth">成长曲线</TabsTrigger>
            <TabsTrigger value="feedback">用户评价</TabsTrigger>
            <TabsTrigger value="training">培训记录</TabsTrigger>
            <TabsTrigger value="archive">成长档案</TabsTrigger>
            <TabsTrigger value="preferences" className="relative">
              用户偏好
              <span className="absolute -top-1 -right-1 w-2 h-2 bg-primary rounded-full" />
            </TabsTrigger>
          </TabsList>

          {/* ===== Tab 1: 能力概览 ===== */}
          <TabsContent value="overview" className="mt-4 space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* 能力雷达图 */}
              <Card className="p-5">
                <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
                  <Gauge className="w-4 h-4 text-primary" />
                  能力雷达图
                </h3>
                <div className="flex justify-center">
                  <RadarChart dimensions={scores.dimensions} />
                </div>
                <div className="mt-3 space-y-1.5">
                  {[
                    { key: "completionRate", label: "任务完成率", val: scores.dimensions.completionRate },
                    { key: "satisfaction", label: "用户满意度", val: scores.dimensions.satisfaction },
                    { key: "speed", label: "响应速度", val: scores.dimensions.speed },
                    { key: "skillMastery", label: "技能掌握度", val: scores.dimensions.skillMastery },
                    { key: "knowledge", label: "知识覆盖度", val: scores.dimensions.knowledge },
                  ].map(d => (
                    <div key={d.key} className="flex items-center gap-2 text-xs">
                      <span className="w-20 text-muted-foreground shrink-0">{d.label}</span>
                      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary rounded-full transition-all"
                          style={{ width: `${d.val}%` }}
                        />
                      </div>
                      <span className="w-8 text-right font-medium text-foreground">{d.val}</span>
                    </div>
                  ))}
                </div>
              </Card>

              {/* 能力详情 */}
              <Card className="p-5">
                <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
                  <Brain className="w-4 h-4 text-primary" />
                  能力评估
                </h3>
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                    <div>
                      <p className="text-sm font-medium text-foreground">综合能力评分</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        基于 {statistics.totalTasks} 次任务处理
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-bold text-primary">{scores.overall}</p>
                      <p className="text-xs text-muted-foreground">/ 100</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 rounded-lg bg-muted/30">
                      <p className="text-xs text-muted-foreground">关联技能</p>
                      <p className="text-lg font-bold text-foreground mt-1">{statistics.skillsCount}</p>
                    </div>
                    <div className="p-3 rounded-lg bg-muted/30">
                      <p className="text-xs text-muted-foreground">关联工具</p>
                      <p className="text-lg font-bold text-foreground mt-1">{statistics.toolsCount}</p>
                    </div>
                    <div className="p-3 rounded-lg bg-muted/30">
                      <p className="text-xs text-muted-foreground">知识库</p>
                      <p className="text-lg font-bold text-foreground mt-1">{statistics.knowledgeCount}</p>
                    </div>
                    <div className="p-3 rounded-lg bg-muted/30">
                      <p className="text-xs text-muted-foreground">培训记录</p>
                      <p className="text-lg font-bold text-foreground mt-1">{trainingHistory.length}</p>
                    </div>
                  </div>

                  {/* 关联技能列表 */}
                  {skills.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-2">掌握的技能</p>
                      <div className="flex flex-wrap gap-1.5">
                        {skills.map(s => (
                          <Badge key={s.id} variant="secondary" className="text-[10px]">
                            <BookOpen className="w-3 h-3 mr-1" />
                            {s.name}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </Card>
            </div>

            {/* 智能体协作关系 */}
            <CollaborationSection agentId={agentId} teamId={teamId} />
          </TabsContent>

          {/* ===== Tab 2: 成长曲线 ===== */}
          <TabsContent value="growth" className="mt-4 space-y-4">
            <Card className="p-5">
              <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
                <LineChart className="w-4 h-4 text-primary" />
                近30天成长趋势
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                <TrendChart data={trend.daily} dataKey="tasks" color="hsl(var(--primary))" label="每日任务数" />
                <TrendChart data={trend.daily} dataKey="successRate" color="#22c55e" label="成功率" />
                <TrendChart data={trend.daily} dataKey="avgRating" color="#f59e0b" label="平均评分" />
              </div>
            </Card>

            {/* 成长等级说明 */}
            <Card className="p-5">
              <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
                <GraduationCap className="w-4 h-4 text-primary" />
                成长等级体系
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {[
                  { name: "见习", range: "0-19分", desc: "初始状态，需要基础培训", color: "text-gray-400" },
                  { name: "初级", range: "20-39分", desc: "具备基础任务处理能力", color: "text-gray-500" },
                  { name: "中级", range: "40-59分", desc: "能独立完成常规任务", color: "text-emerald-500" },
                  { name: "高级", range: "60-74分", desc: "高效处理复杂任务", color: "text-blue-500" },
                  { name: "专家", range: "75-89分", desc: "领域内专家级表现", color: "text-amber-500" },
                  { name: "首席", range: "90-100分", desc: "行业顶尖水平", color: "text-purple-500" },
                ].map(l => (
                  <div
                    key={l.name}
                    className={cn(
                      "p-3 rounded-lg border text-center",
                      l.name === scores.level.name
                        ? "border-primary/50 bg-primary/5"
                        : "border-border bg-card"
                    )}
                  >
                    <p className={cn("text-sm font-bold", l.color)}>{l.name}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{l.range}</p>
                    <p className="text-[10px] text-muted-foreground mt-1">{l.desc}</p>
                  </div>
                ))}
              </div>
            </Card>
          </TabsContent>

          {/* ===== Tab 3: 用户评价 ===== */}
          <TabsContent value="feedback" className="mt-4 space-y-4">
            {recentFeedbacks.length === 0 ? (
              <Card className="p-12 text-center">
                <Star className="w-8 h-8 mx-auto text-muted-foreground/50 mb-3" />
                <p className="text-sm text-muted-foreground">暂无用户评价</p>
                <p className="text-xs text-muted-foreground/60 mt-1">在对话中点赞或评价后，评价将显示在这里</p>
              </Card>
            ) : (
              <div className="space-y-3">
                {recentFeedbacks.map((f, i) => (
                  <Card key={i} className="p-4">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Avatar className="w-6 h-6">
                          <AvatarImage src={f.user?.avatar} />
                          <AvatarFallback className="text-[8px]">
                            {f.user?.name?.slice(0, 2) || "U"}
                          </AvatarFallback>
                        </Avatar>
                        <span className="text-sm font-medium text-foreground">{f.user?.name || "匿名用户"}</span>
                        <StarRating rating={f.rating} size="xs" />
                      </div>
                      <span className="text-[10px] text-muted-foreground">{formatTime(f.createdAt)}</span>
                    </div>
                    {f.comment && <p className="text-sm text-foreground mb-2">{f.comment}</p>}
                    {f.correction && (
                      <div className="p-2 rounded bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                        <p className="text-[10px] text-amber-600 dark:text-amber-400 font-medium mb-0.5">需要改进：</p>
                        <p className="text-xs text-muted-foreground">{f.correction}</p>
                      </div>
                    )}
                    {(() => {
                      const tags = Array.isArray(f.tags) ? f.tags : (typeof f.tags === 'string' ? [f.tags] : []);
                      return tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {tags.map((t, ti) => (
                            <Badge key={ti} variant="outline" className="text-[9px] px-1.5 py-0">{t}</Badge>
                          ))}
                        </div>
                      );
                    })()}
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* ===== Tab 4: 培训记录 ===== */}
          <TabsContent value="training" className="mt-4 space-y-4">
            {/* 投喂工作记录表单 */}
            <Card className="p-4 border-dashed">
              <button
                onClick={() => { setShowWorkForm(!showWorkForm); setSubmitResult(null); }}
                className="w-full flex items-center justify-between text-sm font-medium text-foreground hover:text-primary transition-colors"
              >
                <div className="flex items-center gap-2">
                  <BriefcaseIcon className="w-4 h-4" />
                  <span>投喂工作记录</span>
                  <span className="text-[10px] text-muted-foreground font-normal">
                    让智能体学习同岗位员工的真实工作过程
                  </span>
                </div>
                {showWorkForm ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>

              {showWorkForm && (
                <div className="mt-4 space-y-3">
                  <Input
                    placeholder="工作标题（可选）如：处理客户投诉流程"
                    value={workTitle}
                    onChange={e => setWorkTitle(e.target.value)}
                    className="text-sm"
                  />
                  <Textarea
                    placeholder="粘贴工作内容、过程或成果...&#10;例如：接到客户投诉后，先安抚情绪→记录问题→查询工单→给出解决方案→跟进反馈"
                    value={workContent}
                    onChange={e => setWorkContent(e.target.value)}
                    rows={5}
                    className="text-sm resize-none"
                  />
                  <div className="flex items-center justify-between">
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs gap-1.5"
                      disabled
                    >
                      <Upload className="w-3 h-3" />
                      上传附件（即将支持）
                    </Button>
                    <div className="flex items-center gap-2">
                      {submitResult && (
                        <span className={cn(
                          "text-xs",
                          submitResult.success ? "text-emerald-500" : "text-red-500"
                        )}>
                          {submitResult.message}
                        </span>
                      )}
                      <Button
                        size="sm"
                        onClick={handleSubmitWork}
                        disabled={!workContent.trim() || submittingWork}
                        className="text-xs gap-1.5"
                      >
                        {submittingWork ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <Send className="w-3 h-3" />
                        )}
                        {submittingWork ? "分析中..." : "提交投喂"}
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </Card>

            {/* 培训历史记录 */}
            {trainingHistory.length === 0 ? (
              <Card className="p-12 text-center">
                <GraduationCap className="w-8 h-8 mx-auto text-muted-foreground/50 mb-3" />
                <p className="text-sm text-muted-foreground">暂无培训记录</p>
                <p className="text-xs text-muted-foreground/60 mt-1">用户反馈修正或工作投喂后，记录将显示在这里</p>
              </Card>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-xs text-muted-foreground">共 {trainingHistory.length} 条记录</span>
                </div>
                <div className="relative">
                  <div className="absolute left-4 top-0 bottom-0 w-px bg-border" />
                  <div className="space-y-4">
                    {trainingHistory.map((t, i) => {
                      // 解析 content JSON（work_submission 类型）
                      let parsedContent: { analysis?: { summary?: string; workflow?: string[]; methodology?: string; tags?: string[] }; skillSuggestions?: string } | null = null;
                      let displayContent = t.content;
                      if (t.type === "work_submission") {
                        try { parsedContent = JSON.parse(t.content); } catch { parsedContent = null; }
                        displayContent = parsedContent?.analysis?.summary || t.content;
                      }

                      return (
                        <div key={i} className="relative pl-10">
                          <div className={cn(
                            "absolute left-2.5 w-[9px] h-[9px] rounded-full border-2 border-background mt-1.5",
                            t.type === "feedback" ? "bg-amber-500" :
                            t.type === "knowledge" ? "bg-blue-500" :
                            t.type === "skill" ? "bg-emerald-500" :
                            t.type === "work_submission" ? "bg-green-500" : "bg-muted-foreground"
                          )} />
                          <Card className="p-3">
                            <div className="flex items-center justify-between mb-1">
                              <div className="flex items-center gap-2">
                                {t.type === "feedback" ? (
                                  <ThumbsDown className="w-3 h-3 text-amber-500" />
                                ) : t.type === "knowledge" ? (
                                  <Database className="w-3 h-3 text-blue-500" />
                                ) : t.type === "skill" ? (
                                  <BookOpen className="w-3 h-3 text-emerald-500" />
                                ) : t.type === "work_submission" ? (
                                  <BriefcaseIcon className="w-3 h-3 text-green-500" />
                                ) : (
                                  <Zap className="w-3 h-3 text-muted-foreground" />
                                )}
                                <span className="text-xs font-medium text-foreground">
                                  {t.type === "feedback" ? "用户反馈修正" :
                                   t.type === "knowledge" ? "知识投喂" :
                                   t.type === "skill" ? "技能更新" :
                                   t.type === "work_submission" ? "工作投喂" : "系统培训"}
                                </span>
                                {parsedContent?.analysis?.tags && parsedContent.analysis.tags.length > 0 && (
                                  <div className="flex gap-1">
                                    {parsedContent.analysis.tags.map((tag, ti) => (
                                      <Badge key={ti} variant="outline" className="text-[9px] px-1 py-0">{tag}</Badge>
                                    ))}
                                  </div>
                                )}
                              </div>
                              <span className="text-[10px] text-muted-foreground">{formatTime(t.createdAt)}</span>
                            </div>
                            <p className="text-xs text-muted-foreground line-clamp-2">{displayContent}</p>
                            {parsedContent?.analysis?.workflow && parsedContent.analysis.workflow.length > 0 && (
                              <div className="mt-1.5 flex flex-wrap gap-1">
                                {parsedContent.analysis.workflow.map((step, si) => (
                                  <span key={si} className="text-[9px] text-muted-foreground/70 bg-muted px-1.5 py-0.5 rounded">
                                    {si + 1}. {step}
                                  </span>
                                ))}
                              </div>
                            )}
                            {parsedContent?.skillSuggestions && (
                              <div className="mt-1.5 p-1.5 rounded bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800">
                                <p className="text-[9px] text-emerald-600 dark:text-emerald-400 font-medium">技能改进建议：</p>
                                <p className="text-[10px] text-muted-foreground">{parsedContent.skillSuggestions}</p>
                              </div>
                            )}
                            <span className="text-[9px] text-muted-foreground/60 mt-1 block">
                              来源: {t.sourceType || "系统"}
                            </span>
                          </Card>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </TabsContent>

          {/* ===== Tab 5: 成长档案（任务记录） ===== */}
          <TabsContent value="archive" className="mt-4 space-y-4">
            <GrowthArchiveTab
              agentId={agent.id}
              teamId={teamId}
              initialRecords={taskRecords}
              statistics={statistics}
            />
          </TabsContent>

          {/* ===== Tab 6: 用户偏好 ===== */}
          <TabsContent value="preferences" className="mt-4 space-y-4">
            <UserPreferencesTab agentId={agent.id} teamId={teamId} />
          </TabsContent>
        </Tabs>
      </div>

      {/* ============ 技能生成面板（Sheet） ============ */}
      <Sheet open={showSkillPanel} onOpenChange={setShowSkillPanel}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
          <SheetHeader className="mb-6">
            <SheetTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-primary" />
              从真实数据生成技能
            </SheetTitle>
            <SheetDescription>
              智能体将分析培训记录、用户反馈和知识库数据，自动生成技能更新建议
            </SheetDescription>
          </SheetHeader>

          <div className="space-y-6">
            {/* 数据源说明 */}
            <Card className="p-4 bg-muted/30">
              <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                <FileText className="w-4 h-4 text-primary" />
                分析数据源
              </h4>
              <div className="grid grid-cols-3 gap-3 text-xs">
                <div className="flex items-center gap-2 p-2 bg-background rounded-lg">
                  <GraduationCap className="w-3.5 h-3.5 text-blue-500" />
                  <span>培训记录 <span className="text-muted-foreground">({trainingHistory.length}条)</span></span>
                </div>
                <div className="flex items-center gap-2 p-2 bg-background rounded-lg">
                  <ThumbsUp className="w-3.5 h-3.5 text-amber-500" />
                  <span>用户反馈 <span className="text-muted-foreground">({recentFeedbacks.length}条)</span></span>
                </div>
                <div className="flex items-center gap-2 p-2 bg-background rounded-lg">
                  <Database className="w-3.5 h-3.5 text-emerald-500" />
                  <span>知识库 <span className="text-muted-foreground">({skills.length}关联)</span></span>
                </div>
              </div>
            </Card>

            {/* 操作按钮 */}
            <div className="flex items-center gap-3">
              <Button
                onClick={handleGenerateProposal}
                disabled={generatingProposal}
                className="gap-2"
              >
                {generatingProposal ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Sparkles className="w-4 h-4" />
                )}
                {generatingProposal ? "AI 分析中..." : "开始分析生成"}
              </Button>
              {proposalResult && (
                <span className={cn("text-xs", proposalResult.success ? "text-emerald-500" : "text-red-500")}>
                  {proposalResult.message}
                </span>
              )}
            </div>

            {/* 已有建议列表 */}
            <div>
              <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                <Lightbulb className="w-4 h-4 text-amber-500" />
                技能建议 {proposals.length > 0 ? `(${proposals.length})` : ""}
              </h4>
              {proposalsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
              ) : proposals.length === 0 ? (
                <Card className="p-8 text-center">
                  <Lightbulb className="w-8 h-8 mx-auto text-muted-foreground/50 mb-3" />
                  <p className="text-sm text-muted-foreground">暂无技能建议</p>
                  <p className="text-xs text-muted-foreground/60 mt-1">点击"开始分析生成"从数据中提炼技能</p>
                </Card>
              ) : (
                <div className="space-y-3">
                  {proposals.map((proposal) => {
                    const evidence = proposal.evidence ? (typeof proposal.evidence === "string" ? JSON.parse(proposal.evidence) : proposal.evidence) : [];
                    const dataSources = proposal.data_sources ? (typeof proposal.data_sources === "string" ? JSON.parse(proposal.data_sources) : proposal.data_sources) : null;
                    return (
                      <Card key={proposal.id} className={cn(
                        "p-4 border-l-4",
                        proposal.status === "pending" ? "border-l-amber-400" :
                        proposal.status === "approved" ? "border-l-emerald-400" :
                        "border-l-muted"
                      )}>
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex items-center gap-2">
                            {proposal.action === "create_skill" ? (
                              <Sparkles className="w-4 h-4 text-blue-500" />
                            ) : (
                              <FileText className="w-4 h-4 text-amber-500" />
                            )}
                            <span className="font-medium text-sm">{proposal.title}</span>
                            <span className={cn(
                              "text-[10px] px-1.5 py-0.5 rounded-full",
                              proposal.confidence === "high" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" :
                              proposal.confidence === "medium" ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" :
                              "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                            )}>
                              {proposal.confidence === "high" ? "高可信" : proposal.confidence === "medium" ? "中可信" : "低可信"}
                            </span>
                            <span className={cn(
                              "text-[10px] px-1.5 py-0.5 rounded-full",
                              proposal.status === "pending" ? "bg-amber-100 text-amber-700" :
                              proposal.status === "approved" ? "bg-emerald-100 text-emerald-700" :
                              "bg-muted text-muted-foreground"
                            )}>
                              {proposal.status === "pending" ? "待审核" : proposal.status === "approved" ? "已批准" : "已驳回"}
                            </span>
                          </div>
                        </div>

                        {proposal.reason && (
                          <p className="text-xs text-muted-foreground mb-2">{proposal.reason}</p>
                        )}

                        {/* 数据源统计 */}
                        {dataSources && (
                          <div className="flex flex-wrap gap-2 mb-2">
                            {dataSources.trainingCount > 0 && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                                培训记录 ×{dataSources.trainingCount}
                              </span>
                            )}
                            {dataSources.feedbackCount > 0 && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                                用户反馈 ×{dataSources.feedbackCount}
                              </span>
                            )}
                            {dataSources.knowledgeCount > 0 && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                                知识库 ×{dataSources.knowledgeCount}
                              </span>
                            )}
                          </div>
                        )}

                        {/* 新旧对比预览 */}
                        {proposal.new_content && (
                          <Card className="p-3 bg-muted/30 mb-3">
                            <div className="flex items-center gap-2 mb-2">
                              <FileText className="w-3 h-3 text-primary" />
                              <span className="text-xs font-medium">技能内容预览</span>
                            </div>
                            <pre className="text-xs text-muted-foreground whitespace-pre-wrap line-clamp-6">{proposal.new_content}</pre>
                          </Card>
                        )}

                        {/* 证据引用 */}
                        {evidence.length > 0 && (
                          <div className="mb-3">
                            <span className="text-[10px] text-muted-foreground font-medium">引用来源：</span>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {evidence.slice(0, 5).map((e: string, i: number) => (
                                <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                                  #{e.slice(0, 8)}
                                </span>
                              ))}
                              {evidence.length > 5 && (
                                <span className="text-[10px] text-muted-foreground">+{evidence.length - 5}更多</span>
                              )}
                            </div>
                          </div>
                        )}

                        {/* 操作按钮 */}
                        {proposal.status === "pending" && (
                          <div className="flex items-center gap-2 pt-2 border-t">
                            <Button
                              size="sm"
                              variant="default"
                              className="h-7 text-xs gap-1"
                              onClick={() => handleApproveProposal(proposal.id)}
                              disabled={reviewingId === proposal.id}
                            >
                              {reviewingId === proposal.id ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                <CheckCircle2 className="w-3 h-3" />
                              )}
                              批准
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs gap-1"
                              onClick={() => handleRejectProposal(proposal.id)}
                              disabled={reviewingId === proposal.id}
                            >
                              <XCircle className="w-3 h-3" />
                              驳回
                            </Button>
                          </div>
                        )}
                      </Card>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* ==================== 优化智能体面板 ==================== */}
      <Sheet open={showOptimizePanel} onOpenChange={setShowOptimizePanel}>
        <SheetContent className="w-[600px] sm:max-w-[600px] overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Sliders className="w-5 h-5 text-primary" />
              优化智能体
            </SheetTitle>
            <SheetDescription>
              AI 分析培训记录、用户反馈、执行记录等数据，为智能体提出多维度优化建议
            </SheetDescription>
          </SheetHeader>

          <div className="space-y-6 py-4">
            {/* 数据源统计 */}
            <div className="grid grid-cols-3 gap-3">
              <Card className="p-3 text-center">
                <FileText className="w-4 h-4 mx-auto text-blue-500 mb-1" />
                <p className="text-lg font-bold">{profile?.trainingHistory?.length || 0}</p>
                <p className="text-[10px] text-muted-foreground">培训记录</p>
              </Card>
              <Card className="p-3 text-center">
                <MessageSquare className="w-4 h-4 mx-auto text-amber-500 mb-1" />
                <p className="text-lg font-bold">{profile?.recentFeedbacks?.length || 0}</p>
                <p className="text-[10px] text-muted-foreground">用户反馈</p>
              </Card>
              <Card className="p-3 text-center">
                <Database className="w-4 h-4 mx-auto text-emerald-500 mb-1" />
                <p className="text-lg font-bold">{profile?.statistics?.knowledgeCount || 0}</p>
                <p className="text-[10px] text-muted-foreground">知识库</p>
              </Card>
            </div>

            {/* 分析按钮 */}
            <div className="flex items-center gap-3">
              <Button
                onClick={handleGenerateOptimization}
                disabled={optimizing}
                className="gap-2"
              >
                {optimizing ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Settings2 className="w-4 h-4" />
                )}
                {optimizing ? "AI 深度分析中..." : "开始深度分析"}
              </Button>
              {optimizeResult && (
                <span className={cn("text-xs", optimizeResult.success ? "text-emerald-500" : "text-red-500")}>
                  {optimizeResult.message}
                </span>
              )}
            </div>

            {/* 优化建议列表 */}
            <div>
              <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                <Sliders className="w-4 h-4 text-primary" />
                优化建议 {optimizeProposals.length > 0 ? `(${optimizeProposals.length})` : ""}
              </h4>
              {optimizeLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
              ) : optimizeProposals.length === 0 ? (
                <Card className="p-8 text-center">
                  <Settings2 className="w-8 h-8 mx-auto text-muted-foreground/50 mb-3" />
                  <p className="text-sm text-muted-foreground">暂无优化建议</p>
                  <p className="text-xs text-muted-foreground/60 mt-1">点击"开始深度分析"获取优化建议</p>
                </Card>
              ) : (
                <div className="space-y-3">
                  {optimizeProposals.map((proposal) => {
                    const evidence = proposal.evidence ? (typeof proposal.evidence === "string" ? JSON.parse(proposal.evidence) : proposal.evidence) : [];
                    return (
                      <Card key={proposal.id} className={cn(
                        "p-4 border-l-4",
                        proposal.status === "pending" ? "border-l-primary" :
                        proposal.status === "approved" ? "border-l-emerald-400" :
                        "border-l-muted"
                      )}>
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span className={cn(
                              "text-[10px] px-1.5 py-0.5 rounded-full",
                              proposal.optimize_type === "prompt" ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" :
                              proposal.optimize_type === "model" ? "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400" :
                              proposal.optimize_type === "rag" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" :
                              "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                            )}>
                              {proposal.optimize_type === "prompt" ? "Prompt" :
                               proposal.optimize_type === "model" ? "模型配置" :
                               proposal.optimize_type === "rag" ? "知识库" :
                               proposal.optimize_type === "memory" ? "记忆" :
                               proposal.optimize_type === "greeting" ? "开场白" :
                               proposal.optimize_type === "context" ? "上下文" : proposal.optimize_type}
                            </span>
                            <span className="font-medium text-sm">{proposal.field_name}</span>
                            <span className={cn(
                              "text-[10px] px-1.5 py-0.5 rounded-full",
                              proposal.confidence === "high" ? "bg-emerald-100 text-emerald-700" :
                              proposal.confidence === "medium" ? "bg-amber-100 text-amber-700" :
                              "bg-red-100 text-red-700"
                            )}>
                              {proposal.confidence === "high" ? "高可信" : proposal.confidence === "medium" ? "中可信" : "低可信"}
                            </span>
                            <span className={cn(
                              "text-[10px] px-1.5 py-0.5 rounded-full",
                              proposal.status === "pending" ? "bg-amber-100 text-amber-700" :
                              proposal.status === "approved" ? "bg-emerald-100 text-emerald-700" :
                              "bg-muted text-muted-foreground"
                            )}>
                              {proposal.status === "pending" ? "待审核" : proposal.status === "approved" ? "已批准" : "已驳回"}
                            </span>
                          </div>
                        </div>

                        <p className="text-xs text-muted-foreground mb-2">{proposal.reason}</p>

                        {/* 新旧对比 */}
                        <Card className="p-3 bg-muted/30 mb-3">
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <p className="text-[10px] font-medium text-muted-foreground mb-1">当前值</p>
                              <pre className="text-xs text-muted-foreground/80 whitespace-pre-wrap line-clamp-4 bg-background/50 p-2 rounded">{proposal.old_value || "（空）"}</pre>
                            </div>
                            <div>
                              <p className="text-[10px] font-medium text-emerald-600 mb-1">建议值</p>
                              <pre className="text-xs text-emerald-700 dark:text-emerald-400 whitespace-pre-wrap line-clamp-4 bg-emerald-50 dark:bg-emerald-950/30 p-2 rounded">{proposal.new_value}</pre>
                            </div>
                          </div>
                        </Card>

                        {/* 证据引用 */}
                        {evidence.length > 0 && (
                          <div className="mb-3">
                            <span className="text-[10px] text-muted-foreground font-medium">分析依据：</span>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {evidence.slice(0, 3).map((e: string, i: number) => (
                                <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{e}</span>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* 操作按钮 */}
                        {proposal.status === "pending" && (
                          <div className="flex items-center gap-2 pt-2 border-t">
                            <Button
                              size="sm"
                              variant="default"
                              className="h-7 text-xs gap-1"
                              onClick={() => handleApplyOptimization(proposal.id)}
                              disabled={applyingOptimize === proposal.id}
                            >
                              {applyingOptimize === proposal.id ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                <CheckCircle2 className="w-3 h-3" />
                              )}
                              应用
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs gap-1"
                              onClick={() => handleRejectOptimization(proposal.id)}
                              disabled={applyingOptimize === proposal.id}
                            >
                              <XCircle className="w-3 h-3" />
                              忽略
                            </Button>
                          </div>
                        )}
                      </Card>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

// ==================== 统计卡片子组件 ====================
function StatCard({ icon, label, value, sub, color }: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
  color: string;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className={color}>{icon}</span>
      </div>
      <p className="text-xl font-bold text-foreground">{value}</p>
      <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>
    </Card>
  );
}

// ==================== 成长档案 Tab 组件 ====================
function GrowthArchiveTab({ agentId, teamId, initialRecords, statistics }: {
  agentId: string;
  teamId: string;
  initialRecords: ProfileData["taskRecords"];
  statistics: ProfileData["statistics"];
}) {
  const [records, setRecords] = useState(initialRecords || []);
  const [filterType, setFilterType] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(0);
  const pageSize = 10;

  const taskTypeLabels: Record<string, string> = {
    chat: "对话",
    workflow: "工作流",
    skill: "技能执行",
    tool: "工具调用",
    schedule: "定时任务",
    notify: "通知推送",
    channel: "频道回复",
  };

  const taskTypeColors: Record<string, string> = {
    chat: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    workflow: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
    skill: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
    tool: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
    schedule: "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400",
    notify: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400",
    channel: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400",
  };

  const statusConfig: Record<string, { label: string; color: string }> = {
    success: { label: "成功", color: "text-emerald-500" },
    failed: { label: "失败", color: "text-red-500" },
    running: { label: "执行中", color: "text-blue-500" },
    pending: { label: "等待中", color: "text-amber-500" },
  };

  // 过滤和搜索
  const filtered = records.filter(r => {
    if (filterType !== "all" && r.taskType !== filterType) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (r.inputSummary?.toLowerCase().includes(q) || false) ||
             (r.outputSummary?.toLowerCase().includes(q) || false);
    }
    return true;
  });

  const totalPages = Math.ceil(filtered.length / pageSize);
  const paged = filtered.slice(page * pageSize, (page + 1) * pageSize);

  // 统计
  const typeCounts: Record<string, number> = {};
  records.forEach(r => {
    typeCounts[r.taskType] = (typeCounts[r.taskType] || 0) + 1;
  });

  const successCount = records.filter(r => r.status === "success").length;
  const ratedCount = records.filter(r => r.rating !== null).length;
  const avgRating = ratedCount > 0
    ? (records.filter(r => r.rating !== null).reduce((s, r) => s + (r.rating || 0), 0) / ratedCount)
    : 0;

  return (
    <div className="space-y-4">
      {/* 统计卡片 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-3">
          <p className="text-[10px] text-muted-foreground">总任务数</p>
          <p className="text-lg font-bold text-foreground mt-0.5">{records.length}</p>
        </Card>
        <Card className="p-3">
          <p className="text-[10px] text-muted-foreground">成功率</p>
          <p className="text-lg font-bold text-emerald-500 mt-0.5">
            {records.length > 0 ? Math.round((successCount / records.length) * 100) : 0}%
          </p>
        </Card>
        <Card className="p-3">
          <p className="text-[10px] text-muted-foreground">平均评分</p>
          <p className="text-lg font-bold text-amber-500 mt-0.5">
            {avgRating > 0 ? avgRating.toFixed(1) : "-"}
          </p>
        </Card>
        <Card className="p-3">
          <p className="text-[10px] text-muted-foreground">任务类型</p>
          <p className="text-lg font-bold text-foreground mt-0.5">{Object.keys(typeCounts).length}</p>
        </Card>
      </div>

      {/* 任务类型分布 */}
      <div className="flex flex-wrap gap-1.5">
        {Object.entries(typeCounts).map(([type, count]) => (
          <Badge
            key={type}
            variant="secondary"
            className={cn(
              "text-[10px] cursor-pointer transition-colors",
              filterType === type ? "ring-1 ring-primary" : "",
              taskTypeColors[type] || ""
            )}
            onClick={() => setFilterType(filterType === type ? "all" : type)}
          >
            {taskTypeLabels[type] || type}
            <span className="ml-1 opacity-60">{count}</span>
          </Badge>
        ))}
        {filterType !== "all" && (
          <button
            className="text-[10px] text-muted-foreground hover:text-foreground underline"
            onClick={() => setFilterType("all")}
          >
            清除筛选
          </button>
        )}
      </div>

      {/* 搜索框 */}
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
        <Input
          placeholder="搜索任务内容..."
          value={searchQuery}
          onChange={e => { setSearchQuery(e.target.value); setPage(0); }}
          className="pl-8 h-8 text-xs"
        />
      </div>

      {/* 任务记录列表 */}
      {paged.length === 0 ? (
        <Card className="p-12 text-center">
          <ListOrdered className="w-8 h-8 mx-auto text-muted-foreground/50 mb-3" />
          <p className="text-sm text-muted-foreground">暂无任务记录</p>
          <p className="text-xs text-muted-foreground/60 mt-1">智能体开始工作后，任务记录将自动归档到这里</p>
        </Card>
      ) : (
        <div className="space-y-2">
          {paged.map((record) => {
            const statusInfo = statusConfig[record.status] || { label: record.status, color: "text-muted-foreground" };
            return (
              <Card key={record.id} className="p-3 hover:bg-muted/30 transition-colors">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    {/* 顶部信息行 */}
                    <div className="flex items-center gap-2 mb-1.5">
                      <Badge className={cn("text-[9px] px-1.5 py-0 h-4 font-medium", taskTypeColors[record.taskType] || "")}>
                        {taskTypeLabels[record.taskType] || record.taskType}
                      </Badge>
                      <span className={cn("text-[10px] font-medium", statusInfo.color)}>
                        {statusInfo.label}
                      </span>
                      {record.executionTimeMs !== null && (
                        <span className="text-[9px] text-muted-foreground/60">
                          {(record.executionTimeMs / 1000).toFixed(1)}s
                        </span>
                      )}
                      <span className="text-[9px] text-muted-foreground/60 ml-auto">
                        {formatTime(record.createdAt)}
                      </span>
                    </div>

                    {/* 输入摘要 */}
                    <p className="text-xs text-foreground line-clamp-2 mb-1">
                      {record.inputSummary}
                    </p>

                    {/* 输出摘要 */}
                    {record.outputSummary && (
                      <p className="text-[10px] text-muted-foreground line-clamp-2">
                        {record.outputSummary}
                      </p>
                    )}

                    {/* 反馈/评分 */}
                    <div className="flex items-center gap-2 mt-1.5">
                      {record.rating !== null && (
                        <div className="flex items-center gap-0.5">
                          {[1, 2, 3, 4, 5].map(s => (
                            <Star
                              key={s}
                              className={cn(
                                "w-2.5 h-2.5",
                                s <= (record.rating || 0)
                                  ? "fill-amber-400 text-amber-400"
                                  : "text-muted-foreground/30"
                              )}
                            />
                          ))}
                        </div>
                      )}
                      {record.feedbackText && (
                        <span className="text-[9px] text-muted-foreground/70 truncate max-w-[200px]">
                          "{record.feedbackText}"
                        </span>
                      )}
                      {record.correction && (
                        <span className="text-[9px] text-amber-500/70 truncate max-w-[150px]">
                          修正: {record.correction}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* 分页 */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-2">
          <Button
            variant="outline"
            size="sm"
            className="h-7 w-7 p-0"
            disabled={page === 0}
            onClick={() => setPage(p => Math.max(0, p - 1))}
          >
            <ChevronLeft className="w-3 h-3" />
          </Button>
          <span className="text-xs text-muted-foreground">
            {page + 1} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            className="h-7 w-7 p-0"
            disabled={page >= totalPages - 1}
            onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
          >
            <ChevronRight className="w-3 h-3" />
          </Button>
        </div>
      )}
    </div>
  );
}

// ==================== 缺失导入的图标 ====================
function Briefcase(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24" height="24" viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
    >
      <rect width="20" height="14" x="2" y="7" rx="2" ry="2" />
      <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
    </svg>
  );
}

// ==================== 用户偏好 Tab 组件 ====================
function UserPreferencesTab({ agentId, teamId }: { agentId: string; teamId: string }) {
  const [preferences, setPreferences] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/agents/user-preferences?agentId=${agentId}&teamId=${teamId}`);
        const data = await res.json();
        setPreferences(data.preferences || []);
      } catch (e) {
        console.error("Failed to load user preferences", e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [agentId, teamId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (preferences.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <div className="text-4xl mb-4">👤</div>
          <h3 className="text-lg font-medium mb-2">暂无用户偏好数据</h3>
          <p className="text-sm text-muted-foreground">
            用户与智能体对话后，智能体将自动学习每位用户的沟通偏好，并在此展示。
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
        <Info className="h-4 w-4" />
        <span>智能体自动学习每位用户的沟通偏好，以提供更个性化的服务</span>
      </div>
      {preferences.map((pref: any) => (
        <Card key={pref.id}>
          <CardContent className="pt-6">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-lg">
                  👤
                </div>
                <div>
                  <h4 className="font-medium">{pref.user_name || "用户"}</h4>
                  <p className="text-xs text-muted-foreground">
                    {pref.interaction_count} 次对话 · 最近对话：{pref.last_interaction_at ? new Date(pref.last_interaction_at).toLocaleDateString() : "暂无"}
                  </p>
                </div>
              </div>
            </div>
            {pref.preferences && Object.keys(pref.preferences).length > 0 ? (
              <div className="space-y-2 pl-[52px]">
                {Object.entries(pref.preferences).map(([key, value]: [string, any]) => (
                  <div key={key} className="flex items-start gap-2">
                    <span className="text-xs font-medium text-primary min-w-[60px] mt-0.5">
                      {key === "language" ? "语言" : key === "format" ? "格式" : key === "style" ? "风格" : key === "common_topics" ? "常用话题" : key}
                    </span>
                    <span className="text-sm text-muted-foreground">{String(value)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground pl-[52px]">正在学习中...</p>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ==================== 协作关系组件 ====================
function CollaborationSection({ agentId, teamId }: { agentId: string; teamId: string }) {
  const [agents, setAgents] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/agents?teamId=${teamId}&limit=10`);
        const data = await res.json();
        setAgents((data.agents || []).filter((a: any) => a.id !== agentId).slice(0, 5));
      } catch (e) {
        console.error("Failed to load agents", e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [agentId, teamId]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Handshake className="h-4 w-4" />
          可协作智能体
        </CardTitle>
        <CardDescription>该智能体可通过 delegate_agent 工具委托任务</CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-6">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
          </div>
        ) : agents.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">暂无其他智能体</p>
        ) : (
          <div className="space-y-3">
            {agents.map((a: any) => (
              <div key={a.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors">
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-sm">
                  🤖
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{a.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{a.description || "无描述"}</p>
                </div>
                <span className="text-xs text-muted-foreground whitespace-nowrap">可委托</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}