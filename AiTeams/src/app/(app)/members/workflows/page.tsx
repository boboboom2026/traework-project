"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Search, Workflow, Trash2, ExternalLink, Loader2, BookOpen, Check } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface WorkflowItem {
  id: string;
  name: string;
  description: string;
  skill_id: string | null;
  agent_id: string | null;
  team_id: string;
  steps: unknown[];
  trigger_condition: string;
  is_active: boolean;
  created_at: string;
  updated_at: string | null;
}

interface SkillItem {
  id: string;
  name: string;
  description?: string;
  position_id?: string | null;
}

export default function WorkflowsPage() {
  const router = useRouter();
  const { user } = useAuth();
  const teamId = user?.currentTeamId;
  const [workflows, setWorkflows] = useState<WorkflowItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // 从技能生成弹窗
  const [showSkillDialog, setShowSkillDialog] = useState(false);
  const [skills, setSkills] = useState<SkillItem[]>([]);
  const [skillsLoading, setSkillsLoading] = useState(false);
  const [skillSearch, setSkillSearch] = useState("");
  const [selectedSkillId, setSelectedSkillId] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  const loadWorkflows = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (teamId) params.set("team_id", teamId);
      const res = await fetch(`/api/agents/workflows?${params.toString()}`);
      const data = await res.json();
      if (data.success) {
        setWorkflows(data.data || []);
      }
    } catch (err) {
      console.error("Failed to load workflows:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadWorkflows();
  }, [teamId]);

  const loadSkills = async () => {
    if (!teamId) return;
    setSkillsLoading(true);
    try {
      const res = await fetch(`/api/skills?teamId=${teamId}&search=${skillSearch}`);
      const data = await res.json();
      if (data.success) {
        setSkills(data.skills || data.data || []);
      } else {
        setSkills([]);
      }
    } catch {
      setSkills([]);
    } finally {
      setSkillsLoading(false);
    }
  };

  useEffect(() => {
    if (showSkillDialog && teamId) {
      loadSkills();
    }
  }, [showSkillDialog, teamId]);

  // 搜索技能时重新加载
  useEffect(() => {
    if (showSkillDialog && teamId) {
      const timer = setTimeout(() => loadSkills(), 300);
      return () => clearTimeout(timer);
    }
  }, [skillSearch]);

  const handleGenerateWorkflow = async () => {
    if (!selectedSkillId) return;
    setGenerating(true);
    try {
      const res = await fetch("/api/skills/generate-workflow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skill_id: selectedSkillId }),
      });
      const data = await res.json();
      if (res.ok && data.steps) {
        // 保存工作流
        const saveRes = await fetch("/api/agents/workflows", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: data.name,
            description: data.description || "",
            trigger_condition: data.trigger_condition || "",
            steps: data.steps,
            skill_id: selectedSkillId,
            team_id: teamId,
          }),
        });
        const saveData = await saveRes.json();
        if (saveData.success) {
          setShowSkillDialog(false);
          setSelectedSkillId(null);
          setSkillSearch("");
          loadWorkflows();
          router.push(`/members/workflows/${saveData.data.id}`);
        }
      }
    } catch (err) {
      console.error("生成工作流失败:", err);
    } finally {
      setGenerating(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      await fetch(`/api/agents/workflows?id=${deleteId}`, { method: "DELETE" });
      setWorkflows((prev) => prev.filter((w) => w.id !== deleteId));
    } catch (err) {
      console.error("Failed to delete workflow:", err);
    } finally {
      setDeleting(false);
      setDeleteId(null);
    }
  };

  const filtered = workflows.filter(
    (w) =>
      w.name.toLowerCase().includes(search.toLowerCase()) ||
      (w.description && w.description.toLowerCase().includes(search.toLowerCase()))
  );

  const stepCount = (steps: unknown[]) => (Array.isArray(steps) ? steps.length : 0);

  const filteredSkills = skills.filter(
    (s) =>
      s.name.toLowerCase().includes(skillSearch.toLowerCase()) ||
      (s.description && s.description.toLowerCase().includes(skillSearch.toLowerCase()))
  );

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">工作流</h1>
          <p className="text-sm text-muted-foreground mt-1">
            管理工作流的执行步骤和配置
          </p>
        </div>
        <Button
          onClick={() => setShowSkillDialog(true)}
          className="gap-2"
        >
          <Plus className="w-4 h-4" />
          从技能生成
        </Button>
      </div>

      {/* Search */}
      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="搜索工作流..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Empty state */}
      {!loading && filtered.length === 0 && (
        <div className="text-center py-20">
          <Workflow className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
          <p className="text-muted-foreground">
            {search ? "没有匹配的工作流" : "还没有工作流，请先从技能生成"}
          </p>
          {!search && (
            <Button
              onClick={() => setShowSkillDialog(true)}
              variant="outline"
              className="mt-4 gap-2"
            >
              <Plus className="w-4 h-4" />
              从技能生成
            </Button>
          )}
        </div>
      )}

      {/* Workflow list */}
      {!loading && filtered.length > 0 && (
        <div className="grid gap-3">
          {filtered.map((wf) => (
            <Card
              key={wf.id}
              className="cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => router.push(`/members/workflows/${wf.id}`)}
            >
              <CardHeader className="pb-2 flex flex-row items-start justify-between">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-1">
                    <Workflow className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <CardTitle className="text-base">{wf.name}</CardTitle>
                    {wf.description && (
                      <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                        {wf.description}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge variant="secondary" className="text-xs">
                    {stepCount(wf.steps)} 步
                  </Badge>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="w-8 h-8"
                    onClick={(e) => {
                      e.stopPropagation();
                      router.push(`/members/workflows/${wf.id}`);
                    }}
                  >
                    <ExternalLink className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="w-8 h-8 text-destructive hover:text-destructive"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteId(wf.id);
                    }}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </CardHeader>
            </Card>
          ))}
        </div>
      )}

      {/* 从技能生成弹窗 */}
      <Dialog open={showSkillDialog} onOpenChange={(open) => {
        setShowSkillDialog(open);
        if (!open) {
          setSelectedSkillId(null);
          setSkillSearch("");
        }
      }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>从技能生成工作流</DialogTitle>
            <DialogDescription>
              选择一个技能，AI 将自动解析其 SOP 文档并生成可执行的工作流
            </DialogDescription>
          </DialogHeader>

          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="搜索技能..."
              value={skillSearch}
              onChange={(e) => setSkillSearch(e.target.value)}
              className="pl-10"
            />
          </div>

          <div className="max-h-64 overflow-y-auto space-y-1">
            {skillsLoading && (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            )}
            {!skillsLoading && filteredSkills.length === 0 && (
              <p className="text-center py-8 text-sm text-muted-foreground">
                没有找到技能
              </p>
            )}
            {!skillsLoading && filteredSkills.map((skill) => (
              <div
                key={skill.id}
                className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors ${
                  selectedSkillId === skill.id
                    ? "bg-primary/10 border border-primary/30"
                    : "hover:bg-muted border border-transparent"
                }`}
                onClick={() => setSelectedSkillId(skill.id)}
              >
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <BookOpen className="w-4 h-4 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{skill.name}</p>
                  {skill.description && (
                    <p className="text-xs text-muted-foreground truncate">{skill.description}</p>
                  )}
                </div>
                {selectedSkillId === skill.id && (
                  <Check className="w-4 h-4 text-primary shrink-0" />
                )}
              </div>
            ))}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowSkillDialog(false);
                setSelectedSkillId(null);
                setSkillSearch("");
              }}
            >
              取消
            </Button>
            <Button
              onClick={handleGenerateWorkflow}
              disabled={!selectedSkillId || generating}
            >
              {generating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  生成中...
                </>
              ) : (
                "生成工作流"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm dialog */}
      <AlertDialog
        open={!!deleteId}
        onOpenChange={(open) => !open && setDeleteId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>
              删除后不可恢复，已绑定该工作流的智能体将不再触发工作流执行。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "删除中..." : "确认删除"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}