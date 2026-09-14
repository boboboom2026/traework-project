"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Plus,
  Pencil,
  Trash2,
  Briefcase,
  Users,
  CheckCircle,
  BookOpen,
  Search,
  Sparkles,
  MessageCircle,
  X,
  Save,
  ListTodo,
  FolderOpen,
} from "lucide-react";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// ============== Types ==============

interface Position {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  status: string;
  createdAt: string;
  agentCount: number;
  skillCount: number;
  departmentId?: string | null;
  departmentName?: string | null;
}

interface DepartmentItem {
  id: string;
  name: string;
}

interface PositionDetail {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  createdAt: string;
  agents: { id: string; name: string; avatar?: string }[];
  skills: SkillItem[];
  jobWorks: JobWorkItem[];
}

interface SkillItem {
  id: string;
  name: string;
  description: string;
  content: string;
  sourceType: string;
  createdAt: string;
  updatedAt: string;
}

interface JobWorkItem {
  name: string;
  description: string;
}

// ============== Icon Picker ==============

const ICON_OPTIONS = [
  { name: "Briefcase", icon: Briefcase, label: "公文包" },
  { name: "Users", icon: Users, label: "团队" },
  { name: "Sparkles", icon: Sparkles, label: "智能" },
  { name: "Search", icon: Search, label: "搜索" },
  { name: "BookOpen", icon: BookOpen, label: "书本" },
  { name: "CheckCircle", icon: CheckCircle, label: "完成" },
];

const COLOR_OPTIONS = [
  "#3B82F6", "#6366F1", "#8B5CF6", "#EC4899", "#F43F5E",
  "#EF4444", "#F97316", "#EAB308", "#22C55E", "#14B8A6",
  "#06B6D4", "#0EA5E9", "#64748B", "#78716C", "#000000",
];

const IconComponent = ({ iconName, className }: { iconName: string; className?: string }) => {
  const found = ICON_OPTIONS.find((o) => o.name === iconName);
  if (found) {
    const Icon = found.icon;
    return <Icon className={className || "w-5 h-5"} />;
  }
  return <Briefcase className={className || "w-5 h-5"} />;
};

// ============== Main Component ==============

