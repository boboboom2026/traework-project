"use client";

import { useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import {
  LayoutDashboard,
  Users,
  Building2,
  Bot,
  Settings,
  Shield,
  Menu,
  X,
  ArrowLeft,
  LogOut,
  Server,
  Megaphone,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/admin/dashboard", label: "总览仪表盘", icon: LayoutDashboard },
  { href: "/admin/teams", label: "团队管理", icon: Building2 },
  { href: "/admin/users", label: "用户管理", icon: Users },
  { href: "/admin/agents", label: "智能体管理", icon: Bot },
  { href: "/admin/notifications", label: "系统通知", icon: Megaphone },
  { href: "/admin/settings", label: "系统配置", icon: Settings },
  { href: "/admin/audit-logs", label: "审计日志", icon: Shield },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [adminName, setAdminName] = useState("");

  useEffect(() => {
    // 登录页不需要鉴权
    if (pathname === "/admin/login") {
      setAuthorized(true);
      return;
    }

    const storedUser = localStorage.getItem("user");
    if (!storedUser) {
      router.push("/admin/login");
      return;
    }
    try {
      const user = JSON.parse(storedUser);
      const role = user.platformRole || "user";
      if (role !== "super_admin" && role !== "admin") {
        setAuthorized(false);
        return;
      }
      setAdminName(user.name || "管理员");
      setAuthorized(true);
    } catch {
      router.push("/admin/login");
    }
  }, [router, pathname]);

  if (authorized === null) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (authorized === false) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background gap-4">
        <Server className="w-16 h-16 text-muted-foreground/30" />
        <h1 className="text-2xl font-bold text-foreground">403 无权限访问</h1>
        <p className="text-muted-foreground">您没有平台管理权限，如需访问请联系超级管理员</p>
        <Button onClick={() => router.push("/")} variant="outline">
          <ArrowLeft className="w-4 h-4 mr-2" />
          返回首页
        </Button>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex flex-col border-r border-border bg-card transition-all duration-300",
          sidebarOpen ? "w-56" : "w-0 overflow-hidden"
        )}
      >
        <div className="flex items-center justify-between h-14 px-4 border-b border-border shrink-0">
          <Link href="/admin/dashboard" className="flex items-center gap-2 font-bold text-sm">
            <Server className="w-4 h-4 text-primary" />
            <span className="whitespace-nowrap">平台管理</span>
          </Link>
          <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(false)} className="h-7 w-7">
            <X className="w-4 h-4" />
          </Button>
        </div>

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors",
                  isActive
                    ? "bg-primary text-primary-foreground font-medium"
                    : "text-foreground/70 hover:bg-muted hover:text-foreground"
                )}
              >
                <item.icon className="w-4 h-4 shrink-0" />
                <span className="whitespace-nowrap">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="p-3 border-t border-border space-y-2">
          <Link
            href="/"
            className="flex items-center gap-2 px-3 py-2 rounded-md text-sm text-muted-foreground hover:bg-muted transition-colors"
          >
            <ArrowLeft className="w-4 h-4 shrink-0" />
            <span className="whitespace-nowrap">返回主站</span>
          </Link>
        </div>
      </aside>

      {/* Main content */}
      <div className={cn("flex flex-col flex-1 transition-all duration-300", sidebarOpen ? "ml-56" : "ml-0")}>
        {/* Top bar */}
        <header className="flex items-center justify-between h-14 px-4 border-b border-border bg-card shrink-0">
          <div className="flex items-center gap-3">
            {!sidebarOpen && (
              <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(true)} className="h-8 w-8">
                <Menu className="w-4 h-4" />
              </Button>
            )}
            <h2 className="font-semibold text-sm">
              {navItems.find((item) => pathname === item.href || pathname.startsWith(item.href + "/"))?.label || "平台管理"}
            </h2>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground">{adminName}</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                localStorage.removeItem("auth_token");
                localStorage.removeItem("user");
                localStorage.removeItem("teams");
                router.push("/login");
              }}
              className="text-xs gap-1 text-muted-foreground"
            >
              <LogOut className="w-3 h-3" />
              退出
            </Button>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
      </div>
    </div>
  );
}