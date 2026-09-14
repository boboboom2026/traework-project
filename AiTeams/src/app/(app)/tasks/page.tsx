"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreVertical, Plus, Play, PenLine, History, Trash2, Bot } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { apiJson, withTeamId } from "@/lib/api-client";
import { toast } from "sonner";
import type { WorkflowDefinitionV2 } from "@/lib/workflow/types";

interface Task {
  id: string;
  name: string;
  description: string;
  status: "draft" | "active" | "archived";
  agent_id: string | null;
  trigger_condition: string;
  definition: WorkflowDefinitionV2;
  created_at: string;
  updated_at: string;
}

const STATUS_MAP: Record<Task["status"], { label: string; className: string }> = {
  draft: { label: "草稿", className: "bg-muted text-muted-foreground" },
  active: { label: "运行中", className: "bg-primary/10 text-primary" },
  archived: { label: "已归档", className: "bg-destructive/10 text-destructive" },
};

export default function TasksPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

  const loadTasks = useCallback(async () => {
    try {
      const json = await apiJson<{ data?: Task[] }>(withTeamId("/api/tasks", user?.currentTeamId));
      setTasks(json.data ?? []);
    } catch (e) {
      console.error("加载任务失败:", e);
      toast.error(e instanceof Error ? e.message : "加载任务失败");
    } finally {
      setLoading(false);
    }
  }, [user?.currentTeamId]);

  useEffect(() => {
    if (user) loadTasks();
  }, [user, loadTasks]);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const json = await apiJson<{ data?: { id: string } }>("/api/tasks", {
        method: "POST",
        body: JSON.stringify({ name: newName.trim(), teamId: user?.currentTeamId }),
      });
      if (json.data) {
        setCreateOpen(false);
        setNewName("");
        router.push(`/tasks/${json.data.id}/edit`);
      }
    } catch (e) {
      console.error("创建任务失败:", e);
      toast.error(e instanceof Error ? e.message : "创建任务失败");
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("确定删除该任务吗？")) return;
    try {
      await apiJson(withTeamId(`/api/tasks?id=${id}`, user?.currentTeamId), { method: "DELETE" });
      loadTasks();
    } catch (e) {
      console.error("删除任务失败:", e);
      toast.error(e instanceof Error ? e.message : "删除任务失败");
    }
  };

  const nodeCount = (t: Task) => t.definition?.nodes?.length ?? 0;

  return (
    <div className="mx-auto max-w-5xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">任务</h1>
          <p className="text-sm text-muted-foreground">编排、运行并追踪自动化任务流程</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="mr-1 h-4 w-4" />
          新建任务
        </Button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      ) : tasks.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Bot className="mb-3 h-10 w-10 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">还没有任务，创建一个开始编排</p>
            <Button className="mt-4" onClick={() => setCreateOpen(true)}>
              <Plus className="mr-1 h-4 w-4" />
              新建任务
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {tasks.map((t) => (
            <Card key={t.id} className="group transition-colors hover:border-primary/40">
              <CardContent className="flex items-center gap-4 p-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="truncate font-medium">{t.name}</h3>
                    <Badge className={STATUS_MAP[t.status].className}>{STATUS_MAP[t.status].label}</Badge>
                  </div>
                  <p className="mt-1 truncate text-sm text-muted-foreground">
                    {t.description || "暂无描述"}
                  </p>
                  <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                    <span>{nodeCount(t)} 个节点</span>
                    {t.agent_id && <span>已关联智能体</span>}
                    <span>更新于 {new Date(t.updated_at || t.created_at).toLocaleString()}</span>
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="sm" onClick={() => router.push(`/tasks/${t.id}/edit`)}>
                    <PenLine className="h-4 w-4" />
                    编排
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => router.push(`/tasks/${t.id}/run`)}>
                    <Play className="h-4 w-4" />
                    执行
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => router.push(`/tasks/${t.id}/runs`)}>
                    <History className="h-4 w-4" />
                    记录
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onClick={() => handleDelete(t.id)}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        删除
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>新建任务</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="task-name">任务名称</Label>
            <Input
              id="task-name"
              placeholder="例如：采购申请审批"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreate();
              }}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              取消
            </Button>
            <Button onClick={handleCreate} disabled={creating || !newName.trim()}>
              {creating ? "创建中..." : "创建并编排"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}