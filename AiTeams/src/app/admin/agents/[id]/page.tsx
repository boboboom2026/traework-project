"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Bot, Building2, BookOpen, Wrench, Shield, Clock, Brain } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface AgentDetail {
  id: string;
  name: string;
  description: string;
  system_prompt: string;
  agent_md: string;
  team_name: string;
  team_id: string;
  is_active: boolean;
  review_status: string;
  created_at: string;
  model_config: { model: string; temperature: number; max_tokens: number };
  greeting: string;
  user_guidance: string;
  skills: { id: string; name: string }[];
  tools: { id: string; name: string }[];
  rag_datasets: { id: string; name: string }[];
  prompt_guard_enabled: boolean;
  tool_approval_mode: string;
  memory_enabled: boolean;
  channel_context_enabled: boolean;
  notify_enabled: boolean;
  max_iterations: number;
}

export default function AdminAgentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [agent, setAgent] = useState<AgentDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAgent();
  }, [params.id]);

  async function loadAgent() {
    try {
      const token = localStorage.getItem("auth_token");
      const res = await fetch(`/api/admin/agents/${params.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) setAgent(data.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!agent) {
    return <div className="text-center py-20 text-muted-foreground">智能体不存在</div>;
  }

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" onClick={() => router.back()} className="gap-1">
        <ArrowLeft className="w-4 h-4" />
        返回智能体列表
      </Button>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-purple-500/10 flex items-center justify-center">
            <Bot className="w-6 h-6 text-purple-500" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">{agent.name}</h1>
            <div className="flex items-center gap-2 mt-1">
              <Badge
                variant={
                  agent.review_status === "approved" ? "default" :
                  agent.review_status === "rejected" ? "destructive" : "secondary"
                }
              >
                {agent.review_status === "approved" ? "已通过" :
                 agent.review_status === "rejected" ? "已驳回" : "待审核"}
              </Badge>
              <Badge variant={agent.is_active ? "default" : "secondary"}>
                {agent.is_active ? "启用" : "停用"}
              </Badge>
              <span className="text-sm text-muted-foreground">
                团队: {agent.team_name}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <Brain className="w-4 h-4" /> 模型配置
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">模型</span><span>{agent.model_config?.model || "默认"}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">温度</span><span>{agent.model_config?.temperature ?? "-"}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">最大Token</span><span>{agent.model_config?.max_tokens ?? "-"}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">最大迭代</span><span>{agent.max_iterations ?? "-"}</span></div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <Shield className="w-4 h-4" /> 安全配置
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Prompt注入检测</span><Badge variant={agent.prompt_guard_enabled ? "default" : "secondary"} className="text-xs">{agent.prompt_guard_enabled ? "开启" : "关闭"}</Badge></div>
            <div className="flex justify-between"><span className="text-muted-foreground">工具审批</span><span>{agent.tool_approval_mode || "auto"}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">持久化记忆</span><Badge variant={agent.memory_enabled ? "default" : "secondary"} className="text-xs">{agent.memory_enabled ? "开启" : "关闭"}</Badge></div>
            <div className="flex justify-between"><span className="text-muted-foreground">频道上下文</span><Badge variant={agent.channel_context_enabled ? "default" : "secondary"} className="text-xs">{agent.channel_context_enabled ? "开启" : "关闭"}</Badge></div>
            <div className="flex justify-between"><span className="text-muted-foreground">主动推送</span><Badge variant={agent.notify_enabled ? "default" : "secondary"} className="text-xs">{agent.notify_enabled ? "开启" : "关闭"}</Badge></div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <BookOpen className="w-4 h-4" /> 关联技能 ({agent.skills?.length || 0})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              {agent.skills?.map((s) => (
                <div key={s.id} className="text-sm">{s.name}</div>
              ))}
              {(!agent.skills || agent.skills.length === 0) && (
                <p className="text-sm text-muted-foreground">无</p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <Wrench className="w-4 h-4" /> 关联工具 ({agent.tools?.length || 0})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              {agent.tools?.map((t) => (
                <div key={t.id} className="text-sm">{t.name}</div>
              ))}
              {(!agent.tools || agent.tools.length === 0) && (
                <p className="text-sm text-muted-foreground">无</p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <Building2 className="w-4 h-4" /> 关联知识库 ({agent.rag_datasets?.length || 0})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              {agent.rag_datasets?.map((r) => (
                <div key={r.id} className="text-sm">{r.name}</div>
              ))}
              {(!agent.rag_datasets || agent.rag_datasets.length === 0) && (
                <p className="text-sm text-muted-foreground">无</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {agent.system_prompt && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">System Prompt</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="text-xs whitespace-pre-wrap bg-muted p-3 rounded-md max-h-60 overflow-y-auto">{agent.system_prompt}</pre>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Clock className="w-4 h-4" /> 基本信息
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex justify-between"><span className="text-muted-foreground">描述</span><span>{agent.description || "无"}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">开场白</span><span>{agent.greeting || "无"}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">创建时间</span><span>{new Date(agent.created_at).toLocaleString()}</span></div>
        </CardContent>
      </Card>
    </div>
  );
}