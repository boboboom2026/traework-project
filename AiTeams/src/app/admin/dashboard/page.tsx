"use client";

import { useState, useEffect } from "react";
import { Building2, Users, Bot, MessageSquare, Clock, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface Stats {
  teams: { total: number; active: number; frozen: number };
  users: { total: number; active: number; banned: number };
  agents: { total: number; active: number; pendingReview: number };
  messages: { last7Days: number; channels: number; dms: number; agentChats: number };
}

const statCards = [
  { key: "teams", label: "团队", icon: Building2, color: "text-blue-500", bgColor: "bg-blue-500/10" },
  { key: "users", label: "用户", icon: Users, color: "text-green-500", bgColor: "bg-green-500/10" },
  { key: "agents", label: "智能体", icon: Bot, color: "text-purple-500", bgColor: "bg-purple-500/10" },
  { key: "messages", label: "近7天消息", icon: MessageSquare, color: "text-orange-500", bgColor: "bg-orange-500/10" },
] as const;

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    loadStats();
  }, []);

  async function loadStats() {
    try {
      const token = localStorage.getItem("auth_token");
      const res = await fetch("/api/admin/stats", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) {
        setStats(data.data);
      } else {
        setError(data.error || "加载失败");
      }
    } catch {
      setError("网络错误");
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <AlertTriangle className="w-12 h-12 text-muted-foreground/30" />
        <p className="text-muted-foreground">{error}</p>
        <button onClick={loadStats} className="text-sm text-primary hover:underline">重新加载</button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">总览仪表盘</h1>
        <p className="text-sm text-muted-foreground mt-1">平台整体运行数据概览</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">团队</CardTitle>
            <Building2 className="w-4 h-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.teams.total || 0}</div>
            <div className="flex gap-4 mt-1 text-xs text-muted-foreground">
              <span className="text-green-500">{stats?.teams.active || 0} 活跃</span>
              <span className="text-red-500">{stats?.teams.frozen || 0} 冻结</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">用户</CardTitle>
            <Users className="w-4 h-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.users.total || 0}</div>
            <div className="flex gap-4 mt-1 text-xs text-muted-foreground">
              <span className="text-green-500">{stats?.users.active || 0} 活跃</span>
              <span className="text-red-500">{stats?.users.banned || 0} 封禁</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">智能体</CardTitle>
            <Bot className="w-4 h-4 text-purple-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.agents.total || 0}</div>
            <div className="flex gap-4 mt-1 text-xs text-muted-foreground">
              <span className="text-green-500">{stats?.agents.active || 0} 活跃</span>
              {stats?.agents.pendingReview ? (
                <span className="text-orange-500">{stats.agents.pendingReview} 待审核</span>
              ) : null}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">近7天消息</CardTitle>
            <MessageSquare className="w-4 h-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.messages.last7Days || 0}</div>
            <div className="flex gap-4 mt-1 text-xs text-muted-foreground">
              <span>频道 {stats?.messages.channels || 0}</span>
              <span>私信 {stats?.messages.dms || 0}</span>
              <span>AI {stats?.messages.agentChats || 0}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="hover:bg-muted/50 transition-colors cursor-pointer" onClick={() => window.location.href = "/admin/teams"}>
          <CardContent className="flex items-center gap-4 py-4">
            <div className="p-2 rounded-lg bg-blue-500/10">
              <Building2 className="w-5 h-5 text-blue-500" />
            </div>
            <div>
              <p className="font-medium text-sm">团队管理</p>
              <p className="text-xs text-muted-foreground">查看和管理所有团队</p>
            </div>
          </CardContent>
        </Card>

        <Card className="hover:bg-muted/50 transition-colors cursor-pointer" onClick={() => window.location.href = "/admin/users"}>
          <CardContent className="flex items-center gap-4 py-4">
            <div className="p-2 rounded-lg bg-green-500/10">
              <Users className="w-5 h-5 text-green-500" />
            </div>
            <div>
              <p className="font-medium text-sm">用户管理</p>
              <p className="text-xs text-muted-foreground">管理用户和平台角色</p>
            </div>
          </CardContent>
        </Card>

        <Card className="hover:bg-muted/50 transition-colors cursor-pointer" onClick={() => window.location.href = "/admin/agents"}>
          <CardContent className="flex items-center gap-4 py-4">
            <div className="p-2 rounded-lg bg-purple-500/10">
              <Bot className="w-5 h-5 text-purple-500" />
            </div>
            <div>
              <p className="font-medium text-sm">智能体审核</p>
              <p className="text-xs text-muted-foreground">审核和管理智能体</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}