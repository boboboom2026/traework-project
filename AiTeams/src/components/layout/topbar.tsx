"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { Search, Bell, X, User, Settings, LogOut, ChevronDown, Check, Plus, MessageSquare } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { UserAvatar } from "@/components/shared/user-avatar";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";

interface NotificationItem {
  id: string;
  type: "message" | "system" | "mention" | "invite";
  title: string;
  content: string;
  time: string;
  read: boolean;
}

interface UnreadCount {
  mentions: number;
  systems: number;
  total: number;
}

export function Topbar() {
  const router = useRouter();
  const { user, logout, switchTeam } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [bellOpen, setBellOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const mentionsFetched = useRef(false);

  const fetchUnreadCount = useCallback(async () => {
    if (!user?.id) return;
    try {
      const teamId = localStorage.getItem("lastTeamId") || "";
      const res = await fetch(`/api/inbox/unread-count?userId=${user.id}&teamId=${teamId}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setUnreadCount(data.data?.total || 0);
        }
      }
    } catch {
      // 静默失败
    }
  }, [user]);

  function formatTime(dateStr: string): string {
    if (!dateStr) return "刚刚";
    try {
      const date = new Date(dateStr);
      const now = new Date();
      const diff = now.getTime() - date.getTime();
      const minutes = Math.floor(diff / 60000);
      if (minutes < 1) return "刚刚";
      if (minutes < 60) return `${minutes}分钟前`;
      const hours = Math.floor(minutes / 60);
      if (hours < 24) return `${hours}小时前`;
      const days = Math.floor(hours / 24);
      if (days < 7) return `${days}天前`;
      return date.toLocaleDateString("zh-CN");
    } catch {
      return dateStr;
    }
  }

  const fetchNotifications = useCallback(async () => {
    if (!user?.id) return;
    const teamId = localStorage.getItem("lastTeamId") || "";
    if (!teamId) return;
    const items: NotificationItem[] = [];

    try {
      // 1. 获取 @我的消息
      const mentionsRes = await fetch(
        `/api/channels/messages/mentions?userId=${user.id}&teamId=${teamId}`
      );
      if (mentionsRes.ok) {
        const mentionsData = await mentionsRes.json();
        if (mentionsData.success && mentionsData.data?.messages) {
          for (const msg of mentionsData.data.messages) {
            const time = formatTime(msg.createdAt);
            items.push({
              id: `mention-${msg.id}`,
              type: "mention",
              title: "@提到你",
              content: `${msg.senderName || "某人"}：${msg.content?.substring(0, 50) || "发送了一条消息"}`,
              time,
              read: false,
            });
          }
        }
      }
    } catch {
      // 静默失败
    }

    try {
      // 2. 获取系统通知
      const systemsRes = await fetch(`/api/inbox/systems?userId=${user.id}&teamId=${teamId}`);
      if (systemsRes.ok) {
        const systemsData = await systemsRes.json();
        if (systemsData.success && systemsData.data?.notifications) {
          for (const sys of systemsData.data.notifications) {
            const time = formatTime(sys.createdAt);
            items.push({
              id: `system-${sys.id}`,
              type: "system",
              title: sys.title || "系统消息",
              content: sys.content || "",
              time,
              read: sys.isRead || false,
            });
          }
        }
      }
    } catch {
      // 静默失败
    }

    // 按时间排序，取最新的6条
    items.sort((a, b) => b.time.localeCompare(a.time));
    setNotifications(items.slice(0, 6));
  }, [user]);

  useEffect(() => {
    fetchUnreadCount();
    fetchNotifications();
    const interval = setInterval(() => {
      fetchUnreadCount();
    }, 30000); // 每30秒轮询
    return () => clearInterval(interval);
  }, [fetchUnreadCount, fetchNotifications]);

  const handleBellOpen = () => {
    setBellOpen(true);
    fetchUnreadCount();
    fetchNotifications();
  };

  const markAsRead = async (id: string) => {
    // 标记为已读：对于系统通知标记已读
    if (id.startsWith("system-")) {
      try {
        const teamId = localStorage.getItem("lastTeamId") || "";
        await fetch("/api/inbox/mark-read", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: user?.id, teamId }),
        });
      } catch {
        // 静默失败
      }
    }
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
    fetchUnreadCount();
  };

  const markAllAsRead = async () => {
    try {
      const teamId = localStorage.getItem("lastTeamId") || "";
      await fetch("/api/inbox/mark-read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user?.id, teamId }),
      });
    } catch {
      // 静默失败
    }
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    fetchUnreadCount();
  };

  // 格式化时间
  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      router.push(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
    }
  };

  const handleLogout = () => {
    logout();
    router.push("/login");
  };

  const displayName = user?.name || user?.phone || "用户";
  const initials = displayName.charAt(0).toUpperCase();

  // 当前团队
  const currentTeam = user?.teams?.find((t) => t.id === user.currentTeamId) || user?.teams?.[0];
  const teamInitial = currentTeam?.name?.charAt(0) || "T";

  return (
    <header className="h-14 border-b border-border bg-background flex items-center px-4">
      {/* 左侧：团队 logo + 团队名称 + 团队切换 */}
      <div className="flex-1 flex items-center">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-muted/50 transition-colors outline-none">
              <div className="w-7 h-7 rounded-md bg-primary flex items-center justify-center shrink-0">
                {currentTeam?.logo ? (
                  <img src={currentTeam.logo} alt="" className="w-full h-full rounded-md object-cover" />
                ) : (
                  <span className="text-xs font-bold text-primary-foreground">{teamInitial}</span>
                )}
              </div>
              <span className="text-sm font-medium text-foreground max-w-[160px] truncate">
                {currentTeam?.name || "选择团队"}
              </span>
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-64">
            {user && user.teams && user.teams.length > 0 ? (
              <>
                <div className="px-2 py-1.5">
                  <p className="text-xs font-medium text-muted-foreground">
                    {user.teams.length === 1 ? "我的团队" : "切换团队"}
                  </p>
                </div>
                <DropdownMenuSeparator />
                {user.teams.map((team) => {
                  const isActive = team.id === currentTeam?.id;
                  return (
                    <DropdownMenuItem
                      key={team.id}
                      onClick={() => {
                        if (!isActive) {
                          switchTeam(team.id);
                        }
                      }}
                      className={cn(
                        "flex items-center gap-3 px-2 py-2 cursor-pointer",
                        isActive && "bg-primary/5"
                      )}
                    >
                      <div
                        className="w-7 h-7 rounded-md flex items-center justify-center shrink-0 text-primary-foreground text-xs font-bold"
                        style={{ backgroundColor: team.color || "#3B82F6" }}
                      >
                        {team.name.charAt(0)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{team.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {team.type === "community" ? "社区" : "团队"}
                          {team.role === "owner" ? " · 管理员" : ""}
                        </p>
                      </div>
                      {isActive && <Check className="w-4 h-4 text-primary shrink-0" />}
                    </DropdownMenuItem>
                  );
                })}
                <DropdownMenuSeparator />
              </>
            ) : (
              <>
                <div className="px-2 py-1.5">
                  <p className="text-xs font-medium text-muted-foreground">暂无团队</p>
                </div>
                <DropdownMenuSeparator />
              </>
            )}
            <DropdownMenuItem
              onClick={() => router.push("/onboarding")}
              className="cursor-pointer text-muted-foreground"
            >
              <Plus className="w-4 h-4 mr-2" />
              创建或加入团队
            </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
      </div>

      {/* 搜索框 - 居中 */}
      <div className="flex-1 max-w-xl">
        <form onSubmit={handleSearch} className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="搜索消息、用户、文件..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 pr-10 h-9 bg-muted/50 border-0 focus:bg-background focus:ring-1"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </form>
      </div>

      {/* 右侧：消息 + 通知 + 用户 */}
      <div className="flex-1 flex items-center justify-end gap-2">
        {/* 消息入口 */}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.push("/notifications")}
          className="relative"
          title="消息"
        >
          <MessageSquare className="w-5 h-5" />
        </Button>

      <Popover>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="icon" className="relative">
            <Bell className="w-5 h-5" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-primary text-primary-foreground text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-80 p-0">
          <div className="flex items-center justify-between p-3 border-b border-border">
            <h3 className="font-semibold">通知</h3>
            {unreadCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={markAllAsRead}
                className="text-xs h-auto p-0"
              >
                全部已读
              </Button>
            )}
          </div>
          <div className="max-h-80 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="p-6 text-center text-muted-foreground text-sm">
                暂无通知
              </div>
            ) : (
              notifications.map((notification) => (
                <div
                  key={notification.id}
                  onClick={() => markAsRead(notification.id)}
                  className={cn(
                    "p-3 border-b border-border/50 hover:bg-muted/50 cursor-pointer transition-colors",
                    notification.read
                      ? "opacity-60"
                      : "bg-primary/5"
                  )}
                >
                  <div className="flex items-start gap-2">
                    {!notification.read && (
                      <span className="w-2 h-2 rounded-full bg-primary mt-1.5 shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className={cn("text-sm", notification.read ? "text-muted-foreground" : "font-medium")}>
                        {notification.title}
                      </p>
                      <p className="text-xs text-muted-foreground truncate mt-0.5">
                        {notification.content}
                      </p>
                      <p className="text-xs text-muted-foreground/60 mt-1">
                        {notification.time}
                      </p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
          <div className="p-2 border-t border-border">
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-xs"
              onClick={() => router.push("/notifications")}
            >
              查看全部通知
            </Button>
          </div>
        </PopoverContent>
      </Popover>

      {/* 用户头像 + 下拉菜单 */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-muted/50 transition-colors outline-none">
            <UserAvatar avatarKey={user?.avatar} name={displayName} className="w-7 h-7" fallbackClassName="text-xs font-medium" />
            <span className="text-sm text-foreground max-w-[120px] truncate">
              {displayName}
            </span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <div className="px-2 py-1.5">
            <p className="text-sm font-medium truncate">{displayName}</p>
            {user?.phone && (
              <p className="text-xs text-muted-foreground truncate">{user.phone}</p>
            )}
          </div>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => router.push("/settings?tab=account")}
            className="cursor-pointer"
          >
            <User className="w-4 h-4 mr-2" />
            个人资料
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => router.push("/settings")}
            className="cursor-pointer"
          >
            <Settings className="w-4 h-4 mr-2" />
            账号设置
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={handleLogout}
            className="cursor-pointer text-destructive focus:text-destructive"
          >
            <LogOut className="w-4 h-4 mr-2" />
            退出登录
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      </div>
    </header>
  );
}

