"use client";

import { useState, useEffect, useCallback, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  MessageSquare, AtSign, Bell, Hash, X,
  ChevronRight, ChevronDown, Send,
  Paperclip, Loader2, Bot, UserPlus, Info,
  Flame, Megaphone, Star, Bookmark,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/shared/user-avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAuth } from "@/hooks/use-auth";

type TabType = "mentions" | "replies" | "systems";

// @我的消息类型
interface MentionMessage {
  id: string;
  channelId: string;
  channelName: string | null;
  channelType: string | null;
  senderId: string;
  senderType?: string;
  sender: {
    id: string;
    name: string;
    nickname: string | null;
    avatar: string | null;
    department: string | null;
    position: string | null;
  };
  content: string;
  messageType: string;
  attachments: Array<{
    type: "image" | "video" | "file";
    url: string;
    name?: string;
    size?: number;
  }>;
  topicTags: string[];
  mentions: string[];
  createdAt: string;
}

// 回复我的 - 消息组类型
interface ReplyGroup {
  parentMessage: {
    id: string;
    content: string;
    channelId: string;
    channelName: string | null;
    topicTags: string[];
    createdAt: string;
  };
  replySenders: Array<{ id: string; name: string; nickname: string | null }>;
  replies: Array<{
    id: string;
    senderId: string;
    senderType?: string;
    sender: {
      id: string;
      name: string;
      nickname: string | null;
      avatar: string | null;
      department: string | null;
      position: string | null;
    };
    content: string;
    messageType: string;
    mentions: string[];
    createdAt: string;
  }>;
  totalReplies: number;
}

// 系统消息类型
interface SystemNotification {
  id: string;
  teamId: string;
  userId: string | null;
  type: string;
  title: string;
  content: string | null;
  link: string | null;
  isRead: boolean;
  createdAt: string;
}

