"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Mail, Phone, Calendar, Building2, Shield, Clock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

interface UserDetail {
  id: string;
  name: string;
  phone: string;
  email: string;
  avatar: string;
  is_active: boolean;
  platform_role: string;
  created_at: string;
  teams: { role: string; joined_at: string; team: { id: string; name: string; type: string; logo: string } }[];
  sessions: { created_at: string; last_used_at: string }[];
}

export default function AdminUserDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [user, setUser] = useState<UserDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadUser();
  }, [params.id]);

  async function loadUser() {
    try {
      const token = localStorage.getItem("auth_token");
      const res = await fetch(`/api/admin/users/${params.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) setUser(data.data);
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

  if (!user) {
    return <div className="text-center py-20 text-muted-foreground">用户不存在</div>;
  }

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" onClick={() => router.back()} className="gap-1">
        <ArrowLeft className="w-4 h-4" />
        返回用户列表
      </Button>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Avatar className="w-14 h-14">
            <AvatarFallback className="text-lg">{user.name?.charAt(0) || "?"}</AvatarFallback>
          </Avatar>
          <div>
            <h1 className="text-2xl font-bold">{user.name}</h1>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant={user.is_active ? "default" : "secondary"}>{user.is_active ? "活跃" : "封禁"}</Badge>
              {user.platform_role !== "user" && (
                <Badge variant="outline" className="gap-1">
                  <Shield className="w-3 h-3" />
                  {user.platform_role === "super_admin" ? "超级管理员" : "平台管理员"}
                </Badge>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">基本信息</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2 text-sm">
              <Phone className="w-4 h-4 text-muted-foreground" />
              <span>{user.phone}</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Mail className="w-4 h-4 text-muted-foreground" />
              <span>{user.email || "未设置"}</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Calendar className="w-4 h-4 text-muted-foreground" />
              <span>注册于 {new Date(user.created_at).toLocaleDateString()}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">所属团队 ({user.teams?.length || 0})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {user.teams?.map((m) => (
                <div key={m.team.id} className="flex items-center justify-between p-2 rounded-lg border border-border">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded bg-blue-500/10 flex items-center justify-center">
                      <Building2 className="w-3 h-3 text-blue-500" />
                    </div>
                    <span className="text-sm">{m.team.name}</span>
                  </div>
                  <Badge variant="outline" className="text-xs">{m.role}</Badge>
                </div>
              ))}
              {(!user.teams || user.teams.length === 0) && (
                <p className="text-sm text-muted-foreground">未加入任何团队</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Clock className="w-4 h-4" /> 最近登录记录
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {user.sessions?.slice(0, 5).map((s, i) => (
              <div key={i} className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">登录</span>
                <span>{new Date(s.last_used_at).toLocaleString()}</span>
              </div>
            ))}
            {(!user.sessions || user.sessions.length === 0) && (
              <p className="text-sm text-muted-foreground">暂无登录记录</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}