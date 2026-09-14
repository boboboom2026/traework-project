"use client";

import { useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import {
  Bot,
  Hash,
  Bookmark,
  Mail,
  BookOpen,
  MoreHorizontal,
  Settings,
  Server,
  LogOut,
  Wrench,
  Clock,
  CheckCircle2,
  ListChecks,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { UserAvatar } from "@/components/shared/user-avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type NavItem = {
  id: string;
  label: string;
  icon: React.ReactNode;
  href: string;
  badge?: number;
};

const navItems: NavItem[] = [
  { id: "channels", label: "频道", icon: <Hash className="w-5 h-5" />, href: "/channels" },
  { id: "dms", label: "对话", icon: <Mail className="w-5 h-5" />, href: "/dms" },
  { id: "bookmarks", label: "收藏", icon: <Bookmark className="w-5 h-5" />, href: "/bookmarks" },
  { id: "contacts", label: "通讯录", icon: <BookOpen className="w-5 h-5" />, href: "/contacts" },
  { id: "members", label: "智能体", icon: <Bot className="w-5 h-5" />, href: "/members" },
  { id: "tasks", label: "任务", icon: <ListChecks className="w-5 h-5" />, href: "/tasks" },
  { id: "schedules", label: "自动化任务", icon: <Clock className="w-5 h-5" />, href: "/apps/schedules" },
  { id: "approvals", label: "审批中心", icon: <CheckCircle2 className="w-5 h-5" />, href: "/approvals" },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);

  // 获取未读通知数
  useEffect(() => {
    const userId = user?.id;
    if (!userId) return;

    const fetchUnreadCount = async () => {
      const teamId = localStorage.getItem("lastTeamId") || "";
      if (!teamId) return;
      try {
        const res = await fetch(`/api/inbox/unread-count?userId=${userId}&teamId=${teamId}`);
        const data = await res.json();
        if (data.success) {
          setUnreadCount(data.data.unreadMentions || 0);
        }
      } catch {
        // 静默失败
      }
    };

    fetchUnreadCount();
    const interval = setInterval(fetchUnreadCount, 30000);
    return () => clearInterval(interval);
  }, [user?.id]);

  const handleLogout = () => {
    logout();
    router.push("/login");
  };

  return (
    <TooltipProvider delayDuration={0}>
      <div className="w-[72px] bg-muted/30 border-r border-border flex flex-col h-full items-center py-3 shrink-0">
        {/* 导航列表 */}
        <nav className="flex-1 flex flex-col items-center gap-2 overflow-y-auto w-full px-1.5">
          {navItems.map((item) => {
            const isActive = pathname.startsWith(item.href);
            return (
              <Tooltip key={item.id}>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => router.push(item.href)}
                    className={cn(
                      "relative w-12 h-12 rounded-xl flex flex-col items-center justify-center gap-0.5 transition-colors",
                      isActive
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    )}
                  >
                    {item.icon}
                    <span className="text-[10px] font-medium leading-tight">{item.label}</span>
                    {(item.id === "messages" ? unreadCount : 0) > 0 && (
                      <span className="absolute -top-0.5 -right-0.5 bg-primary text-primary-foreground text-[10px] font-bold rounded-full min-w-[16px] h-4 flex items-center justify-center px-1">
                        {(item.id === "messages" ? unreadCount : 0) > 99 ? "99+" : (item.id === "messages" ? unreadCount : 0)}
                      </span>
                    )}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right" className="text-xs">
                  {item.label}
                </TooltipContent>
              </Tooltip>
            );
          })}

          {/* 管理更多 */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                className="w-12 h-12 rounded-xl flex flex-col items-center justify-center gap-0.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                onClick={() => router.push("/settings")}
              >
                <MoreHorizontal className="w-5 h-5" />
                <span className="text-[10px] font-medium leading-tight">管理</span>
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" className="text-xs">
              管理设置
            </TooltipContent>
          </Tooltip>
        </nav>

        {/* 用户头像 */}
        <div className="mt-auto pt-2 border-t border-border w-full flex justify-center px-1.5">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="rounded-xl hover:bg-muted transition-colors p-1">
                <UserAvatar avatarKey={user?.avatar} name={user?.name || "U"} className="w-10 h-10" fallbackClassName="text-sm" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <div className="px-2 py-1.5">
                <p className="text-sm font-medium">{user?.name || "用户"}</p>
                <p className="text-xs text-muted-foreground">{user?.phone || ""}</p>
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => router.push("/settings")}>
                <Settings className="w-4 h-4 mr-2" />
                设置
              </DropdownMenuItem>
              {(user?.platformRole === "super_admin" || user?.platformRole === "admin") && (
                <DropdownMenuItem onClick={() => router.push("/admin")}>
                  <Server className="w-4 h-4 mr-2" />
                  平台管理
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout} className="text-destructive">
                <LogOut className="w-4 h-4 mr-2" />
                退出登录
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </TooltipProvider>
  );
}