export default function MessagesPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<TabType>("mentions");

  // @我的消息状态
  const [mentionMessages, setMentionMessages] = useState<MentionMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMoreMentions, setHasMoreMentions] = useState(false);
  const [loadingMoreMentions, setLoadingMoreMentions] = useState(false);

  // 回复我的状态
  const [replyGroups, setReplyGroups] = useState<ReplyGroup[]>([]);
  const [repliesLoading, setRepliesLoading] = useState(false);
  const [repliesError, setRepliesError] = useState<string | null>(null);
  const [repliesHasMore, setRepliesHasMore] = useState(false);
  const [repliesLoadingMore, setRepliesLoadingMore] = useState(false);

  // 系统消息状态
  const [systemNotifications, setSystemNotifications] = useState<SystemNotification[]>([]);
  const [systemsLoading, setSystemsLoading] = useState(false);
  const [systemsError, setSystemsError] = useState<string | null>(null);
  const [systemsHasMore, setSystemsHasMore] = useState(false);
  const [systemsLoadingMore, setSystemsLoadingMore] = useState(false);

  // 标记@我的消息为已读
  const markMentionsRead = useCallback(async () => {
    if (!user?.id) return;
    const teamId = localStorage.getItem("lastTeamId") || "";
    if (!teamId) return;
    try {
      await fetch("/api/inbox/mark-read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id, teamId }),
      });
    } catch {
      // 静默失败
    }
  }, [user?.id]);

  const tabs = [
    { id: "mentions" as TabType, label: "@我的", icon: <AtSign className="w-4 h-4" /> },
    { id: "replies" as TabType, label: "回复我的", icon: <MessageSquare className="w-4 h-4" /> },
    { id: "systems" as TabType, label: "系统消息", icon: <Bell className="w-4 h-4" /> },
  ];

  // 加载@我的消息
  const loadMentions = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    setError(null);
    try {
      const teamId = localStorage.getItem("lastTeamId") || "";
      const params = new URLSearchParams({ userId: user.id });
      if (teamId) params.set("teamId", teamId);
      const res = await fetch(`/api/channels/messages/mentions?${params}`);
      if (!res.ok) {
        setError("加载失败，请稍后重试");
        setMentionMessages([]);
        return;
      }
      const data = await res.json();
      if (data.success) {
        setMentionMessages(data.messages || []);
        setHasMoreMentions(!!data.nextCursor);
      } else {
        setError(data.error || "加载失败");
        setMentionMessages([]);
      }
    } catch {
      setError("网络错误，请稍后重试");
      setMentionMessages([]);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  // 加载回复我的消息
  const loadReplies = useCallback(async () => {
    if (!user?.id) return;
    setRepliesLoading(true);
    setRepliesError(null);
    try {
      const teamId = localStorage.getItem("lastTeamId") || "";
      const params = new URLSearchParams({ userId: user.id });
      if (teamId) params.set("teamId", teamId);
      const res = await fetch(`/api/inbox/replies?${params}`);
      if (!res.ok) {
        setRepliesError("加载失败，请稍后重试");
        setReplyGroups([]);
        return;
      }
      const data = await res.json();
      if (data.success) {
        setReplyGroups(data.groups || []);
        setRepliesHasMore(!!data.nextCursor);
      } else {
        setRepliesError(data.error || "加载失败");
        setReplyGroups([]);
      }
    } catch {
      setRepliesError("网络错误，请稍后重试");
      setReplyGroups([]);
    } finally {
      setRepliesLoading(false);
    }
  }, [user?.id]);

  // 加载系统消息
  const loadSystems = useCallback(async () => {
    if (!user?.id) return;
    setSystemsLoading(true);
    setSystemsError(null);
    try {
      const teamId = localStorage.getItem("lastTeamId") || "";
      const params = new URLSearchParams({ userId: user.id });
      if (teamId) params.set("teamId", teamId);
      const res = await fetch(`/api/inbox/systems?${params}`);
      if (!res.ok) {
        setSystemsError("加载失败，请稍后重试");
        setSystemNotifications([]);
        return;
      }
      const data = await res.json();
      if (data.success) {
        setSystemNotifications(data.notifications || []);
        setSystemsHasMore(!!data.nextCursor);
      } else {
        setSystemsError(data.error || "加载失败");
        setSystemNotifications([]);
      }
    } catch {
      setSystemsError("网络错误，请稍后重试");
      setSystemNotifications([]);
    } finally {
      setSystemsLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    loadMentions();
    markMentionsRead();
  }, [loadMentions, markMentionsRead]);

  useEffect(() => {
    if (activeTab === "replies") loadReplies();
  }, [activeTab, loadReplies]);

  useEffect(() => {
    if (activeTab === "systems") loadSystems();
  }, [activeTab, loadSystems]);

  // 跳转到频道
  const handleNavigateToChannel = (channelId: string) => {
    router.push(`/channels?channelId=${channelId}`);
  };

  return (
    <div className="h-full flex">
      {/* 左侧标签栏 */}
      <div className="w-72 border-r border-border flex flex-col bg-card shrink-0">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between shrink-0">
          <h2 className="font-semibold text-base">消息</h2>
        </div>
        <div className="flex-1 p-2 space-y-1 overflow-y-auto">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id);
                if (tab.id === "mentions") markMentionsRead();
              }}
              className={cn(
                "relative w-full flex items-center gap-2 px-4 py-2.5 text-sm rounded transition-colors",
                activeTab === tab.id
                  ? "bg-primary/15 text-primary font-semibold"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              {activeTab === tab.id && (
                <div className="absolute left-0 top-1 bottom-1 w-[3px] rounded-r bg-primary" />
              )}
              {tab.icon}
              <span>{tab.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* 主内容区 */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        {/* 标题栏 */}
        <div className="h-12 border-b border-border flex items-center px-5 shrink-0">
          <h1 className="font-semibold text-base flex items-center gap-2">
            {activeTab === "mentions" && <AtSign className="w-5 h-5" />}
            {activeTab === "replies" && <MessageSquare className="w-5 h-5" />}
            {activeTab === "systems" && <Bell className="w-5 h-5" />}
            {tabs.find(t => t.id === activeTab)?.label}
          </h1>
        </div>

        {/* 内容列表 */}
        <ScrollArea className="flex-1 min-h-0">
          {activeTab === "mentions" && (
            <MentionList
              messages={mentionMessages}
              loading={loading}
              error={error}
              hasMore={hasMoreMentions}
              loadingMore={loadingMoreMentions}
              onLoadMore={() => {}}
              onNavigateToChannel={handleNavigateToChannel}
            />
          )}
          {activeTab === "replies" && (
            <ReplyGroupList
              groups={replyGroups}
              loading={repliesLoading}
              error={repliesError}
              hasMore={repliesHasMore}
              loadingMore={repliesLoadingMore}
              onLoadMore={() => {}}
              onNavigateToChannel={handleNavigateToChannel}
            />
          )}
          {activeTab === "systems" && (
            <SystemNotificationList
              notifications={systemNotifications}
              loading={systemsLoading}
              error={systemsError}
              hasMore={systemsHasMore}
              loadingMore={systemsLoadingMore}
              onLoadMore={() => {}}
              onMarkRead={(id: string) => {
                setSystemNotifications(prev =>
                  prev.map(n => n.id === id ? { ...n, isRead: true } : n)
                );
              }}
            />
          )}
        </ScrollArea>
      </div>
    </div>
  );
}

/** @我的消息列表 */
function MentionList({
  messages,
  loading,
  error,
  hasMore,
  loadingMore,
  onLoadMore,
  onNavigateToChannel,
}: {
  messages: MentionMessage[];
  loading: boolean;
  error: string | null;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
  onNavigateToChannel: (channelId: string) => void;
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center h-48 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-48 text-muted-foreground gap-2">
        <span className="text-sm text-destructive">{error}</span>
      </div>
    );
  }

  if (messages.length === 0) {
    return <EmptyState icon={<AtSign className="w-12 h-12" />} text="暂无@你的消息" />;
  }

  return (
    <div className="divide-y divide-border/50">
      {messages.map((msg) => (
        <MentionMessageCard
          key={msg.id}
          message={msg}
          onNavigateToChannel={onNavigateToChannel}
        />
      ))}
      {hasMore && (
        <div className="flex items-center justify-center py-3">
          <button
            type="button"
            onClick={onLoadMore}
            disabled={loadingMore}
            className="text-xs text-primary hover:underline disabled:opacity-50 flex items-center gap-1"
          >
            {loadingMore ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                加载中...
              </>
            ) : (
              "加载更多"
            )}
          </button>
        </div>
      )}
    </div>
  );
}

