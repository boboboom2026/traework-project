"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Building2, Users, Bot, Clock, Shield } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

interface TeamDetail {
  id: string;
  name: string;
  type: string;
  industry: string;
  is_active: boolean;
  created_at: string;
  memberCount: number;
  agentCount: number;
  owner?: { id: string; name: string; phone: string; avatar: string };
  members?: { role: string; joined_at: string; user: { id: string; name: string; phone: string; avatar: string; is_active: boolean; platform_role: string } }[];
}

export default function AdminTeamDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [team, setTeam] = useState<TeamDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadTeam();
  }, [params.id]);

  async function loadTeam() {
    try {
      const token = localStorage.getItem("auth_token");
      const res = await fetch(`/api/admin/teams/${params.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) setTeam(data.data);
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

  if (!team) {
    return <div className="text-center py-20 text-muted-foreground">团队不存在</div>;
  }

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" onClick={() => router.back()} className="gap-1">
        <ArrowLeft className="w-4 h-4" />
        返回团队列表
      </Button>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center">
            <Building2 className="w-6 h-6 text-blue-500" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">{team.name}</h1>
            <p className="text-sm text-muted-foreground">
              {team.type} · {team.industry || "未设置行业"} · 创建于 {new Date(team.created_at).toLocaleDateString()}
            </p>
          </div>
        </div>
        <Badge variant={team.is_active ? "default" : "secondary"}>{team.is_active ? "活跃" : "冻结"}</Badge>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
              <Users className="w-4 h-4" /> 成员
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{team.memberCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
              <Bot className="w-4 h-4" /> 智能体
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{team.agentCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
              <Clock className="w-4 h-4" /> 创建时间
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm font-medium">{new Date(team.created_at).toLocaleDateString()}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">成员列表 ({team.memberCount})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {team.members?.map((member) => (
              <div key={member.user.id} className="flex items-center justify-between p-3 rounded-lg border border-border">
                <div className="flex items-center gap-3">
                  <Avatar className="w-8 h-8">
                    <AvatarFallback>{member.user.name?.charAt(0) || "?"}</AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="text-sm font-medium">
                      {member.user.name}
                      {member.role === "owner" && (
                        <Badge variant="outline" className="ml-2 text-xs">所有者</Badge>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">{member.user.phone}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {member.user.platform_role && member.user.platform_role !== "user" && (
                    <Badge variant="secondary" className="text-xs gap-1">
                      <Shield className="w-3 h-3" />
                      {member.user.platform_role === "super_admin" ? "超管" : "管理员"}
                    </Badge>
                  )}
                  <Badge variant={member.user.is_active ? "default" : "secondary"} className="text-xs">
                    {member.user.is_active ? "活跃" : "封禁"}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}