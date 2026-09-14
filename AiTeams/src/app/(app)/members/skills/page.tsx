"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { BookOpen, Search, Edit3, Eye, RefreshCw, FileDown, Plus, Upload, Github, Sparkles, Trash2, Loader2, FileText, Zap, GitBranch } from "lucide-react";
import { WorkflowEditor } from "@/components/apps/workflow-editor";
import type { WorkflowDefinition } from "@/lib/workflow-executor";
import { toast } from "sonner";

interface Skill {
  id: string;
  name: string;
  description?: string;
  content: string;
  positionId?: string;
  positionName?: string;
  agentName?: string;
  agentId?: string;
  version?: string;
  sourceType?: string;
  createdAt?: string;
  triggerCondition?: string;
  isExecutable?: boolean;
}

interface Position {
  id: string;
  name: string;
}

interface GitHubSkill {
  name: string;
  description: string;
  content: string;
  version: string;
  sourceFile: string;
  sourceUrl: string;
}

type CreateMode = "manual" | "ai" | "import" | "github";

export default function SkillsPage() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const [skills, setSkills] = useState<Skill[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPositionId, setSelectedPositionId] = useState<string>("all");
  const [viewSkill, setViewSkill] = useState<Skill | null>(null);
  const [editSkill, setEditSkill] = useState<Skill | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editContent, setEditContent] = useState("");
  const [editIsExecutable, setEditIsExecutable] = useState(false);
  const [manualTriggerCondition, setManualTriggerCondition] = useState("");
  const [manualInputSchema, setManualInputSchema] = useState("");
  const [manualOutputSchema, setManualOutputSchema] = useState("");
  const [manualExpectedOutput, setManualExpectedOutput] = useState("");
  const [manualIsExecutable, setManualIsExecutable] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [generatingWorkflow, setGeneratingWorkflow] = useState(false);
  const [workflowPreview, setWorkflowPreview] = useState<WorkflowDefinition | null>(null);
  const [workflowError, setWorkflowError] = useState("");
  const [workflowSaved, setWorkflowSaved] = useState(false);
  const [existingWorkflowId, setExistingWorkflowId] = useState<string | null>(null);

  // Create dialog state
  const [createOpen, setCreateOpen] = useState(false);
  const [createMode, setCreateMode] = useState<CreateMode>("manual");
  const [creating, setCreating] = useState(false);

  // Manual create
  const [manualName, setManualName] = useState("");
  const [manualDesc, setManualDesc] = useState("");
  const [manualContent, setManualContent] = useState("");
  const [manualPositionId, setManualPositionId] = useState("");

  // AI generate
  const [aiName, setAiName] = useState("");
  const [aiDesc, setAiDesc] = useState("");
  const [aiType, setAiType] = useState("通用技能");

  // File import
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importPreview, setImportPreview] = useState<{ name: string; description: string; content: string; sourceFile: string } | null>(null);
  const [importFileName, setImportFileName] = useState("");

  // GitHub import
  const [githubUrl, setGithubUrl] = useState("");
  const [githubSkills, setGithubSkills] = useState<GitHubSkill[]>([]);
  const [githubScanning, setGithubScanning] = useState(false);

  const teamId = user?.currentTeamId || "";

  const loadSkills = useCallback(async () => {
    if (!teamId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/skills?teamId=${teamId}`);
      const data = await res.json();
      if (data.success) {
        setSkills(data.skills || data.data || []);
      }
    } catch (e) {
      console.error("Failed to load skills:", e);
    } finally {
      setLoading(false);
    }
  }, [teamId]);

  const loadPositions = useCallback(async () => {
    if (!teamId) return;
    try {
      const res = await fetch(`/api/positions?teamId=${teamId}`);
      const data = await res.json();
      if (data.success) {
        setPositions(data.data || data.positions || []);
      }
    } catch (e) {
      console.error("Failed to load positions:", e);
    }
  }, [teamId]);

  useEffect(() => {
    if (!authLoading && teamId) {
      loadSkills();
      loadPositions();
    }
  }, [authLoading, teamId, loadSkills, loadPositions]);

  // Load existing workflow when editing a skill
  useEffect(() => {
    if (!editSkill) {
      setWorkflowPreview(null);
      setWorkflowError("");
      setWorkflowSaved(false);
      setExistingWorkflowId(null);
      return;
    }
    (async () => {
      try {
        const res = await fetch(`/api/agents/workflows?skill_id=${editSkill.id}`);
        const data = await res.json();
        if (data.success && data.data && data.data.length > 0) {
          const wf = data.data[0];
          setExistingWorkflowId(wf.id);
          setWorkflowPreview({
            id: wf.id,
            name: wf.name,
            description: wf.description || "",
            trigger_condition: wf.trigger_condition || "",
            steps: wf.steps || [],
          });
          setWorkflowSaved(true);
          setWorkflowError("");
        } else {
          setWorkflowPreview(null);
          setWorkflowSaved(false);
          setExistingWorkflowId(null);
        }
      } catch {
        setWorkflowPreview(null);
        setWorkflowSaved(false);
        setExistingWorkflowId(null);
      }
    })();
  }, [editSkill]);

  const filteredSkills = skills.filter(s => {
    const matchSearch = !searchQuery || s.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchPosition = selectedPositionId === "all" || s.positionId === selectedPositionId;
    return matchSearch && matchPosition;
  });

  // --- Create handlers ---

  const resetCreateForm = () => {
    setManualName("");
    setManualDesc("");
    setManualContent("");
    setManualPositionId("");
    setAiName("");
    setAiDesc("");
    setAiType("通用技能");
    setImportPreview(null);
    setImportFileName("");
    setGithubUrl("");
    setGithubSkills([]);
    setCreateMode("manual");
  };

  const handleCreateOpen = () => {
    resetCreateForm();
    setCreateOpen(true);
  };

  // Manual create
  const handleManualCreate = async () => {
    if (!manualName.trim()) {
      toast.error("请输入技能名称");
      return;
    }
    setCreating(true);
    try {
      const res = await fetch("/api/skills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teamId,
          userId: user?.id,
          name: manualName.trim(),
          description: manualDesc.trim() || undefined,
          content: manualContent || "",
          positionId: manualPositionId || undefined,
          triggerCondition: manualTriggerCondition.trim() || undefined,
          inputSchema: manualInputSchema.trim() || undefined,
          outputSchema: manualOutputSchema.trim() || undefined,
          expectedOutput: manualExpectedOutput.trim() || undefined,
          isExecutable: manualIsExecutable,
        }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success("技能创建成功");
        setCreateOpen(false);
        loadSkills();
      } else {
        toast.error(data.error || "创建失败");
      }
    } catch (e) {
      toast.error("创建失败，请重试");
    } finally {
      setCreating(false);
    }
  };

  // AI generate
  const handleAiGenerate = async () => {
    if (!aiName.trim() && !aiDesc.trim()) {
      toast.error("请输入技能名称或描述");
      return;
    }
    setCreating(true);
    try {
      const res = await fetch("/api/skills/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: aiName.trim(), description: aiDesc.trim(), type: aiType }),
      });
      const data = await res.json();
      if (data.success && data.content) {
        setManualName(aiName.trim());
        setManualDesc(aiDesc.trim());
        setManualContent(data.content);
        if (data.triggerCondition) setManualTriggerCondition(data.triggerCondition);
        if (data.inputSchema) setManualInputSchema(typeof data.inputSchema === "string" ? data.inputSchema : JSON.stringify(data.inputSchema, null, 2));
        if (data.outputSchema) setManualOutputSchema(typeof data.outputSchema === "string" ? data.outputSchema : JSON.stringify(data.outputSchema, null, 2));
        if (data.expectedOutput) setManualExpectedOutput(data.expectedOutput);
        setCreateMode("manual");
        toast.success("AI 生成成功，请确认后保存");
      } else {
        toast.error(data.error || "生成失败");
      }
    } catch (e) {
      toast.error("生成失败，请重试");
    } finally {
      setCreating(false);
    }
  };

  // File import
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validExts = [".md", ".json", ".txt", ".yaml", ".yml"];
    const ext = "." + file.name.split(".").pop()?.toLowerCase();
    if (!validExts.includes(ext)) {
      toast.error("仅支持 .md / .json / .txt / .yaml 文件");
      return;
    }

    setImportFileName(file.name);
    setCreating(true);
    try {
      const content = await file.text();
      const res = await fetch("/api/skills/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teamId,
          userId: user?.id,
          name: file.name.replace(/\.(md|json|txt|yaml|yml)$/i, ""),
          content,
          sourceFile: file.name,
        }),
      });
      const data = await res.json();
      if (data.success && data.preview) {
        setImportPreview(data.preview);
      } else {
        toast.error(data.error || "解析失败");
      }
    } catch (e) {
      toast.error("文件读取失败");
    } finally {
      setCreating(false);
    }
  };

  const handleImportConfirm = async () => {
    if (!importPreview) return;
    setCreating(true);
    try {
      const res = await fetch("/api/skills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teamId,
          userId: user?.id,
          name: importPreview.name,
          description: importPreview.description,
          content: importPreview.content,
          sourceType: "imported",
          sourceFile: importPreview.sourceFile,
          positionId: manualPositionId || undefined,
        }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success("技能导入成功");
        setCreateOpen(false);
        loadSkills();
      } else {
        toast.error(data.error || "导入失败");
      }
    } catch (e) {
      toast.error("导入失败，请重试");
    } finally {
      setCreating(false);
    }
  };

  // GitHub import
  const handleGithubScan = async () => {
    if (!githubUrl.trim()) {
      toast.error("请输入 GitHub 仓库 URL");
      return;
    }
    setGithubScanning(true);
    setGithubSkills([]);
    try {
      const res = await fetch("/api/skills/import-from-github", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: githubUrl.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        setGithubSkills(data.skills || []);
        if (data.skills?.length === 0) {
          toast.info(data.message || "未找到 SKILL.md 文件");
        } else {
          toast.success(data.message || `找到 ${data.skills.length} 个技能`);
        }
      } else {
        toast.error(data.error || "扫描失败");
        if (data.hint) toast.info(data.hint);
      }
    } catch (e) {
      toast.error("扫描失败，请重试");
    } finally {
      setGithubScanning(false);
    }
  };

  const handleGithubImport = async (skill: GitHubSkill) => {
    setCreating(true);
    try {
      const res = await fetch("/api/skills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teamId,
          userId: user?.id,
          name: skill.name,
          description: skill.description,
          content: skill.content,
          sourceType: "github",
          sourceFile: skill.sourceFile,
          positionId: manualPositionId || undefined,
        }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(`「${skill.name}」导入成功`);
        loadSkills();
        setGithubSkills(prev => prev.filter(s => s.name !== skill.name));
      } else {
        toast.error(data.error || "导入失败");
      }
    } catch (e) {
      toast.error("导入失败，请重试");
    } finally {
      setCreating(false);
    }
  };

  // --- Edit / Delete handlers ---

  const handleEdit = (skill: Skill) => {
    setEditSkill(skill);
    setEditName(skill.name || "");
    setEditDescription(skill.description || "");
    setEditContent(skill.content || "");
    setEditIsExecutable(skill.isExecutable || false);
  };

  const handleSaveEdit = async () => {
    if (!editSkill) return;
    setSaving(true);
    try {
      const res = await fetch("/api/skills", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editSkill.id,
          name: editName,
          description: editDescription,
          content: editContent,
          teamId,
          isExecutable: editIsExecutable,
        }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success("技能已更新");
        setEditSkill(null);
        loadSkills();
      } else {
        toast.error(data.error || "更新失败");
      }
    } catch (e) {
      toast.error("更新失败，请重试");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (skill: Skill) => {
    if (!confirm(`确定删除技能「${skill.name}」吗？此操作不可撤销。`)) return;
    setDeleting(skill.id);
    try {
      const res = await fetch(`/api/skills?id=${skill.id}&teamId=${teamId}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        toast.success("技能已删除");
        loadSkills();
      } else {
        toast.error(data.error || "删除失败");
      }
    } catch (e) {
      toast.error("删除失败，请重试");
    } finally {
      setDeleting(null);
    }
  };

  const handleRegenerate = async (skill: Skill) => {
    if (!skill.agentId) {
      toast.error("该技能未关联智能体，无法重新生成");
      return;
    }
    try {
      const res = await fetch("/api/agents/regenerate-skills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId: skill.agentId, teamId }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success("技能已重新生成");
        loadSkills();
      } else {
        toast.error(data.error || "重新生成失败");
      }
    } catch (e) {
      toast.error("重新生成失败，请重试");
    }
  };

  const handleExport = async (skill: Skill) => {
    try {
      const res = await fetch(`/api/skills/export?id=${skill.id}&teamId=${teamId}`);
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${skill.name}.md`;
      a.click();
      window.URL.revokeObjectURL(url);
      toast.success("导出成功");
    } catch (e) {
      toast.error("导出失败");
    }
  };

  if (authLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-10 w-full" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1,2,3,4,5,6].map(i => <Skeleton key={i} className="h-40" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold">工作技能</h2>
          <p className="text-sm text-muted-foreground mt-1">管理所有技能，支持创建、编辑、导入和导出</p>
        </div>
        <Button onClick={handleCreateOpen}>
          <Plus className="h-4 w-4 mr-2" />创建技能
        </Button>
      </div>

      {/* 筛选栏 */}
      <div className="flex items-center gap-3 mb-6">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="搜索技能名称..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={selectedPositionId} onValueChange={setSelectedPositionId}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="全部岗位" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部岗位</SelectItem>
            {positions.map(p => (
              <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* 技能卡片网格 */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1,2,3,4,5,6].map(i => <Skeleton key={i} className="h-40" />)}
        </div>
      ) : filteredSkills.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <BookOpen className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p className="text-lg font-medium">暂无技能</p>
          <p className="text-sm mt-1">点击"创建技能"按钮开始创建，或创建数字成员时系统将自动生成技能</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredSkills.map(skill => (
            <Card key={skill.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1 min-w-0">
                    <h4 className="font-semibold truncate">{skill.name}</h4>
                    <div className="flex items-center gap-2 mt-1.5">
                      {skill.positionName && (
                        <Badge variant="secondary" className="text-xs">{skill.positionName}</Badge>
                      )}
                      {skill.sourceType === "generated" && (
                        <Badge variant="outline" className="text-xs">AI生成</Badge>
                      )}
                      {skill.sourceType === "imported" && (
                        <Badge variant="outline" className="text-xs">导入</Badge>
                      )}
                      {skill.sourceType === "github" && (
                        <Badge variant="outline" className="text-xs">GitHub</Badge>
                      )}
                    </div>
                  </div>
                </div>
                {skill.agentName && (
                  <p className="text-xs text-muted-foreground mb-3">
                    所属成员：{skill.agentName}
                  </p>
                )}
                <div className="flex items-center gap-1.5">
                  <Button variant="ghost" size="sm" onClick={() => setViewSkill(skill)}>
                    <Eye className="h-3.5 w-3.5 mr-1" />查看
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => handleEdit(skill)}>
                    <Edit3 className="h-3.5 w-3.5 mr-1" />编辑
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => handleExport(skill)}>
                    <FileDown className="h-3.5 w-3.5 mr-1" />导出
                  </Button>
                  {skill.agentId && (
                    <Button variant="ghost" size="sm" onClick={() => handleRegenerate(skill)}>
                      <RefreshCw className="h-3.5 w-3.5 mr-1" />重新生成
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => handleDelete(skill)} disabled={deleting === skill.id}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* 创建技能弹窗 */}
      <Dialog open={createOpen} onOpenChange={(open) => { if (!open) setCreateOpen(false); }}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>创建技能</DialogTitle>
            <DialogDescription>选择一种方式创建技能 SOP 文档</DialogDescription>
          </DialogHeader>

          <Tabs value={createMode} onValueChange={(v) => setCreateMode(v as CreateMode)} className="flex-1 flex flex-col">
            <TabsList className="grid grid-cols-4">
              <TabsTrigger value="manual"><FileText className="h-4 w-4 mr-2" />手动创建</TabsTrigger>
              <TabsTrigger value="ai"><Sparkles className="h-4 w-4 mr-2" />AI生成</TabsTrigger>
              <TabsTrigger value="import"><Upload className="h-4 w-4 mr-2" />文件导入</TabsTrigger>
              <TabsTrigger value="github"><Github className="h-4 w-4 mr-2" />GitHub</TabsTrigger>
            </TabsList>

            <div className="flex-1 overflow-y-auto mt-4">
              {/* 手动创建 */}
              <TabsContent value="manual" className="space-y-4 mt-0">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">技能名称 <span className="text-destructive">*</span></label>
                    <Input placeholder="如：客户服务技能" value={manualName} onChange={(e) => setManualName(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">所属岗位</label>
                    <Select value={manualPositionId} onValueChange={setManualPositionId}>
                      <SelectTrigger>
                        <SelectValue placeholder="选择岗位（可选）" />
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
                  <label className="text-sm font-medium">描述</label>
                  <Textarea placeholder="技能简短描述（可选），说明这个技能做什么、适用什么场景" value={manualDesc} onChange={(e) => setManualDesc(e.target.value)} className="min-h-[60px]" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">技能内容（Markdown）</label>
                  <Textarea
                    placeholder="输入 Markdown 格式的 SOP 文档..."
                    value={manualContent}
                    onChange={(e) => setManualContent(e.target.value)}
                    className="min-h-[250px] font-mono text-sm"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">触发条件</label>
                  <input
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                    placeholder="什么情况下触发此技能，如：当用户请求处理售后时"
                    value={manualTriggerCondition}
                    onChange={(e) => setManualTriggerCondition(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">输入参数定义（JSON Schema）</label>
                  <textarea
                    className="flex min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-xs font-mono shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                    placeholder={'{"type":"object","properties":{"keyword":{"type":"string"}}}'}
                    value={manualInputSchema}
                    onChange={(e) => setManualInputSchema(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">输出结果定义（JSON Schema）</label>
                  <textarea
                    className="flex min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-xs font-mono shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                    placeholder={'{"type":"object","properties":{"result":{"type":"string"}}}'}
                    value={manualOutputSchema}
                    onChange={(e) => setManualOutputSchema(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">预期输出描述</label>
                  <input
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                    placeholder="描述执行该技能后预期产生的输出"
                    value={manualExpectedOutput}
                    onChange={(e) => setManualExpectedOutput(e.target.value)}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <button
                    role="switch"
                    aria-checked={manualIsExecutable}
                    onClick={() => setManualIsExecutable(!manualIsExecutable)}
                    className={'relative inline-flex h-5 w-9 items-center rounded-full transition-colors ' + (manualIsExecutable ? 'bg-primary' : 'bg-input')}
                  >
                    <span className={'inline-block h-4 w-4 rounded-full bg-white transition-transform ' + (manualIsExecutable ? 'translate-x-4' : 'translate-x-0.5')} />
                  </button>
                  <label className="text-sm font-medium">可执行为工作流</label>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setCreateOpen(false)}>取消</Button>
                  <Button onClick={handleManualCreate} disabled={creating || !manualName.trim()}>
                    {creating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                    创建
                  </Button>
                </DialogFooter>
              </TabsContent>

              {/* AI生成 */}
              <TabsContent value="ai" className="space-y-4 mt-0">
                <div className="space-y-2">
                  <label className="text-sm font-medium">技能名称 <span className="text-destructive">*</span></label>
                  <Input placeholder="如：新媒体运营技能" value={aiName} onChange={(e) => setAiName(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">技能描述</label>
                  <Textarea
                    placeholder="描述技能的核心目标和适用范围..."
                    value={aiDesc}
                    onChange={(e) => setAiDesc(e.target.value)}
                    className="min-h-[80px]"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">技能类型</label>
                  <Select value={aiType} onValueChange={setAiType}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="通用技能">通用技能</SelectItem>
                      <SelectItem value="运营技能">运营技能</SelectItem>
                      <SelectItem value="技术技能">技术技能</SelectItem>
                      <SelectItem value="客服技能">客服技能</SelectItem>
                      <SelectItem value="销售技能">销售技能</SelectItem>
                      <SelectItem value="管理技能">管理技能</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <p className="text-xs text-muted-foreground">
                  AI 将根据名称和描述生成结构化的 SOP 文档，生成后会自动填充到手动创建表单中供您确认保存。
                </p>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setCreateOpen(false)}>取消</Button>
                  <Button onClick={handleAiGenerate} disabled={creating || (!aiName.trim() && !aiDesc.trim())}>
                    {creating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
                    {creating ? "生成中..." : "AI 生成"}
                  </Button>
                </DialogFooter>
              </TabsContent>

              {/* 文件导入 */}
              <TabsContent value="import" className="space-y-4 mt-0">
                <div className="border-2 border-dashed rounded-lg p-8 text-center">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".md,.json,.txt,.yaml,.yml"
                    className="hidden"
                    onChange={handleFileChange}
                  />
                  {importPreview ? (
                    <div className="space-y-4">
                      <div className="flex items-center gap-3 justify-center">
                        <FileText className="h-8 w-8 text-primary" />
                        <div className="text-left">
                          <p className="font-medium">{importPreview.name}</p>
                          <p className="text-sm text-muted-foreground">{importFileName}</p>
                        </div>
                      </div>
                      <div className="bg-muted/30 rounded-lg p-4 text-left max-h-[200px] overflow-y-auto">
                        <pre className="text-xs whitespace-pre-wrap">{importPreview.content.substring(0, 500)}</pre>
                        {importPreview.content.length > 500 && (
                          <p className="text-xs text-muted-foreground mt-2">...（内容过长，仅显示前500字符）</p>
                        )}
                      </div>
                      <div className="flex items-center gap-3 justify-center">
                        <Button variant="outline" onClick={() => { setImportPreview(null); setImportFileName(""); }}>
                          重新选择
                        </Button>
                        <Button onClick={handleImportConfirm} disabled={creating}>
                          {creating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                          确认导入
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <Upload className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
                      <p className="text-sm font-medium mb-1">点击上传文件</p>
                      <p className="text-xs text-muted-foreground mb-4">支持 .md / .json / .txt / .yaml 格式</p>
                      <Button variant="outline" onClick={() => fileInputRef.current?.click()} disabled={creating}>
                        {creating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
                        {creating ? "解析中..." : "选择文件"}
                      </Button>
                    </div>
                  )}
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">所属岗位</label>
                  <Select value={manualPositionId} onValueChange={setManualPositionId}>
                    <SelectTrigger>
                      <SelectValue placeholder="选择岗位（可选）" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">不关联岗位</SelectItem>
                      {positions.map(p => (
                        <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </TabsContent>

              {/* GitHub导入 */}
              <TabsContent value="github" className="space-y-4 mt-0">
                <div className="flex items-center gap-3">
                  <Input
                    placeholder="输入 GitHub 仓库 URL，如：https://github.com/owner/repo"
                    value={githubUrl}
                    onChange={(e) => setGithubUrl(e.target.value)}
                  />
                  <Button onClick={handleGithubScan} disabled={githubScanning || !githubUrl.trim()}>
                    {githubScanning ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Github className="h-4 w-4 mr-2" />}
                    {githubScanning ? "扫描中..." : "扫描"}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  将扫描仓库中所有 SKILL.md 文件，支持格式：https://github.com/owner/repo 或 owner/repo
                </p>

                {githubSkills.length > 0 && (
                  <div className="space-y-3 mt-4">
                    <p className="text-sm font-medium">找到 {githubSkills.length} 个技能：</p>
                    {githubSkills.map((skill, idx) => (
                      <Card key={idx}>
                        <CardContent className="p-4 flex items-center justify-between">
                          <div className="flex-1 min-w-0">
                            <p className="font-medium truncate">{skill.name}</p>
                            <p className="text-xs text-muted-foreground truncate">{skill.description || skill.sourceFile}</p>
                          </div>
                          <Button size="sm" onClick={() => handleGithubImport(skill)} disabled={creating}>
                            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : "导入"}
                          </Button>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </TabsContent>
            </div>
          </Tabs>
        </DialogContent>
      </Dialog>

      {/* 查看技能弹窗 */}
      <Dialog open={!!viewSkill} onOpenChange={() => setViewSkill(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{viewSkill?.name}</DialogTitle>
          </DialogHeader>
          <div className="prose prose-sm dark:prose-invert max-w-none">
            <pre className="whitespace-pre-wrap font-sans text-sm bg-muted/30 p-4 rounded-lg">
              {viewSkill?.content || "暂无内容"}
            </pre>
          </div>
        </DialogContent>
      </Dialog>

      {/* 编辑技能弹窗 */}
      <Dialog open={!!editSkill} onOpenChange={() => setEditSkill(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>编辑技能</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto space-y-3">
            {/* 技能名称和描述 */}
            <div className="space-y-2">
              <div className="space-y-1">
                <Label className="text-xs font-medium">技能名称 *</Label>
                <Input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="如：竞品调研"
                  className="text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-medium">描述</Label>
                <Textarea
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  placeholder="简要说明这个技能做什么、适用什么场景"
                  className="text-sm min-h-[60px]"
                />
              </div>
            </div>
            {/* 可执行开关 */}
            <div className="flex items-start gap-2">
              <Switch checked={editIsExecutable} onCheckedChange={setEditIsExecutable} className="mt-0.5" />
              <div className="space-y-0.5">
                <Label className="text-xs font-medium">启用执行模式</Label>
                <p className="text-[11px] text-muted-foreground">
                  开启后，LLM 可以在对话中通过 execute_skill 发现并调用此技能。关闭后此技能不可见。
                </p>
              </div>
            </div>
            {/* 输入输出契约 */}
            <Textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              className="min-h-[280px] font-mono text-sm"
              placeholder="在此编辑 Markdown 格式的 SOP 文档..."
            />
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  if (!editSkill) return;
                  setGeneratingWorkflow(true);
                  try {
                    const res = await fetch("/api/skills/generate-workflow", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ skill_id: editSkill.id, content: editContent }),
                    });
                    const data = await res.json();
                    if (res.ok && data.steps && Array.isArray(data.steps)) {
                      setWorkflowPreview(data);
                      setWorkflowError("");
                    } else {
                      setWorkflowError(data.error || "生成失败");
                    }
                  } catch (err) {
                    setWorkflowError(err instanceof Error ? err.message : "生成失败");
                  } finally {
                    setGeneratingWorkflow(false);
                  }
                }}
                disabled={generatingWorkflow || !editSkill}
              >
                {generatingWorkflow ? (
                  <><Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> 解析中...</>
                ) : (
                  <><Zap className="w-3.5 h-3.5 mr-1" /> 生成工作流</>
                )}
              </Button>
              {workflowPreview && (
                <span className="text-xs text-green-600">✅ 已生成 {workflowPreview.steps.length} 步工作流</span>
              )}
              {workflowError && (
                <span className="text-xs text-destructive">{workflowError}</span>
              )}
            </div>
            {workflowPreview && (
              <div className="border rounded-lg p-3 bg-muted/30 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium flex items-center gap-1.5">
                    <GitBranch className="w-3.5 h-3.5" />
                    工作流编辑器
                  </h4>
                  <div className="flex gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={async () => {
                        if (!editSkill) return;
                        try {
                          const isUpdate = existingWorkflowId !== null;
                          const res = await fetch("/api/agents/workflows", {
                            method: isUpdate ? "PUT" : "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              id: isUpdate ? existingWorkflowId : undefined,
                              agent_id: null,
                              skill_id: editSkill.id,
                              team_id: teamId,
                              name: workflowPreview.name,
                              description: workflowPreview.description,
                              trigger_condition: workflowPreview.trigger_condition,
                              steps: workflowPreview.steps,
                            }),
                          });
                          const data = await res.json();
                          if (data.success) {
                            setWorkflowSaved(true);
                            if (data.data?.id) {
                              setExistingWorkflowId(data.data.id);
                              setTimeout(() => {
                                router.push(`/members/workflows/${data.data.id}`);
                              }, 600);
                            } else {
                              setTimeout(() => setWorkflowSaved(false), 2000);
                            }
                          }
                        } catch {}
                      }}
                    >
                      {workflowSaved ? "✅ 已保存" : "💾 保存工作流"}
                    </Button>
                  </div>
                </div>
                <WorkflowEditor
                  workflow={workflowPreview}
                  onChange={setWorkflowPreview}
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setEditSkill(null);
              setWorkflowPreview(null);
              setWorkflowError("");
              setWorkflowSaved(false);
            }}>取消</Button>
            <Button onClick={handleSaveEdit} disabled={saving}>
              {saving ? "保存中..." : "保存"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}