"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { UserAvatar } from "@/components/shared/user-avatar";
import { Search, Mail, Phone, UserPlus, Users, Plus, X, AlertTriangle, Layers, ChevronDown, ChevronRight, Link2, Send, Bot, MessageSquare, Target, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { InviteModal } from "@/components/teams/invite-modal";

// ====== 类型定义 ======
interface Department {
  id: string;
  name: string;
  members: Member[];
}

interface Member {
  id: string;
  name: string;
  avatar?: string;
  position: string;
  department: string;
  phone?: string;
  email?: string;
  status?: "online" | "offline";
  type?: "human" | "agent";
  // 智能体扩展字段
  description?: string;
  goal?: string;
  skillNames?: string[];
  ragDatasetNames?: string[];
  mcpServiceNames?: string[];
  rules?: string[];
}

interface GroupItem {
  id: string;
  name: string;
  description: string;
  creatorId: string;
  creatorName: string;
  memberCount: number;
  isActive: boolean;
  createdAt: string;
  updatedAt?: string;
}

interface GroupMemberItem {
  id: string;
  name: string;
  department: string;
  position: string;
  avatar: string;
  email: string;
  addedAt: string;
}

interface AgentItem {
  id: string;
  name: string;
  description: string;
  avatar: string;
  goal: string;
  rules: string[];
  skillIds: string[];
  skillNames: string[];
  ragDatasetIds: string[];
  ragDatasetNames: string[];
  mcpServiceIds: string[];
  mcpServiceNames: string[];
}

// ====== 成员头像组件 =====
function MemberAvatarComp({ avatar, name, className, type }: { avatar?: string; name: string; className?: string; type?: "human" | "agent" }) {
  if (type === "agent") {
    // 智能体使用 Bot 图标
    const colors = [
      "bg-blue-500", "bg-emerald-500", "bg-violet-500", "bg-amber-500",
      "bg-rose-500", "bg-cyan-500", "bg-indigo-500", "bg-teal-500",
    ];
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    const color = colors[Math.abs(hash) % colors.length];
    return (
      <div className={cn("rounded-lg flex items-center justify-center text-white font-bold shrink-0", className || "w-10 h-10", color)}>
        {name.charAt(0)}
      </div>
    );
  }
  return <UserAvatar avatarKey={avatar} name={name} className={className || "w-10 h-10"} fallbackClassName="text-xs font-medium" />;
}

// ====== 主页面组件 ======
export default function ContactsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const currentTeam = user?.teams?.find((t) => t.id === user.currentTeamId) || user?.teams?.[0];
  const isAdmin = currentTeam?.role === "owner";

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);

  // 成员列表（API 驱动）
  const [teamMembers, setTeamMembers] = useState<Member[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);

  // 智能体列表
  const [agentList, setAgentList] = useState<AgentItem[]>([]);
  const [agentsLoading, setAgentsLoading] = useState(false);

  // 智能体对话弹窗


  // 群组相关状态
  const [groups, setGroups] = useState<GroupItem[]>([]);
  const [groupsLoading, setGroupsLoading] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<GroupItem | null>(null);
  const [groupMembers, setGroupMembers] = useState<GroupMemberItem[]>([]);
  const [groupMembersLoading, setGroupMembersLoading] = useState(false);
  const [groupSearchQuery, setGroupSearchQuery] = useState("");

  // 弹窗状态
  const [createGroupOpen, setCreateGroupOpen] = useState(false);
  const [createGroupStep, setCreateGroupStep] = useState<1 | 2>(1);
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupDesc, setNewGroupDesc] = useState("");
  const [newGroupSelectedMembers, setNewGroupSelectedMembers] = useState<string[]>([]);

  const [editGroupOpen, setEditGroupOpen] = useState(false);
  const [editGroupName, setEditGroupName] = useState("");
  const [editGroupDesc, setEditGroupDesc] = useState("");

  const [disbandGroupOpen, setDisbandGroupOpen] = useState(false);
  const [disbandTarget, setDisbandTarget] = useState<GroupItem | null>(null);

  const [removeMemberOpen, setRemoveMemberOpen] = useState(false);
  const [removeMemberTarget, setRemoveMemberTarget] = useState<GroupMemberItem | null>(null);

  const [addMembersOpen, setAddMembersOpen] = useState(false);
  const [addMembersSelected, setAddMembersSelected] = useState<string[]>([]);
  const [addMembersSearch, setAddMembersSearch] = useState("");
  const [addMembersTab, setAddMembersTab] = useState<"members" | "groups">("members");
  const [addMembersExpandedDepts, setAddMembersExpandedDepts] = useState<Set<string>>(new Set());

  // 创建群组成员选择搜索
  const [createGroupMemberSearch, setCreateGroupMemberSearch] = useState("");
  const [createGroupTab, setCreateGroupTab] = useState<"members" | "groups">("members");
  const [createGroupExpandedDepts, setCreateGroupExpandedDepts] = useState<Set<string>>(new Set());

  // 邀请成员弹窗
  const [inviteModalOpen, setInviteModalOpen] = useState(false);

  // 用于群组成员选择的扁平团队成员列表
  const [selectableTeamMembers, setSelectableTeamMembers] = useState<{ id: string; name: string; department: string; position: string; avatar: string }[]>([]);

  // ====== API 调用 ======

  // 获取团队成员
  const fetchTeamMembers = useCallback(async () => {
    if (!currentTeam?.id) return;
    setMembersLoading(true);
    try {
      const res = await fetch(`/api/teams/members?teamId=${currentTeam.id}`);
      const data = await res.json();
      if (data.success) {
        const members: Member[] = data.members.map((m: { id: string; name: string; department: string; position: string; avatar: string; email?: string; phone?: string }) => ({
          id: m.id,
          name: m.name,
          avatar: m.avatar || "",
          position: m.position || "",
          department: m.department || "",
          email: m.email,
          phone: m.phone,
          status: "offline" as const,
          type: "human" as const,
        }));
        setTeamMembers(members);
        // 同时更新可选择成员列表
        setSelectableTeamMembers(
          data.members.map((m: { id: string; name: string; department: string; position: string; avatar: string }) => ({
            id: m.id,
            name: m.name,
            department: m.department || "",
            position: m.position || "",
            avatar: m.avatar || "",
          }))
        );
      }
    } catch (err) {
      console.error("获取团队成员失败:", err);
    } finally {
      setMembersLoading(false);
    }
  }, [currentTeam?.id]);

  // 获取智能体列表
  const fetchAgents = useCallback(async () => {
    if (!currentTeam?.id) return;
    setAgentsLoading(true);
    try {
      const res = await fetch(`/api/agents?teamId=${currentTeam.id}`);
      const data = await res.json();
      if (data.success) {
        setAgentList(data.agents || []);
      }
    } catch (err) {
      console.error("获取智能体列表失败:", err);
    } finally {
      setAgentsLoading(false);
    }
  }, [currentTeam?.id]);

  // 获取群组列表
  const fetchGroups = useCallback(async () => {
    if (!currentTeam?.id) return;
    setGroupsLoading(true);
    try {
      const res = await fetch(`/api/teams/groups?teamId=${currentTeam.id}&pageSize=100`);
      const data = await res.json();
      if (data.success) {
        setGroups(data.groups);
      }
    } catch (err) {
      console.error("获取群组列表失败:", err);
    } finally {
      setGroupsLoading(false);
    }
  }, [currentTeam?.id]);

  // 获取群组成员
  const fetchGroupMembers = useCallback(async (groupId: string) => {
    setGroupMembersLoading(true);
    try {
      const res = await fetch(`/api/teams/groups/members?groupId=${groupId}`);
      const data = await res.json();
      if (data.success) {
        setGroupMembers(data.members);
      }
    } catch (err) {
      console.error("获取群组成员失败:", err);
    } finally {
      setGroupMembersLoading(false);
    }
  }, []);

  // 初始化加载
  useEffect(() => {
    if (currentTeam?.id) {
      fetchTeamMembers();
      fetchAgents();
      fetchGroups();
    }
  }, [currentTeam?.id, fetchTeamMembers, fetchAgents, fetchGroups]);

  // 选中群组时加载成员
  useEffect(() => {
    if (selectedGroup) {
      fetchGroupMembers(selectedGroup.id);
    } else {
      setGroupMembers([]);
    }
  }, [selectedGroup, fetchGroupMembers]);

  // ====== 数据处理 ======

  // 将智能体映射为 Member 格式（用于统一搜索和展示）
  const agentsAsMembers: Member[] = agentList.map((a) => ({
    id: a.id,
    name: a.name,
    avatar: a.avatar,
    position: a.goal ? (a.goal.length > 20 ? a.goal.slice(0, 20) + "..." : a.goal) : "智能体助手",
    department: "智能体",
    type: "agent" as const,
    description: a.description,
    goal: a.goal,
    skillNames: a.skillNames,
    ragDatasetNames: a.ragDatasetNames,
    mcpServiceNames: a.mcpServiceNames,
    rules: a.rules,
    status: "online" as const,
  }));

  // 按部门分组的人类成员
  const membersByDept = teamMembers.reduce<Record<string, Member[]>>((acc, m) => {
    const dept = m.department || "未分配部门";
    if (!acc[dept]) acc[dept] = [];
    acc[dept].push(m);
    return acc;
  }, {});

  // 搜索过滤（同时搜索人类成员和智能体）
  const filteredMembers = teamMembers.filter(
    (m) =>
      m.name.includes(searchQuery) ||
      m.position.includes(searchQuery) ||
      m.department.includes(searchQuery)
  );
  const filteredAgents = agentsAsMembers.filter(
    (a) =>
      a.name.includes(searchQuery) ||
      (a.description || "").includes(searchQuery) ||
      (a.goal || "").includes(searchQuery) ||
      a.department.includes(searchQuery)
  );

  // 搜索后按部门分组
  const filteredMembersByDept = filteredMembers.reduce<Record<string, Member[]>>((acc, m) => {
    const dept = m.department || "未分配部门";
    if (!acc[dept]) acc[dept] = [];
    acc[dept].push(m);
    return acc;
  }, {});

  // 过滤群组
  const filteredGroups = groups.filter(
    (g) =>
      g.name.toLowerCase().includes(groupSearchQuery.toLowerCase()) ||
      g.description.toLowerCase().includes(groupSearchQuery.toLowerCase())
  );

  // 按部门分组的可选团队成员（用于弹窗选择）
  const selectableMembersByDept = selectableTeamMembers.reduce<Record<string, typeof selectableTeamMembers>>((acc, m) => {
    const dept = m.department || "未分配部门";
    if (!acc[dept]) acc[dept] = [];
    acc[dept].push(m);
    return acc;
  }, {});

  // ====== 操作处理 ======

  // 打开智能体对话 → 跳转私聊页
  const handleOpenAgentChat = (member: Member) => {
    router.push(`/dms?chatWithAgent=${member.id}`);
  };

  // 群组操作
  const handleCreateGroup = async () => {
    if (!currentTeam?.id || !newGroupName.trim()) return;
    const memberIds = newGroupSelectedMembers.filter((id) => !id.startsWith("__group__"));
    try {
      const res = await fetch("/api/teams/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teamId: currentTeam.id,
          name: newGroupName.trim(),
          description: newGroupDesc.trim(),
          creatorId: user?.id,
          memberIds,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setCreateGroupOpen(false);
        setCreateGroupStep(1);
        setNewGroupName("");
        setNewGroupDesc("");
        setNewGroupSelectedMembers([]);
        setCreateGroupMemberSearch("");
        setCreateGroupTab("members");
        setCreateGroupExpandedDepts(new Set());
        fetchGroups();
      }
    } catch (err) {
      console.error("创建群组失败:", err);
    }
  };

  const handleEditGroup = async () => {
    if (!selectedGroup || !editGroupName.trim()) return;
    try {
      const res = await fetch("/api/teams/groups", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: selectedGroup.id,
          name: editGroupName.trim(),
          description: editGroupDesc.trim(),
        }),
      });
      const data = await res.json();
      if (data.success) {
        setEditGroupOpen(false);
        setSelectedGroup((prev) => prev ? { ...prev, name: editGroupName.trim(), description: editGroupDesc.trim() } : null);
        fetchGroups();
      }
    } catch (err) {
      console.error("编辑群组失败:", err);
    }
  };

  const handleDisbandGroup = async () => {
    if (!disbandTarget) return;
    try {
      const res = await fetch(`/api/teams/groups?id=${disbandTarget.id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        setDisbandGroupOpen(false);
        setDisbandTarget(null);
        if (selectedGroup?.id === disbandTarget.id) {
          setSelectedGroup(null);
        }
        fetchGroups();
      }
    } catch (err) {
      console.error("解散群组失败:", err);
    }
  };

  const handleRemoveMember = async () => {
    if (!selectedGroup || !removeMemberTarget) return;
    try {
      const res = await fetch(`/api/teams/groups/members?groupId=${selectedGroup.id}&userId=${removeMemberTarget.id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        setRemoveMemberOpen(false);
        setRemoveMemberTarget(null);
        fetchGroupMembers(selectedGroup.id);
        fetchGroups();
      }
    } catch (err) {
      console.error("移除成员失败:", err);
    }
  };

  const handleAddMembers = async () => {
    if (!selectedGroup) return;
    const userIds = addMembersSelected.filter((id) => !id.startsWith("__group__"));
    if (userIds.length === 0) return;
    try {
      const res = await fetch("/api/teams/groups/members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          groupId: selectedGroup.id,
          userIds,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setAddMembersOpen(false);
        setAddMembersSelected([]);
        fetchGroupMembers(selectedGroup.id);
        fetchGroups();
      }
    } catch (err) {
      console.error("添加成员失败:", err);
    }
  };

  // 当前群组中已有的成员ID集合
  const groupMemberIds = new Set(groupMembers.map((m) => m.id));

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

  // 切换部门展开/折叠
  const toggleDeptExpand = (dept: string, setFn: React.Dispatch<React.SetStateAction<Set<string>>>) => {
    setFn((prev) => {
      const next = new Set(prev);
      if (next.has(dept)) next.delete(dept);
      else next.add(dept);
      return next;
    });
  };

  // 选中成员或智能体
  const handleSelectContact = (member: Member) => {
    setSelectedMember(member);
    setSelectedGroup(null);
  };

  // 选中群组时清除成员选中
  const handleSelectGroup = (group: GroupItem) => {
    setSelectedGroup(group);
    setSelectedMember(null);
  };

  return (
    <div className="h-full flex">
      {/* 左侧列表区 */}
      <div className="w-80 border-r border-border flex flex-col overflow-hidden min-h-0">
        {/* 搜索 */}
        <div className="p-3 border-b border-border">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="搜索成员、智能体..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-9"
            />
          </div>
        </div>

        {/* 标签切换 */}
        <Tabs defaultValue="all" className="flex-1 flex flex-col min-h-0">
          <TabsList className="w-full justify-start rounded-none border-b px-3 pt-2 h-auto bg-transparent">
            <TabsTrigger value="all" className="data-[state=active]:bg-primary/10">
              成员
            </TabsTrigger>
            <TabsTrigger value="groups" className="data-[state=active]:bg-primary/10">
              群组
            </TabsTrigger>
          </TabsList>

          {/* 成员 Tab（含智能体分区） */}
          <TabsContent value="all" className="flex-1 m-0 min-h-0">
            <ScrollArea className="h-full">
              <div className="p-2">
                {(membersLoading || agentsLoading) ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <p className="text-sm">加载中...</p>
                  </div>
                ) : (
                  <>
                    {/* 智能体分区 */}
                    {(filteredAgents.length > 0 || !searchQuery) && (
                      <div className="mb-1">
                        <button
                          className="flex items-center gap-1.5 w-full px-2 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                        >
                          <ChevronDown className="w-3.5 h-3.5" />
                          <Bot className="w-3.5 h-3.5" />
                          智能体 ({filteredAgents.length})
                        </button>
                        {filteredAgents.map((agent) => (
                          <div
                            key={agent.id}
                            onClick={() => handleSelectContact(agent)}
                            className={cn(
                              "flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 cursor-pointer transition-colors ml-2",
                              selectedMember?.id === agent.id && selectedMember?.type === "agent" && "bg-muted"
                            )}
                          >
                            <div className="relative shrink-0">
                              <MemberAvatarComp avatar={agent.avatar} name={agent.name} type="agent" className="w-10 h-10" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-sm">{agent.name}</span>
                                <Badge variant="secondary" className="text-[10px] h-4 px-1.5 bg-primary/10 text-primary border-0">
                                  <Bot className="w-2.5 h-2.5 mr-0.5" />智能体
                                </Badge>
                              </div>
                              <p className="text-xs text-muted-foreground truncate">
                                {agent.position}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* 人类成员按部门分组 */}
                    {searchQuery ? (
                      // 搜索模式：平铺显示
                      filteredMembers.length === 0 && filteredAgents.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">
                          <p className="text-sm">未找到成员或智能体</p>
                        </div>
                      ) : (
                        filteredMembers.map((member) => (
                          <div
                            key={member.id}
                            onClick={() => handleSelectContact(member)}
                            className={cn(
                              "flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 cursor-pointer transition-colors",
                              selectedMember?.id === member.id && selectedMember?.type !== "agent" && "bg-muted"
                            )}
                          >
                            <div className="relative shrink-0">
                              <UserAvatar avatarKey={member.avatar} name={member.name} className="w-10 h-10" fallbackClassName="text-sm" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-sm">{member.name}</span>
                              </div>
                              <p className="text-xs text-muted-foreground truncate">
                                {member.position} · {member.department}
                              </p>
                            </div>
                          </div>
                        ))
                      )
                    ) : (
                      // 非搜索模式：按部门分组
                      Object.entries(membersByDept).map(([dept, members]) => (
                        <div key={dept} className="mb-1">
                          <div className="flex items-center gap-1.5 px-2 py-1.5 text-xs font-medium text-muted-foreground">
                            <Users className="w-3.5 h-3.5" />
                            {dept} ({members.length})
                          </div>
                          {members.map((member) => (
                            <div
                              key={member.id}
                              onClick={() => handleSelectContact(member)}
                              className={cn(
                                "flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 cursor-pointer transition-colors ml-2",
                                selectedMember?.id === member.id && selectedMember?.type !== "agent" && "bg-muted"
                              )}
                            >
                              <div className="relative shrink-0">
                                <UserAvatar avatarKey={member.avatar} name={member.name} className="w-10 h-10" fallbackClassName="text-sm" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="font-medium text-sm">{member.name}</span>
                                </div>
                                <p className="text-xs text-muted-foreground truncate">
                                  {member.position}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      ))
                    )}

                    {/* 无数据 */}
                    {!searchQuery && teamMembers.length === 0 && agentList.length === 0 && (
                      <div className="text-center py-8 text-muted-foreground">
                        <p className="text-sm">暂无成员</p>
                      </div>
                    )}
                  </>
                )}
              </div>
            </ScrollArea>
          </TabsContent>

          {/* 群组 Tab */}
          <TabsContent value="groups" className="flex-1 m-0 min-h-0 flex flex-col">
            <div className="px-3 py-2 flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                群组({groups.length})
              </span>
              {isAdmin && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs text-primary"
                  onClick={() => {
                    setCreateGroupStep(1);
                    setNewGroupName("");
                    setNewGroupDesc("");
                    setNewGroupSelectedMembers([]);
                    setCreateGroupMemberSearch("");
                    setCreateGroupTab("members");
                    setCreateGroupExpandedDepts(new Set());
                    setCreateGroupOpen(true);
                  }}
                >
                  <Plus className="w-3.5 h-3.5 mr-1" />
                  新建用户组
                </Button>
              )}
            </div>
            <div className="px-3 pb-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <Input
                  type="search"
                  placeholder="按名字、职位或团队搜索"
                  value={groupSearchQuery}
                  onChange={(e) => setGroupSearchQuery(e.target.value)}
                  className="pl-9 h-8 text-xs"
                />
              </div>
            </div>
            <ScrollArea className="flex-1">
              <div className="p-2">
                {groupsLoading ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <p className="text-sm">加载中...</p>
                  </div>
                ) : filteredGroups.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Layers className="w-10 h-10 mx-auto mb-2 opacity-40" />
                    <p className="text-sm">暂无群组</p>
                  </div>
                ) : (
                  filteredGroups.map((group) => (
                    <div
                      key={group.id}
                      onClick={() => handleSelectGroup(group)}
                      className={cn(
                        "flex items-center gap-3 p-2.5 rounded-lg hover:bg-muted/50 cursor-pointer transition-colors",
                        selectedGroup?.id === group.id && "bg-muted"
                      )}
                    >
                      <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                        <Users className="w-4.5 h-4.5 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="font-medium text-sm block truncate">{group.name}</span>
                        <p className="text-xs text-muted-foreground truncate">
                          {group.memberCount}个成员{group.description ? ` · ${group.description}` : ""}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </div>

      {/* 右侧详情区 */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* 人类成员详情 */}
        {selectedMember && !selectedGroup && selectedMember.type !== "agent" && (
          <>
            <div className="p-6 border-b border-border">
              <div className="flex items-start gap-4">
                <UserAvatar avatarKey={selectedMember.avatar} name={selectedMember.name} className="w-20 h-20" fallbackClassName="text-2xl" />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h2 className="text-xl font-semibold">{selectedMember.name}</h2>
                  </div>
                  <p className="text-muted-foreground mt-1">{selectedMember.position}</p>
                  <p className="text-sm text-muted-foreground mt-0.5">{selectedMember.department}</p>
                </div>
                <div className="flex gap-2">
                  <Button size="sm">
                    <Mail className="w-4 h-4 mr-1" />
                    发消息
                  </Button>
                </div>
              </div>
            </div>
            <div className="p-6">
              <h3 className="text-sm font-medium mb-4">联系方式</h3>
              <div className="space-y-3">
                {selectedMember.email && (
                  <div className="flex items-center gap-3 text-sm">
                    <Mail className="w-4 h-4 text-muted-foreground" />
                    <span>{selectedMember.email}</span>
                  </div>
                )}
                {selectedMember.phone && (
                  <div className="flex items-center gap-3 text-sm">
                    <Phone className="w-4 h-4 text-muted-foreground" />
                    <span>{selectedMember.phone}</span>
                  </div>
                )}
                {!selectedMember.email && !selectedMember.phone && (
                  <p className="text-sm text-muted-foreground">暂无联系方式</p>
                )}
              </div>
            </div>
          </>
        )}

        {/* 智能体详情 */}
        {selectedMember && !selectedGroup && selectedMember.type === "agent" && (
          <>
            <div className="p-6 border-b border-border">
              <div className="flex items-start gap-4">
                <MemberAvatarComp avatar={selectedMember.avatar} name={selectedMember.name} type="agent" className="w-20 h-20" />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h2 className="text-xl font-semibold">{selectedMember.name}</h2>
                    <Badge variant="secondary" className="text-xs bg-primary/10 text-primary border-0">
                      <Bot className="w-3 h-3 mr-0.5" />智能体
                    </Badge>
                  </div>
                  <p className="text-muted-foreground mt-1 line-clamp-2">
                    {selectedMember.description || "智能体助手"}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => handleOpenAgentChat(selectedMember)}>
                    <MessageSquare className="w-4 h-4 mr-1" />
                    与我对话
                  </Button>
                </div>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* 目标 */}
              {selectedMember.goal && (
                <div>
                  <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
                    <Target className="w-4 h-4 text-primary" />
                    目标
                  </h3>
                  <p className="text-sm text-muted-foreground leading-relaxed bg-muted/30 rounded-lg p-3">
                    {selectedMember.goal}
                  </p>
                </div>
              )}

              {/* 规则 */}
              {selectedMember.rules && selectedMember.rules.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-primary" />
                    规则
                  </h3>
                  <div className="space-y-1.5">
                    {selectedMember.rules.map((rule, i) => (
                      <div key={i} className="text-sm text-muted-foreground bg-muted/30 rounded-lg px-3 py-2 flex items-start gap-2">
                        <span className="text-primary font-medium shrink-0">{i + 1}.</span>
                        <span>{rule}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 关联职能 */}
              {selectedMember.skillNames && selectedMember.skillNames.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium mb-3">关联职能</h3>
                  <div className="flex flex-wrap gap-2">
                    {selectedMember.skillNames.map((name, i) => (
                      <Badge key={i} variant="outline" className="text-xs">{name}</Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* 关联知识库 */}
              {selectedMember.ragDatasetNames && selectedMember.ragDatasetNames.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium mb-3">关联知识库</h3>
                  <div className="flex flex-wrap gap-2">
                    {selectedMember.ragDatasetNames.map((name, i) => (
                      <Badge key={i} variant="outline" className="text-xs">{name}</Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* 关联服务 */}
              {selectedMember.mcpServiceNames && selectedMember.mcpServiceNames.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium mb-3">关联服务</h3>
                  <div className="flex flex-wrap gap-2">
                    {selectedMember.mcpServiceNames.map((name, i) => (
                      <Badge key={i} variant="outline" className="text-xs">{name}</Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* 快捷操作 */}
              <div className="pt-2 border-t border-border">
                <h3 className="text-sm font-medium mb-3">快捷操作</h3>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => handleOpenAgentChat(selectedMember)}>
                    <MessageSquare className="w-4 h-4 mr-1" />
                    发起对话
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => {
                    // 跳转到应用页
                    window.location.href = "/apps";
                  }}>
                    <Layers className="w-4 h-4 mr-1" />
                    查看应用
                  </Button>
                </div>
              </div>
            </div>
          </>
        )}

        {/* 群组详情 */}
        {selectedGroup && (
          <>
            {/* 群组头部信息 */}
            <div className="p-6 border-b border-border">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-xl font-semibold">{selectedGroup.name}</h2>
                  {selectedGroup.description && (
                    <p className="text-sm text-muted-foreground mt-1">{selectedGroup.description}</p>
                  )}
                  <p className="text-xs text-muted-foreground mt-1">@{selectedGroup.name}</p>
                </div>
                {isAdmin && (
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs"
                      onClick={() => {
                        setDisbandTarget(selectedGroup);
                        setDisbandGroupOpen(true);
                      }}
                    >
                      注销群组
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs"
                      onClick={() => {
                        setEditGroupName(selectedGroup.name);
                        setEditGroupDesc(selectedGroup.description);
                        setEditGroupOpen(true);
                      }}
                    >
                      编辑
                    </Button>
                  </div>
                )}
              </div>
            </div>

            {/* 成员列表 */}
            <div className="flex-1 overflow-y-auto">
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-medium">
                    成员 {groupMembers.length}
                  </h3>
                  {isAdmin && (
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-xs"
                        onClick={() => {
                          setInviteModalOpen(true);
                        }}
                      >
                        <Link2 className="w-3.5 h-3.5 mr-1" />
                        邀请成员
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-xs"
                        onClick={() => {
                          setAddMembersSelected([]);
                          setAddMembersSearch("");
                          setAddMembersTab("members");
                          setAddMembersExpandedDepts(new Set());
                          setAddMembersOpen(true);
                        }}
                      >
                        <UserPlus className="w-3.5 h-3.5 mr-1" />
                        添加人员
                      </Button>
                    </div>
                  )}
                </div>

                {groupMembersLoading ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <p className="text-sm">加载中...</p>
                  </div>
                ) : groupMembers.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Users className="w-10 h-10 mx-auto mb-2 opacity-40" />
                    <p className="text-sm">暂无成员</p>
                  </div>
                ) : (
                  <div className="space-y-1">
                    {groupMembers.map((member) => (
                      <div
                        key={member.id}
                        className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-muted/50 transition-colors"
                      >
                        <MemberAvatarComp avatar={member.avatar} name={member.name} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium">
                              {member.name}
                              {member.id === user?.id && (
                                <span className="text-muted-foreground font-normal">（你）</span>
                              )}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground truncate">
                            {member.department}{member.position ? `-${member.position}` : ""}
                          </p>
                        </div>
                        {isAdmin && member.id !== user?.id && (
                          <button
                            onClick={() => {
                              setRemoveMemberTarget(member);
                              setRemoveMemberOpen(true);
                            }}
                            className="text-xs text-primary hover:underline"
                          >
                            移除
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {/* 无选中状态 */}
        {!selectedMember && !selectedGroup && (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <UserPlus className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>选择成员或群组查看详情</p>
            </div>
          </div>
        )}
      </div>

      {/* ====== 创建群组弹窗 ====== */}
      <Dialog open={createGroupOpen} onOpenChange={(open) => { if (!open) setCreateGroupOpen(false); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>创建用户组</DialogTitle>
            <DialogDescription className="sr-only">创建用户组</DialogDescription>
          </DialogHeader>

          {createGroupStep === 1 ? (
            <>
              <p className="text-sm text-muted-foreground">
                创建用户组后，你可以直接@用户组，组内的成员都将收到通知。
              </p>
              <div className="space-y-4 py-2">
                <div className="space-y-2">
                  <Label htmlFor="groupName">名称 <span className="text-destructive">*</span></Label>
                  <Input
                    id="groupName"
                    type="text"
                    placeholder="如：部门、小组、团队等"
                    value={newGroupName}
                    onChange={(e) => setNewGroupName(e.target.value)}
                    className="h-11"
                  />
                  <p className="text-xs text-muted-foreground">
                    名称的用法：@名称，用于成员组消息通知
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="groupDesc">介绍</Label>
                  <Input
                    id="groupDesc"
                    type="text"
                    placeholder="说明群组主要讨论的内容"
                    value={newGroupDesc}
                    onChange={(e) => setNewGroupDesc(e.target.value)}
                    className="h-11"
                  />
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">步骤1（共2步）</span>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setCreateGroupOpen(false)}>取消</Button>
                  <Button
                    onClick={() => setCreateGroupStep(2)}
                    disabled={!newGroupName.trim()}
                  >
                    下一步
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="flex gap-4 py-2" style={{ minHeight: 340 }}>
                {/* 左侧：联系人选择 */}
                <div className="flex-1 border border-border rounded-lg flex flex-col">
                  <div className="p-3 border-b border-border">
                    <div className="relative mb-2">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                      <Input
                        type="search"
                        placeholder="按名字、职位或团队搜索"
                        value={createGroupMemberSearch}
                        onChange={(e) => setCreateGroupMemberSearch(e.target.value)}
                        className="pl-8 h-8 text-xs"
                      />
                    </div>
                    {/* 子标签切换 */}
                    <div className="flex gap-1 bg-muted/50 rounded-md p-0.5">
                      <button
                        className={cn("flex-1 text-xs py-1 rounded-sm transition-colors", createGroupTab === "members" ? "bg-background shadow-sm font-medium" : "text-muted-foreground hover:text-foreground")}
                        onClick={() => setCreateGroupTab("members")}
                      >
                        联系人
                      </button>
                      <button
                        className={cn("flex-1 text-xs py-1 rounded-sm transition-colors", createGroupTab === "groups" ? "bg-background shadow-sm font-medium" : "text-muted-foreground hover:text-foreground")}
                        onClick={() => setCreateGroupTab("groups")}
                      >
                        按群组选择
                      </button>
                    </div>
                  </div>

                  {createGroupTab === "members" ? (
                    <>
                      <div className="px-3 py-1.5 border-b border-border">
                        <span className="text-xs font-medium text-muted-foreground">
                          全部联系人（{selectableTeamMembers.length}人）
                        </span>
                      </div>
                      <ScrollArea className="flex-1">
                        <div className="p-1">
                          {createGroupMemberSearch ? (
                            selectableTeamMembers
                              .filter((m) =>
                                m.name.includes(createGroupMemberSearch) ||
                                m.position.includes(createGroupMemberSearch) ||
                                m.department.includes(createGroupMemberSearch)
                              )
                              .map((member) => (
                                <label
                                  key={member.id}
                                  className="flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-muted/50 cursor-pointer"
                                >
                                  <Checkbox
                                    checked={newGroupSelectedMembers.includes(member.id)}
                                    onCheckedChange={(checked) => {
                                      if (checked) {
                                        setNewGroupSelectedMembers((prev) => [...prev, member.id]);
                                      } else {
                                        setNewGroupSelectedMembers((prev) => prev.filter((id) => id !== member.id));
                                      }
                                    }}
                                  />
                                  <MemberAvatarComp avatar={member.avatar} name={member.name} className="w-7 h-7" />
                                  <div className="flex-1 min-w-0">
                                    <span className="text-sm font-medium">
                                      {member.name}
                                      {member.id === user?.id && (
                                        <span className="text-muted-foreground font-normal">（你）</span>
                                      )}
                                    </span>
                                    <p className="text-xs text-muted-foreground truncate">
                                      {member.department}{member.position ? `-${member.position}` : ""}
                                    </p>
                                  </div>
                                </label>
                              ))
                          ) : (
                            Object.entries(selectableMembersByDept).map(([dept, members]) => {
                              const isExpanded = createGroupExpandedDepts.has(dept);
                              const allSelected = members.every((m) => newGroupSelectedMembers.includes(m.id));
                              return (
                                <div key={dept}>
                                  <div className="flex items-center gap-2 px-2 py-1.5 hover:bg-muted/30 rounded-lg">
                                    <button
                                      onClick={() => toggleDeptExpand(dept, setCreateGroupExpandedDepts)}
                                      className="w-4 h-4 flex items-center justify-center shrink-0"
                                    >
                                      {isExpanded ? (
                                        <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                                      ) : (
                                        <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
                                      )}
                                    </button>
                                    <Checkbox
                                      checked={allSelected && members.length > 0}
                                      onCheckedChange={(checked) => {
                                        if (checked) {
                                          setNewGroupSelectedMembers((prev) => {
                                            const newSet = new Set(prev);
                                            members.forEach((m) => newSet.add(m.id));
                                            return Array.from(newSet);
                                          });
                                        } else {
                                          setNewGroupSelectedMembers((prev) => prev.filter((id) => !members.some((m) => m.id === id)));
                                        }
                                      }}
                                    />
                                    <span className="text-xs font-medium text-muted-foreground">
                                      {dept}（{members.length}人）
                                    </span>
                                  </div>
                                  {isExpanded && members.map((member) => (
                                    <label
                                      key={member.id}
                                      className="flex items-center gap-2.5 pl-8 pr-2 py-2 rounded-lg hover:bg-muted/50 cursor-pointer"
                                    >
                                      <Checkbox
                                        checked={newGroupSelectedMembers.includes(member.id)}
                                        onCheckedChange={(checked) => {
                                          if (checked) {
                                            setNewGroupSelectedMembers((prev) => [...prev, member.id]);
                                          } else {
                                            setNewGroupSelectedMembers((prev) => prev.filter((id) => id !== member.id));
                                          }
                                        }}
                                      />
                                      <MemberAvatarComp avatar={member.avatar} name={member.name} className="w-7 h-7" />
                                      <div className="flex-1 min-w-0">
                                        <span className="text-sm font-medium">
                                          {member.name}
                                          {member.id === user?.id && (
                                            <span className="text-muted-foreground font-normal">（你）</span>
                                          )}
                                        </span>
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
                          选择群组将添加该群组的全部成员
                        </span>
                      </div>
                      <ScrollArea className="flex-1">
                        <div className="p-1">
                          {groups.map((group) => (
                            <label
                              key={group.id}
                              className="flex items-center gap-2.5 px-2 py-2.5 rounded-lg hover:bg-muted/50 cursor-pointer"
                            >
                              <Checkbox
                                checked={newGroupSelectedMembers.includes(`__group__${group.id}`)}
                                onCheckedChange={async (checked) => {
                                  const groupKey = `__group__${group.id}`;
                                  if (checked) {
                                    const memberIds = await getGroupMemberIds(group.id);
                                    setNewGroupSelectedMembers((prev) => {
                                      const withoutPrevGroupMembers = prev.filter((id) => !id.startsWith(`__group__${group.id}`));
                                      return [...withoutPrevGroupMembers, groupKey, ...memberIds];
                                    });
                                  } else {
                                    const memberIds = await getGroupMemberIds(group.id);
                                    setNewGroupSelectedMembers((prev) => prev.filter((id) => id !== groupKey && !memberIds.includes(id)));
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

                {/* 右侧：已选成员 */}
                <div className="flex-1 border border-border rounded-lg flex flex-col">
                  <div className="p-3 border-b border-border flex items-center justify-between">
                    <span className="text-xs font-medium">
                      已选：{newGroupSelectedMembers.filter((id) => !id.startsWith("__group__")).length}人
                    </span>
                    {newGroupSelectedMembers.length > 0 && (
                      <button
                        onClick={() => setNewGroupSelectedMembers([])}
                        className="text-xs text-primary hover:underline"
                      >
                        全部清除
                      </button>
                    )}
                  </div>
                  <ScrollArea className="flex-1">
                    <div className="p-1">
                      {/* 群组标签 */}
                      {newGroupSelectedMembers
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
                                  setNewGroupSelectedMembers((prev) => prev.filter((id) => id !== groupKey && !memberIds.includes(id)));
                                }}
                                className="w-5 h-5 flex items-center justify-center rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          );
                        })}
                      {/* 个人成员 */}
                      {newGroupSelectedMembers
                        .filter((id) => !id.startsWith("__group__"))
                        .map((memberId) => {
                          const member = selectableTeamMembers.find((m) => m.id === memberId);
                          if (!member) return null;
                          return (
                            <div
                              key={memberId}
                              className="flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-muted/50"
                            >
                              <MemberAvatarComp avatar={member.avatar} name={member.name} className="w-7 h-7" />
                              <span className="text-sm font-medium flex-1">{member.name}</span>
                              <button
                                onClick={() => setNewGroupSelectedMembers((prev) => prev.filter((id) => id !== memberId))}
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
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">步骤2（共2步）</span>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setCreateGroupStep(1)}>上一步</Button>
                  <Button
                    onClick={handleCreateGroup}
                  >
                    创建组
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ====== 编辑群组弹窗 ====== */}
      <Dialog open={editGroupOpen} onOpenChange={(open) => { if (!open) setEditGroupOpen(false); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>编辑群组</DialogTitle>
            <DialogDescription className="sr-only">编辑群组信息</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="editGroupName">名称 <span className="text-destructive">*</span></Label>
              <Input
                id="editGroupName"
                type="text"
                value={editGroupName}
                onChange={(e) => setEditGroupName(e.target.value)}
                className="h-11"
              />
              <p className="text-xs text-muted-foreground">
                名称的用法：@名称，用于成员组消息通知
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="editGroupDesc">介绍</Label>
              <Input
                id="editGroupDesc"
                type="text"
                value={editGroupDesc}
                onChange={(e) => setEditGroupDesc(e.target.value)}
                className="h-11"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditGroupOpen(false)}>取消</Button>
            <Button onClick={handleEditGroup} disabled={!editGroupName.trim()}>保存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ====== 注销群组确认弹窗 ====== */}
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
            <Button variant="destructive" onClick={handleDisbandGroup}>移除</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ====== 移除成员确认弹窗 ====== */}
      <Dialog open={removeMemberOpen} onOpenChange={(open) => { if (!open) setRemoveMemberOpen(false); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              移除成员
            </DialogTitle>
            <DialogDescription className="sr-only">确认移除成员</DialogDescription>
          </DialogHeader>
          <p className="text-sm text-muted-foreground py-2">
            是否将 {removeMemberTarget?.name} 从此用户组中移除？
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoveMemberOpen(false)}>取消</Button>
            <Button variant="destructive" onClick={handleRemoveMember}>移除</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ====== 添加人员弹窗 ====== */}
      <Dialog open={addMembersOpen} onOpenChange={(open) => { if (!open) setAddMembersOpen(false); }}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>添加人员</DialogTitle>
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
                    value={addMembersSearch}
                    onChange={(e) => setAddMembersSearch(e.target.value)}
                    className="pl-8 h-8 text-xs"
                  />
                </div>
                {/* 子标签切换：联系人 / 群组 */}
                <div className="flex gap-1 bg-muted/50 rounded-md p-0.5">
                  <button
                    className={cn("flex-1 text-xs py-1 rounded-sm transition-colors", addMembersTab === "members" ? "bg-background shadow-sm font-medium" : "text-muted-foreground hover:text-foreground")}
                    onClick={() => setAddMembersTab("members")}
                  >
                    联系人
                  </button>
                  <button
                    className={cn("flex-1 text-xs py-1 rounded-sm transition-colors", addMembersTab === "groups" ? "bg-background shadow-sm font-medium" : "text-muted-foreground hover:text-foreground")}
                    onClick={() => setAddMembersTab("groups")}
                  >
                    按群组选择
                  </button>
                </div>
              </div>

              {addMembersTab === "members" ? (
                <>
                  <div className="px-3 py-1.5 border-b border-border">
                    <span className="text-xs font-medium text-muted-foreground">
                      全部联系人（{selectableTeamMembers.filter((m) => !groupMemberIds.has(m.id)).length}人可选）
                    </span>
                  </div>
                  <ScrollArea className="flex-1">
                    <div className="p-1">
                      {addMembersSearch ? (
                        // 搜索模式：平铺显示
                        selectableTeamMembers
                          .filter((m) => !groupMemberIds.has(m.id))
                          .filter((m) =>
                            m.name.includes(addMembersSearch) ||
                            m.position.includes(addMembersSearch) ||
                            m.department.includes(addMembersSearch)
                          )
                          .map((member) => (
                            <label
                              key={member.id}
                              className="flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-muted/50 cursor-pointer"
                            >
                              <Checkbox
                                checked={addMembersSelected.includes(member.id)}
                                onCheckedChange={(checked) => {
                                  if (checked) {
                                    setAddMembersSelected((prev) => [...prev, member.id]);
                                  } else {
                                    setAddMembersSelected((prev) => prev.filter((id) => id !== member.id));
                                  }
                                }}
                              />
                              <MemberAvatarComp avatar={member.avatar} name={member.name} className="w-7 h-7" />
                              <div className="flex-1 min-w-0">
                                <span className="text-sm font-medium">{member.name}</span>
                                <p className="text-xs text-muted-foreground truncate">
                                  {member.department}{member.position ? `-${member.position}` : ""}
                                </p>
                              </div>
                            </label>
                          ))
                      ) : (
                        // 分组模式：按部门折叠展示
                        Object.entries(selectableMembersByDept).map(([dept, members]) => {
                          const availableMembers = members.filter((m) => !groupMemberIds.has(m.id));
                          if (availableMembers.length === 0) return null;
                          const isExpanded = addMembersExpandedDepts.has(dept);
                          const allSelected = availableMembers.every((m) => addMembersSelected.includes(m.id));
                          return (
                            <div key={dept}>
                              <div className="flex items-center gap-2 px-2 py-1.5 hover:bg-muted/30 rounded-lg">
                                <button
                                  onClick={() => toggleDeptExpand(dept, setAddMembersExpandedDepts)}
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
                                      setAddMembersSelected((prev) => {
                                        const newSet = new Set(prev);
                                        availableMembers.forEach((m) => newSet.add(m.id));
                                        return Array.from(newSet);
                                      });
                                    } else {
                                      setAddMembersSelected((prev) => prev.filter((id) => !availableMembers.some((m) => m.id === id)));
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
                                    checked={addMembersSelected.includes(member.id)}
                                    onCheckedChange={(checked) => {
                                      if (checked) {
                                        setAddMembersSelected((prev) => [...prev, member.id]);
                                      } else {
                                        setAddMembersSelected((prev) => prev.filter((id) => id !== member.id));
                                      }
                                    }}
                                  />
                                  <MemberAvatarComp avatar={member.avatar} name={member.name} className="w-7 h-7" />
                                  <div className="flex-1 min-w-0">
                                    <span className="text-sm font-medium">{member.name}</span>
                                    <p className="text-xs text-muted-foreground truncate">
                                      {member.position || "暂无职位"}
                                    </p>
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
                        .filter((g) => g.id !== selectedGroup?.id)
                        .map((group) => (
                          <label
                            key={group.id}
                            className="flex items-center gap-2.5 px-2 py-2.5 rounded-lg hover:bg-muted/50 cursor-pointer"
                          >
                            <Checkbox
                              checked={addMembersSelected.includes(`__group__${group.id}`)}
                              onCheckedChange={async (checked) => {
                                const groupKey = `__group__${group.id}`;
                                if (checked) {
                                  const memberIds = await getGroupMemberIds(group.id);
                                  const nonDuplicateIds = memberIds.filter((id: string) => !groupMemberIds.has(id));
                                  setAddMembersSelected((prev) => {
                                    const withoutPrevGroupMembers = prev.filter((id) => !id.startsWith(`__group__${group.id}`));
                                    return [...withoutPrevGroupMembers, groupKey, ...nonDuplicateIds];
                                  });
                                } else {
                                  const memberIds = await getGroupMemberIds(group.id);
                                  const nonDuplicateIds = memberIds.filter((id: string) => !groupMemberIds.has(id));
                                  setAddMembersSelected((prev) => prev.filter((id) => id !== groupKey && !nonDuplicateIds.includes(id)));
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
                  已选：{addMembersSelected.filter((id) => !id.startsWith("__group__")).length}人
                  {groupMembers.length > 0 && (
                    <span className="text-muted-foreground font-normal ml-1">（已有{groupMembers.length}人）</span>
                  )}
                </span>
                {addMembersSelected.length > 0 && (
                  <button
                    onClick={() => setAddMembersSelected([])}
                    className="text-xs text-primary hover:underline"
                  >
                    全部清除
                  </button>
                )}
              </div>
              <ScrollArea className="flex-1">
                <div className="p-1">
                  {/* 已在群组中的成员（灰色，不可操作） */}
                  {groupMembers.length > 0 && (
                    <>
                      <div className="px-2 py-1.5">
                        <span className="text-xs text-muted-foreground">已加入</span>
                      </div>
                      {groupMembers.map((member) => (
                        <div
                          key={`existing-${member.id}`}
                          className="flex items-center gap-2.5 px-2 py-2 rounded-lg bg-muted/30"
                        >
                          <MemberAvatarComp avatar={member.avatar} name={member.name} className="w-7 h-7" />
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
                  {addMembersSelected.filter((id) => id.startsWith("__group__")).length > 0 && (
                    <div className="px-2 pt-2 pb-1.5 border-t border-border/50">
                      <span className="text-xs text-muted-foreground">新添加</span>
                    </div>
                  )}
                  {addMembersSelected
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
                              const nonDuplicateIds = memberIds.filter((id: string) => !groupMemberIds.has(id));
                              setAddMembersSelected((prev) => prev.filter((id) => id !== groupKey && !nonDuplicateIds.includes(id)));
                            }}
                            className="w-5 h-5 flex items-center justify-center rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      );
                    })}
                  {/* 新选中的个人成员 */}
                  {(groupMembers.length === 0 && addMembersSelected.filter((id) => id.startsWith("__group__")).length === 0) && addMembersSelected.filter((id) => !id.startsWith("__group__")).length > 0 && (
                    <div className="px-2 py-1.5">
                      <span className="text-xs text-muted-foreground">新添加</span>
                    </div>
                  )}
                  {(groupMembers.length > 0 || addMembersSelected.filter((id) => id.startsWith("__group__")).length > 0) && addMembersSelected.filter((id) => !id.startsWith("__group__")).length > 0 && (
                    <div className="px-2 pt-1 pb-1.5 border-t border-border/50">
                      <span className="text-xs text-muted-foreground">新添加</span>
                    </div>
                  )}
                  {addMembersSelected
                    .filter((id) => !id.startsWith("__group__"))
                    .map((memberId) => {
                      const member = selectableTeamMembers.find((m) => m.id === memberId);
                      if (!member) return null;
                      return (
                        <div
                          key={memberId}
                          className="flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-muted/50"
                        >
                          <MemberAvatarComp avatar={member.avatar} name={member.name} className="w-7 h-7" />
                          <span className="text-sm font-medium flex-1">{member.name}</span>
                          <button
                            onClick={() => setAddMembersSelected((prev) => prev.filter((id) => id !== memberId))}
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
            <Button variant="outline" onClick={() => setAddMembersOpen(false)}>取消</Button>
            <Button
              onClick={handleAddMembers}
              disabled={addMembersSelected.filter((id) => !id.startsWith("__group__")).length === 0}
            >
              <Send className="w-4 h-4 mr-1" />
              添加（{addMembersSelected.filter((id) => !id.startsWith("__group__")).length}人）
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ====== 邀请成员弹窗 ====== */}
      <InviteModal
        open={inviteModalOpen}
        onOpenChange={(open) => {
          setInviteModalOpen(open);
          if (!open) {
            fetchTeamMembers();
          }
        }}
        teamId={currentTeam?.id || ""}
        teamName={currentTeam?.name || ""}
      />
    </div>
  );
}
