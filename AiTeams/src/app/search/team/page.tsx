"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Search, Users, ArrowLeft } from "lucide-react";

interface Team {
  id: string;
  name: string;
  type: string;
  logo?: string;
  color?: string;
  industry?: string;
  created_at: string;
}

export default function SearchTeamPage() {
  const router = useRouter();
  const [keyword, setKeyword] = useState("");
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [joining, setJoining] = useState<string | null>(null);
  const [joinSuccess, setJoinSuccess] = useState<string | null>(null);
  const [error, setError] = useState("");

  // 获取当前用户
  const [currentUser, setCurrentUser] = useState<Record<string, string>>({});
  const userId = currentUser.id;

  useEffect(() => {
    setCurrentUser(JSON.parse(localStorage.getItem("user") || "{}"));
  }, []);

  // 搜索团队
  const handleSearch = async () => {
    if (!keyword.trim()) return;

    setLoading(true);
    setSearched(true);
    setError("");
    setTeams([]);

    try {
      const res = await fetch(`/api/teams/search?keyword=${encodeURIComponent(keyword)}`);
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "搜索失败");
        return;
      }

      setTeams(data.teams);
    } catch {
      setError("搜索失败，请重试");
    } finally {
      setLoading(false);
    }
  };

  // 加入团队
  const handleJoinTeam = async (teamId: string) => {
    if (!userId) {
      setError("请先登录");
      router.push("/login");
      return;
    }

    setJoining(teamId);
    setError("");

    try {
      const res = await fetch("/api/teams/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          teamId,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "加入失败");
        return;
      }

      setJoinSuccess(teamId);

      // 刷新用户数据
      const userRes = await fetch(`/api/teams/list?userId=${userId}`);
      const userData = await userRes.json();
      if (userData.success) {
        localStorage.setItem("teams", JSON.stringify(userData.teams));
      }

      // 延迟跳转
      setTimeout(() => {
        router.push("/onboarding");
      }, 1500);
    } catch {
      setError("加入失败，请重试");
    } finally {
      setJoining(null);
    }
  };

  // 处理回车搜索
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSearch();
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-amber-50/30">
      {/* 顶部导航 */}
      <header className="bg-background border-b border-border sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4">
          <div className="flex items-center h-14 gap-3">
            <Button variant="ghost" size="icon" onClick={() => router.back()}>
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <span className="font-medium">搜索团队</span>
          </div>
        </div>
      </header>

      {/* 搜索区域 */}
      <div className="bg-primary/5 py-6">
        <div className="max-w-2xl mx-auto px-4">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="输入团队名称搜索"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                onKeyDown={handleKeyDown}
                className="pl-9"
              />
            </div>
            <Button onClick={handleSearch} disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "搜索"}
            </Button>
          </div>
        </div>
      </div>

      {/* 结果区域 */}
      <main className="max-w-2xl mx-auto px-4 py-6">
        {error && (
          <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
            {error}
          </div>
        )}

        {joinSuccess && (
          <div className="mb-4 p-3 rounded-lg bg-green-500/10 text-green-600 text-sm">
            加入成功，即将跳转到团队选择页...
          </div>
        )}

        {!searched && (
          <div className="text-center py-12 text-muted-foreground">
            <Search className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>输入团队名称搜索</p>
          </div>
        )}

        {searched && !loading && teams.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <Users className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>未找到相关团队</p>
          </div>
        )}

        {teams.length > 0 && (
          <div className="space-y-3">
            {teams.map((team) => (
              <Card key={team.id} className="overflow-hidden">
                <CardContent className="p-4">
                  <div className="flex items-center gap-4">
                    {/* 团队图标 */}
                    <div
                      className="w-12 h-12 rounded-lg flex items-center justify-center text-white font-medium shrink-0"
                      style={{ backgroundColor: team.color || "#3B82F6" }}
                    >
                      {team.name.charAt(0)}
                    </div>

                    {/* 团队信息 */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-medium truncate">{team.name}</h3>
                        <Badge variant="secondary" className="text-xs">
                          {team.type === "community" ? "社区" : "团队"}
                        </Badge>
                      </div>
                      {team.industry && (
                        <p className="text-sm text-muted-foreground mt-0.5">
                          {team.industry}
                        </p>
                      )}
                    </div>

                    {/* 操作按钮 */}
                    <div className="shrink-0">
                      {joinSuccess === team.id ? (
                        <Badge variant="default" className="bg-green-500">
                          已加入
                        </Badge>
                      ) : (
                        <Button
                          size="sm"
                          onClick={() => handleJoinTeam(team.id)}
                          disabled={joining === team.id}
                        >
                          {joining === team.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            "申请加入"
                          )}
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
