"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import {
    Search,
    Send,
    Smile,
    MoreHorizontal,
    Phone,
    Mail as MailIcon,
    Star,
    User,
    X,
    ArrowLeft,
    Plus,
    FileText,
    AtSign,
    ChevronDown,
    Bold,
    Italic,
    Code2,
    Bot,
    Loader2,
    Target,
    Sparkles,
    MessageSquare,
    Users,
    ImagePlus,
    Paperclip,
    CornerDownRight,
    CheckCircle2,
    XCircle,
    Clock,
    Loader2 as Loader2Icon,
    Package,
    Check,
    Pencil,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { DocCard } from "@/components/channels/doc-card";
import { SubmitApprovalButton } from "@/components/apps/submit-approval-button";
import { isDocumentContent, sanitizeContent } from "@/lib/doc-utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { UserAvatar } from "@/components/shared/user-avatar";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AgentThinkingPanel } from "@/components/apps/agent-thinking-panel";
import type { ToolCallItem } from "@/components/apps/agent-thinking-panel";
import { Separator } from "@/components/ui/separator";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/hooks/use-auth";
import { ThinkingChain, type ThinkingStep } from "@/components/apps/thinking-chain";

interface OtherUser {
    id: string;
    name: string;
    avatar?: string | null;
    department?: string | null;
    position?: string | null;
    email?: string | null;
    phone?: string | null;
}

interface Conversation {
    id: string;
    otherUser: OtherUser;
    lastMessage: string;
    lastMessageAt: string;
    unreadCount: number;
}

interface Message {
    id: string;
    senderId: string;
    content: string;
    messageType: string;
    isRead: boolean;
    createdAt: string;
    sender: {
        name: string;
        avatar?: string | null;
        department?: string | null;
        position?: string | null;
    };
    forwardedFromType?: string;
    forwardedFromId?: string;
    forwardedMessage?: {
        type: string;
        senderName: string;
        senderAvatar: string | null;
        content: string;
        attachments: Array<Record<string, unknown>>;
        channelName?: string;
        createdAt: string;
    } | null;
}

interface AgentSession {
    id: string;
    agentId: string;
    agentName: string;
    agentAvatar: string;
    agentDescription: string;
    agentGoal: string;
    lastMessage: string;
    lastMessageAt: string;
    unreadCount: number;
    taskStatus?: "idle" | "processing" | "completed" | "failed";
    taskSummary?: string;
    lastArtifacts?: Array<{ type: string; name: string; url?: string; content?: string }>;
}

interface AgentMessage {
    id: string;
    senderType: "user" | "agent";
    senderId: string;
    content: string;
    attachments: Array<{
        type: string;
        url?: string;
        name: string;
        size?: number;
        key?: string;
    }>;
    isRead: boolean;
    createdAt: string;
    meta?: {
        agent_name?: string;
        artifacts?: Array<{ type: string; name: string; url?: string; content?: string }>;
    } | null;
}

interface TeamMember {
    id: string;
    name: string;
    avatar?: string | null;
    department?: string;
    position?: string;
}

interface AgentItem {
    id: string;
    name: string;
    description: string;
    avatar: string;
    goal: string;
}

function formatTime(dateStr: string): string {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const oneDay = 86400000;

    if (diff < 60000)
        return "刚刚";

    if (diff < 3600000)
        return `${Math.floor(diff / 60000)}分钟前`;

    if (diff < oneDay)
        return `${Math.floor(diff / 3600000)}小时前`;

    const isThisYear = date.getFullYear() === now.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");

    if (diff < oneDay * 2)
        return `昨天 ${hours}:${minutes}`;

    if (isThisYear)
        return `${month}-${day} ${hours}:${minutes}`;

    return `${date.getFullYear()}-${month}-${day} ${hours}:${minutes}`;
}

function formatMessageTime(dateStr: string): string {
    const date = new Date(dateStr);
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    return `${hours}:${minutes}`;
}

const AVATAR_COLORS = [
    "bg-blue-500",
    "bg-emerald-500",
    "bg-violet-500",
    "bg-amber-500",
    "bg-rose-500",
    "bg-cyan-500",
    "bg-indigo-500",
    "bg-teal-500"
];

