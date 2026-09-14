"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth, Team } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { ChevronDown } from "lucide-react";

export default function OnboardingPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [hoveredTeam, setHoveredTeam] = useState<string | null>(null);
  const { user, switchTeam } = useAuth();
  const router = useRouter();

  // 获取团队列表
  const teams = user?.teams || [];

  // 获取团队前缀（手机号+团队）
  const accountLabel = user?.phone
    ? `${user.phone.replace(/(\d{3})\d{4}(\d{4})/, "$1****$2")} 团队`
    : "我的团队";

  // 进入团队
  const handleEnterTeam = async (team: Team) => {
    setIsLoading(true);
    try {
      switchTeam(team.id);
      await new Promise((resolve) => setTimeout(resolve, 300));
      router.push("/");
    } finally {
      setIsLoading(false);
    }
  };

  // 创建新团队
  const handleCreateTeam = () => {
    router.push("/register/create-team");
  };

  // 使用另一个账号
  const handleUseAnotherAccount = () => {
    router.push("/login");
  };

  // 如果没有用户或没有团队，跳转到登录页
  useEffect(() => {
    if (!user) {
      router.push("/login");
    }
  }, [user, router]);

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      {/* 顶部导航栏 */}
      <header className="bg-background border-b border-border">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center">
                <svg
                  viewBox="0 0 24 24"
                  className="w-6 h-6 text-primary-foreground"
                  fill="currentColor"
                >
                  <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
                </svg>
              </div>
              <span className="text-xl font-bold text-foreground">AiTeams</span>
            </div>

            {/* 导航链接 */}
            <nav className="hidden md:flex items-center gap-8">
              <a
                href="#"
                className="text-sm font-medium text-foreground relative pb-2 after:absolute after:bottom-0 after:left-0 after:w-full after:h-0.5 after:bg-primary"
              >
                产品
              </a>
              <a
                href="#"
                className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                解决方案
              </a>
              <a
                href="#"
                className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                社区
              </a>
              <a
                href="#"
                className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                价格
              </a>
            </nav>

            {/* 右侧按钮 */}
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                onClick={handleCreateTeam}
                className="hidden sm:inline-flex"
              >
                创建新团队
              </Button>
              <Button className="relative">
                启动AiTeams
                <ChevronDown className="w-4 h-4 ml-1" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* 欢迎横幅 */}
      <div className="bg-gradient-to-r from-primary to-primary/80 py-16 sm:py-24">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="text-3xl sm:text-4xl font-bold text-primary-foreground">
            欢迎回来！
          </h1>
        </div>
      </div>

      {/* 主内容区 */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 -mt-8 pb-16">
        {/* 团队选择卡片 */}
        <div className="bg-card rounded-2xl shadow-lg border border-border overflow-hidden mb-6">
          {/* 账号标识栏 */}
          <div className="bg-muted/50 px-6 py-4 border-b border-border">
            <span className="text-sm font-medium text-muted-foreground">
              {accountLabel}
            </span>
          </div>

          {/* 团队列表 */}
          <div className="p-4">
            {teams.length > 0 ? (
              <div className="space-y-2">
                {teams.map((team) => (
                  <button
                    key={team.id}
                    onClick={() => handleEnterTeam(team)}
                    onMouseEnter={() => setHoveredTeam(team.id)}
                    onMouseLeave={() => setHoveredTeam(null)}
                    disabled={isLoading}
                    className="w-full flex items-center gap-4 p-4 rounded-xl hover:bg-muted/50 transition-colors text-left disabled:opacity-50"
                  >
                    {/* 团队图标 */}
                    <div
                      className="w-12 h-12 rounded-lg flex items-center justify-center shrink-0 text-primary-foreground font-medium"
                      style={{ backgroundColor: team.color || "#3B82F6" }}
                    >
                      {team.name.charAt(0)}
                    </div>

                    {/* 团队信息 */}
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-foreground truncate">
                        {team.name}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {team.type === "community" ? "社区" : "团队"}
                      </div>
                    </div>

                    {/* 进入箭头/按钮 */}
                    <div className="shrink-0">
                      {hoveredTeam === team.id ? (
                        <Button size="sm" variant="default">
                          进入 &gt;
                        </Button>
                      ) : (
                        <svg
                          className="w-5 h-5 text-muted-foreground"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M9 5l7 7-7 7"
                          />
                        </svg>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <p className="text-muted-foreground mb-4">暂无可进入的团队</p>
                <Button onClick={handleCreateTeam}>创建第一个团队</Button>
              </div>
            )}
          </div>
        </div>

        {/* 创建新团队提示卡片 */}
        <div className="bg-muted/50 rounded-xl p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <svg
                viewBox="0 0 24 24"
                className="w-5 h-5 text-primary-foreground"
                fill="currentColor"
              >
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
              </svg>
            </div>
            <span className="text-sm text-foreground">
              希望与其他团队使用AiTeams?
            </span>
          </div>
          <Button size="sm" onClick={handleCreateTeam}>
            创建新团队
          </Button>
        </div>

        {/* 底部链接 */}
        <div className="text-center mt-8">
          <p className="text-sm text-muted-foreground">
            没看到你的团队?{" "}
            <button
              onClick={handleUseAnotherAccount}
              className="text-primary hover:underline bg-transparent border-none cursor-pointer"
            >
              使用另一个账号
            </button>
          </p>
        </div>
      </main>
    </div>
  );
}
