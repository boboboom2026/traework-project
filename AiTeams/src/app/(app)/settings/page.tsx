"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { InviteModal } from "@/components/teams/invite-modal";
import {
  Smartphone,
  Mail,
  Lock,
  User,
  Loader2,
  Info,
  Users,
  UserCog,
  BarChart3,
  Layers,
  Upload,
  Settings,
  ChevronRight,
  Search,
  Eye,
  Pencil,
  Network,
  Plus,
  Trash2,
  Building2,
  Camera,
  X,
  AlertTriangle,
  ChevronLeft,
  Briefcase,
  Send,
  ChevronDown,
  Bot,
  TrendingUp,
  Hash,
  MessageSquare,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { UserAvatar } from "@/components/shared/user-avatar";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import PositionCenter from "@/components/settings/position-center";
import {
  Select as SelectComponent,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type SettingsTab = "account" | "customize" | "members" | "org" | "groups" | "users" | "analytics" | "positions" | "ai-assistant";

interface MemberItem {
  id: string;
  name: string;
  nickname: string;
  department: string;
  position: string;
  phone: string;
  email?: string;
  avatar?: string;
  status: "正常" | "已注销";
  role?: string;
  joinedAt?: string;
}

interface OrgNode {
  id: string;
  name: string;
  parentId?: string | null;
  sortOrder?: number;
  children?: OrgNode[];
}

interface NavGroup {
  title: string;
  items: { id: SettingsTab; label: string; icon?: React.ReactNode }[];
}

const navGroups: NavGroup[] = [
  {
    title: "账户",
    items: [
      { id: "account", label: "个人账户设置" },
      { id: "customize", label: "更改团队信息" },
    ],
  },
  {
    title: "管理",
    items: [
      { id: "members", label: "成员管理", icon: <Users className="w-4 h-4" /> },
      { id: "org", label: "组织架构", icon: <Network className="w-4 h-4" /> },
      { id: "positions", label: "岗位中心", icon: <Briefcase className="w-4 h-4" /> },
      { id: "groups", label: "群组管理", icon: <Layers className="w-4 h-4" /> },
      { id: "users", label: "用户管理", icon: <UserCog className="w-4 h-4" /> },
      { id: "analytics", label: "统计与分析", icon: <BarChart3 className="w-4 h-4" /> },
      { id: "ai-assistant", label: "频道AI助手", icon: <Bot className="w-4 h-4" /> },
    ],
  },
];

export default function SettingsPage() {
  const { user, logout, bindPhone, updateProfile, sendCode } = useAuth();

  // 成员头像解析组件
  function MemberAvatar({ avatar, name, className }: { avatar?: string; name: string; className?: string }) {
    const sizeClass = className || "w-8 h-8";
    const fallbackTextClass = sizeClass.includes("16") ? "text-xl font-medium" : "text-xs font-medium";
    return <UserAvatar avatarKey={avatar} name={name} className={sizeClass} fallbackClassName={fallbackTextClass} />;
  }

  // 编辑成员头像组件（支持预览覆盖）
  function EditMemberAvatar() {
    if (!editMember) return null;
    return (
      <UserAvatar avatarKey={editMember.avatar} src={editMemberAvatarPreview} name={editMember.name} className="w-24 h-24" fallbackClassName="text-2xl font-medium" />
    );
  }
  const router = useRouter();
  const searchParams = useSearchParams();

  // 团队信息
  const currentTeam = user?.teams?.find((t) => t.id === user.currentTeamId) || user?.teams?.[0];
  const isAdmin = currentTeam?.role === "owner";

  // 根据权限过滤导航项
  const visibleNavGroups: NavGroup[] = useMemo(() => isAdmin
    ? navGroups
    : [
        {
          title: "账户",
          items: [{ id: "account" as SettingsTab, label: "个人账户设置" }],
        },
      ], [isAdmin]);

  const [activeTab, setActiveTab] = useState<SettingsTab>("account");
  const [dialogOpen, setDialogOpen] = useState<string | null>(null);
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [viewMember, setViewMember] = useState<MemberItem | null>(null);
  const [editMember, setEditMember] = useState<MemberItem | null>(null);
  const [editMemberForm, setEditMemberForm] = useState({
    name: "",
    nickname: "",
    department: "",
    position: "",
    email: "",
  });

  // 当编辑成员变化时，同步表单数据
  useEffect(() => {
    if (editMember) {
      setEditMemberForm({
        name: editMember.name || "",
        nickname: editMember.nickname || "",
        department: editMember.department === "无" ? "" : (editMember.department || ""),
        position: editMember.position || "",
        email: editMember.email || "",
      });
    }
  }, [editMember]);
  const [orgDialogOpen, setOrgDialogOpen] = useState<"add" | "edit" | "delete" | null>(null);
  const [orgEditTarget, setOrgEditTarget] = useState<OrgNode | null>(null);
  const [orgNewName, setOrgNewName] = useState("");
  const [orgNewParentId, setOrgNewParentId] = useState<string | null>(null);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [members, setMembers] = useState<MemberItem[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [departments, setDepartments] = useState<OrgNode[]>([]);
  const [departmentsLoading, setDepartmentsLoading] = useState(false);
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [countdown, setCountdown] = useState(0);
  const [name, setName] = useState(user?.name || "");
  const [nickname, setNickname] = useState(user?.nickname || "");
  const [email, setEmail] = useState(user?.email || "");
  const [position, setPosition] = useState(user?.position || "");
  const [department, setDepartment] = useState(user?.department || "");

  // 从 URL 参数读取初始 tab
  useEffect(() => {
    const tab = searchParams.get("tab");
    const allItems = visibleNavGroups.flatMap(g => g.items);
    if (tab && allItems.some(item => item.id === tab)) {
      setActiveTab(tab as SettingsTab);
    } else if (tab && !allItems.some(item => item.id === tab)) {
      // 非管理员访问管理页面，重定向到个人账户
      setActiveTab("account");
    }
  }, [searchParams, visibleNavGroups]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarKey, setAvatarKey] = useState<string | null>(null);
  const profileFileInputRef = useRef<HTMLInputElement>(null);
  const memberFileInputRef = useRef<HTMLInputElement>(null);
  const [editMemberAvatarPreview, setEditMemberAvatarPreview] = useState<string | null>(null);
  const [editMemberAvatarKey, setEditMemberAvatarKey] = useState<string | null>(null);

  // 群组管理相关状态
  const [groups, setGroups] = useState<{ id: string; name: string; description: string; creatorId: string; creatorName: string; memberCount: number; isActive: boolean; createdAt: string; updatedAt?: string }[]>([]);
  const [groupsLoading, setGroupsLoading] = useState(false);
  const [groupSearch, setGroupSearch] = useState("");
  const [groupPage, setGroupPage] = useState(1);
  const [groupTotal, setGroupTotal] = useState(0);
  const [createGroupOpen, setCreateGroupOpen] = useState(false);
  const [createGroupName, setCreateGroupName] = useState("");
  const [createGroupDesc, setCreateGroupDesc] = useState("");
  const [disbandGroupOpen, setDisbandGroupOpen] = useState(false);
  const [disbandTarget, setDisbandTarget] = useState<{ id: string; name: string } | null>(null);

  // 群组添加成员相关状态
  const [addGroupMembersOpen, setAddGroupMembersOpen] = useState(false);
  const [addGroupMembersTarget, setAddGroupMembersTarget] = useState<{ id: string; name: string } | null>(null);
  const [addGroupMembersSelected, setAddGroupMembersSelected] = useState<string[]>([]);
  const [addGroupMembersSearch, setAddGroupMembersSearch] = useState("");
  const [addGroupMembersTab, setAddGroupMembersTab] = useState<"members" | "groups">("members");
  const [addGroupMembersExpandedDepts, setAddGroupMembersExpandedDepts] = useState<Set<string>>(new Set());
  const [currentGroupMemberIds, setCurrentGroupMemberIds] = useState<Set<string>>(new Set());
  const [currentGroupMembers, setCurrentGroupMembers] = useState<{ id: string; name: string; department: string; position: string; avatar?: string }[]>([]);

  // 群组邀请成员
  const [groupInviteOpen, setGroupInviteOpen] = useState(false);

  // 获取群组列表
  const fetchGroups = useCallback(async () => {
    if (!currentTeam?.id) return;
    setGroupsLoading(true);
    try {
      const searchParam = groupSearch ? `&search=${encodeURIComponent(groupSearch)}` : "";
      const res = await fetch(`/api/teams/groups?teamId=${currentTeam.id}&page=${groupPage}&pageSize=10${searchParam}`);
      const data = await res.json();
      if (data.success) {
        setGroups(data.groups);
        setGroupTotal(data.total);
      }
    } catch (err) {
      console.error("获取群组列表失败:", err);
    } finally {
      setGroupsLoading(false);
    }
  }, [currentTeam?.id, groupPage, groupSearch]);

  useEffect(() => {
    if (currentTeam?.id && activeTab === "groups") {
      fetchGroups();
    }
  }, [currentTeam?.id, activeTab, groupPage, groupSearch, fetchGroups]);

  const groupPageSize = 10;
  const groupTotalPages = Math.ceil(groupTotal / groupPageSize);

  // 按部门分组的团队成员
  const membersByDept = members.reduce<Record<string, typeof members>>((acc, m) => {
    const dept = m.department || "未分配部门";
    if (!acc[dept]) acc[dept] = [];
    acc[dept].push(m);
    return acc;
  }, {});

  // 获取其他群组的成员ID
  const getGroupMemberIds = async (groupId: string): Promise<string[]> => {
    try {
      const res = await fetch(`/api/teams/groups/members?groupId=${groupId}`);
      const data = await res.json();
      if (data.success) {
        return data.members.map((m: { id: string }) => m.id);
      }
    } catch (err) {
      console.error("获取群组成员失败:", err);
    }
    return [];
  };

  // 打开添加成员弹窗
  const openAddGroupMembers = async (groupId: string, groupName: string) => {
    setAddGroupMembersTarget({ id: groupId, name: groupName });
    setAddGroupMembersSelected([]);
    setAddGroupMembersSearch("");
    setAddGroupMembersTab("members");
    setAddGroupMembersExpandedDepts(new Set());
    // 获取当前群组成员
    try {
      const res = await fetch(`/api/teams/groups/members?groupId=${groupId}`);
      const data = await res.json();
      if (data.success) {
        const groupMemberList = data.members as { id: string; name: string; department: string; position: string; avatar?: string }[];
        setCurrentGroupMemberIds(new Set(groupMemberList.map((m) => m.id)));
        setCurrentGroupMembers(groupMemberList);
      }
    } catch (err) {
      console.error("获取群组成员失败:", err);
      setCurrentGroupMemberIds(new Set());
      setCurrentGroupMembers([]);
    }
    setAddGroupMembersOpen(true);
  };

  // 添加成员到群组
  const handleAddGroupMembers = async () => {
    if (!addGroupMembersTarget) return;
    const userIds = addGroupMembersSelected.filter((id) => !id.startsWith("__group__"));
    if (userIds.length === 0) return;
    try {
      const res = await fetch("/api/teams/groups/members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          groupId: addGroupMembersTarget.id,
          userIds,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setAddGroupMembersOpen(false);
        setAddGroupMembersTarget(null);
        setAddGroupMembersSelected([]);
        fetchGroups();
      }
    } catch (err) {
      console.error("添加成员失败:", err);
    }
  };

  // 切换部门展开/折叠
  const toggleDeptExpand = (dept: string) => {
    setAddGroupMembersExpandedDepts((prev) => {
      const next = new Set(prev);
      if (next.has(dept)) next.delete(dept);
      else next.add(dept);
      return next;
    });
  };

  // 获取团队成员列表
  const fetchMembers = useCallback(async () => {
    if (!currentTeam?.id) return;
    setMembersLoading(true);
    try {
      const res = await fetch(`/api/teams/members?teamId=${currentTeam.id}`);
      const data = await res.json();
      if (data.success) {
        setMembers(data.members);
      }
    } catch (err) {
      console.error("获取成员列表失败:", err);
    } finally {
      setMembersLoading(false);
    }
  }, [currentTeam?.id]);

  // 获取部门列表
  const fetchDepartments = useCallback(async () => {
    if (!currentTeam?.id) return;
    setDepartmentsLoading(true);
    try {
      const res = await fetch(`/api/teams/departments?teamId=${currentTeam.id}`);
      const data = await res.json();
      if (data.success) {
        setDepartments(data.tree || []);
      }
    } catch (err) {
      console.error("获取部门列表失败:", err);
    } finally {
      setDepartmentsLoading(false);
    }
  }, [currentTeam?.id]);

  // 加载成员和部门数据
  const loadStats = useCallback(async () => {
    if (!currentTeam?.id) return;
    setStatsLoading(true);
    try {
      const res = await fetch(`/api/teams/stats?teamId=${currentTeam.id}`);
      const data = await res.json();
      if (data.success) {
        setStats(data.stats);
      }
    } catch (err) {
      console.error("Failed to load stats:", err);
    } finally {
      setStatsLoading(false);
    }
  }, [currentTeam?.id]);

  useEffect(() => {
    if (currentTeam?.id) {
      fetchMembers();
      fetchDepartments();
      loadStats();
    }
  }, [currentTeam?.id, fetchMembers, fetchDepartments, loadStats]);
  const [teamName, setTeamName] = useState(currentTeam?.name || "");
  const [teamUrl, setTeamUrl] = useState("");
  const [teamSaving, setTeamSaving] = useState(false);

  // 用户管理状态
  const [userSearchQuery, setUserSearchQuery] = useState("");
  const [userManageLoading, setUserManageLoading] = useState(false);
  const [removeMemberTarget, setRemoveMemberTarget] = useState<{ id: string; name: string } | null>(null);
  const [removeMemberSubmitting, setRemoveMemberSubmitting] = useState(false);

  // 统计数据
  interface TeamStats {
    totalMembers: number;
    activeMembers: number;
    totalChannels: number;
    totalMessages: number;
    messagesLast7Days: number;
    messagesLast30Days: number;
    topChannels: { name: string; count: number }[];
    dailyMessages: { date: string; count: number }[];
    topMembers: { userId: string; name: string; count: number }[];
  }
  const [stats, setStats] = useState<TeamStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);

  const filteredUserMembers = useMemo(() => {
    if (!userSearchQuery.trim()) return members;
    const q = userSearchQuery.toLowerCase();
    return members.filter((m) =>
      m.name.toLowerCase().includes(q) ||
      (m.nickname || "").toLowerCase().includes(q) ||
      (m.department || "").toLowerCase().includes(q) ||
      (m.position || "").toLowerCase().includes(q)
    );
  }, [members, userSearchQuery]);

  // 更新成员角色
  const handleRoleChange = async (member: MemberItem, newRole: "admin" | "member") => {
    if (!currentTeam?.id) return;
    try {
      const res = await fetch("/api/teams/members", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamId: currentTeam.id, userId: member.id, role: newRole }),
      });
      const data = await res.json();
      if (data.success) {
        await fetchMembers();
      }
    } catch (err) {
      console.error("更新角色失败:", err);
    }
  };

  // 移除成员
  const handleRemoveMember = (member: MemberItem) => {
    setRemoveMemberTarget(member);
  };

  const confirmRemoveMember = async () => {
    if (!currentTeam?.id || !removeMemberTarget) return;
    setRemoveMemberSubmitting(true);
    try {
      const res = await fetch(`/api/teams/members?teamId=${currentTeam.id}&userId=${removeMemberTarget.id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (data.success) {
        await fetchMembers();
        setRemoveMemberTarget(null);
      }
    } catch (err) {
      console.error("移除成员失败:", err);
    } finally {
      setRemoveMemberSubmitting(false);
    }
  };

  // 保存团队信息
  const handleSaveTeamInfo = async () => {
    if (!currentTeam?.id) return;
    setTeamSaving(true);
    try {
      const res = await fetch("/api/teams/info", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamId: currentTeam.id, name: teamName }),
      });
      const data = await res.json();
      if (data.success) {
        // 更新本地状态
        if (user?.teams) {
          const updatedTeams = user.teams.map((t) =>
            t.id === currentTeam.id ? { ...t, name: teamName } : t
          );
          // Trigger a refresh
          window.location.reload();
        }
      }
    } catch (err) {
      console.error("保存团队信息失败:", err);
    } finally {
      setTeamSaving(false);
    }
  };

  // 发送验证码
  const handleSendCode = async () => {
    if (!phone || phone.length !== 11) {
      setError("请输入正确的手机号");
      return;
    }
    setIsLoading(true);
    setError("");
    try {
      const result = await sendCode(phone, "bind");
      if (result.success) {
        if (result.code) setCode(result.code);
        setCountdown(60);
        const timer = setInterval(() => {
          setCountdown((prev) => {
            if (prev <= 1) { clearInterval(timer); return 0; }
            return prev - 1;
          });
        }, 1000);
      } else {
        setError(result.error || "发送失败");
      }
    } catch {
      setError("发送失败");
    } finally {
      setIsLoading(false);
    }
  };

  // 绑定手机号
  const handleBindPhone = async () => {
    if (!phone || !code) { setError("请填写完整信息"); return; }
    setIsLoading(true); setError("");
    try {
      const result = await bindPhone(phone, code);
      if (result.success) { setDialogOpen(null); setPhone(""); setCode(""); }
      else { setError(result.error || "绑定失败"); }
    } catch { setError("绑定失败，请重试"); }
    finally { setIsLoading(false); }
  };

  // 保存个人资料
  const handleSaveProfile = async () => {
    setIsLoading(true);
    try {
      const profileData: Record<string, string> = { name, nickname, email, position, department };
      if (avatarKey) profileData.avatar = avatarKey;
      await updateProfile(profileData);
      // 如果有新头像 key，同步到数据库
      if (avatarKey && user?.id) {
        await fetch("/api/users", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: user.id, avatar: avatarKey }),
        });
      }
      setAvatarKey(null);
      setAvatarPreview(null);
      setDialogOpen(null);
    } finally {
      setIsLoading(false);
    }
  };

  // 上传头像到对象存储
  const handleAvatarUpload = async (
    file: File,
    userId: string,
    onPreview: (url: string | null) => void,
    onKeyReady: (key: string) => void
  ) => {
    setAvatarUploading(true);
    try {
      // 先生成本地预览
      const localUrl = URL.createObjectURL(file);
      onPreview(localUrl);

      const formData = new FormData();
      formData.append("file", file);
      formData.append("userId", userId);

      const res = await fetch("/api/upload/avatar", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();

      if (data.success) {
        onKeyReady(data.key);
        // 用签名 URL 替换本地预览
        onPreview(data.url);
      } else {
        onPreview(null);
        alert(data.error || "上传失败");
      }
    } catch (err) {
      console.error("上传头像失败:", err);
      onPreview(null);
      alert("上传失败，请重试");
    } finally {
      setAvatarUploading(false);
    }
  };

  const handleLogout = () => {
    if (confirm("确定要退出登录吗？")) { logout(); router.push("/login"); }
  };

  // 组织架构辅助函数
  const toggleExpand = (nodeId: string) => {
    setExpandedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });
  };

  const countOrgNodes = (nodes: OrgNode[]): number => {
    return nodes.reduce((sum, node) => {
      return sum + 1 + (node.children ? countOrgNodes(node.children) : 0);
    }, 0);
  };

  const getDeptMemberCount = (deptName: string): number => {
    return members.filter((m) => m.department === deptName).length;
  };

  const flattenOrgNodes = (nodes: OrgNode[], depth: number = 0): { id: string; name: string; depth: number }[] => {
    const result: { id: string; name: string; depth: number }[] = [];
    for (const node of nodes) {
      result.push({ id: node.id, name: node.name, depth });
      if (node.children) {
        result.push(...flattenOrgNodes(node.children, depth + 1));
      }
    }
    return result;
  };

  const renderOrgTree = (node: OrgNode, depth: number) => {
    const hasChildren = node.children && node.children.length > 0;
    const isExpanded = expandedNodes.has(node.id);
    const memberCount = getDeptMemberCount(node.name);

    return (
      <div key={node.id}>
        <div
          className="group flex items-center gap-1 px-2 py-2 rounded-lg hover:bg-muted/50 transition-colors"
          style={{ paddingLeft: `${depth * 24 + 8}px` }}
        >
          {/* 展开/折叠按钮 */}
          <button
            onClick={() => hasChildren && toggleExpand(node.id)}
            className={cn(
              "w-5 h-5 flex items-center justify-center rounded transition-colors shrink-0",
              hasChildren ? "hover:bg-muted cursor-pointer" : "cursor-default"
            )}
          >
            {hasChildren ? (
              <ChevronRight
                className={cn(
                  "w-3.5 h-3.5 text-muted-foreground transition-transform duration-200",
                  isExpanded && "rotate-90"
                )}
              />
            ) : (
              <span className="w-3.5" />
            )}
          </button>

          {/* 图标 */}
          <div className="w-7 h-7 rounded-md flex items-center justify-center shrink-0 bg-muted text-muted-foreground">
            <Building2 className="w-4 h-4" />
          </div>

          {/* 名称和成员数 */}
          <span className="text-sm font-medium flex-1">
            {node.name}
          </span>
          <span className="text-xs text-muted-foreground mr-2">
            {memberCount > 0 ? `${memberCount}人` : ""}
          </span>

          {/* 操作按钮 */}
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={() => {
                setOrgNewName("");
                setOrgNewParentId(node.id);
                setOrgDialogOpen("add");
              }}
              className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              title="新增子部门"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => {
                setOrgEditTarget(node);
                setOrgNewName(node.name);
                setOrgDialogOpen("edit");
              }}
              className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              title="编辑部门"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => {
                setOrgEditTarget(node);
                setOrgDialogOpen("delete");
              }}
              className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
              title="删除部门"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* 子节点 */}
        {hasChildren && isExpanded && (
          <div>
            {node.children!.map((child) => renderOrgTree(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="h-full flex">
      {/* 左侧导航 */}
      <aside className="w-56 bg-card border-r border-border flex flex-col shrink-0">
        <div className="h-14 border-b border-border flex items-center px-4 gap-3">
          <button
            onClick={() => router.push("/")}
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            返回
          </button>
          <h2 className="text-base font-semibold">设置</h2>
        </div>

        <nav className="flex-1 p-3 space-y-4 overflow-y-auto">
          {visibleNavGroups.map((group) => (
            <div key={group.title}>
              <p className="text-xs font-medium text-muted-foreground px-3 mb-1 uppercase tracking-wider">
                {group.title}
              </p>
              <div className="space-y-0.5">
                {group.items.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setActiveTab(item.id)}
                    className={cn(
                      "w-full px-3 py-2 text-left text-sm rounded-lg transition-colors flex items-center gap-2",
                      activeTab === item.id
                        ? "bg-primary/10 text-primary font-medium"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    )}
                  >
                    {item.icon}
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div className="p-3 border-t border-border">
          <button
            onClick={handleLogout}
            className="w-full px-3 py-2 text-left text-sm rounded-lg text-destructive hover:bg-destructive/10 transition-colors"
          >
            退出登录
          </button>
        </div>
      </aside>

      {/* 右侧内容 */}
      <main className="flex-1 overflow-y-auto">
        {activeTab === "account" && (
          <div className="max-w-2xl p-8">
            <h1 className="text-2xl font-semibold mb-6">个人账户设置</h1>
            <div className="bg-card rounded-xl border border-border overflow-hidden">
              {/* 手机号 */}
              <button
                onClick={() => setDialogOpen("phone")}
                className="w-full flex items-center gap-4 p-4 hover:bg-muted/50 transition-colors"
              >
                <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center text-muted-foreground">
                  <Smartphone className="w-5 h-5" />
                </div>
                <div className="flex-1 text-left">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">手机号</span>
                    {user?.phone && (
                      <span className="text-xs bg-green-500/10 text-green-600 px-1.5 py-0.5 rounded">已绑定</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">{user?.phone || "未绑定"}</span>
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                </div>
              </button>
              <Separator />
              {/* 邮箱 */}
              <button
                onClick={() => setDialogOpen("email")}
                className="w-full flex items-center gap-4 p-4 hover:bg-muted/50 transition-colors"
              >
                <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center text-muted-foreground">
                  <Mail className="w-5 h-5" />
                </div>
                <div className="flex-1 text-left">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">邮箱</span>
                    {user?.email && (
                      <span className="text-xs bg-green-500/10 text-green-600 px-1.5 py-0.5 rounded">已绑定</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">{user?.email || "未绑定"}</span>
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                </div>
              </button>
              <Separator />
              {/* 密码 */}
              <button
                onClick={() => setDialogOpen("password")}
                className="w-full flex items-center gap-4 p-4 hover:bg-muted/50 transition-colors"
              >
                <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center text-muted-foreground">
                  <Lock className="w-5 h-5" />
                </div>
                <div className="flex-1 text-left">
                  <span className="font-medium">密码</span>
                  <p className="text-sm text-muted-foreground">设置或修改登录密码</p>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              </button>
              <Separator />
              {/* 个人资料 */}
              <button
                onClick={() => setDialogOpen("profile")}
                className="w-full flex items-center gap-4 p-4 hover:bg-muted/50 transition-colors"
              >
                <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center text-muted-foreground">
                  <User className="w-5 h-5" />
                </div>
                <div className="flex-1 text-left">
                  <span className="font-medium">编辑资料</span>
                  <p className="text-sm text-muted-foreground">修改姓名、昵称、职位、部门</p>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>
          </div>
        )}

        {activeTab === "customize" && (
          <div className="max-w-3xl p-8">
            <h1 className="text-2xl font-semibold mb-6">更改团队信息</h1>
            <div className="bg-card rounded-xl border border-border p-8">
              <div className="flex gap-8">
                {/* 左侧：文字信息 */}
                <div className="flex-1 space-y-6">
                  {/* 团队名称 */}
                  <div className="space-y-2">
                    <Label htmlFor="teamName" className="text-sm font-medium">
                      团队的名称
                    </Label>
                    <Input
                      id="teamName"
                      type="text"
                      value={teamName}
                      onChange={(e) => setTeamName(e.target.value)}
                      placeholder="请输入团队名称"
                      className="h-11"
                    />
                  </div>

                  {/* 网址 */}
                  <div className="space-y-2">
                    <Label htmlFor="teamUrl" className="text-sm font-medium">
                      网址
                    </Label>
                    <div className="flex items-center h-11 rounded-md border border-input bg-muted/50 px-3">
                      <span className="text-sm text-muted-foreground mr-1">https://</span>
                      <input
                        id="teamUrl"
                        type="text"
                        value={teamUrl}
                        onChange={(e) => setTeamUrl(e.target.value.replace(/[^a-z0-9-]/g, ""))}
                        placeholder="your-team"
                        className="flex-1 bg-transparent text-sm outline-none"
                      />
                        <span className="text-sm text-muted-foreground ml-1">.aiteams.com</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      * 网址只能包含小写字母、数字和短划线
                    </p>
                  </div>

                  {/* 保存按钮 */}
                  <Button
                    className="h-11 px-8"
                    onClick={handleSaveTeamInfo}
                    disabled={teamSaving}
                  >
                    {teamSaving ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> 保存中...</> : "保存更改"}
                  </Button>
                </div>

                {/* 右侧：头像 */}
                <div className="flex flex-col items-center w-48">
                  <div className="w-32 h-32 rounded-xl bg-muted border-2 border-dashed border-border flex items-center justify-center mb-3">
                    {currentTeam?.logo ? (
                      <img src={currentTeam.logo} alt="" className="w-full h-full rounded-xl object-cover" />
                    ) : (
                      <div className="text-center">
                        <div className="w-16 h-16 rounded-lg bg-primary/10 flex items-center justify-center mx-auto mb-2">
                          <span className="text-2xl font-bold text-primary">
                            {teamName.charAt(0) || "T"}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                  <Button variant="outline" size="sm" className="mb-4">
                    <Upload className="w-4 h-4 mr-1" />
                    更换头像
                  </Button>
                  <div className="text-xs text-muted-foreground space-y-1">
                    <p className="font-medium text-foreground mb-1">头像建议:</p>
                    <ul className="list-disc list-inside space-y-0.5">
                      <li>使用纯色背景色。</li>
                      <li>使用图形徽标或图像。</li>
                      <li>图标周围留有留白。</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === "members" && (
          <div className="p-8">
            <div className="flex items-center justify-between mb-6">
              <h1 className="text-2xl font-semibold">成员管理</h1>
              <div className="flex items-center gap-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input placeholder="搜索成员" className="h-9 pl-9 w-52" />
                </div>
              {isAdmin && (
                <Button onClick={() => setInviteModalOpen(true)}>
                  <Users className="w-4 h-4 mr-1" />
                  邀请新人员
                </Button>
              )}
              </div>
            </div>

            {/* 成员表格 */}
            <div className="bg-card rounded-xl border border-border overflow-hidden">
              {membersLoading ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                  <span className="ml-2 text-sm text-muted-foreground">加载成员列表...</span>
                </div>
              ) : members.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16">
                  <Users className="w-12 h-12 text-muted-foreground/40 mb-3" />
                  <p className="text-muted-foreground text-sm">暂无成员</p>
                </div>
              ) : (
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border bg-muted/30">
                      <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">名称</th>
                      <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">部门</th>
                      <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">职位</th>
                      <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">手机</th>
                      <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">角色</th>
                      {isAdmin && <th className="text-right text-xs font-medium text-muted-foreground px-4 py-3">操作</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {members.map((member) => (
                      <tr key={member.id} className="border-b border-border/50 last:border-0 hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            <MemberAvatar avatar={member.avatar} name={member.name} />
                            <span className="text-sm font-medium">{member.name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-sm text-muted-foreground">{member.department || "无"}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-sm text-muted-foreground">{member.position || "-"}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-sm text-muted-foreground">{member.phone || "-"}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={cn(
                            "text-xs px-2 py-0.5 rounded-full",
                            member.role === "owner"
                              ? "bg-primary/10 text-primary font-medium"
                              : "bg-muted text-muted-foreground"
                          )}>
                            {member.role === "owner" ? "管理员" : "成员"}
                          </span>
                        </td>
                        {isAdmin && (
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-3">
                            <button
                              onClick={() => setViewMember(member)}
                              className="text-sm text-primary hover:underline inline-flex items-center gap-1"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              查看
                            </button>
                            <button
                              onClick={() => setEditMember(member)}
                              className="text-sm text-primary hover:underline inline-flex items-center gap-1"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                              编辑
                            </button>
                          </div>
                        </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {/* 分页 */}
              {!membersLoading && members.length > 0 && (
                <div className="flex items-center justify-between px-4 py-3 border-t border-border">
                  <span className="text-sm text-muted-foreground">共 {members.length} 条记录</span>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === "org" && (
          <div className="max-w-3xl p-8">
            <div className="flex items-center justify-between mb-6">
              <h1 className="text-2xl font-semibold">组织架构</h1>
              <Button onClick={() => {
                setOrgNewName("");
                setOrgNewParentId(null);
                setOrgDialogOpen("add");
              }}>
                <Plus className="w-4 h-4 mr-1" />
                新增部门
              </Button>
            </div>

            <div className="bg-card rounded-xl border border-border overflow-hidden">
              {/* 树形结构头部 */}
              <div className="px-4 py-3 border-b border-border bg-muted/30">
                <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                  <Network className="w-3.5 h-3.5" />
                  部门架构
                </div>
              </div>

              {/* 树形列表 */}
              <div className="p-2">
                {departmentsLoading ? (
                  <div className="flex items-center justify-center py-16">
                    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                    <span className="ml-2 text-sm text-muted-foreground">加载部门架构...</span>
                  </div>
                ) : departments.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16">
                    <Building2 className="w-12 h-12 text-muted-foreground/40 mb-3" />
                    <p className="text-muted-foreground text-sm">暂无部门</p>
                  </div>
                ) : (
                  departments.map((dept) => renderOrgTree(dept, 0))
                )}
              </div>
            </div>

            {/* 统计信息 */}
            <div className="mt-4 flex items-center gap-4 text-sm text-muted-foreground">
              <span>共 {countOrgNodes(departments)} 个部门</span>
              <span>·</span>
              <span>共 {members.length} 名成员</span>
            </div>
          </div>
        )}

        {activeTab === "groups" && (
          <div className="max-w-4xl p-8">
            <div className="flex items-center justify-between mb-6">
              <h1 className="text-2xl font-semibold">群组管理</h1>
              <div className="flex items-center gap-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="搜索群组"
                    value={groupSearch}
                    onChange={(e) => { setGroupSearch(e.target.value); setGroupPage(1); }}
                    className="h-9 pl-9 w-52"
                  />
                </div>
                <Button onClick={() => { setCreateGroupName(""); setCreateGroupDesc(""); setCreateGroupOpen(true); }}>
                  <Layers className="w-4 h-4 mr-1" />
                  创建群组
                </Button>
              </div>
            </div>
            <div className="bg-card rounded-xl border border-border overflow-hidden">
              {groupsLoading ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                  <span className="ml-2 text-sm text-muted-foreground">加载群组列表...</span>
                </div>
              ) : groups.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16">
                  <Layers className="w-12 h-12 text-muted-foreground/40 mb-3" />
                  <p className="text-muted-foreground text-sm">暂无群组</p>
                </div>
              ) : (
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border bg-muted/30">
                      <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">名称</th>
                      <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">创建人</th>
                      <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">成员数</th>
                      <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">创建时间</th>
                      <th className="text-right text-xs font-medium text-muted-foreground px-4 py-3">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {groups.map((group) => (
                      <tr key={group.id} className="border-b border-border/50 last:border-0 hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                              <Users className="w-4 h-4 text-primary" />
                            </div>
                            <div>
                              <span className="text-sm font-medium">{group.name}</span>
                              {group.description && (
                                <p className="text-xs text-muted-foreground truncate max-w-48">{group.description}</p>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-sm text-muted-foreground">{group.creatorName || "-"}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-sm text-muted-foreground">{group.memberCount}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-sm text-muted-foreground">
                            {group.createdAt ? new Date(group.createdAt).toLocaleString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "-"}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-3">
                            <button
                              onClick={() => openAddGroupMembers(group.id, group.name)}
                              className="text-sm text-primary hover:underline"
                            >
                              添加成员
                            </button>
                            <button
                              onClick={() => {
                                setAddGroupMembersTarget({ id: group.id, name: group.name });
                                setGroupInviteOpen(true);
                              }}
                              className="text-sm text-primary hover:underline"
                            >
                              邀请成员
                            </button>
                            <button
                              onClick={() => {
                                setDisbandTarget({ id: group.id, name: group.name });
                                setDisbandGroupOpen(true);
                              }}
                              className="text-sm text-destructive hover:underline"
                            >
                              解散群组
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {/* 分页 */}
              {!groupsLoading && groupTotal > 0 && (
                <div className="flex items-center justify-between px-4 py-3 border-t border-border">
                  <span className="text-sm text-muted-foreground">
                    共{groupTotal}条记录 第{groupPage}/{groupTotalPages || 1}页
                  </span>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      disabled={groupPage <= 1}
                      onClick={() => setGroupPage((p) => Math.max(1, p - 1))}
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </Button>
                    {Array.from({ length: Math.min(5, groupTotalPages) }, (_, i) => {
                      let pageNum: number;
                      if (groupTotalPages <= 5) {
                        pageNum = i + 1;
                      } else if (groupPage <= 3) {
                        pageNum = i + 1;
                      } else if (groupPage >= groupTotalPages - 2) {
                        pageNum = groupTotalPages - 4 + i;
                      } else {
                        pageNum = groupPage - 2 + i;
                      }
                      return (
                        <Button
                          key={pageNum}
                          variant={pageNum === groupPage ? "default" : "outline"}
                          size="icon"
                          className="h-8 w-8 text-xs"
                          onClick={() => setGroupPage(pageNum)}
                        >
                          {pageNum}
                        </Button>
                      );
                    })}
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      disabled={groupPage >= groupTotalPages}
                      onClick={() => setGroupPage((p) => Math.min(groupTotalPages, p + 1))}
                    >
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === "users" && (
          <div className="p-8">
            <div className="flex items-center justify-between mb-6">
              <h1 className="text-2xl font-semibold">用户管理</h1>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="搜索用户..."
                  value={userSearchQuery}
                  onChange={(e) => setUserSearchQuery(e.target.value)}
                  className="h-9 pl-9 w-52"
                />
              </div>
            </div>

            <div className="bg-card rounded-xl border border-border overflow-hidden">
              {userManageLoading ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                  <span className="ml-2 text-sm text-muted-foreground">加载用户列表...</span>
                </div>
              ) : filteredUserMembers.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16">
                  <UserCog className="w-12 h-12 text-muted-foreground/40 mb-3" />
                  <p className="text-muted-foreground text-sm">
                    {userSearchQuery ? "未找到匹配的用户" : "暂无用户"}
                  </p>
                </div>
              ) : (
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border bg-muted/30">
                      <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">用户</th>
                      <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">部门</th>
                      <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">职位</th>
                      <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">手机</th>
                      <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">角色</th>
                      <th className="text-right text-xs font-medium text-muted-foreground px-4 py-3">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUserMembers.map((member) => (
                      <tr key={member.id} className="border-b border-border/50 last:border-0 hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            <UserAvatar avatarKey={member.avatar} name={member.name} className="w-8 h-8" />
                            <div>
                              <span className="text-sm font-medium">{member.name}</span>
                              {member.nickname && (
                                <span className="text-xs text-muted-foreground ml-1">({member.nickname})</span>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-sm text-muted-foreground">{member.department || "无"}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-sm text-muted-foreground">{member.position || "-"}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-sm text-muted-foreground">{member.phone || "-"}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={cn(
                            "text-xs px-2 py-0.5 rounded-full",
                            member.role === "owner" && "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
                            member.role === "admin" && "bg-primary/10 text-primary",
                            member.role === "member" && "bg-muted text-muted-foreground"
                          )}>
                            {member.role === "owner" ? "所有者" : member.role === "admin" ? "管理员" : "成员"}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          {isAdmin && member.role !== "owner" ? (
                            <div className="flex items-center justify-end gap-2">
                              <select
                                value={member.role}
                                onChange={(e) => handleRoleChange(member, e.target.value as "admin" | "member")}
                                className="text-xs h-7 rounded-md border border-input bg-background px-2 outline-none focus:border-primary"
                              >
                                <option value="member">成员</option>
                                <option value="admin">管理员</option>
                              </select>
                              <button
                                onClick={() => handleRemoveMember(member)}
                                className="text-xs text-red-500 hover:text-red-600 hover:underline inline-flex items-center gap-1"
                              >
                                <Trash2 className="w-3 h-3" />
                                移除
                              </button>
                            </div>
                          ) : member.role === "owner" ? (
                            <span className="text-xs text-muted-foreground">-</span>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {!userManageLoading && filteredUserMembers.length > 0 && (
                <div className="flex items-center justify-between px-4 py-3 border-t border-border">
                  <span className="text-sm text-muted-foreground">
                    共 {members.length} 人
                    {userSearchQuery && `，筛选 ${filteredUserMembers.length} 人`}
                  </span>
                </div>
              )}
            </div>

            {/* 移除成员确认弹窗 */}
            <Dialog open={!!removeMemberTarget} onOpenChange={(o) => !o && setRemoveMemberTarget(null)}>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5 text-red-500" />
                    确认移除成员
                  </DialogTitle>
                  <DialogDescription>
                    确定要将 <strong>{removeMemberTarget?.name}</strong> 从团队中移除吗？
                    该成员将失去所有频道和团队的访问权限。
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter className="gap-2">
                  <Button variant="outline" onClick={() => setRemoveMemberTarget(null)}>
                    取消
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={confirmRemoveMember}
                    disabled={removeMemberSubmitting}
                  >
                    {removeMemberSubmitting ? (
                      <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> 移除中...</>
                    ) : "确认移除"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        )}

        {activeTab === "positions" && (
          <div className="h-full overflow-y-auto p-6">
            <PositionCenter teamId={currentTeam?.id || ""} />
          </div>
        )}

        {activeTab === "analytics" && (
          <div className="max-w-5xl p-8">
            <h1 className="text-2xl font-semibold mb-6">统计与分析</h1>

            {statsLoading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                <span className="ml-2 text-sm text-muted-foreground">加载统计数据...</span>
              </div>
            ) : stats ? (
              <div className="space-y-6">
                {/* 统计卡片 */}
                <div className="grid grid-cols-4 gap-4">
                  <div className="bg-card rounded-xl border border-border p-5">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                        <Users className="w-5 h-5 text-blue-500" />
                      </div>
                      <span className="text-sm text-muted-foreground">总成员</span>
                    </div>
                    <p className="text-3xl font-bold">{stats.totalMembers}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {stats.activeMembers} 人近期活跃
                    </p>
                  </div>
                  <div className="bg-card rounded-xl border border-border p-5">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center">
                        <Hash className="w-5 h-5 text-green-500" />
                      </div>
                      <span className="text-sm text-muted-foreground">频道数</span>
                    </div>
                    <p className="text-3xl font-bold">{stats.totalChannels}</p>
                  </div>
                  <div className="bg-card rounded-xl border border-border p-5">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
                        <MessageSquare className="w-5 h-5 text-amber-500" />
                      </div>
                      <span className="text-sm text-muted-foreground">总消息</span>
                    </div>
                    <p className="text-3xl font-bold">{stats.totalMessages}</p>
                  </div>
                  <div className="bg-card rounded-xl border border-border p-5">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-10 h-10 rounded-lg bg-purple-500/10 flex items-center justify-center">
                        <TrendingUp className="w-5 h-5 text-purple-500" />
                      </div>
                      <span className="text-sm text-muted-foreground">近7天消息</span>
                    </div>
                    <p className="text-3xl font-bold">{stats.messagesLast7Days}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      本周累计 {stats.messagesLast7Days} 条
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {/* 近7天消息趋势 */}
                  <div className="bg-card rounded-xl border border-border p-5">
                    <h3 className="text-sm font-medium mb-4">近7天消息趋势</h3>
                    {stats.dailyMessages.length > 0 ? (
                      <div className="flex items-end gap-1 h-40">
                        {stats.dailyMessages.map((day, i) => {
                          const maxCount = Math.max(...stats.dailyMessages.map(d => d.count), 1);
                          const barHeight = maxCount > 0 ? Math.max((day.count / maxCount) * 130, 2) : 0;
                          return (
                            <div
                              key={i}
                              className="flex-1 flex flex-col items-center group relative"
                            >
                              <div className="flex-1 min-h-0" />
                              <div
                                className="w-full rounded-sm bg-primary/60 hover:bg-primary transition-colors cursor-pointer"
                                style={{ height: `${barHeight}px` }}
                              />
                              <div className="absolute -top-7 left-1/2 -translate-x-1/2 bg-popover text-popover-foreground text-xs px-2 py-1 rounded shadow opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10">
                                {day.date}: {day.count} 条
                              </div>
                              <span className="text-[10px] text-muted-foreground mt-0.5">
                                {day.date.slice(5)}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="flex items-center justify-center h-40 text-sm text-muted-foreground">
                        暂无消息数据
                      </div>
                    )}
                  </div>

                  {/* 热门频道 */}
                  <div className="bg-card rounded-xl border border-border p-5">
                    <h3 className="text-sm font-medium mb-4">消息最多的频道</h3>
                    {stats.topChannels.length > 0 ? (
                      <div className="space-y-3">
                        {stats.topChannels.map((ch, i) => {
                          const maxCount = stats.topChannels[0]?.count || 1;
                          const width = (ch.count / maxCount) * 100;
                          return (
                            <div key={i} className="space-y-1">
                              <div className="flex items-center justify-between text-sm">
                                <span className="text-muted-foreground truncate">{ch.name}</span>
                                <span className="font-medium ml-2">{ch.count}</span>
                              </div>
                              <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                                <div
                                  className="h-full rounded-full bg-primary/60 transition-all"
                                  style={{ width: `${Math.max(width, 5)}%` }}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="flex items-center justify-center h-40 text-sm text-muted-foreground">
                        暂无频道数据
                      </div>
                    )}
                  </div>
                </div>

                {/* 活跃成员 */}
                <div className="bg-card rounded-xl border border-border p-5">
                  <h3 className="text-sm font-medium mb-4">最活跃的成员</h3>
                  {stats.topMembers.length > 0 ? (
                    <div className="grid grid-cols-2 gap-2">
                      {stats.topMembers.map((m, i) => {
                        const maxCount = stats.topMembers[0]?.count || 1;
                        const width = (m.count / maxCount) * 100;
                        return (
                          <div key={i} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors">
                            <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs font-medium text-muted-foreground shrink-0">
                              {m.name.charAt(0)}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">{m.name}</p>
                              <div className="w-full h-1.5 bg-muted rounded-full mt-1 overflow-hidden">
                                <div
                                  className="h-full rounded-full bg-amber-500/60"
                                  style={{ width: `${Math.max(width, 5)}%` }}
                                />
                              </div>
                            </div>
                            <span className="text-sm font-medium text-muted-foreground">{m.count}</span>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
                      暂无消息数据
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="bg-card rounded-xl border border-border p-8 text-center">
                <BarChart3 className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">加载统计数据失败</p>
                <Button variant="outline" className="mt-4" onClick={loadStats}>
                  重新加载
                </Button>
              </div>
            )}
          </div>
        )}

        {activeTab === "ai-assistant" && (
          <AiAssistantSettings teamId={currentTeam?.id || ""} />
        )}
      </main>

      {/* 绑定手机号弹窗 */}
      <Dialog open={dialogOpen === "phone"} onOpenChange={() => setDialogOpen(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>绑定手机号</DialogTitle><DialogDescription className="sr-only">绑定手机号</DialogDescription></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="bindPhone">手机号</Label>
              <Input id="bindPhone" type="tel" placeholder="请输入手机号" value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 11))} className="h-11" maxLength={11} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bindCode">验证码</Label>
              <div className="flex gap-2">
                <Input id="bindCode" type="text" placeholder="请输入验证码" value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} className="h-11 flex-1" maxLength={6} />
                <Button variant="outline" className="h-11 px-4" onClick={handleSendCode} disabled={countdown > 0 || isLoading}>
                  {countdown > 0 ? `${countdown}s` : "获取验证码"}
                </Button>
              </div>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(null)}>取消</Button>
            <Button onClick={handleBindPhone} disabled={isLoading}>
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "确定"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 邮箱弹窗 */}
      <Dialog open={dialogOpen === "email"} onOpenChange={() => setDialogOpen(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>绑定邮箱</DialogTitle><DialogDescription className="sr-only">绑定邮箱</DialogDescription></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="bindEmail">邮箱地址</Label>
              <Input id="bindEmail" type="email" placeholder="请输入邮箱地址" value={email}
                onChange={(e) => setEmail(e.target.value)} className="h-11" />
            </div>
            <div className="flex items-start gap-2 p-3 bg-primary/5 rounded-lg">
              <Info className="w-4 h-4 text-primary mt-0.5 shrink-0" />
              <p className="text-sm text-muted-foreground">绑定邮箱可用于找回密码和接收通知</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(null)}>取消</Button>
            <Button onClick={() => setDialogOpen(null)}>确定</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 密码弹窗 */}
      <Dialog open={dialogOpen === "password"} onOpenChange={() => setDialogOpen(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>设置密码</DialogTitle><DialogDescription className="sr-only">设置密码</DialogDescription></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="newPassword">新密码</Label>
              <Input id="newPassword" type="password" placeholder="请输入新密码（至少6位）" className="h-11" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">确认密码</Label>
              <Input id="confirmPassword" type="password" placeholder="请再次输入新密码" className="h-11" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(null)}>取消</Button>
            <Button onClick={() => setDialogOpen(null)}>确定</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 编辑资料弹窗 */}
      <Dialog open={dialogOpen === "profile"} onOpenChange={(open) => { if (!open) { setDialogOpen(null); setAvatarPreview(null); setAvatarKey(null); } }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>编辑资料</DialogTitle><DialogDescription className="sr-only">编辑资料</DialogDescription></DialogHeader>
          <div className="grid grid-cols-2 gap-6 py-4">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="editName">全名 <span className="text-destructive">*</span></Label>
                <Input id="editName" type="text" placeholder="请输入您的姓名" value={name}
                  onChange={(e) => setName(e.target.value)} className="h-11" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="editNickname">昵称</Label>
                <Input id="editNickname" type="text" placeholder="请输入您的昵称" value={nickname}
                  onChange={(e) => setNickname(e.target.value)} className="h-11" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="editPosition">职位</Label>
                <Input id="editPosition" type="text" placeholder="请输入您的职位" value={position}
                  onChange={(e) => setPosition(e.target.value)} className="h-11" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="editDepartment">部门</Label>
                <SelectComponent value={department} onValueChange={setDepartment}>
                  <SelectTrigger id="editDepartment" className="h-11 w-full">
                    <SelectValue placeholder="请选择部门" />
                  </SelectTrigger>
                  <SelectContent>
                    {flattenOrgNodes(departments).map((node) => (
                      <SelectItem key={node.id} value={node.name}>
                        {"　".repeat(node.depth)}{node.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </SelectComponent>
              </div>
            </div>
            <div className="flex flex-col items-center justify-center">
              <div className="relative group mb-3">
                <UserAvatar avatarKey={user?.avatar} src={avatarPreview} name={user?.name || "U"} className="w-24 h-24" fallbackClassName="text-2xl" />
                <button
                  type="button"
                  onClick={() => profileFileInputRef.current?.click()}
                  disabled={avatarUploading}
                  className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-full opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                >
                  {avatarUploading ? (
                    <Loader2 className="w-6 h-6 text-white animate-spin" />
                  ) : (
                    <Camera className="w-6 h-6 text-white" />
                  )}
                </button>
              </div>
              <input
                ref={profileFileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/gif,image/webp"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file && user?.id) {
                    handleAvatarUpload(file, user.id, setAvatarPreview, setAvatarKey);
                  }
                  e.target.value = "";
                }}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => profileFileInputRef.current?.click()}
                disabled={avatarUploading}
              >
                {avatarUploading ? (
                  <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                ) : (
                  <Upload className="w-4 h-4 mr-1" />
                )}
                {avatarUploading ? "上传中..." : "更换头像"}
              </Button>
              {avatarPreview && (
                <button
                  onClick={() => { setAvatarPreview(null); setAvatarKey(null); }}
                  className="mt-2 text-xs text-muted-foreground hover:text-destructive transition-colors flex items-center gap-1"
                >
                  <X className="w-3 h-3" /> 移除
                </button>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDialogOpen(null); setAvatarPreview(null); setAvatarKey(null); }}>取消</Button>
            <Button onClick={handleSaveProfile} disabled={isLoading || avatarUploading}>
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "保存"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 邀请弹窗 */}
      <InviteModal
        open={inviteModalOpen}
        onOpenChange={(open) => {
          setInviteModalOpen(open);
          // 关闭弹窗时刷新成员列表（新成员可能已加入）
          if (!open) {
            fetchMembers();
          }
        }}
        teamId={currentTeam?.id || ""}
        teamName={currentTeam?.name || ""}
      />

      {/* 查看成员详情弹窗 */}
      <Dialog open={!!viewMember} onOpenChange={(open) => { if (!open) setViewMember(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>成员详情</DialogTitle>
            <DialogDescription className="sr-only">查看成员详情信息</DialogDescription>
          </DialogHeader>
          {viewMember && (
            <div className="py-4">
              <div className="flex items-center gap-4 mb-6">
                <MemberAvatar avatar={viewMember.avatar} name={viewMember.name} className="w-16 h-16" />
                <div>
                  <h3 className="text-lg font-semibold">{viewMember.name}</h3>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={cn(
                      "text-xs px-2 py-0.5 rounded-full",
                      viewMember.role === "owner"
                        ? "bg-primary/10 text-primary font-medium"
                        : "bg-muted text-muted-foreground"
                    )}>
                      {viewMember.role === "owner" ? "管理员" : "成员"}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <span className={cn(
                        "w-1.5 h-1.5 rounded-full",
                        viewMember.status === "正常" ? "bg-green-500" : "bg-red-500"
                      )} />
                      <span className={cn(
                        "text-xs",
                        viewMember.status === "正常" ? "text-green-600" : "text-red-500"
                      )}>{viewMember.status}</span>
                    </div>
                  </div>
                </div>
              </div>
              <div className="space-y-3">
                <div className="flex items-center justify-between py-2 border-b border-border/50">
                  <span className="text-sm text-muted-foreground">部门</span>
                  <span className="text-sm">{viewMember.department || "无"}</span>
                </div>
                <div className="flex items-center justify-between py-2 border-b border-border/50">
                  <span className="text-sm text-muted-foreground">职位</span>
                  <span className="text-sm">{viewMember.position || "-"}</span>
                </div>
                <div className="flex items-center justify-between py-2 border-b border-border/50">
                  <span className="text-sm text-muted-foreground">手机号</span>
                  <span className="text-sm">{viewMember.phone || "-"}</span>
                </div>
                <div className="flex items-center justify-between py-2 border-b border-border/50">
                  <span className="text-sm text-muted-foreground">邮箱</span>
                  <span className="text-sm">{viewMember.email || "未填写"}</span>
                </div>
                <div className="flex items-center justify-between py-2">
                  <span className="text-sm text-muted-foreground">加入时间</span>
                  <span className="text-sm">{viewMember.joinedAt ? new Date(viewMember.joinedAt).toLocaleDateString("zh-CN") : "-"}</span>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewMember(null)}>关闭</Button>
            <Button onClick={() => {
              if (viewMember) {
                setEditMember(viewMember);
                setViewMember(null);
              }
            }}>编辑</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 编辑资料弹窗 */}
      <Dialog open={!!editMember} onOpenChange={(open) => { if (!open) { setEditMember(null); setEditMemberAvatarPreview(null); setEditMemberAvatarKey(null); } }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>编辑资料</DialogTitle>
            <DialogDescription className="sr-only">编辑成员资料信息</DialogDescription>
          </DialogHeader>
          {editMember && (
            <div className="py-4">
              <div className="grid grid-cols-[1fr_auto] gap-6">
                {/* 左侧表单 */}
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="editFullName">全名 <span className="text-destructive">*</span></Label>
                    <Input
                      id="editFullName"
                      type="text"
                      placeholder="请输入全名"
                      value={editMemberForm.name}
                      onChange={(e) => setEditMemberForm((prev) => ({ ...prev, name: e.target.value }))}
                      className="h-11"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="editMemberNickname">昵称</Label>
                    <Input
                      id="editMemberNickname"
                      type="text"
                      placeholder="请输入昵称"
                      value={editMemberForm.nickname}
                      onChange={(e) => setEditMemberForm((prev) => ({ ...prev, nickname: e.target.value }))}
                      className="h-11"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="editDept">部门</Label>
                    <SelectComponent
                      value={editMemberForm.department || "__none__"}
                      onValueChange={(v) => setEditMemberForm((prev) => ({ ...prev, department: v === "__none__" ? "" : v }))}
                    >
                      <SelectTrigger id="editDept" className="h-11 w-full">
                        <SelectValue placeholder="请选择部门" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">无</SelectItem>
                        {flattenOrgNodes(departments).map((node) => (
                          <SelectItem key={node.id} value={node.name}>
                            {"　".repeat(node.depth)}{node.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </SelectComponent>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="editPosition">职位</Label>
                    <Input
                      id="editPosition"
                      type="text"
                      placeholder="请输入职位"
                      value={editMemberForm.position}
                      onChange={(e) => setEditMemberForm((prev) => ({ ...prev, position: e.target.value }))}
                      className="h-11"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="editEmail">邮箱</Label>
                    <Input
                      id="editEmail"
                      type="email"
                      placeholder="邮箱地址"
                      value={editMemberForm.email}
                      onChange={(e) => setEditMemberForm((prev) => ({ ...prev, email: e.target.value }))}
                      className="h-11"
                    />
                  </div>
                </div>

                {/* 右侧头像 */}
                <div className="flex flex-col items-center pt-2">
                  <div className="relative group mb-3">
                    <EditMemberAvatar />
                    <button
                      type="button"
                      onClick={() => memberFileInputRef.current?.click()}
                      disabled={avatarUploading}
                      className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-full opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                    >
                      {avatarUploading ? (
                        <Loader2 className="w-6 h-6 text-white animate-spin" />
                      ) : (
                        <Camera className="w-6 h-6 text-white" />
                      )}
                    </button>
                  </div>
                  <input
                    ref={memberFileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/gif,image/webp"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file && editMember.id) {
                        handleAvatarUpload(file, editMember.id, setEditMemberAvatarPreview, setEditMemberAvatarKey);
                      }
                      e.target.value = "";
                    }}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => memberFileInputRef.current?.click()}
                    disabled={avatarUploading}
                  >
                    {avatarUploading ? (
                      <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                    ) : (
                      <Upload className="w-4 h-4 mr-1" />
                    )}
                    {avatarUploading ? "上传中..." : "上传头像"}
                  </Button>
                  {editMemberAvatarPreview && (
                    <button
                      onClick={() => { setEditMemberAvatarPreview(null); setEditMemberAvatarKey(null); }}
                      className="mt-2 text-xs text-muted-foreground hover:text-destructive transition-colors flex items-center gap-1"
                    >
                      <X className="w-3 h-3" /> 移除
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditMember(null)}>取消</Button>
            <Button
              onClick={async () => {
                if (!editMember || !editMemberForm.name.trim()) return;
                try {
                  const updatePayload: Record<string, unknown> = {
                    id: editMember.id,
                    name: editMemberForm.name.trim(),
                    nickname: editMemberForm.nickname.trim() || null,
                    department: editMemberForm.department || null,
                    position: editMemberForm.position.trim() || null,
                    email: editMemberForm.email.trim() || null,
                  };
                  if (editMemberAvatarKey) {
                    updatePayload.avatar = editMemberAvatarKey;
                  }
                  const res = await fetch("/api/users", {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(updatePayload),
                  });
                  const data = await res.json();
                  if (data.success) {
                    setEditMember(null);
                    setEditMemberAvatarPreview(null);
                    setEditMemberAvatarKey(null);
                    fetchMembers();
                    // 如果编辑的是当前用户，同步更新 auth 状态
                    if (editMember.id === user?.id) {
                      const profileUpdate: Record<string, string | undefined> = {
                        name: editMemberForm.name.trim(),
                        nickname: editMemberForm.nickname.trim() || undefined,
                        department: editMemberForm.department || undefined,
                        position: editMemberForm.position.trim() || undefined,
                        email: editMemberForm.email.trim() || undefined,
                      };
                      if (editMemberAvatarKey) {
                        profileUpdate.avatar = editMemberAvatarKey;
                      }
                      await updateProfile(profileUpdate);
                    }
                  }
                } catch (err) {
                  console.error("更新成员信息失败:", err);
                }
              }}
              disabled={!editMemberForm.name.trim() || isLoading}
            >
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "保存更改"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 新增部门弹窗 */}
      <Dialog open={orgDialogOpen === "add"} onOpenChange={(open) => { if (!open) setOrgDialogOpen(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>新增部门</DialogTitle>
            <DialogDescription className="sr-only">新增部门到组织架构</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="orgNewName">部门名称 <span className="text-destructive">*</span></Label>
              <Input
                id="orgNewName"
                type="text"
                placeholder="请输入部门名称"
                value={orgNewName}
                onChange={(e) => setOrgNewName(e.target.value)}
                className="h-11"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="orgNewParent">上级部门</Label>
              <SelectComponent value={orgNewParentId || "__none__"} onValueChange={(v) => setOrgNewParentId(v === "__none__" ? null : v)}>
                <SelectTrigger id="orgNewParent" className="h-11 w-full">
                  <SelectValue placeholder="无（顶级部门）" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">无（顶级部门）</SelectItem>
                  {flattenOrgNodes(departments).map((node) => (
                    <SelectItem key={node.id} value={node.id}>
                      {"　".repeat(node.depth)}{node.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </SelectComponent>
            </div>
            <div className="flex items-start gap-2 p-3 bg-primary/5 rounded-lg">
              <Info className="w-4 h-4 text-primary mt-0.5 shrink-0" />
              <p className="text-sm text-muted-foreground">新增的部门将添加到所选上级部门下</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOrgDialogOpen(null)}>取消</Button>
            <Button
              onClick={async () => {
                if (!orgNewName.trim() || !currentTeam?.id) return;
                try {
                  const res = await fetch("/api/teams/departments", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      teamId: currentTeam.id,
                      name: orgNewName.trim(),
                      parentId: orgNewParentId,
                    }),
                  });
                  const data = await res.json();
                  if (data.success) {
                    setOrgDialogOpen(null);
                    fetchDepartments();
                  }
                } catch (err) {
                  console.error("创建部门失败:", err);
                }
              }}
              disabled={!orgNewName.trim()}
            >
              确认新增
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 编辑部门弹窗 */}
      <Dialog open={orgDialogOpen === "edit"} onOpenChange={(open) => { if (!open) setOrgDialogOpen(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>编辑部门</DialogTitle>
            <DialogDescription className="sr-only">编辑部门名称</DialogDescription>
          </DialogHeader>
          {orgEditTarget && (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="orgEditName">部门名称 <span className="text-destructive">*</span></Label>
                <Input
                  id="orgEditName"
                  type="text"
                  placeholder="请输入部门名称"
                  value={orgNewName}
                  onChange={(e) => setOrgNewName(e.target.value)}
                  className="h-11"
                />
              </div>
              <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg">
                <Building2 className="w-4 h-4 text-muted-foreground shrink-0" />
                <p className="text-sm text-muted-foreground">
                  当前位置：{orgEditTarget.name}
                  {getDeptMemberCount(orgEditTarget.name) > 0 && ` (${getDeptMemberCount(orgEditTarget.name)}人)`}
                </p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOrgDialogOpen(null)}>取消</Button>
            <Button
              onClick={async () => {
                if (!orgNewName.trim() || !orgEditTarget) return;
                try {
                  const res = await fetch("/api/teams/departments", {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      id: orgEditTarget.id,
                      name: orgNewName.trim(),
                    }),
                  });
                  const data = await res.json();
                  if (data.success) {
                    setOrgDialogOpen(null);
                    fetchDepartments();
                  }
                } catch (err) {
                  console.error("更新部门失败:", err);
                }
              }}
              disabled={!orgNewName.trim()}
            >
              保存更改
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 删除部门弹窗 */}
      <Dialog open={orgDialogOpen === "delete"} onOpenChange={(open) => { if (!open) setOrgDialogOpen(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>删除部门</DialogTitle>
            <DialogDescription className="sr-only">确认删除部门</DialogDescription>
          </DialogHeader>
          {orgEditTarget && (
            <div className="py-4">
              <div className="flex items-center gap-3 p-4 bg-destructive/5 rounded-lg border border-destructive/20">
                <div className="w-10 h-10 rounded-lg bg-destructive/10 flex items-center justify-center shrink-0">
                  <Trash2 className="w-5 h-5 text-destructive" />
                </div>
                <div>
                  <p className="font-medium text-sm">
                    确定删除「{orgEditTarget.name}」部门吗？
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {orgEditTarget.children && orgEditTarget.children.length > 0
                      ? `该部门下还有 ${orgEditTarget.children.length} 个子部门，删除后将一并移除。`
                      : getDeptMemberCount(orgEditTarget.name) > 0
                        ? `该部门下还有 ${getDeptMemberCount(orgEditTarget.name)} 名成员，删除后成员将变为未分配部门。`
                        : "删除后无法恢复，请谨慎操作。"}
                  </p>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOrgDialogOpen(null)}>取消</Button>
            <Button
              variant="destructive"
              onClick={async () => {
                if (!orgEditTarget) return;
                try {
                  const res = await fetch(`/api/teams/departments?id=${orgEditTarget.id}`, {
                    method: "DELETE",
                  });
                  const data = await res.json();
                  if (data.success) {
                    setOrgDialogOpen(null);
                    fetchDepartments();
                  }
                } catch (err) {
                  console.error("删除部门失败:", err);
                }
              }}
            >
              确认删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 创建群组弹窗 */}
      <Dialog open={createGroupOpen} onOpenChange={(open) => { if (!open) setCreateGroupOpen(false); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>创建用户组</DialogTitle>
            <DialogDescription className="sr-only">创建用户组</DialogDescription>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            创建用户组后，你可以直接@用户组，组内的成员都将收到通知。
          </p>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="settingsGroupName">名称 <span className="text-destructive">*</span></Label>
              <Input
                id="settingsGroupName"
                type="text"
                placeholder="如：部门、小组、团队等"
                value={createGroupName}
                onChange={(e) => setCreateGroupName(e.target.value)}
                className="h-11"
              />
              <p className="text-xs text-muted-foreground">
                名称的用法：@名称，用于成员组消息通知
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="settingsGroupDesc">介绍</Label>
              <Input
                id="settingsGroupDesc"
                type="text"
                placeholder="说明群组主要讨论的内容"
                value={createGroupDesc}
                onChange={(e) => setCreateGroupDesc(e.target.value)}
                className="h-11"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateGroupOpen(false)}>取消</Button>
            <Button
              onClick={async () => {
                if (!createGroupName.trim() || !currentTeam?.id) return;
                try {
                  const res = await fetch("/api/teams/groups", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      teamId: currentTeam.id,
                      name: createGroupName.trim(),
                      description: createGroupDesc.trim(),
                      creatorId: user?.id,
                    }),
                  });
                  const data = await res.json();
                  if (data.success) {
                    setCreateGroupOpen(false);
                    setCreateGroupName("");
                    setCreateGroupDesc("");
                    fetchGroups();
                  }
                } catch (err) {
                  console.error("创建群组失败:", err);
                }
              }}
              disabled={!createGroupName.trim()}
            >
              创建
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 解散群组确认弹窗 */}
      <Dialog open={disbandGroupOpen} onOpenChange={(open) => { if (!open) setDisbandGroupOpen(false); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              注销群组
            </DialogTitle>
            <DialogDescription className="sr-only">确认注销群组</DialogDescription>
          </DialogHeader>
          <p className="text-sm text-muted-foreground py-2">
            如果你注销此用户组，你将无法使用@群组 通知群组成员。
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDisbandGroupOpen(false)}>取消</Button>
            <Button
              variant="destructive"
              onClick={async () => {
                if (!disbandTarget) return;
                try {
                  const res = await fetch(`/api/teams/groups?id=${disbandTarget.id}`, { method: "DELETE" });
                  const data = await res.json();
                  if (data.success) {
                    setDisbandGroupOpen(false);
                    setDisbandTarget(null);
                    fetchGroups();
                  }
                } catch (err) {
                  console.error("解散群组失败:", err);
                }
              }}
            >
              移除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ====== 群组添加成员弹窗 ====== */}
      <Dialog open={addGroupMembersOpen} onOpenChange={(open) => { if (!open) setAddGroupMembersOpen(false); }}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>添加成员到「{addGroupMembersTarget?.name}」</DialogTitle>
            <DialogDescription className="sr-only">添加成员到群组</DialogDescription>
          </DialogHeader>
          <div className="flex gap-4 py-2" style={{ minHeight: 380 }}>
            {/* 左侧：可选联系人 */}
            <div className="flex-1 border border-border rounded-lg flex flex-col">
              <div className="p-3 border-b border-border">
                <div className="relative mb-2">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                  <Input
                    type="search"
                    placeholder="按名字、职位或团队搜索"
                    value={addGroupMembersSearch}
                    onChange={(e) => setAddGroupMembersSearch(e.target.value)}
                    className="pl-8 h-8 text-xs"
                  />
                </div>
                <div className="flex gap-1 bg-muted/50 rounded-md p-0.5">
                  <button
                    className={cn("flex-1 text-xs py-1 rounded-sm transition-colors", addGroupMembersTab === "members" ? "bg-background shadow-sm font-medium" : "text-muted-foreground hover:text-foreground")}
                    onClick={() => setAddGroupMembersTab("members")}
                  >
                    联系人
                  </button>
                  <button
                    className={cn("flex-1 text-xs py-1 rounded-sm transition-colors", addGroupMembersTab === "groups" ? "bg-background shadow-sm font-medium" : "text-muted-foreground hover:text-foreground")}
                    onClick={() => setAddGroupMembersTab("groups")}
                  >
                    按群组选择
                  </button>
                </div>
              </div>

              {addGroupMembersTab === "members" ? (
                <>
                  <div className="px-3 py-1.5 border-b border-border">
                    <span className="text-xs font-medium text-muted-foreground">
                      全部联系人（{members.filter((m) => !currentGroupMemberIds.has(m.id)).length}人可选）
                    </span>
                  </div>
                  <ScrollArea className="flex-1">
                    <div className="p-1">
                      {addGroupMembersSearch ? (
                        members
                          .filter((m) => !currentGroupMemberIds.has(m.id))
                          .filter((m) =>
                            m.name.includes(addGroupMembersSearch) ||
                            m.position.includes(addGroupMembersSearch) ||
                            m.department.includes(addGroupMembersSearch)
                          )
                          .map((member) => (
                            <label
                              key={member.id}
                              className="flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-muted/50 cursor-pointer"
                            >
                              <Checkbox
                                checked={addGroupMembersSelected.includes(member.id)}
                                onCheckedChange={(checked) => {
                                  if (checked) {
                                    setAddGroupMembersSelected((prev) => [...prev, member.id]);
                                  } else {
                                    setAddGroupMembersSelected((prev) => prev.filter((id) => id !== member.id));
                                  }
                                }}
                              />
                              <UserAvatar avatarKey={member.avatar} name={member.name || "?"} className="w-7 h-7" fallbackClassName="text-xs" />
                              <div className="flex-1 min-w-0">
                                <span className="text-sm font-medium">{member.name}</span>
                                <p className="text-xs text-muted-foreground truncate">
                                  {member.department}{member.position ? `-${member.position}` : ""}
                                </p>
                              </div>
                            </label>
                          ))
                      ) : (
                        Object.entries(membersByDept).map(([dept, deptMembers]) => {
                          const availableMembers = deptMembers.filter((m) => !currentGroupMemberIds.has(m.id));
                          if (availableMembers.length === 0) return null;
                          const isExpanded = addGroupMembersExpandedDepts.has(dept);
                          const allSelected = availableMembers.every((m) => addGroupMembersSelected.includes(m.id));
                          return (
                            <div key={dept}>
                              <div className="flex items-center gap-2 px-2 py-1.5 hover:bg-muted/30 rounded-lg">
                                <button
                                  onClick={() => toggleDeptExpand(dept)}
                                  className="w-4 h-4 flex items-center justify-center shrink-0"
                                >
                                  {isExpanded ? (
                                    <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                                  ) : (
                                    <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
                                  )}
                                </button>
                                <Checkbox
                                  checked={allSelected && availableMembers.length > 0}
                                  onCheckedChange={(checked) => {
                                    if (checked) {
                                      setAddGroupMembersSelected((prev) => {
                                        const newSet = new Set(prev);
                                        availableMembers.forEach((m) => newSet.add(m.id));
                                        return Array.from(newSet);
                                      });
                                    } else {
                                      setAddGroupMembersSelected((prev) => prev.filter((id) => !availableMembers.some((m) => m.id === id)));
                                    }
                                  }}
                                />
                                <span className="text-xs font-medium text-muted-foreground">
                                  {dept}（{availableMembers.length}人）
                                </span>
                              </div>
                              {isExpanded && availableMembers.map((member) => (
                                <label
                                  key={member.id}
                                  className="flex items-center gap-2.5 pl-8 pr-2 py-2 rounded-lg hover:bg-muted/50 cursor-pointer"
                                >
                                  <Checkbox
                                    checked={addGroupMembersSelected.includes(member.id)}
                                    onCheckedChange={(checked) => {
                                      if (checked) {
                                        setAddGroupMembersSelected((prev) => [...prev, member.id]);
                                      } else {
                                        setAddGroupMembersSelected((prev) => prev.filter((id) => id !== member.id));
                                      }
                                    }}
                                  />
                                  <UserAvatar avatarKey={member.avatar} name={member.name || "?"} className="w-7 h-7" fallbackClassName="text-xs" />
                                  <div className="flex-1 min-w-0">
                                    <span className="text-sm font-medium">{member.name}</span>
                                    <p className="text-xs text-muted-foreground truncate">{member.position || "暂无职位"}</p>
                                  </div>
                                </label>
                              ))}
                            </div>
                          );
                        })
                      )}
                    </div>
                  </ScrollArea>
                </>
              ) : (
                <>
                  <div className="px-3 py-1.5 border-b border-border">
                    <span className="text-xs font-medium text-muted-foreground">
                      选择群组将添加该群组中未在本群组的成员
                    </span>
                  </div>
                  <ScrollArea className="flex-1">
                    <div className="p-1">
                      {groups
                        .filter((g) => g.id !== addGroupMembersTarget?.id)
                        .map((group) => (
                          <label
                            key={group.id}
                            className="flex items-center gap-2.5 px-2 py-2.5 rounded-lg hover:bg-muted/50 cursor-pointer"
                          >
                            <Checkbox
                              checked={addGroupMembersSelected.includes(`__group__${group.id}`)}
                              onCheckedChange={async (checked) => {
                                const groupKey = `__group__${group.id}`;
                                if (checked) {
                                  const memberIds = await getGroupMemberIds(group.id);
                                  const nonDuplicateIds = memberIds.filter((id: string) => !currentGroupMemberIds.has(id));
                                  setAddGroupMembersSelected((prev) => {
                                    const withoutPrevGroupMembers = prev.filter((id) => !id.startsWith(`__group__${group.id}`));
                                    return [...withoutPrevGroupMembers, groupKey, ...nonDuplicateIds];
                                  });
                                } else {
                                  const memberIds = await getGroupMemberIds(group.id);
                                  const nonDuplicateIds = memberIds.filter((id: string) => !currentGroupMemberIds.has(id));
                                  setAddGroupMembersSelected((prev) => prev.filter((id) => id !== groupKey && !nonDuplicateIds.includes(id)));
                                }
                              }}
                            />
                            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                              <Users className="w-4 h-4 text-primary" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <span className="text-sm font-medium">{group.name}</span>
                              <p className="text-xs text-muted-foreground truncate">
                                {group.memberCount}个成员{group.description ? ` · ${group.description}` : ""}
                              </p>
                            </div>
                          </label>
                        ))}
                    </div>
                  </ScrollArea>
                </>
              )}
            </div>

            {/* 右侧：已选 */}
            <div className="flex-1 border border-border rounded-lg flex flex-col">
              <div className="p-3 border-b border-border flex items-center justify-between">
                <span className="text-xs font-medium">
                  已选：{addGroupMembersSelected.filter((id) => !id.startsWith("__group__")).length}人
                  {currentGroupMembers.length > 0 && (
                    <span className="text-muted-foreground font-normal ml-1">（已有{currentGroupMembers.length}人）</span>
                  )}
                </span>
                {addGroupMembersSelected.length > 0 && (
                  <button
                    onClick={() => setAddGroupMembersSelected([])}
                    className="text-xs text-primary hover:underline"
                  >
                    全部清除
                  </button>
                )}
              </div>
              <ScrollArea className="flex-1">
                <div className="p-1">
                  {/* 已在群组中的成员（灰色，不可操作） */}
                  {currentGroupMembers.length > 0 && (
                    <>
                      <div className="px-2 py-1.5">
                        <span className="text-xs text-muted-foreground">已加入</span>
                      </div>
                      {currentGroupMembers.map((member) => (
                        <div
                          key={`existing-${member.id}`}
                          className="flex items-center gap-2.5 px-2 py-2 rounded-lg bg-muted/30"
                        >
                          <UserAvatar avatarKey={member.avatar} name={member.name || "?"} className="w-7 h-7" fallbackClassName="text-xs" />
                          <div className="flex-1 min-w-0">
                            <span className="text-sm font-medium text-muted-foreground">{member.name}</span>
                            <p className="text-xs text-muted-foreground/60 truncate">
                              {member.department}{member.position ? `-${member.position}` : ""}
                            </p>
                          </div>
                          <span className="text-xs text-muted-foreground/60 shrink-0">已加入</span>
                        </div>
                      ))}
                    </>
                  )}
                  {/* 新选中的群组标签 */}
                  {addGroupMembersSelected.filter((id) => id.startsWith("__group__")).length > 0 && (
                    <div className="px-2 pt-2 pb-1.5 border-t border-border/50">
                      <span className="text-xs text-muted-foreground">新添加</span>
                    </div>
                  )}
                  {addGroupMembersSelected
                    .filter((id) => id.startsWith("__group__"))
                    .map((groupKey) => {
                      const groupId = groupKey.replace("__group__", "");
                      const group = groups.find((g) => g.id === groupId);
                      if (!group) return null;
                      return (
                        <div
                          key={groupKey}
                          className="flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-muted/50"
                        >
                          <div className="w-6 h-6 rounded bg-primary/10 flex items-center justify-center shrink-0">
                            <Users className="w-3 h-3 text-primary" />
                          </div>
                          <span className="text-sm font-medium flex-1 text-primary">{group.name}（整组）</span>
                          <button
                            onClick={async () => {
                              const memberIds = await getGroupMemberIds(groupId);
                              const nonDuplicateIds = memberIds.filter((id: string) => !currentGroupMemberIds.has(id));
                              setAddGroupMembersSelected((prev) => prev.filter((id) => id !== groupKey && !nonDuplicateIds.includes(id)));
                            }}
                            className="w-5 h-5 flex items-center justify-center rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      );
                    })}
                  {/* 新选中的个人成员 */}
                  {(currentGroupMembers.length === 0 && addGroupMembersSelected.filter((id) => id.startsWith("__group__")).length === 0) && addGroupMembersSelected.filter((id) => !id.startsWith("__group__")).length > 0 && (
                    <div className="px-2 py-1.5">
                      <span className="text-xs text-muted-foreground">新添加</span>
                    </div>
                  )}
                  {(currentGroupMembers.length > 0 || addGroupMembersSelected.filter((id) => id.startsWith("__group__")).length > 0) && addGroupMembersSelected.filter((id) => !id.startsWith("__group__")).length > 0 && (
                    <div className="px-2 pt-1 pb-1.5 border-t border-border/50">
                      <span className="text-xs text-muted-foreground">新添加</span>
                    </div>
                  )}
                  {addGroupMembersSelected
                    .filter((id) => !id.startsWith("__group__"))
                    .map((memberId) => {
                      const member = members.find((m) => m.id === memberId);
                      if (!member) return null;
                      return (
                        <div
                          key={memberId}
                          className="flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-muted/50"
                        >
                          <UserAvatar avatarKey={member.avatar} name={member.name || "?"} className="w-7 h-7" fallbackClassName="text-xs" />
                          <span className="text-sm font-medium flex-1">{member.name}</span>
                          <button
                            onClick={() => setAddGroupMembersSelected((prev) => prev.filter((id) => id !== memberId))}
                            className="w-5 h-5 flex items-center justify-center rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      );
                    })}
                </div>
              </ScrollArea>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddGroupMembersOpen(false)}>取消</Button>
            <Button
              onClick={handleAddGroupMembers}
              disabled={addGroupMembersSelected.filter((id) => !id.startsWith("__group__")).length === 0}
            >
              <Send className="w-4 h-4 mr-1" />
              添加（{addGroupMembersSelected.filter((id) => !id.startsWith("__group__")).length}人）
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ====== 群组邀请成员弹窗 ====== */}
      <InviteModal
        open={groupInviteOpen}
        onOpenChange={(open) => {
          setGroupInviteOpen(open);
          if (!open) {
            fetchMembers();
          }
        }}
        teamId={currentTeam?.id || ""}
        teamName={currentTeam?.name || ""}
      />
    </div>
  );
}

// ==================== 频道AI助手配置组件 ====================
function AiAssistantSettings({ teamId }: { teamId: string }) {
  const [enabled, setEnabled] = useState(true);
  const [name, setName] = useState("频道AI助手");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [greeting, setGreeting] = useState("");
  const [userGuidance, setUserGuidance] = useState("");
  const [model, setModel] = useState("doubao-seed-2-0-pro-260215");
  const [temperature, setTemperature] = useState(0.7);
  const [maxTokens, setMaxTokens] = useState(2000);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // 加载配置
  useEffect(() => {
    if (!teamId) return;
    setLoading(true);
    fetch(`/api/channels/ai-assistant/config?teamId=${teamId}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.config) {
          const c = data.config;
          setEnabled(c.enabled ?? true);
          if (c.name) setName(c.name);
          if (c.systemPrompt) setSystemPrompt(c.systemPrompt);
          if (c.greeting) setGreeting(c.greeting);
          if (c.userGuidance) setUserGuidance(c.userGuidance);
          if (c.modelConfig) {
            const mc = c.modelConfig;
            if (mc.model) setModel(mc.model);
            if (mc.temperature !== undefined) setTemperature(mc.temperature);
            if (mc.maxTokens) setMaxTokens(mc.maxTokens);
          }
        }
      })
      .catch((err) => console.error("加载AI助手配置失败:", err))
      .finally(() => setLoading(false));
  }, [teamId]);

  // 保存配置
  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/channels/ai-assistant/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teamId,
          enabled,
          name,
          systemPrompt,
          greeting,
          userGuidance,
          modelConfig: { model, temperature, maxTokens },
        }),
      });
      const data = await res.json();
      if (data.success) {
        setMessage({ type: "success", text: "配置已保存" });
      } else {
        setMessage({ type: "error", text: data.error || "保存失败" });
      }
    } catch {
      setMessage({ type: "error", text: "网络错误" });
    } finally {
      setSaving(false);
      setTimeout(() => setMessage(null), 3000);
    }
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="max-w-3xl">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Bot className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">频道AI助手</h1>
            <p className="text-sm text-muted-foreground">配置全局频道AI助手，所有频道共享此配置</p>
          </div>
        </div>

        {/* 启用开关 */}
        <div className="bg-card rounded-xl border border-border p-5 mb-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-medium">启用频道AI助手</h3>
              <p className="text-sm text-muted-foreground mt-1">开启后，用户在频道中 @频道AI助手 即可获得AI回复</p>
            </div>
            <Checkbox checked={enabled} onCheckedChange={(v) => setEnabled(v as boolean)} />
          </div>
        </div>

        {/* 基本配置 */}
        <div className="bg-card rounded-xl border border-border p-5 mb-4 space-y-4">
          <h3 className="font-medium">基本配置</h3>
          <div className="space-y-2">
            <Label>助手名称</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="频道AI助手" />
          </div>
          <div className="space-y-2">
            <Label>开场白</Label>
            <Input value={greeting} onChange={(e) => setGreeting(e.target.value)} placeholder="你好！我是频道AI助手，有什么可以帮助你的？" />
          </div>
          <div className="space-y-2">
            <Label>输入框引导语</Label>
            <Input value={userGuidance} onChange={(e) => setUserGuidance(e.target.value)} placeholder="请输入你的需求，例如：帮我总结一下今天的讨论..." />
          </div>
        </div>

        {/* 模型配置 */}
        <div className="bg-card rounded-xl border border-border p-5 mb-4 space-y-4">
          <h3 className="font-medium">模型配置</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>模型</Label>
              <SelectComponent value={model} onValueChange={setModel}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="选择模型" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="doubao-seed-2-0-pro-260215">Doubao Seed 2.0 Pro</SelectItem>
                  <SelectItem value="doubao-seed-2-0-lite-260215">Doubao Seed 2.0 Lite</SelectItem>
                  <SelectItem value="doubao-seed-2-0-mini-260215">Doubao Seed 2.0 Mini</SelectItem>
                  <SelectItem value="kimi-k2-5-260127">Kimi K2.5</SelectItem>
                  <SelectItem value="qwen-3-5-plus-260215">Qwen 3.5 Plus</SelectItem>
                  <SelectItem value="minimax-m2-5-260212">MiniMax M2.5</SelectItem>
                </SelectContent>
              </SelectComponent>
            </div>
            <div className="space-y-2">
              <Label>Max Tokens</Label>
              <Input type="number" value={maxTokens} onChange={(e) => setMaxTokens(Number(e.target.value))} min={256} max={8192} />
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>温度 ({temperature.toFixed(1)})</Label>
              <span className="text-xs text-muted-foreground">
                {temperature < 0.3 ? "精确" : temperature < 0.7 ? "平衡" : "创意"}
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={temperature}
              onChange={(e) => setTemperature(Number(e.target.value))}
              className="w-full"
            />
          </div>
        </div>

        {/* System Prompt */}
        <div className="bg-card rounded-xl border border-border p-5 mb-4 space-y-4">
          <h3 className="font-medium">System Prompt</h3>
          <p className="text-xs text-muted-foreground">定义频道AI助手的角色定位、行为规则和回复风格</p>
          <textarea
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            rows={15}
            className="w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-sm font-mono placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring"
            placeholder="你是一个专业的频道AI助手，负责帮助团队成员解答问题、总结讨论、提取待办事项..."
          />
        </div>

        {/* 保存按钮 */}
        <div className="flex items-center gap-3 pb-8">
          <Button onClick={handleSave} disabled={saving} size="lg">
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
            保存配置
          </Button>
          {message && (
            <span className={cn("text-sm", message.type === "success" ? "text-green-600" : "text-destructive")}>
              {message.text}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