function getAvatarColor(name: string) {
    let hash = 0;

    for (let i = 0; i < name.length; i++) {
        hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }

    return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function AgentAvatar(
    {
        name,
        className
    }: {
        name: string;
        className?: string;
    }
) {
    return (
        <div
            className={cn(
                "rounded-lg flex items-center justify-center text-white font-bold shrink-0",
                className || "w-10 h-10",
                getAvatarColor(name)
            )}>
            {name.charAt(0)}
        </div>
    );
}

function UserProfileCard(
    {
        user,
        onClose,
        onSendMessage
    }: {
        user: OtherUser;
        onClose: () => void;
        onSendMessage?: () => void;
    }
) {
    return (
        <div
            className="absolute right-4 top-12 z-50 w-72 bg-card rounded-xl border border-border shadow-lg animate-in fade-in-0 slide-in-from-right-2 duration-200">
            <div className="p-4 flex items-start gap-3">
                <UserAvatar
                    avatarKey={user.avatar}
                    name={user.name}
                    className="w-14 h-14"
                    fallbackClassName="text-lg" />
                <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-sm">{user.name}</h3>
                    {user.position && <p className="text-xs text-muted-foreground mt-0.5">{user.position}</p>}
                    {user.department && <Badge variant="secondary" className="mt-1 text-xs">{user.department}</Badge>}
                </div>
                <button
                    onClick={onClose}
                    className="text-muted-foreground hover:text-foreground p-1">
                    <X className="w-4 h-4" />
                </button>
            </div>
            <div className="px-4 pb-3 flex items-center gap-2">
                <Button
                    variant="outline"
                    size="sm"
                    className="h-8 gap-1.5 text-xs"
                    onClick={onSendMessage}>
                    <Send className="w-3.5 h-3.5" />发消息
                            </Button>
                <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
                    <Star className="w-3.5 h-3.5" />星标
                            </Button>
                <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
                    <User className="w-3.5 h-3.5" />查看资料
                            </Button>
            </div>
            <Separator />
            <div className="p-4 space-y-3">
                <h4 className="text-xs font-medium text-muted-foreground">联系方式</h4>
                {user.phone && <div className="flex items-center gap-2 text-sm">
                    <Phone className="w-4 h-4 text-muted-foreground" />
                    <span className="text-primary">{user.phone}</span>
                </div>}
                {user.email && <div className="flex items-center gap-2 text-sm">
                    <MailIcon className="w-4 h-4 text-muted-foreground" />
                    <span className="text-primary">{user.email}</span>
                </div>}
                {!user.phone && !user.email && <p className="text-sm text-muted-foreground">暂无联系方式</p>}
            </div>
        </div>
    );
}

function NewConversationDialog(
    {
        open,
        onClose,
        teamId,
        userId,
        onConversationCreated,
        onAgentConversationCreated
    }: {
        open: boolean;
        onClose: () => void;
        teamId: string;
        userId: string;
        onConversationCreated: (conv: Conversation) => void;
        onAgentConversationCreated: (session: AgentSession) => void;
    }
) {
    const [tab, setTab] = useState<"members" | "agents">("members");
    const [members, setMembers] = useState<TeamMember[]>([]);
    const [agents, setAgents] = useState<AgentItem[]>([]);
    const [search, setSearch] = useState("");
    const [loading, setLoading] = useState(false);

    const fetchMembers = async () => {
        setLoading(true);

        try {
            const res = await fetch(`/api/teams/members?teamId=${teamId}`);
            const data = await res.json();

            if (data.success) {
                setMembers(data.members.filter((m: TeamMember) => m.id !== userId));
            }
        } catch (err) {
            console.error("获取成员列表失败:", err);
        }

        setLoading(false);
    };

    const fetchAgents = async () => {
        try {
            const res = await fetch(`/api/agents?teamId=${teamId}`);
            const data = await res.json();

            if (data.success) {
                setAgents((data.agents || []).map((a: AgentItem) => ({
                    id: a.id,
                    name: a.name,
                    description: a.description || "",
                    avatar: a.avatar || "",
                    goal: a.goal || ""
                })));
            }
        } catch (err) {
            console.error("获取智能体列表失败:", err);
        }
    };

    useEffect(() => {
        if (open && teamId) {
            fetchMembers();
            fetchAgents();
        }
    }, [open, teamId]);

    const filteredMembers = members.filter(m => m.name.toLowerCase().includes(search.toLowerCase()));

    const filteredAgents = agents.filter(
        a => a.name.toLowerCase().includes(search.toLowerCase()) || (a.description || "").toLowerCase().includes(search.toLowerCase())
    );

    const grouped = filteredMembers.reduce<Record<string, TeamMember[]>>((acc, m) => {
        const dept = m.department || "未分组";

        if (!acc[dept])
            acc[dept] = [];

        acc[dept].push(m);
        return acc;
    }, {});

    const handleSelectMember = async (member: TeamMember) => {
        try {
            const res = await fetch("/api/dms/conversations", {
                method: "POST",

                headers: {
                    "Content-Type": "application/json"
                },

                body: JSON.stringify({
                    teamId,
                    userId,
                    otherUserId: member.id
                })
            });

            const data = await res.json();

            if (data.success) {
                const conv: Conversation = {
                    id: data.conversation.id,

                    otherUser: {
                        id: member.id,
                        name: member.name,
                        avatar: member.avatar,
                        department: member.department,
                        position: member.position
                    },

                    lastMessage: "",
                    lastMessageAt: data.conversation.created_at || new Date().toISOString(),
                    unreadCount: 0
                };

                onConversationCreated(conv);
                onClose();
            }
        } catch (err) {
            console.error("创建会话失败:", err);
        }
    };

    const handleSelectAgent = async (agent: AgentItem) => {
        try {
            const res = await fetch("/api/agent-chat/sessions", {
                method: "POST",

                headers: {
                    "Content-Type": "application/json"
                },

                body: JSON.stringify({
                    teamId,
                    userId,
                    agentId: agent.id
                })
            });

            const data = await res.json();

            if (data.success) {
                onAgentConversationCreated(data.session);
                onClose();
            }
        } catch (err) {
            console.error("创建智能体会话失败:", err);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>发起新对话</DialogTitle>
                </DialogHeader>
                <div className="space-y-3">
                    <div className="relative">
                        <Search
                            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                            placeholder="搜索成员或智能体..."
                            className="pl-9"
                            value={search}
                            onChange={e => setSearch(e.target.value)} />
                    </div>
                    {}
                    <div className="flex gap-1 bg-muted/50 rounded-md p-0.5">
                        <button
                            className={cn(
                                "flex-1 text-xs py-1.5 rounded-sm transition-colors",
                                tab === "members" ? "bg-background shadow-sm font-medium" : "text-muted-foreground hover:text-foreground"
                            )}
                            onClick={() => setTab("members")}>
                            <Users className="w-3.5 h-3.5 inline mr-1" />成员
                                        </button>
                        <button
                            className={cn(
                                "flex-1 text-xs py-1.5 rounded-sm transition-colors",
                                tab === "agents" ? "bg-background shadow-sm font-medium" : "text-muted-foreground hover:text-foreground"
                            )}
                            onClick={() => setTab("agents")}>
                            <Bot className="w-3.5 h-3.5 inline mr-1" />智能体
                                        </button>
                    </div>
                    <ScrollArea className="h-72">
                        {loading ? <div className="py-8 text-center text-sm text-muted-foreground">加载中...</div> : tab === "members" ? filteredMembers.length === 0 ? <div className="py-8 text-center text-sm text-muted-foreground">未找到成员</div> : Object.entries(grouped).map(([dept, deptMembers]) => <div key={dept}>
                            <div
                                className="px-3 py-1.5 text-xs font-medium text-muted-foreground sticky top-0 bg-card">
                                {dept}
                            </div>
                            {deptMembers.map(member => <button
                                key={member.id}
                                onClick={() => handleSelectMember(member)}
                                className="w-full flex items-center gap-3 px-3 py-2 hover:bg-muted/50 rounded-lg transition-colors">
                                <UserAvatar
                                    avatarKey={member.avatar}
                                    name={member.name}
                                    className="w-8 h-8"
                                    fallbackClassName="text-xs" />
                                <div className="flex-1 text-left min-w-0">
                                    <p className="text-sm font-medium truncate">{member.name}</p>
                                    {member.position && <p className="text-xs text-muted-foreground truncate">{member.position}</p>}
                                </div>
                            </button>)}
                        </div>) : filteredAgents.length === 0 ? <div className="py-8 text-center text-sm text-muted-foreground">未找到智能体</div> : filteredAgents.map(agent => <button
                            key={agent.id}
                            onClick={() => handleSelectAgent(agent)}
                            className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-muted/50 rounded-lg transition-colors">
                            <AgentAvatar name={agent.name} className="w-8 h-8" />
                            <div className="flex-1 text-left min-w-0">
                                <div className="flex items-center gap-1.5">
                                    <p className="text-sm font-medium truncate">{agent.name}</p>
                                    <Badge
                                        variant="secondary"
                                        className="text-[10px] h-4 px-1 bg-primary/10 text-primary border-0">
                                        <Bot className="w-2.5 h-2.5 mr-0.5" />智能体
                                                              </Badge>
                                </div>
                                <p className="text-xs text-muted-foreground truncate">{(agent.goal || agent.description || "智能体助手").length > 20 ? (agent.goal || agent.description || "智能体助手").slice(0, 20) + "..." : agent.goal || agent.description || "智能体助手"}</p>
                            </div>
                        </button>)}
                    </ScrollArea>
                </div>
            </DialogContent>
        </Dialog>
    );
}

export default function DmsPage() {
    const router = useRouter();
    const searchParams = useSearchParams();

    const {
        user
    } = useAuth();

    const teamId = user?.currentTeamId || "";
    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [selectedConv, setSelectedConv] = useState<Conversation | null>(null);
    const [messages, setMessages] = useState<Message[]>([]);
    const [messageInput, setMessageInput] = useState("");
    const [searchQuery, setSearchQuery] = useState("");
    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(false);
    const [profileUser, setProfileUser] = useState<OtherUser | null>(null);
    const [showNewDialog, setShowNewDialog] = useState(false);
    const [agentSessions, setAgentSessions] = useState<AgentSession[]>([]);
    const [selectedAgentSession, setSelectedAgentSession] = useState<AgentSession | null>(null);
    const [agentMessages, setAgentMessages] = useState<AgentMessage[]>([]);
    const [agentSending, setAgentSending] = useState(false);
    const [currentStep, setCurrentStep] = useState<string | null>(null);
    const [toolCalls, setToolCalls] = useState<ToolCallItem[]>([]);
    const [agentError, setAgentError] = useState<string | null>(null);
    const [safetyIntercepted, setSafetyIntercepted] = useState(false);
    const [agentProgress, setAgentProgress] = useState<any>(null);
    const [agentStreamingContent, setAgentStreamingContent] = useState("");
    const [workflowSteps, setWorkflowSteps] = useState<ThinkingStep[]>([]);
    const [workflowVisible, setWorkflowVisible] = useState(false);
    const [workflowCurrentIdx, setWorkflowCurrentIdx] = useState(0);
    const [workflowHasError, setWorkflowHasError] = useState(false);
    const [workflowErrorMessage, setWorkflowErrorMessage] = useState("");
    const [workflowWaitingForHuman, setWorkflowWaitingForHuman] = useState(false);
    const [workflowHumanMessage, setWorkflowHumanMessage] = useState("");
    const [workflowSessionId, setWorkflowSessionId] = useState("");
    const [workflowAssignees, setWorkflowAssignees] = useState<string[]>([]);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const messageListRef = useRef<HTMLDivElement>(null);
    const abortRef = useRef<AbortController | null>(null);
    const humanTextareaRef = useRef<HTMLTextAreaElement>(null);
    const agentTextareaRef = useRef<HTMLTextAreaElement>(null);

    const [agentPendingAttachments, setAgentPendingAttachments] = useState<Array<{
        id: string;
        file: File;
        type: "image" | "video" | "file";
        previewUrl: string;
        name: string;
        size: number;
        status: "uploading" | "done" | "error";
        key?: string;
        url?: string;
        contentType?: string;
    }>>([]);

    const agentImageInputRef = useRef<HTMLInputElement>(null);
    const agentFileInputRef = useRef<HTMLInputElement>(null);

    const autoResize = (el: HTMLTextAreaElement) => {
        el.style.height = "auto";
        const lineHeight = 20;
        const maxRows = 10;
        const maxHeight = lineHeight * maxRows;
        el.style.height = Math.min(el.scrollHeight, maxHeight) + "px";
    };

    const isAgentMode = selectedAgentSession !== null;

    const loadConversations = useCallback(async () => {
        if (!user?.id || !teamId)
            return;

        try {
            const res = await fetch(`/api/dms/conversations?userId=${user.id}&teamId=${teamId}`);
            const data = await res.json();

            if (data.success) {
                setConversations(data.conversations);
                const chatWith = searchParams.get("chatWith");

                if (chatWith) {
                    const existing = data.conversations.find((c: Conversation) => c.otherUser.id === chatWith);

                    if (existing) {
                        setSelectedConv(existing);
                    } else {
                        const createRes = await fetch("/api/dms/conversations", {
                            method: "POST",

                            headers: {
                                "Content-Type": "application/json"
                            },

                            body: JSON.stringify({
                                teamId,
                                userId: user.id,
                                otherUserId: chatWith
                            })
                        });

                        const createData = await createRes.json();

                        if (createData.success) {
                            const newConv: Conversation = {
                                id: createData.conversation.id,

                                otherUser: {
                                    id: chatWith,
                                    name: "用户"
                                },

                                lastMessage: "",
                                lastMessageAt: new Date().toISOString(),
                                unreadCount: 0
                            };

                            setConversations(prev => [newConv, ...prev]);
                            setSelectedConv(newConv);
                        }
                    }

                    router.replace("/dms");
                }

                const chatWithAgent = searchParams.get("chatWithAgent");

                if (chatWithAgent) {
                    const agentRes = await fetch("/api/agent-chat/sessions", {
                        method: "POST",

                        headers: {
                            "Content-Type": "application/json"
                        },

                        body: JSON.stringify({
                            teamId,
                            userId: user.id,
                            agentId: chatWithAgent
                        })
                    });

                    const agentData = await agentRes.json();

                    if (agentData.success) {
                        const session = agentData.session as AgentSession;

                        setAgentSessions(prev => {
                            const exists = prev.find(s => s.id === session.id);

                            if (exists)
                                return prev;

                            return [session, ...prev];
                        });

                        setSelectedAgentSession(session);
                        setSelectedConv(null);
                    }

                    router.replace("/dms");
                }
            }
        } catch (err) {
            console.error("加载会话列表失败:", err);
        }

        setLoading(false);
    }, [user?.id, teamId, searchParams, router]);

    useEffect(() => {
        loadConversations();
    }, [loadConversations]);

    const loadAgentSessions = useCallback(async () => {
        if (!user?.id || !teamId)
            return;

        try {
            const res = await fetch(`/api/agent-chat/sessions?userId=${user.id}&teamId=${teamId}`);
            const data = await res.json();

            if (data.success) {
                setAgentSessions(data.sessions || []);
            }
        } catch (err) {
            console.error("加载智能体会话列表失败:", err);
        }
    }, [user?.id, teamId]);

    useEffect(() => {
        loadAgentSessions();
    }, [loadAgentSessions]);

    const loadMessages = useCallback(async () => {
        if (!selectedConv)
            return;

        try {
            const res = await fetch(`/api/dms/messages?conversationId=${selectedConv.id}`);
            const data = await res.json();

            if (data.success) {
                setMessages(data.messages);

                if (user?.id) {
                    await fetch("/api/dms/read", {
                        method: "PUT",

                        headers: {
                            "Content-Type": "application/json"
                        },

                        body: JSON.stringify({
                            conversationId: selectedConv.id,
                            userId: user.id
                        })
                    });

                    setConversations(prev => prev.map(c => c.id === selectedConv.id ? {
                        ...c,
                        unreadCount: 0
                    } : c));
                }
            }
        } catch (err) {
            console.error("加载消息失败:", err);
        }
    }, [selectedConv, user?.id]);

    const loadAgentMessages = useCallback(async () => {
        if (!selectedAgentSession)
            return;

        try {
            const res = await fetch(`/api/agent-chat/messages?sessionId=${selectedAgentSession.id}`);
            const data = await res.json();

            if (data.success) {
                setAgentMessages(data.messages || []);

                setAgentSessions(prev => prev.map(s => s.id === selectedAgentSession.id ? {
                    ...s,
                    unreadCount: 0
                } : s));
            }

            // 恢复审批卡片：从已落库的审批任务重放"等待审批"状态（会话刷新/重开时保持）
            try {
                const pendingRes = await fetch(`/api/agents/workflows/approvals/pending?session_id=${selectedAgentSession.id}`, {
                    headers: {
                        Authorization: `Bearer ${localStorage.getItem("auth_token") || ""}`,
                    },
                });
                const pendingData = await pendingRes.json();
                const pendingTasks = Array.isArray(pendingData?.data) ? pendingData.data : [];
                if (pendingTasks.length > 0) {
                    const t = pendingTasks[0];
                    setWorkflowVisible(true);
                    setWorkflowWaitingForHuman(true);
                    setWorkflowHumanMessage(t.message || "请确认");
                    setWorkflowSessionId(t.session_id || "");
                    setWorkflowAssignees(Array.isArray(t.approver_id) ? t.approver_id : [t.approver_id].filter(Boolean));
                    setWorkflowSteps(prev => {
                        const newSteps = [...prev];
                        if (newSteps[t.step_index]) {
                            newSteps[t.step_index] = {
                                ...newSteps[t.step_index],
                                status: "waiting",
                            };
                        }
                        return newSteps;
                    });
                }
            } catch (pendingErr) {
                // 待审批恢复失败不影响消息加载
                console.error("恢复待审批卡片失败:", pendingErr);
            }
        } catch (err) {
            console.error("加载智能体消息失败:", err);
        }
    }, [selectedAgentSession]);

    useEffect(() => {
        if (selectedConv)
            loadMessages();
    }, [selectedConv, loadMessages]);

    useEffect(() => {
        if (selectedAgentSession)
            loadAgentMessages();
    }, [selectedAgentSession, loadAgentMessages]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({
            behavior: "smooth"
        });
    }, [messages, agentMessages, agentStreamingContent]);

    const handleSend = async () => {
        if (!messageInput.trim() || !selectedConv || !user?.id || sending)
            return;

        const content = messageInput.trim();
        setMessageInput("");
        setToolCalls([]);
        setAgentError(null);
        setSafetyIntercepted(false);
        setAgentProgress(null);
        setSending(true);

        const optimisticMsg: Message = {
            id: `temp-${Date.now()}`,
            senderId: user.id,
            content,
            messageType: "text",
            isRead: false,
            createdAt: new Date().toISOString(),

            sender: {
                name: user.name,
                avatar: null,
                department: user.department,
                position: user.position
            }
        };

        setMessages(prev => [...prev, optimisticMsg]);

        try {
            const res = await fetch("/api/dms/messages", {
                method: "POST",

                headers: {
                    "Content-Type": "application/json"
                },

                body: JSON.stringify({
                    conversationId: selectedConv.id,
                    senderId: user.id,
                    content,
                    messageType: "text"
                })
            });

            const data = await res.json();

            if (data.success) {
                setConversations(prev => prev.map(c => c.id === selectedConv.id ? {
                    ...c,
                    lastMessage: content,
                    lastMessageAt: new Date().toISOString()
                } : c));
            }
        } catch (err) {
            console.error("发送消息失败:", err);
        }

        setSending(false);
    };

    const agentHandleFileSelect = async (files: FileList | File[], forcedType?: "image" | "video" | "file") => {
        const currentCount = agentPendingAttachments.length;

        for (let i = 0; i < files.length; i++) {
            if (currentCount + i >= 9)
                break;

            const file = files[i];
            let type: "image" | "video" | "file" = "file";

            if (forcedType) {
                type = forcedType;
            } else if (file.type.startsWith("image/")) {
                type = "image";
            } else if (file.type.startsWith("video/")) {
                type = "video";
            }

            const id = `agent-att-${Date.now()}-${i}`;
            const previewUrl = type === "image" ? URL.createObjectURL(file) : type === "video" ? URL.createObjectURL(file) : "";

            const newAtt = {
                id,
                file,
                type,
                previewUrl,
                name: file.name,
                size: file.size,
                status: "uploading" as const
            };

            setAgentPendingAttachments(prev => [...prev, newAtt]);

            try {
                const formData = new FormData();
                formData.append("file", file);
                formData.append("userId", user?.id || "");

                const res = await fetch("/api/upload/attachment", {
                    method: "POST",
                    body: formData
                });

                const data = await res.json();

                if (data.success) {
                    setAgentPendingAttachments(prev => prev.map(a => a.id === id ? {
                        ...a,
                        status: "done" as const,
                        key: data.key,
                        url: data.url,
                        contentType: data.contentType
                    } : a));
                } else {
                    setAgentPendingAttachments(prev => prev.map(a => a.id === id ? {
                        ...a,
                        status: "error" as const
                    } : a));
                }
            } catch {
                setAgentPendingAttachments(prev => prev.map(a => a.id === id ? {
                    ...a,
                    status: "error" as const
                } : a));
            }
        }
    };

    const agentRemoveAttachment = (id: string) => {
        setAgentPendingAttachments(prev => {
            const att = prev.find(a => a.id === id);

            if (att?.previewUrl)
                URL.revokeObjectURL(att.previewUrl);

            return prev.filter(a => a.id !== id);
        });
    };

    const handleAgentSend = async (presetContent?: string) => {
        const effectiveContent = (presetContent ?? messageInput).trim();
        if (!effectiveContent && agentPendingAttachments.length === 0 || !selectedAgentSession || !user?.id || agentSending)
            return;

        if (agentPendingAttachments.some(a => a.status === "uploading"))
            return;

        const content = effectiveContent;
        setMessageInput("");

        const attachmentsToSend = agentPendingAttachments.filter(a => a.status === "done").map(a => ({
            type: a.type,
            url: a.url || "",
            name: a.name,
            size: a.size,
            key: a.key,
            contentType: a.contentType
        }));

        setAgentPendingAttachments(prev => {
            prev.forEach(a => {
                if (a.previewUrl)
                    URL.revokeObjectURL(a.previewUrl);
            });

            return [];
        });

        setAgentSending(true);
        setAgentStreamingContent("");

        const optimisticMsg: AgentMessage = {
            id: `temp-${Date.now()}`,
            senderType: "user",
            senderId: user.id,
            content: content || (attachmentsToSend.length > 0 ? "[附件]" : ""),
            attachments: attachmentsToSend,
            isRead: false,
            createdAt: new Date().toISOString()
        };

        setAgentMessages(prev => [...prev, optimisticMsg]);

        try {
            abortRef.current = new AbortController();

            const res = await fetch("/api/agent-chat/messages", {
                method: "POST",

                headers: {
                    "Content-Type": "application/json"
                },

                body: JSON.stringify({
                    sessionId: selectedAgentSession.id,
                    userId: user.id,
                    content: content || (attachmentsToSend.length > 0 ? "[附件]" : ""),
                    attachments: attachmentsToSend
                }),

                signal: abortRef.current.signal
            });

            if (!res.ok) {
                console.error("调用智能体失败:", res.status);
                setAgentSending(false);
                return;
            }

            const reader = res.body?.getReader();

            if (!reader) {
                setAgentSending(false);
                return;
            }

            const decoder = new TextDecoder();
            let accumulated = "";

            while (true) {
                const {
                    done,
                    value
                } = await reader.read();

                if (done)
                    break;

                const chunk = decoder.decode(value, {
                    stream: true
                });

                const lines = chunk.split("\n");

                for (const line of lines) {
                    if (line.startsWith("data: ")) {
                        const data = line.slice(6).trim();

                        if (data === "[DONE]")
                            continue;

                        try {
                            const parsed = JSON.parse(data);

                            if (parsed.type === "tool_call_start") {
                                setAgentStreamingContent(prev => prev + "\n\n🔧 正在执行工具...");
                            }

                            if (parsed.type === "function_call_detail") {
                                const match = parsed.content?.match(/调用:\s*(\w+)/);
                                if (match) {
                                    const toolName = match[1];
                                    setToolCalls(prev => [...prev, {
                                        name: toolName,
                                        args: parsed.content.replace(/^调用:\s*\w+\s*/, "").slice(0, 60),
                                        status: "executing",
                                    }]);
                                }
                            }

                            if (parsed.type === "tool_result") {
                                setToolCalls(prev => prev.map((tc, idx) =>
                                    idx === prev.length - 1 && tc.status === "executing"
                                        ? { ...tc, status: parsed.success ? "success" : "error", result: typeof parsed.result === "string" ? parsed.result.slice(0, 200) : JSON.stringify(parsed.result).slice(0, 200) }
                                        : tc
                                ));
                            }

                            if (parsed.type === "delegate_agent_start") {
                                const agentName = parsed.agent_name || "";
                                setToolCalls(prev => prev.map(tc =>
                                    tc.name === "delegate_agent" && tc.status === "executing"
                                        ? { ...tc, delegateTo: agentName }
                                        : tc
                                ));
                            }

                            if (parsed.type === "step") {
                                setCurrentStep(parsed.content);
                            }

                            if (parsed.type === "error") {
                                setAgentError(parsed.content || "执行出错");
                            }

                            if (parsed.type === "safety_intercepted") {
                                setSafetyIntercepted(true);
                            }

                            if (parsed.type === "progress") {
                                setAgentProgress({
                                    iteration: parsed.iteration || 0,
                                    maxIterations: parsed.maxIterations || 10,
                                    toolsCalled: parsed.toolsCalled || 0,
                                    elapsedMs: parsed.elapsedMs || 0,
                                    tokenUsage: parsed.tokenUsage || 0,
                                    summary: parsed.summary || "",
                                    budget: parsed.budget || "",
                                });
                            }

                            // 工作流事件处理
                            if (parsed.type === "workflow_step_start" && parsed.step) {
                                setWorkflowVisible(true);
                                setWorkflowCurrentIdx(parsed.stepIndex);
                                setWorkflowHasError(false);
                                setWorkflowErrorMessage("");
                                setWorkflowWaitingForHuman(false);
                                setWorkflowSteps(prev => {
                                    const newSteps = [...prev];
                                    // 确保数组长度足够
                                    while (newSteps.length <= parsed.stepIndex) {
                                        newSteps.push({ name: "", status: "pending" });
                                    }
                                    newSteps[parsed.stepIndex] = {
                                        name: parsed.step.name || `步骤 ${parsed.stepIndex + 1}`,
                                        description: parsed.step.description,
                                        status: "running",
                                    };
                                    return newSteps;
                                });
                            }

                            if (parsed.type === "workflow_step_complete" && parsed.step) {
                                setWorkflowSteps(prev => {
                                    const newSteps = [...prev];
                                    if (newSteps[parsed.stepIndex]) {
                                        newSteps[parsed.stepIndex] = {
                                            ...newSteps[parsed.stepIndex],
                                            status: "completed",
                                            summary: parsed.summary,
                                        };
                                    }
                                    return newSteps;
                                });
                            }

                            if (parsed.type === "workflow_step_error" && parsed.step) {
                                setWorkflowHasError(true);
                                setWorkflowErrorMessage(parsed.error || "步骤执行失败");
                                setWorkflowSteps(prev => {
                                    const newSteps = [...prev];
                                    if (newSteps[parsed.stepIndex]) {
                                        newSteps[parsed.stepIndex] = {
                                            ...newSteps[parsed.stepIndex],
                                            status: "error",
                                            error: parsed.error,
                                        };
                                    }
                                    return newSteps;
                                });
                            }

                            if (parsed.type === "workflow_waiting_human") {
                                setWorkflowWaitingForHuman(true);
                                setWorkflowHumanMessage(parsed.message || "请确认");
                                setWorkflowSessionId(parsed.session_id || "");
                                setWorkflowAssignees(Array.isArray(parsed.assignee) ? parsed.assignee : []);
                                setWorkflowSteps(prev => {
                                    const newSteps = [...prev];
                                    if (newSteps[parsed.stepIndex]) {
                                        newSteps[parsed.stepIndex] = {
                                            ...newSteps[parsed.stepIndex],
                                            status: "waiting",
                                        };
                                    }
                                    return newSteps;
                                });
                            }

                            if (parsed.type === "workflow_complete") {
                                // 工作流完成，保持面板可见展示最终结果
                                setWorkflowSteps(prev => prev.map(s => ({ ...s, status: "completed" as const })));
                            }

                            if (parsed.content) {
                                accumulated += parsed.content;
                                setAgentStreamingContent(accumulated);
                            }

                            if (parsed.done) {
                                await loadAgentMessages();
                                setAgentStreamingContent("");
                                loadAgentSessions();
                            }

                            if (parsed.error) {
                                console.error("智能体回复错误:", parsed.error);
                            }
                        } catch {}
                    }
                }
            }

            if (accumulated) {
                await loadAgentMessages();
                setAgentStreamingContent("");
                loadAgentSessions();
            }
        } catch (err) {
            if (err instanceof DOMException && err.name === "AbortError")
                {} else {
                console.error("智能体对话失败:", err);
            }
        } finally {
            setAgentSending(false);
            abortRef.current = null;
        }
    };

    const [showRejectInput, setShowRejectInput] = useState(false);
    const [rejectFeedback, setRejectFeedback] = useState("");

    const handleWorkflowDecision = async (decision: "approved" | "rejected", feedback?: string) => {
        if (!workflowSessionId) {
            console.warn("无 workflowSessionId，无法继续工作流");
            return;
        }

        let text = "";
        if (decision === "approved") {
            text = "审核通过，请继续执行工作流";
        } else {
            text = feedback ? `修改意见：${feedback}，请重新生成` : "审核不通过，请重新生成";
        }

        setShowRejectInput(false);
        setRejectFeedback("");
        await handleAgentSend(text);
    };

    const handleUnifiedSend = () => {
        if (isAgentMode) {
            handleAgentSend();
        } else {
            handleSend();
        }
    };

    const handleConversationCreated = (conv: Conversation) => {
        setConversations(prev => {
            const exists = prev.find(c => c.id === conv.id);

            if (exists) {
                setSelectedConv(exists);
                return prev;
            }

            return [conv, ...prev];
        });

        setSelectedConv(conv);
        setSelectedAgentSession(null);
    };

    const handleAgentSessionCreated = (session: AgentSession) => {
        setAgentSessions(prev => {
            const exists = prev.find(s => s.id === session.id);

            if (exists) {
                setSelectedAgentSession(exists);
                return prev;
            }

            return [session, ...prev];
        });

        setSelectedAgentSession(session);
        setSelectedConv(null);
    };

    const handleSelectConv = (conv: Conversation) => {
        setSelectedConv(conv);
        setSelectedAgentSession(null);
    };

    const handleSelectAgentSession = (session: AgentSession) => {
        setSelectedAgentSession(session);
        setSelectedConv(null);
    };

    const filteredConversations = conversations.filter(c => c.otherUser.name.toLowerCase().includes(searchQuery.toLowerCase()));
    const filteredAgentSessions = agentSessions.filter(s => s.agentName.toLowerCase().includes(searchQuery.toLowerCase()));
    const totalUnread = conversations.reduce((sum, c) => sum + c.unreadCount, 0);
    const agentTotalUnread = agentSessions.reduce((sum, s) => sum + s.unreadCount, 0);
    const unifiedList = [
        ...filteredConversations.map((c) => ({
            type: "member" as const,
            id: c.id,
            name: c.otherUser.name,
            time: c.lastMessageAt,
            source: c,
        })),
        ...filteredAgentSessions.map((s) => ({
            type: "agent" as const,
            id: s.id,
            name: s.agentName,
            time: s.lastMessageAt,
            source: s,
        })),
    ].sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());

    return (
        <div className="h-full flex relative">
            {}
            <div
                className={cn(
                    "w-80 border-r border-border flex flex-col bg-card shrink-0",
                    (selectedConv || selectedAgentSession) && "hidden md:flex"
                )}>
                {}
                <div
                    className="px-4 py-3 border-b border-border flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <h2 className="font-semibold text-base">对话</h2>
                        {totalUnread + agentTotalUnread > 0 && <Badge variant="destructive" className="text-xs h-5">
                            {totalUnread + agentTotalUnread > 99 ? "99+" : totalUnread + agentTotalUnread}
                        </Badge>}
                    </div>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => setShowNewDialog(true)}>
                        <Plus className="w-4 h-4" />
                    </Button>
                </div>
                {}
                <div className="px-3 py-2 border-b border-border/50">
                    <div className="relative">
                        <Search
                            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                            type="search"
                            placeholder="搜索私聊..."
                            className="pl-9 h-9 text-sm"
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)} />
                    </div>
                </div>
                {}
                <ScrollArea className="flex-1 min-h-0">
                    {loading ? <div className="py-8 text-center text-sm text-muted-foreground">加载中...</div> : <div>
                        {}
                        {unifiedList.length > 0 ? unifiedList.map(item => {
                            if (item.type === "member") {
                                const conv = item.source as Conversation;
                                return (
                                    <button
                                        key={conv.id}
                                        onClick={() => handleSelectConv(conv)}
                                        className={cn(
                                            "w-full flex items-start gap-3 px-4 py-3 hover:bg-muted/50 transition-colors text-left",
                                            selectedConv?.id === conv.id && "bg-muted"
                                        )}>
                                        <UserAvatar
                                            avatarKey={conv.otherUser.avatar}
                                            name={conv.otherUser.name}
                                            className="w-10 h-10"
                                            fallbackClassName="text-sm" />
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center justify-between gap-2">
                                                <span className="font-medium text-sm truncate">{conv.otherUser.name}</span>
                                                <span className="text-xs text-muted-foreground shrink-0">{formatTime(conv.lastMessageAt)}</span>
                                            </div>
                                            <div className="flex items-center justify-between gap-2 mt-0.5">
                                                <p className="text-xs text-muted-foreground truncate">
                                                    {conv.lastMessage ? conv.lastMessage.length > 15 ? conv.lastMessage.slice(0, 15) + "..." : conv.lastMessage : "暂无消息"}
                                                </p>
                                                {conv.unreadCount > 0 && <Badge variant="destructive" className="shrink-0 text-xs h-4 min-w-4 px-1">
                                                    {conv.unreadCount > 99 ? "99+" : conv.unreadCount}
                                                </Badge>}
                                            </div>
                                        </div>
                                    </button>
                                );
                            } else {
                                const session = item.source as AgentSession;
                                const taskBadge = (() => {
                                    switch (session.taskStatus) {
                                        case "processing": return <Badge className="text-[10px] h-4 px-1 bg-emerald-500/15 text-emerald-600 border-0 shrink-0 gap-0.5"><Loader2Icon className="w-2.5 h-2.5 animate-spin" />处理中</Badge>;
                                        case "completed": return <Badge className="text-[10px] h-4 px-1 bg-green-500/15 text-green-600 border-0 shrink-0 gap-0.5"><CheckCircle2 className="w-2.5 h-2.5" />已完成</Badge>;
                                        case "failed": return <Badge className="text-[10px] h-4 px-1 bg-red-500/15 text-red-600 border-0 shrink-0 gap-0.5"><XCircle className="w-2.5 h-2.5" />失败</Badge>;
                                        default: return null;
                                    }
                                })();
                                const artifactCount = session.lastArtifacts?.length || 0;
                                return (
                                    <button
                                        key={session.id}
                                        onClick={() => handleSelectAgentSession(session)}
                                        className={cn(
                                            "w-full flex items-start gap-3 px-4 py-3 hover:bg-muted/50 transition-colors text-left",
                                            selectedAgentSession?.id === session.id && "bg-muted"
                                        )}>
                                        <div className="relative">
                                            <AgentAvatar name={session.agentName} className="w-10 h-10" />
                                            {session.taskStatus === "processing" && (
                                                <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-500 rounded-full border-2 border-card animate-pulse" />
                                            )}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center justify-between gap-2">
                                                <div className="flex items-center gap-1.5 min-w-0">
                                                    <span className="font-medium text-sm truncate">{session.agentName}</span>
                                                    <Badge variant="secondary" className="text-[10px] h-4 px-1 bg-primary/10 text-primary border-0 shrink-0">
                                                        <Bot className="w-2.5 h-2.5 mr-0.5" />智能体
                                                    </Badge>
                                                </div>
                                                <span className="text-xs text-muted-foreground shrink-0">{formatTime(session.lastMessageAt)}</span>
                                            </div>
                                            <div className="flex items-center justify-between gap-2 mt-0.5">
                                                <p className="text-xs text-muted-foreground truncate">
                                                    {session.lastMessage ? session.lastMessage.length > 15 ? session.lastMessage.slice(0, 15) + "..." : session.lastMessage : "暂无消息"}
                                                </p>
                                                <div className="flex items-center gap-1 shrink-0">
                                                    {artifactCount > 0 && (
                                                        <Badge className="text-[10px] h-4 px-1 bg-amber-500/15 text-amber-600 border-0 gap-0.5">
                                                            <Package className="w-2.5 h-2.5" />{artifactCount}
                                                        </Badge>
                                                    )}
                                                    {session.unreadCount > 0 && <Badge variant="destructive" className="text-xs h-4 min-w-4 px-1">
                                                        {session.unreadCount > 99 ? "99+" : session.unreadCount}
                                                    </Badge>}
                                                </div>
                                            </div>
                                            {taskBadge && (
                                                <div className="mt-1">{taskBadge}</div>
                                            )}
                                        </div>
                                    </button>
                                );
                            }
                        }) : <div className="py-8 text-center text-sm text-muted-foreground">
                            {searchQuery ? "未找到相关会话" : "暂无私聊会话"}
                        </div>}
                    </div>}
                </ScrollArea>
            </div>
            {}
            <div
                className={cn(
                    "flex-1 flex flex-col min-w-0 relative",
                    !selectedConv && !selectedAgentSession && "hidden md:flex"
                )}>
                {selectedConv ? <>
                    {}
                    <div
                        className="h-13 border-b border-border flex items-center justify-between px-4 shrink-0">
                        <div className="flex items-center gap-3">
                            <button
                                onClick={() => setSelectedConv(null)}
                                className="md:hidden mr-1 text-muted-foreground hover:text-foreground">
                                <ArrowLeft className="w-5 h-5" />
                            </button>
                            <UserAvatar
                                avatarKey={selectedConv.otherUser.avatar}
                                name={selectedConv.otherUser.name}
                                className="w-8 h-8 cursor-pointer hover:opacity-80 transition-opacity"
                                fallbackClassName="text-sm"
                                onClick={() => setProfileUser(selectedConv.otherUser)} />
                            <div>
                                <span className="font-medium text-sm">{selectedConv.otherUser.name}</span>
                                {selectedConv.otherUser.position && <span className="text-xs text-muted-foreground ml-2">{selectedConv.otherUser.position}</span>}
                            </div>
                        </div>
                        <div className="flex items-center gap-1">
                            <Button variant="ghost" size="icon" className="h-8 w-8"><Phone className="w-4 h-4" /></Button>
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="w-4 h-4" /></Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                    <DropdownMenuItem>查看资料</DropdownMenuItem>
                                    <DropdownMenuItem>置顶对话</DropdownMenuItem>
                                    <DropdownMenuItem>消息免打扰</DropdownMenuItem>
                                    <DropdownMenuItem className="text-destructive">删除对话</DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </div>
                    </div>
                    {}
                    <ScrollArea className="flex-1 min-h-0 px-4 py-3">
                        <div ref={messageListRef} className="space-y-1">
                            {messages.map((msg, idx) => {
                                const isMine = msg.senderId === user?.id;
                                const prevMsg = messages[idx - 1];
                                const showAvatar = !isMine && (!prevMsg || prevMsg.senderId !== msg.senderId);
                                const showName = !isMine && (!prevMsg || prevMsg.senderId !== msg.senderId);

                                return (
                                    <MessageBubble
                                        key={msg.id}
                                        message={msg}
                                        isMine={isMine}
                                        showAvatar={showAvatar}
                                        showName={showName}
                                        onAvatarClick={() => setProfileUser(msg.sender as OtherUser)} />
                                );
                            })}
                            <div ref={messagesEndRef} />
                        </div>
                    </ScrollArea>
                    {}
                    <div className="border-t border-border p-3 shrink-0">
                        <div className="bg-muted/30 border border-border/50 rounded-xl">
                            <textarea
                                ref={humanTextareaRef}
                                value={messageInput}
                                onChange={e => {
                                    setMessageInput(e.target.value);
                                    autoResize(e.target);
                                }}
                                placeholder="输入消息..."
                                rows={2}
                                className="w-full px-3 py-2 bg-transparent resize-none text-sm focus:outline-none max-h-[200px] overflow-y-auto"
                                onKeyDown={e => {
                                    if (e.key === "Enter" && !e.shiftKey) {
                                        e.preventDefault();
                                        handleSend();
                                    }
                                }} />
                            <div className="flex items-center justify-between px-2 pb-1.5">
                                <div className="flex items-center gap-0.5">
                                    <Button variant="ghost" size="icon" className="h-7 w-7"><Plus className="w-4 h-4 text-muted-foreground" /></Button>
                                    <Button variant="ghost" size="icon" className="h-7 w-7"><Smile className="w-4 h-4 text-muted-foreground" /></Button>
                                    <Button variant="ghost" size="icon" className="h-7 w-7"><FileText className="w-4 h-4 text-muted-foreground" /></Button>
                                    <Button variant="ghost" size="icon" className="h-7 w-7"><AtSign className="w-4 h-4 text-muted-foreground" /></Button>
                                    <div className="w-px h-4 bg-border mx-1" />
                                    <Button variant="ghost" size="icon" className="h-7 w-7"><Bold className="w-3.5 h-3.5 text-muted-foreground" /></Button>
                                    <Button variant="ghost" size="icon" className="h-7 w-7"><Italic className="w-3.5 h-3.5 text-muted-foreground" /></Button>
                                    <Button variant="ghost" size="icon" className="h-7 w-7"><Code2 className="w-3.5 h-3.5 text-muted-foreground" /></Button>
                                </div>
                                <Button
                                    size="sm"
                                    onClick={handleSend}
                                    disabled={!messageInput.trim() || sending}
                                    className="h-7 gap-1.5 text-xs">
                                    <Send className="w-3.5 h-3.5" />发送
                                                      </Button>
                            </div>
                        </div>
                    </div>
                    {}
                    {profileUser && <UserProfileCard
                        user={profileUser}
                        onClose={() => setProfileUser(null)}
                        onSendMessage={() => setProfileUser(null)} />}
                </> : selectedAgentSession ? <>
                    {}
                    <div
                        className="h-13 border-b border-border flex items-center justify-between px-4 shrink-0">
                        <div className="flex items-center gap-3">
                            <button
                                onClick={() => setSelectedAgentSession(null)}
                                className="md:hidden mr-1 text-muted-foreground hover:text-foreground">
                                <ArrowLeft className="w-5 h-5" />
                            </button>
                            <AgentAvatar name={selectedAgentSession.agentName} className="w-8 h-8" />
                            <div>
                                <div className="flex items-center gap-1.5">
                                    <span className="font-medium text-sm">{selectedAgentSession.agentName}</span>
                                    <Badge
                                        variant="secondary"
                                        className="text-[10px] h-4 px-1.5 bg-primary/10 text-primary border-0">
                                        <Bot className="w-2.5 h-2.5 mr-0.5" />智能体
                                                            </Badge>
                                </div>
                                <p className="text-xs text-muted-foreground truncate max-w-xs">
                                    {selectedAgentSession.agentGoal || selectedAgentSession.agentDescription || "智能体助手"}
                                </p>
                            </div>
                        </div>
                        <div className="flex items-center gap-1">
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="w-4 h-4" /></Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                    <DropdownMenuItem>查看智能体详情</DropdownMenuItem>
                                    <DropdownMenuItem>消息免打扰</DropdownMenuItem>
                                    <DropdownMenuItem className="text-destructive">删除对话</DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </div>
                    </div>
                    {}
                    <ScrollArea className="flex-1 min-h-0 px-4 py-3">
                        <div className="space-y-1">
                            {agentMessages.length === 0 && !agentStreamingContent && <div
                                className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                                <AgentAvatar name={selectedAgentSession.agentName} className="w-14 h-14 mb-3 text-xl" />
                                <p className="text-sm font-medium text-foreground">{selectedAgentSession.agentName}</p>
                                <p className="text-xs mt-1 max-w-sm text-center">
                                    {selectedAgentSession.agentGoal || selectedAgentSession.agentDescription || "有什么可以帮你的？"}
                                </p>
                            </div>}
                            {agentMessages.map((msg, idx) => {
                                const isMine = msg.senderType === "user";

                                return (
                                    <AgentMessageBubble
                                        key={msg.id}
                                        message={msg}
                                        isMine={isMine}
                                        agentName={selectedAgentSession.agentName}
                                        currentTeamId={teamId}
                                        currentUser={user}
                                        sessionId={selectedAgentSession.id}
                                        onActionTaken={(text) => handleAgentSend(text)} />
                                );
                            })}
                            {}
                            {agentStreamingContent && <div className="flex gap-2 mb-1">
                                <AgentAvatar name={selectedAgentSession.agentName} className="w-8 h-8" />
                                <div className="max-w-md lg:max-w-lg xl:max-w-2xl space-y-2">
                                    <ThinkingChain
                                        steps={workflowSteps}
                                        visible={workflowVisible}
                                        hasError={workflowHasError}
                                        errorMessage={workflowErrorMessage}
                                    />
                                    <div className="flex items-center gap-2 mb-0.5">
                                        <span className="text-xs font-medium">{selectedAgentSession.agentName}</span>
                                        <Badge
                                            variant="secondary"
                                            className="text-[10px] h-4 px-1 bg-primary/10 text-primary border-0">
                                            <Bot className="w-2.5 h-2.5 mr-0.5" />智能体
                                                                    </Badge>
                                    </div>
                                    <div className="bg-muted px-3 py-2 rounded-2xl rounded-bl-sm">
                                        <p className="text-sm whitespace-pre-wrap break-words">{agentStreamingContent}</p>
                                        <span
                                            className="inline-block w-1.5 h-4 bg-primary/60 animate-pulse ml-0.5 -mb-0.5" />
                                    </div>
                                </div>
                            </div>}
                            {workflowWaitingForHuman && (
                                <div className="flex gap-2 mb-1">
                                    <AgentAvatar name={selectedAgentSession.agentName} className="w-8 h-8" />
                                    <div className="max-w-md lg:max-w-lg xl:max-w-2xl bg-card border rounded-2xl p-4 shadow-sm space-y-3">
                                        <div className="flex items-center gap-2">
                                            <Clock className="w-3.5 h-3.5 text-amber-500" />
                                            <span className="text-xs font-medium text-foreground">{workflowHumanMessage || "请进行审核确认"}</span>
                                        </div>
                                        <div className="border-t pt-3 space-y-3">
                                            {showRejectInput ? (
                                                <div className="space-y-2">
                                                    <Textarea
                                                        value={rejectFeedback}
                                                        onChange={(e) => setRejectFeedback(e.target.value)}
                                                        placeholder="请输入修改意见..."
                                                        rows={3}
                                                    />
                                                    <div className="flex gap-2">
                                                        <Button size="sm" onClick={() => handleWorkflowDecision("rejected", rejectFeedback)} disabled={!rejectFeedback.trim()}>
                                                            提交修改意见
                                                        </Button>
                                                        <Button size="sm" variant="outline" onClick={() => setShowRejectInput(false)}>
                                                            取消
                                                        </Button>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="flex gap-2">
                                                    <Button size="sm" onClick={() => handleWorkflowDecision("approved")}>
                                                        <Check className="w-3.5 h-3.5 mr-1" />通过
                                                    </Button>
                                                    <Button size="sm" variant="outline" onClick={() => setShowRejectInput(true)}>
                                                        <Pencil className="w-3.5 h-3.5 mr-1" />修改意见
                                                    </Button>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}
                            {}
                            {agentSending && !agentStreamingContent && <div className="flex gap-2 mb-1">
                                <AgentAvatar name={selectedAgentSession.agentName} className="w-8 h-8" />
                                <div className="bg-muted px-3 py-2 rounded-2xl rounded-bl-sm flex-1 min-w-0">
                                    <AgentThinkingPanel
                                        currentStep={currentStep}
                                        toolCalls={toolCalls}
                                        isResponding={agentSending}
                                        error={agentError}
                                        safetyIntercepted={safetyIntercepted}
                                        progress={agentProgress}
                                    />
                                </div>
                            </div>}
                            <div ref={messagesEndRef} />
                        </div>
                    </ScrollArea>
                    {}
                    <div className="border-t border-border p-3 shrink-0">
                        <div className="bg-muted/30 border border-border/50 rounded-xl">
                            {}
                            {agentPendingAttachments.length > 0 && <div className="px-3 pt-2 flex flex-wrap gap-2">
                                {agentPendingAttachments.map(att => <div
                                    key={att.id}
                                    className="relative group rounded-lg border border-border/50 bg-background overflow-hidden">
                                    {att.type === "image" ? <div className="w-16 h-16">
                                        {att.previewUrl && <img
                                            src={att.previewUrl}
                                            alt={att.name}
                                            className="w-full h-full object-cover" />}
                                    </div> : <div className="flex items-center gap-1.5 px-2 py-1.5 max-w-[140px]">
                                        <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                                        <span className="text-xs truncate">{att.name}</span>
                                    </div>}
                                    {}
                                    <button
                                        onClick={() => agentRemoveAttachment(att.id)}
                                        className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                        <X className="w-2.5 h-2.5" />
                                    </button>
                                    {}
                                    {att.status === "uploading" && <div
                                        className="absolute inset-0 bg-background/60 flex items-center justify-center">
                                        <Loader2 className="w-4 h-4 animate-spin text-primary" />
                                    </div>}
                                    {att.status === "error" && <div
                                        className="absolute inset-0 bg-destructive/20 flex items-center justify-center">
                                        <X className="w-4 h-4 text-destructive" />
                                    </div>}
                                </div>)}
                            </div>}
                            <textarea
                                ref={agentTextareaRef}
                                value={messageInput}
                                onChange={e => {
                                    setMessageInput(e.target.value);
                                    autoResize(e.target);
                                }}
                                placeholder={`给 ${selectedAgentSession.agentName} 发送消息...`}
                                rows={2}
                                className="w-full px-3 py-2 bg-transparent resize-none text-sm focus:outline-none max-h-[200px] overflow-y-auto"
                                onKeyDown={e => {
                                    if (e.key === "Enter" && !e.shiftKey) {
                                        e.preventDefault();
                                        handleAgentSend();
                                    }
                                }}
                                disabled={agentSending} />
                            <div className="flex items-center justify-between px-2 pb-1.5">
                                <div className="flex items-center gap-0.5">
                                    <input
                                        type="file"
                                        ref={agentImageInputRef}
                                        className="hidden"
                                        accept="image/*"
                                        multiple
                                        onChange={e => {
                                            if (e.target.files)
                                                agentHandleFileSelect(e.target.files, "image");

                                            e.target.value = "";
                                        }} />
                                    <input
                                        type="file"
                                        ref={agentFileInputRef}
                                        className="hidden"
                                        accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv"
                                        multiple
                                        onChange={e => {
                                            if (e.target.files)
                                                agentHandleFileSelect(e.target.files, "file");

                                            e.target.value = "";
                                        }} />
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-7 w-7"
                                        disabled={agentSending}
                                        onClick={() => agentImageInputRef.current?.click()}
                                        title="上传图片"><ImagePlus className="w-4 h-4 text-muted-foreground" /></Button>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-7 w-7"
                                        disabled={agentSending}
                                        onClick={() => agentFileInputRef.current?.click()}
                                        title="上传文件"><Paperclip className="w-4 h-4 text-muted-foreground" /></Button>
                                    <Button variant="ghost" size="icon" className="h-7 w-7" disabled={agentSending}><Smile className="w-4 h-4 text-muted-foreground" /></Button>
                                </div>
                                <Button
                                    size="sm"
                                    onClick={() => handleAgentSend()}
                                    disabled={!messageInput.trim() && agentPendingAttachments.length === 0 || agentSending || agentPendingAttachments.some(a => a.status === "uploading")}
                                    className="h-7 gap-1.5 text-xs">
                                    {agentSending ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />回复中</> : <><Send className="w-3.5 h-3.5" />发送</>}
                                </Button>
                            </div>
                        </div>
                    </div>
                </> : <div className="flex-1 flex items-center justify-center">
                    <div className="text-center space-y-3">
                        <div
                            className="w-16 h-16 mx-auto rounded-full bg-muted flex items-center justify-center">
                            <MailIcon className="w-8 h-8 text-muted-foreground" />
                        </div>
                        <p className="text-muted-foreground text-sm">选择一个对话开始聊天</p>
                        <Button variant="outline" size="sm" onClick={() => setShowNewDialog(true)}>
                            <Plus className="w-4 h-4 mr-1.5" />发起新私聊
                                          </Button>
                    </div>
                </div>}
            </div>
            {}
            <NewConversationDialog
                open={showNewDialog}
                onClose={() => setShowNewDialog(false)}
                teamId={teamId}
                userId={user?.id || ""}
                onConversationCreated={handleConversationCreated}
                onAgentConversationCreated={handleAgentSessionCreated} />

            
        </div>
    );
}

function ConversationItem(
    {
        conversation,
        isSelected,
        currentUserId,
        onClick,
        onAvatarClick
    }: {
        conversation: Conversation;
        isSelected: boolean;
        currentUserId: string;
        onClick: () => void;
        onAvatarClick: (e: React.MouseEvent) => void;
    }
) {
    const lastMsgPreview = conversation.lastMessage ? conversation.lastMessage.length > 15 ? conversation.lastMessage.slice(0, 15) + "..." : conversation.lastMessage : "暂无消息";

    return (
        <button
            onClick={onClick}
            className={cn(
                "w-full flex items-start gap-3 px-4 py-3 hover:bg-muted/50 transition-colors text-left",
                isSelected && "bg-muted"
            )}>
            <div className="relative shrink-0" onClick={onAvatarClick}>
                <UserAvatar
                    avatarKey={conversation.otherUser.avatar}
                    name={conversation.otherUser.name}
                    className="w-10 h-10 cursor-pointer hover:opacity-80 transition-opacity"
                    fallbackClassName="text-sm" />
            </div>
            <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-sm truncate">{conversation.otherUser.name}</span>
                    <span className="text-xs text-muted-foreground shrink-0">{formatTime(conversation.lastMessageAt)}</span>
                </div>
                <div className="flex items-center justify-between gap-2 mt-0.5">
                    <p className="text-xs text-muted-foreground truncate">{lastMsgPreview}</p>
                    {conversation.unreadCount > 0 && <Badge variant="destructive" className="shrink-0 text-xs h-4 min-w-4 px-1">
                        {conversation.unreadCount > 99 ? "99+" : conversation.unreadCount}
                    </Badge>}
                </div>
            </div>
        </button>
    );
}

function MessageBubble(
    {
        message,
        isMine,
        showAvatar,
        showName,
        onAvatarClick
    }: {
        message: Message;
        isMine: boolean;
        showAvatar: boolean;
        showName: boolean;
        onAvatarClick: () => void;
    }
) {
    const [expanded, setExpanded] = useState(false);
    const [showAllContent, setShowAllContent] = useState(false);
    const isLong = message.content.length > 200;
    const isVeryLong = message.content.length > 500;
    const displayContent = isLong && !expanded ? sanitizeContent(message.content).slice(0, 200) + "..." : sanitizeContent(message.content);

    if (isMine) {
        return (
            <div className="flex justify-end gap-2 mb-1">
                <div className="max-w-sm lg:max-w-md xl:max-w-lg">
                    <div
                        className="bg-primary text-primary-foreground px-3 py-2 rounded-2xl rounded-br-sm">
                        <p className="text-sm whitespace-pre-wrap break-words">{displayContent}</p>
                        {message.forwardedMessage && message.forwardedMessage.senderName && <div className="border-l-2 border-primary/40 pl-2.5 mt-1.5 mb-1 text-sm">
                            <div className="flex items-center gap-1 mb-0.5">
                                <CornerDownRight className="h-3 w-3 text-muted-foreground shrink-0" />
                                <span className="font-medium text-xs text-muted-foreground">{message.forwardedMessage.senderName}</span>
                                {message.forwardedMessage.channelName && <span className="text-[11px] text-muted-foreground">#{message.forwardedMessage.channelName}</span>}
                            </div>
                            <p
                                className={cn(
                                    "text-xs text-primary-foreground/90 whitespace-pre-wrap",
                                    !showAllContent && "line-clamp-3"
                                )}>
                                {message.forwardedMessage.content}
                            </p>
                            {message.forwardedMessage.content.length > 150 && <button
                                onClick={e => {
                                    e.stopPropagation();
                                    setShowAllContent(!showAllContent);
                                }}
                                className="text-[11px] text-primary-foreground/70 mt-1 flex items-center gap-0.5 hover:text-primary-foreground transition-colors">
                                {showAllContent ? "收起" : "展开全文"}
                                <ChevronDown
                                    className={cn("w-3 h-3 transition-transform", showAllContent && "rotate-180")} />
                            </button>}
                            {message.forwardedMessage.attachments?.length > 0 && <div className="flex flex-wrap gap-1 mt-1">
                                {message.forwardedMessage.attachments!.slice(0, 3).map((att: any, i: number) => att.type === "image" ? <div
                                    key={i}
                                    className="w-10 h-10 rounded overflow-hidden bg-primary-foreground/10">
                                    <img src={att.url} alt="" className="w-full h-full object-cover" />
                                </div> : null)}
                                {message.forwardedMessage.attachments.length > 3 && <span className="text-xs text-muted-foreground self-center">+{message.forwardedMessage.attachments.length - 3}
                                </span>}
                            </div>}
                        </div>}
                        {isLong && <button
                            onClick={() => setExpanded(!expanded)}
                            className="text-[11px] text-primary-foreground/80 mt-1.5 flex items-center gap-0.5 hover:text-primary-foreground transition-colors">
                            {expanded ? "收起" : "展开全文"}
                            <ChevronDown className={cn("w-3 h-3 transition-transform", expanded && "rotate-180")} />
                        </button>}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 text-right">{formatMessageTime(message.createdAt)}</p>
                </div>
            </div>
        );
    }

    return (
        <div className="flex gap-2 mb-1">
            <div className="shrink-0 w-8">
                {showAvatar ? <UserAvatar
                    avatarKey={message.sender.avatar}
                    name={message.sender.name}
                    className="w-8 h-8 cursor-pointer hover:opacity-80 transition-opacity"
                    fallbackClassName="text-xs"
                    onClick={onAvatarClick} /> : <div className="w-8" />}
            </div>
            <div className="max-w-sm lg:max-w-md xl:max-w-lg">
                {showName && <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-xs font-medium">{message.sender.name}</span>
                    <span className="text-xs text-muted-foreground">{formatMessageTime(message.createdAt)}</span>
                    {message.sender.department && <Badge variant="secondary" className="text-xs h-4 px-1.5">{message.sender.department}</Badge>}
                </div>}
                <div className="bg-muted px-3 py-2 rounded-2xl rounded-bl-sm">
                    <p className="text-sm whitespace-pre-wrap break-words">{displayContent}</p>
                    {message.forwardedMessage && message.forwardedMessage.senderName && <div className="border-l-2 border-blue-400/50 pl-2.5 mt-1.5 mb-1 text-sm">
                        <div className="flex items-center gap-1 mb-0.5">
                            <CornerDownRight className="h-3 w-3 text-muted-foreground shrink-0" />
                            <span className="font-medium text-xs text-muted-foreground">{message.forwardedMessage.senderName}</span>
                            {message.forwardedMessage.channelName && <span className="text-[11px] text-muted-foreground">#{message.forwardedMessage.channelName}</span>}
                        </div>
                        <p
                            className={cn(
                                "text-xs text-foreground/90 whitespace-pre-wrap",
                                !showAllContent && "line-clamp-3"
                            )}>
                            {message.forwardedMessage.content}
                        </p>
                        {message.forwardedMessage.content.length > 150 && <button
                            onClick={e => {
                                e.stopPropagation();
                                setShowAllContent(!showAllContent);
                            }}
                            className="text-[11px] text-foreground/70 mt-1 flex items-center gap-0.5 hover:text-foreground transition-colors">
                            {showAllContent ? "收起" : "展开全文"}
                            <ChevronDown
                                className={cn("w-3 h-3 transition-transform", showAllContent && "rotate-180")} />
                        </button>}
                        {message.forwardedMessage.attachments?.length > 0 && <div className="flex flex-wrap gap-1 mt-1">
                            {message.forwardedMessage.attachments!.slice(0, 3).map((att: any, i: number) => att.type === "image" ? <div
                                key={i}
                                className="w-10 h-10 rounded overflow-hidden bg-muted-foreground/10">
                                <img src={att.url} alt="" className="w-full h-full object-cover" />
                            </div> : null)}
                            {message.forwardedMessage.attachments.length > 3 && <span className="text-xs text-muted-foreground self-center">+{message.forwardedMessage.attachments.length - 3}
                            </span>}
                        </div>}
                    </div>}
                    {isLong && <button
                        onClick={() => setExpanded(!expanded)}
                        className="text-xs text-primary mt-1.5 flex items-center gap-0.5 hover:underline font-medium">
                        {expanded ? "收起" : "展开全文"}
                        <ChevronDown className={cn("w-3 h-3 transition-transform", expanded && "rotate-180")} />
                    </button>}
                </div>
            </div>
        </div>
    );
}

function AgentMessageBubble(
    {
        message,
        isMine,
        agentName,
        currentTeamId,
        currentUser,
        sessionId,
        onActionTaken,
    }: {
        message: AgentMessage;
        isMine: boolean;
        agentName: string;
        currentTeamId: string;
        currentUser: { id: string; name: string; avatar?: string } | null;
        sessionId?: string;
        onActionTaken?: (text: string) => void;
    }
) {
    const hasAttachments = message.attachments && message.attachments.length > 0;
    const [expanded, setExpanded] = useState(false);
    const feedbackStorageKey = `agent-feedback-${message.id}`;
    const [agentFeedback, setAgentFeedback] = useState<"up" | "down" | null>(() => {
      if (typeof window !== "undefined") {
        const saved = localStorage.getItem(feedbackStorageKey);
        if (saved === "up" || saved === "down") return saved;
      }
      return null;
    });
    const [agentShowCorrection, setAgentShowCorrection] = useState(false);
    const [agentCorrection, setAgentCorrection] = useState("");
    const [agentSubmitting, setAgentSubmitting] = useState(false);
    const isLong = (message.content?.length || 0) > 200;
    const displayContent = isLong && !expanded ? sanitizeContent(message.content!).slice(0, 200) + "..." : sanitizeContent(message.content!);

    if (isMine) {
        return (
            <div className="flex justify-end gap-2 mb-1">
                <div className="max-w-sm lg:max-w-md xl:max-w-lg">
                    <div
                        className="bg-primary text-primary-foreground px-3 py-2 rounded-2xl rounded-br-sm">
                        {}
                        {hasAttachments && <div className="flex flex-wrap gap-1.5 mb-1.5">
                            {message.attachments.map((att, i) => {
                                if (att.type === "image" && att.url) {
                                    return (
                                        <img
                                            key={i}
                                            src={att.url}
                                            alt={att.name}
                                            className="max-w-[180px] max-h-[120px] rounded-md object-cover border border-primary-foreground/20" />
                                    );
                                }

                                return (
                                    <div
                                        key={i}
                                        className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-primary-foreground/10 text-xs">
                                        <FileText className="w-3 h-3" />
                                        <span className="truncate max-w-[100px]">{att.name}</span>
                                    </div>
                                );
                            })}
                        </div>}
                        {message.content && <p className="text-sm whitespace-pre-wrap break-words">{displayContent}</p>}
                        {isLong && <button
                            onClick={() => setExpanded(!expanded)}
                            className="text-[11px] text-primary-foreground/80 mt-1.5 flex items-center gap-0.5 hover:text-primary-foreground transition-colors">
                            {expanded ? "收起" : "展开全文"}
                            <ChevronDown className={cn("w-3 h-3 transition-transform", expanded && "rotate-180")} />
                        </button>}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 text-right">{formatMessageTime(message.createdAt)}</p>
                </div>
            </div>
        );
    }

    return (
        <div className="flex gap-2 mb-1">
            <AgentAvatar name={agentName} className="w-8 h-8" />
            <div className="max-w-md lg:max-w-lg xl:max-w-2xl">
                <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-xs font-medium">{agentName}</span>
                    <Badge
                        variant="secondary"
                        className="text-[10px] h-4 px-1 bg-primary/10 text-primary border-0">
                        <Bot className="w-2.5 h-2.5 mr-0.5" />智能体
                                  </Badge>
                    <span className="text-xs text-muted-foreground">{formatMessageTime(message.createdAt)}</span>
                </div>
                <div className="bg-muted px-3 py-2 rounded-2xl rounded-bl-sm">
                    <p className="text-sm whitespace-pre-wrap break-words">{displayContent || message.content}</p>
                    {isLong && <button
                        onClick={() => setExpanded(!expanded)}
                        className="text-xs text-primary mt-1.5 flex items-center gap-0.5 hover:underline font-medium">
                        {expanded ? "收起" : "展开全文"}
                        <ChevronDown className={cn("w-3 h-3 transition-transform", expanded && "rotate-180")} />
                    </button>}
                    {isDocumentContent(message.content) && (
                        <DocCard content={message.content} />
                    )}
                    <div className="mt-2 flex items-center gap-2">
                        <SubmitApprovalButton
                            hideWhenNoTask
                            teamId={currentTeamId}
                            userId={currentUser?.id || ""}
                            sessionId={sessionId}
                            sourceId={message.id}
                            title={(() => {
                                const lines = (message.content || "").split("\n").map(l => l.trim()).filter(Boolean);
                                for (const l of lines) {
                                    const m = l.match(/^#{1,4}\s+(.+)/);
                                    if (m) return m[1].trim();
                                }
                                return "方案审批";
                            })()}
                            draft={{ content: message.content }}
                            taskType="方案审批"
                            description="智能体生成的方案，等待审批确认"
                            onActionTaken={onActionTaken}
                        />
                    </div>
                </div>
                {message.meta?.artifacts && message.meta.artifacts.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                        <span className="text-[10px] text-muted-foreground flex items-center gap-0.5"><Package className="w-3 h-3" />产出物：</span>
                        {message.meta.artifacts.map((art, i) => {
                            if (art.type === "image" && art.url) {
                                return (
                                    <a key={i} href={art.url} target="_blank" rel="noopener noreferrer"
                                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-amber-500/10 text-amber-700 text-[11px] hover:bg-amber-500/20 transition-colors">
                                        <ImagePlus className="w-3 h-3" />{art.name}
                                    </a>
                                );
                            }
                            if (art.type === "link" && art.url) {
                                return (
                                    <a key={i} href={art.url} target="_blank" rel="noopener noreferrer"
                                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-blue-500/10 text-blue-700 text-[11px] hover:bg-blue-500/20 transition-colors">
                                        <FileText className="w-3 h-3" />{art.name}
                                    </a>
                                );
                            }
                            if (art.type === "code") {
                                return (
                                    <span key={i}
                                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-violet-500/10 text-violet-700 text-[11px]">
                                        <Code2 className="w-3 h-3" />{art.name}
                                    </span>
                                );
                            }
                            return (
                                <span key={i}
                                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-muted text-muted-foreground text-[11px]">
                                    <FileText className="w-3 h-3" />{art.name}
                                </span>
                            );
                        })}
                    </div>
                )}
                {/* 反馈按钮 - AI 消息 */}
                {message.content && (
                    <div className="flex items-center gap-1 mt-1 pl-1">
                        <button
                            onClick={() => {
                                if (agentSubmitting) return;
                                setAgentFeedback("up");
                                localStorage.setItem(feedbackStorageKey, "up");
                                fetch("/api/agents/feedback", {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({
                                        agentId: message.senderId,
                                        teamId: currentTeamId,
                                        userId: currentUser?.id,
                                        rating: 5, tags: ["好评"],
                                    }),
                                }).catch(() => {});
                            }}
                            className={cn("p-1 rounded hover:bg-muted transition-colors", agentFeedback === "up" ? "text-green-500" : "text-muted-foreground")}
                            title="有用"
                        >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 9V5a3 3 0 00-3-3l-4 9v11h11.28a2 2 0 002-1.7l1.38-9a2 2 0 00-2-2.3H14zM7 22H4a2 2 0 01-2-2v-7a2 2 0 012-2h3" />
                            </svg>
                        </button>
                        <button
                            onClick={() => {
                                if (agentSubmitting) return;
                                setAgentShowCorrection(true);
                            }}
                            className={cn("p-1 rounded hover:bg-muted transition-colors", agentFeedback === "down" ? "text-red-500" : "text-muted-foreground")}
                            title="需要改进"
                        >
                            <svg className="w-3.5 h-3.5 scale-y-[-1]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 9V5a3 3 0 00-3-3l-4 9v11h11.28a2 2 0 002-1.7l1.38-9a2 2 0 00-2-2.3H14zM7 22H4a2 2 0 01-2-2v-7a2 2 0 012-2h3" />
                            </svg>
                        </button>
                        {agentShowCorrection && (
                            <div className="flex items-center gap-1 ml-2 flex-1">
                                <input
                                    type="text"
                                    value={agentCorrection}
                                    onChange={(e) => setAgentCorrection(e.target.value)}
                                    placeholder="输入正确回答..."
                                    className="flex-1 h-7 px-2 text-xs rounded border border-border bg-background"
                                    autoFocus
                                />
                                <button
                                    onClick={async () => {
                                        setAgentSubmitting(true);
                                        setAgentFeedback("down");
                                        localStorage.setItem(feedbackStorageKey, "down");
                                        setAgentShowCorrection(false);
                                        await fetch("/api/agents/feedback", {
                                            method: "POST",
                                            headers: { "Content-Type": "application/json" },
                                            body: JSON.stringify({
                                                agentId: message.senderId,
                                                teamId: currentTeamId,
                                                userId: currentUser?.id,
                                                rating: 1, tags: ["需改进"],
                                                correction: agentCorrection || undefined,
                                            }),
                                        }).catch(() => {});
                                        setAgentSubmitting(false);
                                    }}
                                    className="px-2 h-7 text-xs rounded bg-primary text-primary-foreground hover:bg-primary/90"
                                    disabled={agentSubmitting}
                                >
                                    提交
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}