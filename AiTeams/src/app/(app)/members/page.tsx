"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { DEFAULT_MODEL_ID, MODEL_CATALOG } from "@/lib/llm/model-catalog";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { DepartmentTreeSelect } from "@/components/ui/department-tree-select";
import {
  Bot, Plus, Search, Loader2, MessageCircle, Pencil,
  Zap, BookOpen, Wrench, Server, ChevronRight,
  CheckCircle2, AlertCircle, TrendingUp, Clock, Sparkles,
  Settings2, Save, FileText, X, Check,
  Cpu, Brain, Shield, Sliders, ListOrdered, Workflow, User, Terminal,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ==================== 类型定义 ====================
interface Agent {
  id: string;
  name: string;
  description: string;
  avatar: string;
  positionId: string;
  positionName: string;
  positionColor: string;
  positionIcon: string;
  skillIds: string[];
  toolIds: string[];
  ragDatasetIds: string[];
  status: string;
  systemPrompt: string;
  greeting: string;
  userGuidance: string;
  modelConfig: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  workflowId?: string;
  skillNames?: string[];
  toolNames?: string[];
  ragDatasetNames?: string[];
  notifyEnabled?: boolean;
  notifyConfig?: Record<string, unknown>;
  channelContextEnabled?: boolean;
  channelContextLimit?: number;
  channelContextScope?: string;
  memoryEnabled?: boolean;
  memoryConfig?: Record<string, unknown>;
  promptGuardEnabled?: boolean;
  toolApprovalMode?: string;
  contextCompressEnabled?: boolean;
  maxIterations?: number;
  roleIdentity?: string;
  boundaries?: { action: string; permission: string }[];
  agentMd?: string;
}

interface Position {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  code: string;
  jobWorks: Array<{ name: string; description: string }>;
  status: string;
  departmentId?: string | null;
  departmentName?: string | null;
}

interface Department {
  id: string;
  name: string;
  parentId?: string | null;
}

interface Skill {
  id: string;
  name: string;
  content: string;
  positionId: string;
  positionName: string;
  agentId: string;
  agentName: string;
  version: string;
  sourceType: string;
  createdAt: string;
}

interface Tool {
  id: string;
  name: string;
  action: string;
  description: string;
  isBuiltin: boolean;
  status: string;
}

interface RAGDataset {
  id: string;
  name: string;
  description: string;
  documentCount: number;
  status: string;
}

// ==================== 图标映射 ====================
const iconMap: Record<string, React.ReactNode> = {
  Bot: <Bot className="w-5 h-5" />,
  MessageCircle: <MessageCircle className="w-5 h-5" />,
  Zap: <Zap className="w-5 h-5" />,
  TrendingUp: <TrendingUp className="w-5 h-5" />,
  Sparkles: <Sparkles className="w-5 h-5" />,
  BookOpen: <BookOpen className="w-5 h-5" />,
  Wrench: <Wrench className="w-5 h-5" />,
  Server: <Server className="w-5 h-5" />,
  Clock: <Clock className="w-5 h-5" />,
};

// ==================== 状态计算 ====================
function getAgentStatus(agent: Agent): { label: string; color: string; icon: React.ReactNode } {
  if (agent.status === "disabled") return { label: "已停用", color: "bg-muted text-muted-foreground", icon: <AlertCircle className="w-3 h-3" /> };
  if (!agent.skillIds || agent.skillIds.length < 2) return { label: "待培训", color: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400", icon: <Clock className="w-3 h-3" /> };
  return { label: "活跃", color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400", icon: <CheckCircle2 className="w-3 h-3" /> };
}

// ==================== 创建成员弹窗 ====================
function CreateMemberDialog({
  open,
  onOpenChange,
  positions,
  teamId,
  userId,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  positions: Position[];
  teamId: string;
  userId: string;
  onSuccess: () => void;
}) {
  const [name, setName] = useState("");
  const [selectedPositionId, setSelectedPositionId] = useState("");
  const [selectedJobWorks, setSelectedJobWorks] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const selectedPosition = positions.find(p => p.id === selectedPositionId);

  const handlePositionChange = (v: string) => {
    setSelectedPositionId(v);
    setError("");
    // 默认全选该岗位的所有工作职责
    const pos = positions.find(p => p.id === v);
    if (pos?.jobWorks?.length) {
      setSelectedJobWorks(new Set(pos.jobWorks.map(jw => jw.name)));
    } else {
      setSelectedJobWorks(new Set());
    }
  };

  const toggleJobWork = (name: string) => {
    setSelectedJobWorks(prev => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  };

  const handleSubmit = async () => {
    if (!name.trim()) { setError("请输入成员名称"); return; }
    if (!selectedPositionId) { setError("请选择岗位"); return; }
    if (selectedJobWorks.size === 0) { setError("请至少选择一项工作职责"); return; }
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          positionId: selectedPositionId,
          selectedJobWorkNames: Array.from(selectedJobWorks),
          teamId,
          createdBy: userId,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "创建失败");
      }
      onOpenChange(false);
      setName("");
      setSelectedPositionId("");
      setSelectedJobWorks(new Set());
      onSuccess();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "创建失败");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>新建数字成员</DialogTitle>
          <DialogDescription>
            选择岗位后，勾选需要的工作职责，系统将自动为每个职责生成对应的技能 SOP。
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>成员名称 *</Label>
            <Input
              placeholder="例如：新媒体运营助手"
              value={name}
              onChange={e => { setName(e.target.value); setError(""); }}
            />
          </div>
          <div className="space-y-2">
            <Label>选择岗位 *</Label>
            <Select value={selectedPositionId} onValueChange={handlePositionChange}>
              <SelectTrigger>
                <SelectValue placeholder="请选择岗位" />
              </SelectTrigger>
              <SelectContent>
                {(() => {
                  const grouped: Record<string, Position[]> = {};
                  positions.forEach(p => {
                    const deptName = p.departmentName || "未分类";
                    if (!grouped[deptName]) grouped[deptName] = [];
                    grouped[deptName].push(p);
                  });
                  const deptNames = Object.keys(grouped).sort((a, b) =>
                    a === "未分类" ? 1 : b === "未分类" ? -1 : a.localeCompare(b)
                  );
                  return deptNames.flatMap(deptName => [
                    <SelectGroup key={deptName}>
                      <SelectLabel>{deptName}</SelectLabel>
                      {grouped[deptName].map(p => (
                        <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                      ))}
                    </SelectGroup>
                  ]);
                })()}
              </SelectContent>
            </Select>
          </div>

          {selectedPosition && selectedPosition.jobWorks?.length > 0 && (
            <div className="space-y-2">
              <Label>工作职责（勾选将创建技能）</Label>
              <div className="space-y-1.5 max-h-[200px] overflow-y-auto rounded-lg border p-2">
                {selectedPosition.jobWorks.map((jw) => (
                  <label
                    key={jw.name}
                    className="flex items-start gap-2.5 p-2 rounded-md hover:bg-muted/50 cursor-pointer transition-colors"
                  >
                    <Checkbox
                      checked={selectedJobWorks.has(jw.name)}
                      onCheckedChange={() => toggleJobWork(jw.name)}
                      className="mt-0.5"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium leading-tight">{jw.name}</p>
                      {jw.description && (
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{jw.description}</p>
                      )}
                    </div>
                  </label>
                ))}
              </div>
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : null}
            确认创建
          </Button>
        </div>
      </DialogContent>
    </Dialog>

    );
}

// ==================== 编辑成员弹窗 ====================
function EditAgentDialog({
  agent,
  open,
  onOpenChange,
  positions,
  allSkills,
  allTools,
  allDatasets,
  teamId,
  onSuccess,
}: {
  agent: Agent | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  positions: Position[];
  allSkills: Skill[];
  allTools: Tool[];
  allDatasets: RAGDataset[];
  teamId: string;
  onSuccess: () => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [roleIdentity, setRoleIdentity] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [boundaries, setBoundaries] = useState<{action: string; permission: string}[]>([]);
  const [greeting, setGreeting] = useState("");
  const [userGuidance, setUserGuidance] = useState("");
  const [positionId, setPositionId] = useState("");
  const [selectedSkillIds, setSelectedSkillIds] = useState<string[]>([]);
  const [selectedToolIds, setSelectedToolIds] = useState<string[]>([]);
  const [selectedRagIds, setSelectedRagIds] = useState<string[]>([]);
  const [agentMd, setAgentMd] = useState("");
  const [copySuccess, setCopySuccess] = useState(false);
  
  const [activeTab, setActiveTab] = useState("basic");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [showAddSkillDialog, setShowAddSkillDialog] = useState(false);
  const [addSkillSearch, setAddSkillSearch] = useState("");
  const [pendingAddSkillIds, setPendingAddSkillIds] = useState<string[]>([]);

  // 高级配置
  const [modelConfig, setModelConfig] = useState<{ model: string; temperature: number; maxTokens: number }>({
    model: DEFAULT_MODEL_ID,
    temperature: 0.7,
    maxTokens: 2000,
  });
  const [memoryEnabled, setMemoryEnabled] = useState(false);
  const [memoryRecallCount, setMemoryRecallCount] = useState(5);
  const [channelContextEnabled, setChannelContextEnabled] = useState(false);
  const [channelContextLimit, setChannelContextLimit] = useState(20);
  const [channelContextScope, setChannelContextScope] = useState("channel");
  const [contextCompressEnabled, setContextCompressEnabled] = useState(false);
  const [promptGuardEnabled, setPromptGuardEnabled] = useState(false);
  const [toolApprovalMode, setToolApprovalMode] = useState("auto");
  const [maxIterations, setMaxIterations] = useState(10);
  const [workflowId, setWorkflowId] = useState<string | undefined>(undefined);
  const [workflows, setWorkflows] = useState<{ id: string; name: string; steps: unknown[] }[]>([]);

  useEffect(() => {
    if (agent && open) {
      setName(agent.name || "");
      setDescription(agent.description || "");
      setRoleIdentity(agent.roleIdentity || "");
      setSystemPrompt(agent.systemPrompt || "");
      setBoundaries(agent.boundaries || []);
      setGreeting(agent.greeting || "");
      setUserGuidance(agent.userGuidance || "");
      setPositionId(agent.positionId || "");
      setSelectedSkillIds(agent.skillIds || []);
      setSelectedToolIds(agent.toolIds || []);
      setSelectedRagIds(agent.ragDatasetIds || []);
      setAgentMd(agent.agentMd || "");
      setActiveTab("basic");
      setError("");

      // 加载高级配置
      setModelConfig((agent.modelConfig as { model: string; temperature: number; maxTokens: number }) || {
        model: DEFAULT_MODEL_ID, temperature: 0.7, maxTokens: 2000,
      });
      setMemoryEnabled(agent.memoryEnabled || false);
      setMemoryRecallCount((agent.memoryConfig as { recallCount?: number })?.recallCount || 5);
      setChannelContextEnabled(agent.channelContextEnabled || false);
      setChannelContextLimit(agent.channelContextLimit || 20);
      setChannelContextScope(agent.channelContextScope || "channel");
      setContextCompressEnabled(agent.contextCompressEnabled || false);
      setPromptGuardEnabled(agent.promptGuardEnabled || false);
      setToolApprovalMode(agent.toolApprovalMode || "auto");
      setMaxIterations(agent.maxIterations || 10);
      setWorkflowId(agent.workflowId || undefined);
    }
  }, [agent, open]);

  // 加载工作流列表
  useEffect(() => {
    if (open && teamId) {
      fetch(`/api/agents/workflows?teamId=${teamId}`)
        .then((r) => r.json())
        .then((data) => {
          if (data.data) setWorkflows(data.data);
        })
        .catch(() => {});
    }
  }, [open, teamId]);

  const toggleArrayItem = (arr: string[], item: string) => {
    if (arr.includes(item)) return arr.filter(i => i !== item);
    return [...arr, item];
  };

  const handleSubmit = async () => {
    if (!agent) return;
    if (!name.trim()) { setError("请输入成员名称"); return; }
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/agents", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: agent.id,
          name: name.trim(),
          description: description.trim() || undefined,
          roleIdentity: roleIdentity.trim() || undefined,
          systemPrompt: systemPrompt.trim() || undefined,
          greeting: greeting.trim() || undefined,
          userGuidance: userGuidance.trim() || undefined,
          positionId: positionId || undefined,
          skillIds: selectedSkillIds,
          toolIds: selectedToolIds,
          ragDatasetIds: selectedRagIds,
          teamId,
          boundaries,
          // 高级配置
          modelConfig,
          memoryEnabled,
          memoryConfig: { recallCount: memoryRecallCount, strategy: "semantic" },
          channelContextEnabled,
          channelContextLimit,
          channelContextScope,
          contextCompressEnabled,
          promptGuardEnabled,
          toolApprovalMode,
          maxIterations,
          workflowId: workflowId || null,
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "更新失败");
      onOpenChange(false);
      onSuccess();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "更新失败");
    } finally {
      setSubmitting(false);
    }
  };

  if (!agent) return null;

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-7xl max-w-7xl max-h-[90vh] flex flex-col p-0 gap-0">
        <DialogHeader className="shrink-0 px-6 pt-6 pb-0">
          <DialogTitle className="flex items-center gap-2">
            <Settings2 className="w-4 h-4" />
            编辑成员 - {agent.name}
          </DialogTitle>
          <DialogDescription>
            修改成员配置信息，保存后立即生效。
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col min-h-0 flex-1 px-6">
          <TabsList className="grid grid-cols-3 sm:grid-cols-6">
            <TabsTrigger value="basic">基本信息</TabsTrigger>
            <TabsTrigger value="prompt">提示词配置</TabsTrigger>
            <TabsTrigger value="agentmd" className="gap-1">
              <FileText className="w-3.5 h-3.5" />
              agent.md
            </TabsTrigger>
            <TabsTrigger value="skills">技能与工具</TabsTrigger>
            <TabsTrigger value="resources">知识库与服务</TabsTrigger>
            <TabsTrigger value="advanced" className="gap-1">
              <Cpu className="w-3.5 h-3.5" />
              高级配置
            </TabsTrigger>
          </TabsList>

          <div className="mt-4 space-y-4 flex-1 overflow-y-auto min-h-0 pb-4">
            {/* 基本信息 */}
            <TabsContent value="basic" className="space-y-4 mt-0">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>成员名称 <span className="text-destructive">*</span></Label>
                  <Input value={name} onChange={e => { setName(e.target.value); setError(""); }} placeholder="成员名称" />
                </div>
                <div className="space-y-2">
                  <Label>所属岗位</Label>
                  <Select value={positionId} onValueChange={setPositionId}>
                    <SelectTrigger>
                      <SelectValue placeholder="选择岗位" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">不关联岗位</SelectItem>
                      {positions.map(p => (
                        <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>描述</Label>
                <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="成员描述（选填）" />
              </div>
            </TabsContent>

            {/* 提示词配置 */}
            <TabsContent value="prompt" className="space-y-4 mt-0">
              <div className="space-y-2">
                <Label className="flex items-center gap-1.5"><User className="w-3.5 h-3.5" /> 角色身份（Role Identity）</Label>
                <p className="text-xs text-muted-foreground">稳定的身份定义，描述"这个 Agent 是谁"——角色本质、性格、思维基调。不包含项目指令。</p>
                <Textarea
                  value={roleIdentity}
                  onChange={e => setRoleIdentity(e.target.value)}
                  className="min-h-[120px] font-mono text-sm"
                  placeholder='例如：你是一名资深数据分析师，有8年行业经验，擅长从数据中提取洞察。你相信数据会说话，但更擅长把数据翻译成业务能听懂的语言。'
                />
              </div>
              <div className="space-y-2">
                <Label className="flex items-center gap-1.5"><Terminal className="w-3.5 h-3.5" /> 指令（Instructions）</Label>
                <p className="text-xs text-muted-foreground">可灵活调整的输出指令——语言、格式、行为规则等。不包含角色身份。</p>
                <Textarea
                  value={systemPrompt}
                  onChange={e => setSystemPrompt(e.target.value)}
                  className="min-h-[150px] font-mono text-sm"
                  placeholder="例如：请用中文回复，输出使用 Markdown 格式，先给结论再给数据支撑。"
                />
              </div>
              <div className="space-y-2">
                <Label>开场白（Greeting）</Label>
                <Input
                  value={greeting}
                  onChange={e => setGreeting(e.target.value)}
                  placeholder="例如：你好！我是新媒体运营助手，有什么可以帮助你的？"
                />
              </div>
              <div className="space-y-2">
                <Label>输入框引导提示</Label>
                <Input
                  value={userGuidance}
                  onChange={e => setUserGuidance(e.target.value)}
                  placeholder="例如：请输入你的需求，如：帮我写一篇推文..."
                />
              </div>
            </TabsContent>

            {/* agent.md 智能体说明书 */}
            <TabsContent value="agentmd" className="space-y-4 mt-0">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-medium text-foreground">agent.md</h3>
                    <p className="text-xs text-muted-foreground">智能体说明书 — 由表单配置自动生成，只读展示</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => {
                      navigator.clipboard.writeText(agentMd);
                      setCopySuccess(true);
                      setTimeout(() => setCopySuccess(false), 2000);
                    }}>
                      {copySuccess ? "已复制" : "复制"}
                    </Button>
                  </div>
                </div>
                <div className="relative">
                  <textarea
                    className="w-full min-h-[400px] font-mono text-sm p-4 rounded-lg border border-border bg-muted/30 resize-y focus:outline-none cursor-default"
                    placeholder={`# 智能体名称\n\n## 简介\n...\n\n## 行为规则\n...\n\n## 工具\n...\n\n## 知识库\n...`}
                    value={agentMd}
                    readOnly
                  />
                </div>
                {!agentMd && (
                  <div className="rounded-lg bg-muted/50 p-4 text-center">
                    <FileText className="mx-auto h-8 w-8 text-muted-foreground/50 mb-2" />
                    <p className="text-sm text-muted-foreground">保存后系统将自动生成 agent.md 说明书</p>
                  </div>
                )}
              </div>
            </TabsContent>

            {/* 技能与工具 */}
            <TabsContent value="skills" className="space-y-4 mt-0">
              <div className="space-y-3">
                <Label>关联技能（Skill SOP）</Label>
                {/* 已绑定技能列表 */}
                {selectedSkillIds.length === 0 ? (
                  <p className="text-sm text-muted-foreground">暂无关联技能</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {selectedSkillIds.map(id => {
                      const skill = allSkills.find(s => s.id === id);
                      return (
                        <Badge key={id} variant="default" className="text-xs gap-1 pr-1">
                          {skill?.name || "未知技能"}
                          <button
                            className="ml-0.5 rounded-full hover:bg-primary-foreground/20 p-0.5"
                            onClick={() => setSelectedSkillIds(prev => prev.filter(i => i !== id))}
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </Badge>
                      );
                    })}
                  </div>
                )}
                {/* 添加技能按钮 */}
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs gap-1"
                  onClick={() => {
                    const unboundIds = allSkills.filter(s => !selectedSkillIds.includes(s.id)).map(s => s.id);
                    setPendingAddSkillIds([]);
                    setAddSkillSearch("");
                    setShowAddSkillDialog(true);
                  }}
                >
                  <Plus className="w-3.5 h-3.5" />
                  添加技能
                </Button>
              </div>
              <div className="space-y-3">
                <Label>关联工具（Tool）</Label>
                <div className="flex flex-wrap gap-2">
                  {allTools.length === 0 && (
                    <p className="text-sm text-muted-foreground">暂无可用工具</p>
                  )}
                  {allTools.map(t => (
                    <Badge
                      key={t.id}
                      variant={selectedToolIds.includes(t.id) ? "default" : "outline"}
                      className="cursor-pointer text-xs"
                      onClick={() => setSelectedToolIds(prev => toggleArrayItem(prev, t.id))}
                    >
                      {t.name}
                      {t.isBuiltin && <span className="ml-1 opacity-60">(内置)</span>}
                    </Badge>
                  ))}
                </div>
              </div>
            </TabsContent>

            {/* 知识库与服务 */}
            <TabsContent value="resources" className="space-y-4 mt-0">
              <div className="space-y-3">
                <Label>关联知识库（RAG）</Label>
                <div className="flex flex-wrap gap-2">
                  {allDatasets.length === 0 && (
                    <p className="text-sm text-muted-foreground">暂无知识库</p>
                  )}
                  {allDatasets.map(d => (
                    <Badge
                      key={d.id}
                      variant={selectedRagIds.includes(d.id) ? "default" : "outline"}
                      className="cursor-pointer text-xs"
                      onClick={() => setSelectedRagIds(prev => toggleArrayItem(prev, d.id))}
                    >
                      {d.name}
                      <span className="ml-1 opacity-60">({d.documentCount} 文档)</span>
                    </Badge>
                  ))}
                </div>
              </div>
              </TabsContent>

            {/* 高级配置 */}
            <TabsContent value="advanced" className="space-y-5 mt-0">
              {/* 模型配置 */}
              <div className="space-y-3">
                <Label className="flex items-center gap-1.5"><Cpu className="w-3.5 h-3.5" /> 模型配置</Label>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <span className="text-xs text-muted-foreground">模型</span>
                    <Select value={modelConfig.model} onValueChange={v => setModelConfig(prev => ({ ...prev, model: v }))}>
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {MODEL_CATALOG.map(m => (
                          <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <span className="text-xs text-muted-foreground">最大 Token</span>
                    <Input
                      type="number"
                      min={256}
                      max={32000}
                      step={256}
                      value={modelConfig.maxTokens}
                      onChange={e => setModelConfig(prev => ({ ...prev, maxTokens: Math.max(256, parseInt(e.target.value) || 2000) }))}
                      className="h-8 text-xs"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <span className="text-xs text-muted-foreground">温度 (Temperature): {modelConfig.temperature}</span>
                  <input
                    type="range"
                    min={0}
                    max={2}
                    step={0.1}
                    value={modelConfig.temperature}
                    onChange={e => setModelConfig(prev => ({ ...prev, temperature: parseFloat(e.target.value) }))}
                    className="w-full h-1.5 bg-secondary rounded-full appearance-none cursor-pointer accent-primary"
                  />
                  <div className="flex justify-between text-[10px] text-muted-foreground">
                    <span>精确 (0)</span>
                    <span>平衡 (1)</span>
                    <span>创意 (2)</span>
                  </div>
                </div>
              </div>

              {/* 分隔线 */}
              <div className="border-t border-border" />

              {/* 持久化记忆 */}
              <div className="space-y-3">
                <Label className="flex items-center gap-1.5"><Brain className="w-3.5 h-3.5" /> 持久化记忆</Label>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">启用记忆功能</span>
                  <button
                    className={`relative w-9 h-5 rounded-full transition-colors ${memoryEnabled ? 'bg-primary' : 'bg-muted-foreground/30'}`}
                    onClick={() => setMemoryEnabled(!memoryEnabled)}
                  >
                    <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${memoryEnabled ? 'translate-x-4' : ''}`} />
                  </button>
                </div>
                {memoryEnabled && (
                  <div className="space-y-1.5">
                    <span className="text-xs text-muted-foreground">召回数量</span>
                    <Input
                      type="number"
                      min={1}
                      max={50}
                      value={memoryRecallCount}
                      onChange={e => setMemoryRecallCount(Math.max(1, parseInt(e.target.value) || 5))}
                      className="h-8 text-xs w-24"
                    />
                  </div>
                )}
              </div>

              {/* 分隔线 */}
              <div className="border-t border-border" />

              {/* 频道上下文 */}
              <div className="space-y-3">
                <Label className="flex items-center gap-1.5"><Sliders className="w-3.5 h-3.5" /> 频道上下文</Label>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">注入频道历史上下文</span>
                  <button
                    className={`relative w-9 h-5 rounded-full transition-colors ${channelContextEnabled ? 'bg-primary' : 'bg-muted-foreground/30'}`}
                    onClick={() => setChannelContextEnabled(!channelContextEnabled)}
                  >
                    <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${channelContextEnabled ? 'translate-x-4' : ''}`} />
                  </button>
                </div>
                {channelContextEnabled && (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <span className="text-xs text-muted-foreground">检索条数</span>
                      <Input
                        type="number"
                        min={1}
                        max={100}
                        value={channelContextLimit}
                        onChange={e => setChannelContextLimit(Math.max(1, parseInt(e.target.value) || 20))}
                        className="h-8 text-xs"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <span className="text-xs text-muted-foreground">检索范围</span>
                      <Select value={channelContextScope} onValueChange={setChannelContextScope}>
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="channel">当前频道</SelectItem>
                          <SelectItem value="team">全团队</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}
              </div>

              {/* 工作流绑定 */}
              <div className="space-y-3">
                <Label className="flex items-center gap-1.5"><Workflow className="w-3.5 h-3.5" /> 工作流执行</Label>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">绑定工作流（可选）</span>
                    {workflowId && (
                      <button
                        className="text-xs text-destructive hover:underline"
                        onClick={() => setWorkflowId(undefined)}
                      >
                        解除绑定
                      </button>
                    )}
                  </div>
                  <Select
                    value={workflowId || "none"}
                    onValueChange={(v) => setWorkflowId(v === "none" ? undefined : v)}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="选择工作流" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">不绑定</SelectItem>
                      {workflows.length > 0 && workflows
                        .filter((w: any) => w.is_active)
                        .map((w: any) => (
                          <SelectItem key={w.id} value={w.id}>
                            {w.name} ({w.steps?.length || 0}步)
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                  {workflowId && (
                    <p className="text-xs text-muted-foreground">
                      绑定后，当用户请求匹配工作流触发条件时，AI 将自动执行工作流步骤
                    </p>
                  )}
                </div>
              </div>

              {/* 分隔线 */}
              <div className="border-t border-border" />

              {/* 安全与优化 */}
              <div className="space-y-3">
                <Label className="flex items-center gap-1.5"><Shield className="w-3.5 h-3.5" /> 安全与优化</Label>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Prompt 注入检测</span>
                  <button
                    className={`relative w-9 h-5 rounded-full transition-colors ${promptGuardEnabled ? 'bg-primary' : 'bg-muted-foreground/30'}`}
                    onClick={() => setPromptGuardEnabled(!promptGuardEnabled)}
                  >
                    <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${promptGuardEnabled ? 'translate-x-4' : ''}`} />
                  </button>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">上下文压缩</span>
                  <button
                    className={`relative w-9 h-5 rounded-full transition-colors ${contextCompressEnabled ? 'bg-primary' : 'bg-muted-foreground/30'}`}
                    onClick={() => setContextCompressEnabled(!contextCompressEnabled)}
                  >
                    <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${contextCompressEnabled ? 'translate-x-4' : ''}`} />
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <span className="text-xs text-muted-foreground">工具审批模式</span>
                    <Select value={toolApprovalMode} onValueChange={setToolApprovalMode}>
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="auto">自动执行</SelectItem>
                        <SelectItem value="always">每次审批</SelectItem>
                        <SelectItem value="conditional">条件审批</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <span className="text-xs text-muted-foreground">最大循环次数</span>
                    <Input
                      type="number"
                      min={1}
                      max={50}
                      value={maxIterations}
                      onChange={e => setMaxIterations(Math.max(1, parseInt(e.target.value) || 10))}
                      className="h-8 text-xs"
                    />
                  </div>
                </div>
              </div>

              {/* 权限边界 */}
              <div className="space-y-4 pt-4 border-t">
                <div className="flex items-center gap-2">
                  <Shield className="h-4 w-4 text-muted-foreground" />
                  <h4 className="text-sm font-medium">权限边界（Boundaries）</h4>
                </div>
                <p className="text-xs text-muted-foreground">定义智能体可以做什么、不能做什么、哪些需要审批</p>
                <div className="space-y-2">
                  {boundaries.map((b: any, i: number) => (
                    <div key={i} className="flex items-center gap-2">
                      <select
                        value={b.permission || "allow"}
                        onChange={e => {
                          const newB = [...boundaries];
                          newB[i] = { ...newB[i], permission: e.target.value };
                          setBoundaries(newB);
                        }}
                        className="h-8 w-24 text-xs rounded-md border border-input bg-background px-2"
                      >
                        <option value="allow">✅ 允许</option>
                        <option value="deny">❌ 禁止</option>
                        <option value="approval">⚠️ 需审批</option>
                      </select>
                      <input
                        type="text"
                        value={b.action || ""}
                        onChange={e => {
                          const newB = [...boundaries];
                          newB[i] = { ...newB[i], action: e.target.value };
                          setBoundaries(newB);
                        }}
                        placeholder="例如：查询数据"
                        className="flex-1 h-8 text-xs rounded-md border border-input bg-background px-2"
                      />
                      <button
                        onClick={() => {
                          const newB = boundaries.filter((_: any, j: number) => j !== i);
                          setBoundaries(newB);
                        }}
                        className="h-8 w-8 flex items-center justify-center text-xs text-muted-foreground hover:text-destructive"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                  <button
                    onClick={() => {
                      setBoundaries([...boundaries, { action: "", permission: "allow" }]);
                    }}
                    className="flex items-center gap-1 text-xs text-primary hover:text-primary/80"
                  >
                    + 添加权限条目
                  </button>
                </div>
              </div>
            </TabsContent>

            </div>
        </Tabs>

        <div className="shrink-0 px-6 pb-4 pt-2 border-t">
          {error && <p className="text-sm text-destructive mb-2">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Save className="w-4 h-4 mr-1.5" />}
              保存修改
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>

    {/* 添加技能弹窗 */}
    <Dialog open={showAddSkillDialog} onOpenChange={setShowAddSkillDialog}>
      <DialogContent className="max-w-md max-h-[85vh] flex flex-col p-0 gap-0">
        <DialogHeader className="shrink-0 px-6 pt-6 pb-0">
          <DialogTitle>添加技能</DialogTitle>
          <DialogDescription>
            选择要绑定到该智能体的技能
          </DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto min-h-0 px-6 py-4 space-y-3">
          {/* 搜索框 */}
          <div className="relative shrink-0">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={addSkillSearch}
              onChange={e => setAddSkillSearch(e.target.value)}
              placeholder="搜索技能..."
              className="pl-8 h-9 text-sm"
            />
          </div>
          {/* 技能列表 */}
          <div className="space-y-1">
            {allSkills
              .filter(s => !selectedSkillIds.includes(s.id))
              .filter(s => !addSkillSearch || s.name.toLowerCase().includes(addSkillSearch.toLowerCase()))
              .length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                {addSkillSearch ? "未找到匹配的技能" : "没有可添加的技能"}
              </p>
            ) : (
              allSkills
                .filter(s => !selectedSkillIds.includes(s.id))
                .filter(s => !addSkillSearch || s.name.toLowerCase().includes(addSkillSearch.toLowerCase()))
                .map(s => {
                  const isPending = pendingAddSkillIds.includes(s.id);
                  return (
                    <label
                      key={s.id}
                      className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-accent cursor-pointer text-sm"
                      onClick={() => {
                        setPendingAddSkillIds(prev =>
                          prev.includes(s.id)
                            ? prev.filter(i => i !== s.id)
                            : [...prev, s.id]
                        );
                      }}
                    >
                      <div className={cn(
                        "w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors",
                        isPending ? "bg-primary border-primary text-primary-foreground" : "border-muted-foreground/30"
                      )}>
                        {isPending && <Check className="w-3 h-3" />}
                      </div>
                      <span className="flex-1">{s.name}</span>
                    </label>
                  );
                })
            )}
          </div>
        </div>
        <DialogFooter className="shrink-0 px-6 pb-6 pt-4 border-t">
          <Button variant="outline" onClick={() => setShowAddSkillDialog(false)}>取消</Button>
          <Button
            onClick={() => {
              setSelectedSkillIds(prev => [...prev, ...pendingAddSkillIds]);
              setShowAddSkillDialog(false);
              setPendingAddSkillIds([]);
              setAddSkillSearch("");
            }}
            disabled={pendingAddSkillIds.length === 0}
          >
            <Check className="w-4 h-4 mr-1.5" />
            确认添加{pendingAddSkillIds.length > 0 ? ` (${pendingAddSkillIds.length})` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}

export default function MembersPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const teamId = user?.currentTeamId || "";

  // ==================== 数据状态 ====================
  const [agents, setAgents] = useState<Agent[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [tools, setTools] = useState<Tool[]>([]);
  const [datasets, setDatasets] = useState<RAGDataset[]>([]);
  const [loading, setLoading] = useState(true);

  // ==================== UI 状态 ====================
  const [searchQuery, setSearchQuery] = useState("");
  const [departments, setDepartments] = useState<Department[]>([]);
  const [filterDepartmentId, setFilterDepartmentId] = useState<string | undefined>(undefined);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [showDetailSheet, setShowDetailSheet] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editAgent, setEditAgent] = useState<Agent | null>(null);
  const [showEditDialog, setShowEditDialog] = useState(false);

  // ==================== 数据加载 ====================
  const loadAll = useCallback(async () => {
    if (!teamId) return;
    setLoading(true);
    try {
      const [agentsRes, positionsRes, skillsRes, toolsRes, datasetsRes, deptsRes] = await Promise.all([
        fetch(`/api/agents?teamId=${teamId}`),
        fetch(`/api/positions?teamId=${teamId}`),
        fetch(`/api/skills?teamId=${teamId}`),
        fetch(`/api/tools?teamId=${teamId}`),
        fetch(`/api/rag?teamId=${teamId}`),
        fetch(`/api/departments?teamId=${teamId}`),
      ]);
      const [agentsData, positionsData, skillsData, toolsData, datasetsData, deptsData] = await Promise.all([
        agentsRes.json(), positionsRes.json(), skillsRes.json(), toolsRes.json(), datasetsRes.json(), deptsRes.json(),
      ]);
      setAgents(agentsData.agents || agentsData.data || []);
      setPositions(positionsData.positions || positionsData.data || []);
      setSkills(skillsData.skills || skillsData.definitions || skillsData.data || []);
      setTools(toolsData.tools || toolsData.data || []);
      setDatasets(datasetsData.datasets || datasetsData.data || []);
      const rawDepts = deptsData.departments || deptsData.data || [];
      setDepartments(rawDepts.map((d: Record<string, unknown>) => ({ id: d.id as string, name: d.name as string, parentId: d.parent_id as string | null })));
    } catch (err) {
      console.error("加载数据失败:", err);
    } finally {
      setLoading(false);
    }
  }, [teamId]);

  useEffect(() => { loadAll(); }, [loadAll]);

  // ==================== 处理 URL 参数（编辑模式） ====================
  useEffect(() => {
    const editId = searchParams?.get("edit");
    if (editId && agents.length > 0 && !loading) {
      const agent = agents.find(a => a.id === editId);
      if (agent) {
        setEditAgent(agent);
        setShowEditDialog(true);
        // 清除 URL 参数，避免重复触发
        router.replace("/members", { scroll: false });
      }
    }
  }, [searchParams, agents, loading, router]);

  // ==================== 筛选逻辑 ====================
  const filteredAgents = agents.filter(a => {
    if (searchQuery && !a.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    if (filterDepartmentId) {
      const pos = positions.find(p => p.id === a.positionId);
      if (pos?.departmentId !== filterDepartmentId) return false;
    }
    if (statusFilter !== "all") {
      const status = getAgentStatus(a);
      if (statusFilter === "active" && status.label !== "活跃") return false;
      if (statusFilter === "training" && status.label !== "待培训") return false;
      if (statusFilter === "disabled" && status.label !== "已停用") return false;
    }
    return true;
  });

  // ==================== 操作 ====================
  const handleOpenChat = useCallback((agent: Agent) => {
    router.push(`/dms?chatWithAgent=${agent.id}`);
  }, [router]);

  const handleCardClick = (agent: Agent) => {
    setSelectedAgent(agent);
    setShowDetailSheet(true);
  };

  const handleCreateMember = () => {
    setShowCreateDialog(true);
  };

  const handleEditAgent = (e: React.MouseEvent, agent: Agent) => {
    e.stopPropagation();
    setEditAgent(agent);
    setShowEditDialog(true);
  };

  const getPositionById = (id: string) => positions.find(p => p.id === id);

  if (!user || !teamId) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* 顶部栏 */}
      <div className="h-14 border-b border-border flex items-center justify-between px-6 shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="text-base font-semibold text-foreground">全部成员</h1>
          <Badge variant="outline" className="text-[10px]">{agents.length} 个成员</Badge>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              placeholder="搜索成员..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="pl-8 h-8 w-48 text-sm"
            />
          </div>
          <DepartmentTreeSelect
            departments={departments}
            value={filterDepartmentId}
            onChange={(id) => setFilterDepartmentId(id || undefined)}
            placeholder="按部门查看"
            allowClear
          />
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-8 w-32 text-sm">
              <SelectValue placeholder="全部状态" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部状态</SelectItem>
              <SelectItem value="active">活跃</SelectItem>
              <SelectItem value="training">待培训</SelectItem>
              <SelectItem value="disabled">已停用</SelectItem>
            </SelectContent>
          </Select>
          <Button size="sm" onClick={handleCreateMember}>
            <Plus className="w-4 h-4 mr-1" />
            新建成员
          </Button>
        </div>
      </div>

      {/* 内容区 */}
      <ScrollArea className="flex-1 min-h-0">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : filteredAgents.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
            <Bot className="w-12 h-12 mb-3 opacity-30" />
            <p className="text-sm">暂无数字成员</p>
            <p className="text-xs mt-1">点击&ldquo;新建成员&rdquo;创建第一个数字成员</p>
            <Button size="sm" className="mt-4" onClick={handleCreateMember}>
              <Plus className="w-4 h-4 mr-1" />
              新建成员
            </Button>
          </div>
        ) : (
          <div className="p-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filteredAgents.map(agent => {
                const pos = getPositionById(agent.positionId);
                const status = getAgentStatus(agent);
                return (
                  <div
                    key={agent.id}
                    onClick={() => handleCardClick(agent)}
                    className="group relative rounded-xl border bg-card p-5 hover:shadow-md hover:border-primary/30 transition-all cursor-pointer"
                  >
                    {/* 头像 + 名称 + 状态 */}
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
                          style={{ backgroundColor: pos?.color || "#3B82F6" }}
                        >
                          {iconMap[pos?.icon || "Bot"] ? (
                            <span className="text-white">{iconMap[pos?.icon || "Bot"]}</span>
                          ) : (
                            <Bot className="w-5 h-5 text-white" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <h3 className="font-semibold text-sm truncate">{agent.name}</h3>
                          {pos && (
                            <span className="text-xs text-muted-foreground">{pos.name}</span>
                          )}
                        </div>
                      </div>
                      <Badge className={cn("text-[10px] h-5 px-1.5 gap-1 shrink-0 ml-2", status.color)}>
                        {status.icon}
                        {status.label}
                      </Badge>
                    </div>

                    {/* 角色身份卡 */}
                    {agent.roleIdentity && (
                      <div className="mb-3 rounded-md bg-primary/5 px-3 py-2 border border-primary/10">
                        <p className="text-[11px] font-medium text-primary/70 mb-0.5">角色身份</p>
                        <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                          {agent.roleIdentity}
                        </p>
                      </div>
                    )}
                    {!agent.roleIdentity && agent.description && (
                      <p className="text-xs text-muted-foreground line-clamp-2 mb-3">{agent.description}</p>
                    )}

                    {/* 数据指标 */}
                    <div className="grid grid-cols-3 gap-1.5 text-center">
                      <div className="p-2 rounded-lg bg-muted/40">
                        <div className="text-sm font-bold">{agent.skillIds?.length || 0}</div>
                        <div className="text-[10px] text-muted-foreground">技能</div>
                      </div>
                      <div className="p-2 rounded-lg bg-muted/40">
                        <div className="text-sm font-bold">{agent.toolIds?.length || 0}</div>
                        <div className="text-[10px] text-muted-foreground">工具</div>
                      </div>
                      <div className="p-2 rounded-lg bg-muted/40">
                        <div className="text-sm font-bold">{agent.ragDatasetIds?.length || 0}</div>
                        <div className="text-[10px] text-muted-foreground">知识库</div>
                      </div>
                    </div>

                    {/* 悬浮操作栏 */}
                    <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        title="查看档案"
                        onClick={(e) => { e.stopPropagation(); router.push(`/members/agents/${agent.id}`); }}
                      >
                        <FileText className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={(e) => handleEditAgent(e, agent)}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-primary"
                        onClick={(e) => { e.stopPropagation(); handleOpenChat(agent); }}
                      >
                        <MessageCircle className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                );
              })}

              {/* 新建成员卡片 */}
              <div
                onClick={handleCreateMember}
                className="rounded-xl border-2 border-dashed border-border hover:border-primary/40 hover:bg-muted/30 transition-all cursor-pointer flex flex-col items-center justify-center p-5 min-h-[180px]"
              >
                <div className="w-11 h-11 rounded-xl bg-muted flex items-center justify-center mb-3">
                  <Plus className="w-5 h-5 text-muted-foreground" />
                </div>
                <span className="text-sm text-muted-foreground font-medium">新建成员</span>
                <span className="text-xs text-muted-foreground/60 mt-1">选择岗位自动创建</span>
              </div>
            </div>
          </div>
        )}
      </ScrollArea>

      {/* 成员详情侧边栏 */}
      <Sheet open={showDetailSheet} onOpenChange={setShowDetailSheet}>
        <SheetContent className="w-[420px] sm:max-w-[420px] p-0">
          {selectedAgent && (() => {
            const pos = getPositionById(selectedAgent.positionId);
            const status = getAgentStatus(selectedAgent);
            const agentSkills = skills.filter(s => selectedAgent.skillIds?.includes(s.id));
            const agentTools = tools.filter(t => selectedAgent.toolIds?.includes(t.id));
            const agentDatasets = datasets.filter(d => selectedAgent.ragDatasetIds?.includes(d.id));
            return (
              <div className="flex flex-col h-full">
                <SheetHeader className="px-6 py-4 border-b border-border shrink-0">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
                      style={{ backgroundColor: pos?.color || "#3B82F6" }}
                    >
                      {iconMap[pos?.icon || "Bot"] ? (
                        <span className="text-white">{iconMap[pos?.icon || "Bot"]}</span>
                      ) : (
                        <Bot className="w-6 h-6 text-white" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <SheetTitle className="text-base truncate">{selectedAgent.name}</SheetTitle>
                      <div className="flex items-center gap-2 mt-0.5">
                        {pos && <Badge variant="secondary" className="text-[10px] h-5">{pos.name}</Badge>}
                        <Badge className={cn("text-[10px] h-5 px-1.5 gap-1", status.color)}>
                          {status.icon}
                          {status.label}
                        </Badge>
                      </div>
                    </div>
                  </div>
                </SheetHeader>

                <ScrollArea className="flex-1 min-h-0">
                  <div className="p-6 space-y-5">
                    {/* 概览数据 */}
                    <div className="grid grid-cols-4 gap-2">
                      <div className="text-center p-2 rounded-lg bg-muted/40">
                        <div className="text-lg font-bold">{agentSkills.length}</div>
                        <div className="text-[10px] text-muted-foreground">技能</div>
                      </div>
                      <div className="text-center p-2 rounded-lg bg-muted/40">
                        <div className="text-lg font-bold">{agentTools.length}</div>
                        <div className="text-[10px] text-muted-foreground">工具</div>
                      </div>
                      <div className="text-center p-2 rounded-lg bg-muted/40">
                        <div className="text-lg font-bold">{agentDatasets.length}</div>
                        <div className="text-[10px] text-muted-foreground">知识库</div>
                      </div>
                    </div>

                    {/* 描述 */}
                    {selectedAgent.description && (
                      <div>
                        <h4 className="text-xs font-semibold text-muted-foreground mb-1.5">描述</h4>
                        <p className="text-sm">{selectedAgent.description}</p>
                      </div>
                    )}

                    {/* 开场白 */}
                    {selectedAgent.greeting && (
                      <div>
                        <h4 className="text-xs font-semibold text-muted-foreground mb-1.5">开场白</h4>
                        <p className="text-sm text-muted-foreground bg-muted/30 rounded-lg p-3">{selectedAgent.greeting}</p>
                      </div>
                    )}

                    {/* 技能列表 */}
                    {agentSkills.length > 0 && (
                      <div>
                        <h4 className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
                          <BookOpen className="w-3.5 h-3.5" /> 技能 ({agentSkills.length})
                        </h4>
                        <div className="space-y-1.5">
                          {agentSkills.map(s => (
                            <div key={s.id} className="flex items-center gap-2 p-2 rounded-lg bg-muted/30 text-sm">
                              <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                              <span className="truncate">{s.name}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* 工具列表 */}
                    {agentTools.length > 0 && (
                      <div>
                        <h4 className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
                          <Wrench className="w-3.5 h-3.5" /> 工具 ({agentTools.length})
                        </h4>
                        <div className="space-y-1.5">
                          {agentTools.map(t => (
                            <div key={t.id} className="flex items-center gap-2 p-2 rounded-lg bg-muted/30 text-sm">
                              <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                              <span className="truncate">{t.name}</span>
                              {t.isBuiltin && <Badge variant="outline" className="text-[9px] h-4">内置</Badge>}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* 知识库列表 */}
                    {agentDatasets.length > 0 && (
                      <div>
                        <h4 className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
                          <Server className="w-3.5 h-3.5" /> 知识库 ({agentDatasets.length})
                        </h4>
                        <div className="space-y-1.5">
                          {agentDatasets.map(d => (
                            <div key={d.id} className="flex items-center gap-2 p-2 rounded-lg bg-muted/30 text-sm">
                              <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                              <span className="truncate">{d.name}</span>
                              <span className="text-xs text-muted-foreground shrink-0">{d.documentCount} 文档</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* 创建时间 */}
                    <div className="text-xs text-muted-foreground pt-2 border-t border-border">
                      创建于 {new Date(selectedAgent.createdAt).toLocaleDateString("zh-CN")}
                    </div>
                  </div>
                </ScrollArea>

                {/* 底部操作栏 */}
                <div className="px-6 py-3 border-t border-border shrink-0 flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => { setShowDetailSheet(false); router.push(`/members/agents/${selectedAgent.id}`); }}>
                    <FileText className="w-4 h-4 mr-1.5" />
                    档案
                  </Button>
                  <Button className="flex-1" size="sm" onClick={() => { setShowDetailSheet(false); handleOpenChat(selectedAgent); }}>
                    <MessageCircle className="w-4 h-4 mr-1.5" />
                    对话
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => { setShowDetailSheet(false); setEditAgent(selectedAgent); setShowEditDialog(true); }}>
                    <Pencil className="w-4 h-4 mr-1.5" />
                    编辑
                  </Button>
                </div>
              </div>
            );
          })()}
        </SheetContent>
      </Sheet>

      {/* 创建成员弹窗 */}
      <CreateMemberDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        positions={positions}
        teamId={teamId}
        userId={user.id}
        onSuccess={loadAll}
      />

      {/* 编辑成员弹窗 */}
      <EditAgentDialog
        agent={editAgent}
        open={showEditDialog}
        onOpenChange={(open) => { setShowEditDialog(open); if (!open) setEditAgent(null); }}
        positions={positions}
        allSkills={skills}
        allTools={tools}
        allDatasets={datasets}
        teamId={teamId}
        onSuccess={loadAll}
      />
    </div>
  );
}