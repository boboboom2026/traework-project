"use client";

import { useParams, useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { ArrowLeft, Save, Trash2, Loader2, AlertCircle, CheckCircle, Brain, Bot, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { WorkflowEditor } from "@/components/apps/workflow-editor";
import type { WorkflowDefinition } from "@/lib/workflow-executor";
import { toast } from "sonner";

export default function WorkflowEditPage() {
  const params = useParams();
  const router = useRouter();
  const workflowId = params.id as string;

  const [workflow, setWorkflow] = useState<WorkflowDefinition>({
    id: workflowId,
    name: "",
    description: "",
    trigger_condition: "",
    steps: [],
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [skillName, setSkillName] = useState<string>("");
  const [agentName, setAgentName] = useState<string>("");

  useEffect(() => {
    if (!workflowId) return;
    const loadWorkflow = async () => {
      try {
        setLoading(true);
        const res = await fetch(`/api/agents/workflows?id=${workflowId}`);
        const data = await res.json();
        if (data.success && data.data) {
          const wf = Array.isArray(data.data) ? data.data[0] : data.data;
          if (!wf) { setError("工作流不存在或已被删除"); return; }
          setWorkflow({
            id: wf.id || workflowId,
            name: wf.name || "",
            description: wf.description || "",
            trigger_condition: wf.trigger_condition || "",
            steps: wf.steps || [],
          });
          // 加载关联的 Skill 名称
          if (wf.skill_id) {
            try {
              const skillRes = await fetch(`/api/skills?id=${wf.skill_id}`);
              const skillData = await skillRes.json();
              if (skillData.success && skillData.data) {
                setSkillName(skillData.data.name || "");
              }
            } catch {}
          }
          // 加载关联的 Agent 名称
          if (wf.agent_id) {
            try {
              const agentRes = await fetch(`/api/agents?id=${wf.agent_id}`);
              const agentData = await agentRes.json();
              if (agentData.success && agentData.data) {
                setAgentName(agentData.data.name || "");
              }
            } catch {}
          }
        } else {
          setError("工作流不存在或已被删除");
        }
      } catch (e) {
        setError("加载工作流失败");
      } finally {
        setLoading(false);
      }
    };
    loadWorkflow();
  }, [workflowId]);

  const handleSave = async () => {
    if (!workflow.name.trim()) {
      toast.error("请输入工作流名称");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/agents/workflows`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: workflowId,
          name: workflow.name,
          description: workflow.description,
          trigger_condition: workflow.trigger_condition,
          steps: workflow.steps,
        }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success("保存成功");
      } else {
        toast.error(data.error || "保存失败");
      }
    } catch {
      toast.error("保存失败，请检查网络");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm("确定要删除此工作流吗？此操作不可恢复。")) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/agents/workflows?id=${workflowId}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (data.success) {
        toast.success("已删除");
        router.push("/members/workflows");
      } else {
        toast.error(data.error || "删除失败");
      }
    } catch {
      toast.error("删除失败");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <AlertCircle className="w-12 h-12 text-destructive" />
        <p className="text-lg text-muted-foreground">{error}</p>
        <Button variant="outline" onClick={() => router.push("/members/workflows")}>
          返回工作流列表
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* 顶部操作栏 */}
      <div className="flex items-center justify-between px-6 py-3 border-b shrink-0">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.push("/members/workflows")}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-lg font-semibold">{workflow.name || "未命名工作流"}</h1>
            <div className="flex items-center gap-2 mt-0.5">
              {skillName && (
                <Badge variant="secondary" className="gap-1 text-xs">
                  <BookOpen className="w-3 h-3" />
                  {skillName}
                </Badge>
              )}
              {agentName && (
                <Badge variant="secondary" className="gap-1 text-xs">
                  <Bot className="w-3 h-3" />
                  {agentName}
                </Badge>
              )}
              <Badge variant="outline" className="text-xs">
                {workflow.steps.length} 步
              </Badge>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleDelete} disabled={saving}>
            <Trash2 className="w-4 h-4 mr-1" />
            删除
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
            保存
          </Button>
        </div>
      </div>

      {/* 编辑区 */}
      <div className="flex-1 overflow-auto p-6">
        <Card className="p-6 max-w-4xl mx-auto">
          <WorkflowEditor
            workflow={workflow}
            onChange={setWorkflow}
          />
        </Card>
      </div>
    </div>
  );
}