/** 单条@我的消息卡片 */
function MentionMessageCard({
  message: msg,
  onNavigateToChannel,
}: {
  message: MentionMessage;
  onNavigateToChannel: (channelId: string) => void;
}) {
  const imageAttachments = msg.attachments.filter(a => a.type === "image");

  return (
    <div
      className="px-5 py-3.5 hover:bg-muted/30 cursor-pointer transition-colors"
      onClick={() => onNavigateToChannel(msg.channelId)}
    >
      <div className="flex items-center gap-1.5 mb-2">
        <span className="text-[12px] text-muted-foreground">
          {msg.sender.name}
          {msg.sender.nickname && (
            <span className="text-muted-foreground/60"> ({msg.sender.nickname})</span>
          )}
        </span>
        <span className="text-[12px] text-muted-foreground">在</span>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onNavigateToChannel(msg.channelId);
          }}
          className="text-[12px] text-primary font-medium hover:underline inline-flex items-center gap-0.5"
        >
          <Hash className="w-3 h-3" />
          {msg.channelName || "未知频道"}
        </button>
        <span className="text-[12px] text-muted-foreground">提及了你</span>
        <span className="text-[11px] text-muted-foreground/60 ml-auto">
          {formatTime(msg.createdAt)}
        </span>
      </div>

      <div className="flex gap-2.5">
        {msg.senderType === "agent" ? (
          <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <Bot className="w-4.5 h-4.5 text-primary" />
          </div>
        ) : (
          <UserAvatar avatarKey={msg.sender.avatar} name={msg.sender.name} className="w-9 h-9 shrink-0" fallbackClassName="text-xs" />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm">{msg.sender.name}</span>
            {msg.senderType === "agent" && (
              <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-primary bg-primary/10 px-1.5 py-0.5 rounded">
                <Bot className="w-2.5 h-2.5" />智能体
              </span>
            )}
            {msg.sender.nickname && (
              <span className="text-xs text-muted-foreground">({msg.sender.nickname})</span>
            )}
          </div>

          {msg.content && (
            <div className="mt-1 text-sm text-foreground/80 whitespace-pre-wrap break-words line-clamp-4 leading-relaxed">
              {renderMentionContent(msg.content)}
            </div>
          )}

          {imageAttachments.length > 0 && (
            <div className="flex gap-1.5 mt-2 flex-wrap">
              {imageAttachments.slice(0, 3).map((att, idx) => (
                <div key={idx} className="w-20 h-20 rounded-lg overflow-hidden bg-muted border border-border">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={att.url} alt="" className="w-full h-full object-cover" />
                </div>
              ))}
              {imageAttachments.length > 3 && (
                <div className="w-20 h-20 rounded-lg bg-muted border border-border flex items-center justify-center text-xs text-muted-foreground">
                  +{imageAttachments.length - 3}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** 回复我的 - 消息组列表 */
function ReplyGroupList({
  groups,
  loading,
  error,
  hasMore,
  loadingMore,
  onLoadMore,
  onNavigateToChannel,
}: {
  groups: ReplyGroup[];
  loading: boolean;
  error: string | null;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
  onNavigateToChannel: (channelId: string) => void;
}) {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  const toggleGroup = (groupId: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
        <span className="text-sm text-destructive">{error}</span>
      </div>
    );
  }

  if (groups.length === 0) {
    return <EmptyState icon={<MessageSquare className="w-12 h-12" />} text="暂无回复消息" />;
  }

  return (
    <div className="divide-y divide-border/50">
      {groups.map((group) => {
        const groupId = group.parentMessage.id;
        const isExpanded = expandedGroups.has(groupId);
        const displayReplies = isExpanded ? group.replies : group.replies.slice(0, 2);
        const senderNames = group.replySenders.map(s => s.nickname || s.name).join("、");

        return (
          <div key={groupId} className="px-5 py-4 hover:bg-muted/30 transition-colors">
            <div className="flex items-center gap-1.5 mb-3">
              <MessageSquare className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              <span className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{senderNames}</span>
                {" 回复了你"}
              </span>
            </div>

            <div className="space-y-3">
              {displayReplies.map((reply) => (
                <ReplyCard
                  key={reply.id}
                  reply={reply}
                  onNavigateToChannel={() => onNavigateToChannel(group.parentMessage.channelId)}
                />
              ))}
            </div>

            {group.replies.length > 2 && (
              <button
                type="button"
                onClick={() => toggleGroup(groupId)}
                className="flex items-center gap-1 text-xs text-primary hover:underline mt-2"
              >
                {isExpanded ? "收起" : `显示更多回复（${group.replies.length - 2} 条）`}
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
              </button>
            )}
          </div>
        );
      })}
      {hasMore && (
        <div className="flex items-center justify-center py-3">
          <button
            type="button"
            onClick={onLoadMore}
            disabled={loadingMore}
            className="text-xs text-primary hover:underline disabled:opacity-50 flex items-center gap-1"
          >
            {loadingMore ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                加载中...
              </>
            ) : (
              "加载更多"
            )}
          </button>
        </div>
      )}
    </div>
  );
}

/** 单条回复卡片 */
function ReplyCard({
  reply,
  onNavigateToChannel,
}: {
  reply: ReplyGroup["replies"][0];
  onNavigateToChannel: () => void;
}) {
  return (
    <div
      className="flex gap-2.5 cursor-pointer hover:bg-muted/20 rounded-lg p-2 -mx-2 transition-colors"
      onClick={onNavigateToChannel}
    >
      <UserAvatar
        avatarKey={reply.sender.avatar}
        name={reply.sender.nickname || reply.sender.name}
        className="w-8 h-8 shrink-0 mt-0.5"
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-sm font-medium truncate">
            {reply.sender.nickname || reply.sender.name}
          </span>
          <span className="text-[11px] text-muted-foreground/60 shrink-0">
            {formatTime(reply.createdAt)}
          </span>
        </div>
        <div className="text-sm text-foreground/90 leading-relaxed">
          <RenderReplyContent content={reply.content} />
        </div>
      </div>
    </div>
  );
}

/** 渲染回复内容（高亮 @提及） */
function RenderReplyContent({ content }: { content: string }) {
  const parts = content.split(/(@\w[\w.-]*)/g);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith("@")) {
          return (
            <span key={i} className="text-primary font-medium">
              {part}
            </span>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}

/** 系统消息列表 */
function SystemNotificationList({
  notifications,
  loading,
  error,
  hasMore,
  loadingMore,
  onLoadMore,
  onMarkRead,
}: {
  notifications: SystemNotification[];
  loading: boolean;
  error: string | null;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
  onMarkRead: (id: string) => void;
}) {
  const router = useRouter();
  const { user } = useAuth();

  const handleClick = async (n: SystemNotification) => {
    // 标记已读
    if (!n.isRead) {
      onMarkRead(n.id);
      try {
        const teamId = localStorage.getItem("lastTeamId") || "";
        await fetch("/api/inbox/systems/read", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: user?.id, teamId, notificationIds: [n.id] }),
        });
      } catch {
        // 静默失败
      }
    }
    // 如果有链接则跳转
    if (n.link) {
      router.push(n.link);
    }
  };
  const getTypeIcon = (type: string) => {
    switch (type) {
      case "welcome":
        return <Star className="w-4 h-4 text-amber-500" />;
      case "member_joined":
        return <UserPlus className="w-4 h-4 text-green-500" />;
      case "system_announcement":
        return <Megaphone className="w-4 h-4 text-primary" />;
      default:
        return <Info className="w-4 h-4 text-muted-foreground" />;
    }
  };

  const getTypeBadge = (type: string) => {
    switch (type) {
      case "welcome":
        return "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400";
      case "member_joined":
        return "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400";
      case "system_announcement":
        return "bg-primary/10 text-primary";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case "welcome": return "欢迎";
      case "member_joined": return "成员";
      case "system_announcement": return "公告";
      default: return "系统";
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
        <span className="text-sm text-destructive">{error}</span>
      </div>
    );
  }

  if (notifications.length === 0) {
    return <EmptyState icon={<Bell className="w-12 h-12" />} text="暂无系统消息" />;
  }

  return (
    <div className="divide-y divide-border/50">
      {notifications.map((n) => (
        <div
          key={n.id}
          onClick={() => handleClick(n)}
          className={cn(
            "px-5 py-4 hover:bg-muted/30 transition-colors cursor-pointer",
            !n.isRead && "bg-primary/5"
          )}
        >
          <div className="flex items-start gap-3">
            <div className="mt-0.5 shrink-0">
              {getTypeIcon(n.type)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm font-medium">{n.title}</span>
                <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full font-medium", getTypeBadge(n.type))}>
                  {getTypeLabel(n.type)}
                </span>
                {!n.isRead && (
                  <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                )}
              </div>
              {n.content && (
                <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">
                  {n.content}
                </p>
              )}
              {n.link && (
                <span className="text-xs text-primary mt-1.5 inline-flex items-center gap-1">
                  <ChevronRight className="w-3 h-3" />
                  查看详情
                </span>
              )}
            </div>
            <span className="text-xs text-muted-foreground shrink-0 whitespace-nowrap">
              {formatTime(n.createdAt)}
            </span>
          </div>
        </div>
      ))}
      {hasMore && (
        <div className="flex items-center justify-center py-3">
          <button
            type="button"
            onClick={onLoadMore}
            disabled={loadingMore}
            className="text-xs text-primary hover:underline disabled:opacity-50 flex items-center gap-1"
          >
            {loadingMore ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                加载中...
              </>
            ) : (
              "加载更多"
            )}
          </button>
        </div>
      )}
    </div>
  );
}

/** 空状态组件 */
function EmptyState({ icon, text }: { icon: ReactNode; text: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
      <div className="mb-3 opacity-40">{icon}</div>
      <p className="text-sm">{text}</p>
    </div>
  );
}

/** 时间格式化 */
function formatTime(dateStr: string): string {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHour = Math.floor(diffMs / 3600000);
  const diffDay = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return "刚刚";
  if (diffMin < 60) return `${diffMin}分钟前`;
  if (diffHour < 24) return `${diffHour}小时前`;
  if (diffDay < 7) return `${diffDay}天前`;

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  if (year === now.getFullYear()) return `${month}/${day}`;
  return `${year}/${month}/${day}`;
}

/** 渲染@提及内容 */
function renderMentionContent(content: string): ReactNode[] {
  if (!content) return [];
  const parts = content.split(/(@\w[\w.-]*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("@")) {
      return (
        <span key={i} className="text-primary font-medium">{part}</span>
      );
    }
    return <span key={i}>{part}</span>;
  });
}