export default function PositionCenter({ teamId }: { teamId?: string }) {
  const router = useRouter();

  // State
  const [positions, setPositions] = useState<Position[]>([]);
  const [departments, setDepartments] = useState<DepartmentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPosition, setSelectedPosition] = useState<PositionDetail | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);

  // Create/Edit dialog
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formName, setFormName] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formIcon, setFormIcon] = useState("Briefcase");
  const [formColor, setFormColor] = useState("#3B82F6");
  const [formDeptId, setFormDeptId] = useState<string>("");
  const [saving, setSaving] = useState(false);

  // Delete confirm
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  // Job Work management
  const [showJobWorkDialog, setShowJobWorkDialog] = useState(false);
  const [editJobWorkIndex, setEditJobWorkIndex] = useState<number | null>(null);
  const [jobWorkName, setJobWorkName] = useState("");
  const [jobWorkDesc, setJobWorkDesc] = useState("");
  const [jobWorkSaving, setJobWorkSaving] = useState(false);

  // ============== Load Positions ==============

  const loadPositions = useCallback(async () => {
    if (!teamId) return;
    setLoading(true);
    try {
      // 同时加载部门和岗位
      const [deptRes, posRes] = await Promise.all([
        fetch(`/api/teams/departments?teamId=${teamId}`),
        fetch(`/api/positions?teamId=${teamId}`),
      ]);
      const deptData = await deptRes.json();
      if (deptData.success) {
        setDepartments(deptData.departments || []);
      }
      const data = await posRes.json();
      if (data.success) {
        const list = (data.data || []).map((p: any) => ({
          id: p.id,
          name: p.name,
          description: p.description || "",
          icon: p.icon || "Briefcase",
          color: p.color || "#3B82F6",
          status: p.status || "active",
          createdAt: p.created_at || p.createdAt,
          agentCount: p.agentCount || 0,
          skillCount: p.skillCount || 0,
          departmentId: p.departmentId || p.department_id,
          departmentName: p.departmentName || null,
        }));
        setPositions(list);
      }
    } catch (err) {
      console.error("加载岗位列表失败:", err);
    } finally {
      setLoading(false);
    }
  }, [teamId]);

  useEffect(() => {
    loadPositions();
  }, [loadPositions]);

  // ============== Load Detail ==============

  const loadDetail = async (id: string) => {
    setDetailLoading(true);
    setShowDetail(true);
    try {
      const res = await fetch(`/api/positions/detail?id=${id}`);
      const data = await res.json();
      if (data.success) {
        // 确保 jobWorks 是数组（API返回JSONB可能为字符串）
        const pos = {
          ...data.position,
          jobWorks: typeof data.position.jobWorks === 'string'
            ? JSON.parse(data.position.jobWorks)
            : (data.position.jobWorks || []),
        };
        setSelectedPosition(pos);
      } else {
        toast.error("加载详情失败");
      }
    } catch (err) {
      console.error("加载岗位详情失败:", err);
      toast.error("加载详情失败");
    } finally {
      setDetailLoading(false);
    }
  };

  // ============== Create / Update ==============

  const handleCreate = async () => {
    if (!formName.trim() || !teamId) return;
    setSaving(true);
    try {
      const res = await fetch("/api/positions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teamId,
          name: formName.trim(),
          description: formDesc.trim(),
          icon: formIcon,
          color: formColor,
          departmentId: formDeptId || undefined,
        }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success("岗位创建成功");
        setShowCreateDialog(false);
        resetForm();
        await loadPositions();
      } else {
        toast.error(data.error || "创建失败");
      }
    } catch (err) {
      console.error("创建岗位失败:", err);
      toast.error("创建失败");
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async () => {
    if (!formName.trim() || !editingId) return;
    setSaving(true);
    try {
      const res = await fetch("/api/positions", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingId,
          name: formName.trim(),
          description: formDesc.trim(),
          icon: formIcon,
          color: formColor,
          departmentId: formDeptId || null,
        }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success("岗位更新成功");
        setShowEditDialog(false);
        resetForm();
        setEditingId(null);
        await loadPositions();
        if (selectedPosition && selectedPosition.id === editingId) {
          setSelectedPosition((prev) => prev ? { ...prev, name: formName.trim(), description: formDesc.trim(), icon: formIcon, color: formColor, departmentId: formDeptId || undefined } : null);
        }
      } else {
        toast.error(data.error || "更新失败");
      }
    } catch (err) {
      console.error("更新岗位失败:", err);
      toast.error("更新失败");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/positions?id=${id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        toast.success("岗位已删除");
        setDeleteConfirm(null);
        if (showDetail && selectedPosition?.id === id) {
          setShowDetail(false);
          setSelectedPosition(null);
        }
        await loadPositions();
      } else {
        toast.error(data.error || "删除失败");
      }
    } catch (err) {
      console.error("删除岗位失败:", err);
      toast.error("删除失败");
    }
  };

  const resetForm = () => {
    setFormName("");
    setFormDesc("");
    setFormIcon("Briefcase");
    setFormColor("#3B82F6");
    setFormDeptId("");
  };

  const openEdit = (pos: Position) => {
    setEditingId(pos.id);
    setFormName(pos.name);
    setFormDesc(pos.description || "");
    setFormIcon(pos.icon || "Briefcase");
    setFormColor(pos.color || "#3B82F6");
    setFormDeptId(pos.departmentId || "");
    setShowEditDialog(true);
  };

  // ============== Job Work Management ==============

  const openCreateJobWork = () => {
    setEditJobWorkIndex(null);
    setJobWorkName("");
    setJobWorkDesc("");
    setShowJobWorkDialog(true);
  };

  const openEditJobWork = (index: number, jobWork: JobWorkItem) => {
    setEditJobWorkIndex(index);
    setJobWorkName(jobWork.name);
    setJobWorkDesc(jobWork.description);
    setShowJobWorkDialog(true);
  };

  const handleSaveJobWork = async () => {
    if (!jobWorkName.trim() || !selectedPosition) return;
    setJobWorkSaving(true);
    try {
      const currentJobWorks = selectedPosition.jobWorks || [];
      let newJobWorks: JobWorkItem[];

      if (editJobWorkIndex !== null) {
        // Edit existing
        newJobWorks = currentJobWorks.map((jw, i) =>
          i === editJobWorkIndex
            ? { name: jobWorkName.trim(), description: jobWorkDesc.trim() }
            : jw
        );
      } else {
        // Add new
        newJobWorks = [...currentJobWorks, { name: jobWorkName.trim(), description: jobWorkDesc.trim() }];
      }

      const res = await fetch("/api/positions", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: selectedPosition.id,
          job_works: newJobWorks,
        }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(editJobWorkIndex !== null ? "职能工作已更新" : "职能工作已添加");
        setShowJobWorkDialog(false);
        // Refresh detail
        const detailRes = await fetch(`/api/positions/detail?id=${selectedPosition.id}`);
        const detailData = await detailRes.json();
        if (detailData.success) {
          setSelectedPosition(detailData.position);
        }
        await loadPositions();
      } else {
        toast.error(data.error || "保存失败");
      }
    } catch (err) {
      console.error("保存职能工作失败:", err);
      toast.error("保存失败");
    } finally {
      setJobWorkSaving(false);
    }
  };

  const handleDeleteJobWork = async (index: number) => {
    if (!selectedPosition) return;
    const currentJobWorks = selectedPosition.jobWorks || [];
    const newJobWorks = currentJobWorks.filter((_, i) => i !== index);

    try {
      const res = await fetch("/api/positions", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: selectedPosition.id,
          job_works: newJobWorks,
        }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success("职能工作已删除");
        // Refresh detail
        const detailRes = await fetch(`/api/positions/detail?id=${selectedPosition.id}`);
        const detailData = await detailRes.json();
        if (detailData.success) {
          setSelectedPosition(detailData.position);
        }
        await loadPositions();
      } else {
        toast.error(data.error || "删除失败");
      }
    } catch (err) {
      console.error("删除职能工作失败:", err);
      toast.error("删除失败");
    }
  };

  // ============== Render ==============

  const renderPositionCard = (pos: Position) => (
    <div
      key={pos.id}
      className="group relative rounded-xl border bg-card hover:border-primary/40 hover:shadow-md transition-all cursor-pointer"
      onClick={() => loadDetail(pos.id)}
    >
      <div className="p-5">
        <div className="flex items-start justify-between mb-3">
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center text-white text-lg font-bold"
            style={{ backgroundColor: pos.color || "#3B82F6" }}
          >
            <IconComponent iconName={pos.icon} className="w-6 h-6" />
          </div>
          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button
              variant="ghost"
              size="icon"
              className="w-8 h-8"
              onClick={(e) => { e.stopPropagation(); openEdit(pos); }}
            >
              <Pencil className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="w-8 h-8 text-destructive hover:text-destructive"
              onClick={(e) => { e.stopPropagation(); setDeleteConfirm(pos.id); }}
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </div>
        <h4 className="font-semibold mb-1">{pos.name}</h4>
        {pos.description && (
          <p className="text-sm text-muted-foreground line-clamp-2 mb-3">{pos.description}</p>
        )}
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Users className="w-3.5 h-3.5" />
            {pos.agentCount}个智能体
          </span>
          <span className="flex items-center gap-1">
            <ListTodo className="w-3.5 h-3.5" />
            {pos.skillCount}项职能工作
          </span>
        </div>
      </div>
      <div className="absolute bottom-0 left-0 right-0 h-1 rounded-b-xl" style={{ backgroundColor: pos.color || "#3B82F6", opacity: 0.3 }} />
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">岗位中心</h3>
          <p className="text-sm text-muted-foreground">
            管理团队岗位，定义岗位的职能工作（做什么），创建智能体时选择岗位即可自动生成 Skill 配置（怎么做）
          </p>
        </div>
        <Button onClick={() => { resetForm(); setShowCreateDialog(true); }}>
          <Plus className="w-4 h-4 mr-2" />新建岗位
        </Button>
      </div>

      {/* Position Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-32 rounded-lg border bg-muted/5 animate-pulse" />
          ))}
        </div>
      ) : positions.length === 0 ? (
        <div className="text-center py-16 border rounded-lg bg-muted/5">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <Briefcase className="w-8 h-8 text-primary/60" />
          </div>
          <p className="text-muted-foreground mb-2">暂无岗位</p>
          <p className="text-sm text-muted-foreground/70 mb-4">先创建岗位，再创建智能体时选择岗位-自动生成配置</p>
          <Button variant="outline" onClick={() => { resetForm(); setShowCreateDialog(true); }}>
            <Plus className="w-4 h-4 mr-2" />新建岗位
          </Button>
        </div>
      ) : (
        <div className="space-y-6">
          {/* 未归类 */}
          {(() => {
            const ungrouped = positions.filter(p => !p.departmentId);
            if (ungrouped.length === 0) return null;
            return (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <FolderOpen className="w-4 h-4 text-muted-foreground" />
                  <h4 className="text-sm font-medium text-muted-foreground">未归类</h4>
                  <span className="text-xs text-muted-foreground/70">({ungrouped.length})</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {ungrouped.map(renderPositionCard)}
                </div>
              </div>
            );
          })()}
          {/* 按部门分组 */}
          {departments.map(dept => {
            const deptPositions = positions.filter(p => p.departmentId === dept.id);
            if (deptPositions.length === 0) return null;
            return (
              <div key={dept.id}>
                <div className="flex items-center gap-2 mb-3">
                  <FolderOpen className="w-4 h-4 text-primary" />
                  <h4 className="text-sm font-medium">{dept.name}</h4>
                  <span className="text-xs text-muted-foreground/70">({deptPositions.length})</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {deptPositions.map(renderPositionCard)}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ============== Create Dialog ============== */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>新建岗位</DialogTitle>
            <DialogDescription>定义一个新的团队岗位，后续创建智能体时可选择此岗位自动生成配置</DialogDescription>
          </DialogHeader>
          <div className="space-y-5 py-2">
            <div>
              <label className="text-sm font-medium mb-1.5 block">岗位名称</label>
              <Input
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="如：产品经理"
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">图标</label>
              <div className="grid grid-cols-6 gap-2">
                {ICON_OPTIONS.map((opt) => {
                  const Icon = opt.icon;
                  return (
                    <button
                      key={opt.name}
                      type="button"
                      className={`w-10 h-10 rounded-lg flex items-center justify-center border transition-all ${
                        formIcon === opt.name
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border hover:border-primary/50 text-muted-foreground"
                      }`}
                      onClick={() => setFormIcon(opt.name)}
                      title={opt.label}
                    >
                      <Icon className="w-5 h-5" />
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">颜色</label>
              <div className="flex flex-wrap gap-2">
                {COLOR_OPTIONS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className={`w-8 h-8 rounded-full border-2 transition-all ${
                      formColor === c ? "border-foreground scale-110" : "border-transparent"
                    }`}
                    style={{ backgroundColor: c }}
                    onClick={() => setFormColor(c)}
                  />
                ))}
              </div>
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">所属部门</label>
              <Select value={formDeptId} onValueChange={setFormDeptId}>
                <SelectTrigger>
                  <SelectValue placeholder="不选择部门（归类为未分类）" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">不选择部门</SelectItem>
                  {departments.map(dept => (
                    <SelectItem key={dept.id} value={dept.id}>{dept.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">岗位职责</label>
              <Textarea
                value={formDesc}
                onChange={(e) => setFormDesc(e.target.value)}
                placeholder="描述这个岗位的职责和目标，创建智能体时将自动生成 system_prompt..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>取消</Button>
            <Button onClick={handleCreate} disabled={saving || !formName.trim()}>
              {saving ? "创建中..." : "创建"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============== Edit Dialog ============== */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>编辑岗位</DialogTitle>
            <DialogDescription>修改岗位的名称、图标、颜色和描述</DialogDescription>
          </DialogHeader>
          <div className="space-y-5 py-2">
            <div>
              <label className="text-sm font-medium mb-1.5 block">岗位名称</label>
              <Input
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="如：产品经理"
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">图标</label>
              <div className="grid grid-cols-6 gap-2">
                {ICON_OPTIONS.map((opt) => {
                  const Icon = opt.icon;
                  return (
                    <button
                      key={opt.name}
                      type="button"
                      className={`w-10 h-10 rounded-lg flex items-center justify-center border transition-all ${
                        formIcon === opt.name
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border hover:border-primary/50 text-muted-foreground"
                      }`}
                      onClick={() => setFormIcon(opt.name)}
                      title={opt.label}
                    >
                      <Icon className="w-5 h-5" />
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">颜色</label>
              <div className="flex flex-wrap gap-2">
                {COLOR_OPTIONS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className={`w-8 h-8 rounded-full border-2 transition-all ${
                      formColor === c ? "border-foreground scale-110" : "border-transparent"
                    }`}
                    style={{ backgroundColor: c }}
                    onClick={() => setFormColor(c)}
                  />
                ))}
              </div>
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">所属部门</label>
              <Select value={formDeptId} onValueChange={setFormDeptId}>
                <SelectTrigger>
                  <SelectValue placeholder="不选择部门（归类为未分类）" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">不选择部门</SelectItem>
                  {departments.map(dept => (
                    <SelectItem key={dept.id} value={dept.id}>{dept.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">岗位职责</label>
              <Textarea
                value={formDesc}
                onChange={(e) => setFormDesc(e.target.value)}
                placeholder="描述这个岗位的职责和目标..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditDialog(false)}>取消</Button>
            <Button onClick={handleUpdate} disabled={saving || !formName.trim()}>
              {saving ? "保存中..." : "保存"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============== Delete Confirm ============== */}
      <Dialog open={!!deleteConfirm} onOpenChange={(v) => !v && setDeleteConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认删除</DialogTitle>
            <DialogDescription>
              删除后，该岗位下的智能体将不再关联此岗位，技能也将一并删除。此操作不可撤销。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>取消</Button>
            <Button variant="destructive" onClick={() => deleteConfirm && handleDelete(deleteConfirm)}>
              删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============== Detail Sheet ============== */}
      <Sheet open={showDetail} onOpenChange={(v) => { if (!v) { setShowDetail(false); setSelectedPosition(null); } }}>
        <SheetContent className="w-full sm:max-w-xl md:max-w-2xl overflow-y-auto">
          {detailLoading ? (
            <div className="space-y-6 pt-8">
              <div className="h-20 rounded-lg bg-muted/10 animate-pulse" />
              <div className="h-40 rounded-lg bg-muted/10 animate-pulse" />
              <div className="h-40 rounded-lg bg-muted/10 animate-pulse" />
            </div>
          ) : selectedPosition ? (
            <>
              {/* Header */}
              <SheetHeader className="pb-6 border-b">
                <div className="flex items-center gap-4">
                  <div
                    className="w-14 h-14 rounded-xl flex items-center justify-center text-white"
                    style={{ backgroundColor: selectedPosition.color || "#3B82F6" }}
                  >
                    <IconComponent iconName={selectedPosition.icon} className="w-7 h-7" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <SheetTitle className="text-xl">{selectedPosition.name}</SheetTitle>
                    {selectedPosition.description && (
                      <SheetDescription className="mt-1 line-clamp-2">
                        {selectedPosition.description}
                      </SheetDescription>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="shrink-0"
                    onClick={() => {
                      const pos = positions.find((p) => p.id === selectedPosition.id);
                      if (pos) openEdit(pos);
                    }}
                  >
                    <Pencil className="w-4 h-4" />
                  </Button>
                </div>
                <div className="flex items-center gap-4 mt-3 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Users className="w-4 h-4" />
                    {selectedPosition.agents.length}个智能体
                  </span>
                  <span className="flex items-center gap-1">
                    <ListTodo className="w-4 h-4" />
                    {(selectedPosition.jobWorks || []).length}项职能工作
                  </span>
                </div>
              </SheetHeader>

              {/* Tabs */}
              <div className="mt-6">
                <Tabs defaultValue="agents">
                  <TabsList className="w-full grid grid-cols-2">
                    <TabsTrigger value="agents">在岗智能体</TabsTrigger>
                    <TabsTrigger value="jobWorks">职能工作</TabsTrigger>
                  </TabsList>

                  {/* === Agents Tab === */}
                  <TabsContent value="agents" className="mt-4 space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-medium">在岗智能体（{selectedPosition.agents.length}）</h4>
                    </div>
                    {selectedPosition.agents.length === 0 ? (
                      <div className="text-center py-8 border rounded-lg bg-muted/5">
                        <Sparkles className="w-10 h-10 mx-auto text-muted-foreground/50 mb-2" />
                        <p className="text-sm text-muted-foreground">暂无智能体占用此岗位</p>
                        <p className="text-xs text-muted-foreground/60 mt-1">
                          前往「应用」页创建智能体时选择此岗位
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {selectedPosition.agents.map((agent) => (
                          <div
                            key={agent.id}
                            className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-muted/20 transition-colors"
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-sm font-medium text-primary">
                                {agent.name.charAt(0)}
                              </div>
                              <div>
                                <p className="text-sm font-medium">{agent.name}</p>
                                <p className="text-xs text-muted-foreground">{selectedPosition.name} · 在岗智能体</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-8"
                                onClick={() => router.push(`/dms?chatWithAgent=${agent.id}`)}
                              >
                                <MessageCircle className="w-4 h-4 mr-1" />对话
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </TabsContent>

                  {/* === Job Works Tab === */}
                  <TabsContent value="jobWorks" className="mt-4 space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-medium">职能工作（{(selectedPosition.jobWorks || []).length}）</h4>
                      <Button variant="outline" size="sm" onClick={openCreateJobWork}>
                        <Plus className="w-4 h-4 mr-1" />新建职能工作
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      职能工作定义该岗位"做什么"（名称+描述）。创建智能体时，LLM 将根据职能工作自动生成可执行的 Skill 操作流程文档。
                    </p>
                    {(!selectedPosition.jobWorks || selectedPosition.jobWorks.length === 0) ? (
                      <div className="text-center py-8 border rounded-lg bg-muted/5">
                        <ListTodo className="w-10 h-10 mx-auto text-muted-foreground/50 mb-2" />
                        <p className="text-sm text-muted-foreground">暂无职能工作</p>
                        <p className="text-xs text-muted-foreground/60 mt-1">
                          为岗位添加职能工作后，创建智能体时将自动生成 Skill 配置
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {selectedPosition.jobWorks.map((jw, index) => (
                          <div
                            key={index}
                            className="p-3 rounded-lg border bg-card hover:bg-muted/20 transition-colors"
                          >
                            <div className="flex items-start justify-between">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <ListTodo className="w-4 h-4 text-primary shrink-0" />
                                  <span className="font-medium text-sm">{jw.name}</span>
                                </div>
                                {jw.description && (
                                  <p className="text-xs text-muted-foreground mt-1">{jw.description}</p>
                                )}
                              </div>
                              <div className="flex gap-1 shrink-0 ml-2">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="w-7 h-7"
                                  onClick={() => openEditJobWork(index, jw)}
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="w-7 h-7 text-destructive hover:text-destructive"
                                  onClick={() => handleDeleteJobWork(index)}
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </Button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </TabsContent>
                </Tabs>
              </div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>

      {/* ============== Job Work Create/Edit Dialog ============== */}
      <Dialog open={showJobWorkDialog} onOpenChange={setShowJobWorkDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editJobWorkIndex !== null ? "编辑职能工作" : "新建职能工作"}</DialogTitle>
            <DialogDescription>
              {editJobWorkIndex !== null
                ? "修改职能工作的名称和描述"
                : "为岗位添加新的职能工作，定义该岗位需要做什么"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium mb-1.5 block">工作名称</label>
              <Input
                value={jobWorkName}
                onChange={(e) => setJobWorkName(e.target.value)}
                placeholder="如：需求分析"
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">工作描述</label>
              <Textarea
                value={jobWorkDesc}
                onChange={(e) => setJobWorkDesc(e.target.value)}
                placeholder="描述这项工作的目标和产出物，LLM将根据此描述自动生成可执行的Skill操作流程..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowJobWorkDialog(false)}>取消</Button>
            <Button onClick={handleSaveJobWork} disabled={jobWorkSaving || !jobWorkName.trim()}>
              {jobWorkSaving ? "保存中..." : "保存"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}