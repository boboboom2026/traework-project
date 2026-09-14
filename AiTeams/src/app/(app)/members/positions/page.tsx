"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { DepartmentTreeSelect } from "@/components/ui/department-tree-select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Pencil, Trash2, ListTodo, Users, Briefcase } from "lucide-react";
import * as Icons from "lucide-react";

// ==================== 类型定义 ====================
interface JobWork {
  name: string;
  description: string;
}

interface Department {
  id: string;
  name: string;
  parentId?: string | null;
}

interface Position {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  code: string;
  jobWorks: JobWork[];
  agentCount: number;
  departmentId?: string;
  departmentName?: string;
}

// ==================== 图标选择器 ====================
const ICON_OPTIONS = [
  "Briefcase", "Megaphone", "PenTool", "BarChart3", "Users",
  "MessageCircle", "ShoppingCart", "Code", "Palette", "Headphones",
  "Camera", "Globe", "Heart", "Zap", "Star",
];

// ==================== 颜色选择器 ====================
const COLOR_OPTIONS = [
  "#3B82F6", "#10B981", "#8B5CF6", "#F59E0B", "#EF4444",
  "#06B6D4", "#EC4899", "#6366F1", "#14B8A6", "#F97316",
];

// ==================== 岗位管理页面 ====================
export default function PositionsPage() {
  const { user } = useAuth();
  const teamId = user?.currentTeamId;

  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(false);
  const [filterDepartmentId, setFilterDepartmentId] = useState<string | undefined>(undefined);

  const filteredPositions = filterDepartmentId
    ? positions.filter((p) => p.departmentId === filterDepartmentId)
    : positions;

  // 弹窗状态
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingPosition, setEditingPosition] = useState<Position | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<Position | null>(null);

  // 详情面板
  const [selectedPosition, setSelectedPosition] = useState<Position | null>(null);

  // 部门列表
  const [departments, setDepartments] = useState<Department[]>([]);

  // 表单状态
  const [formName, setFormName] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formIcon, setFormIcon] = useState("Briefcase");
  const [formColor, setFormColor] = useState("#3B82F6");
  const [formDepartmentId, setFormDepartmentId] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // 职能工作弹窗
  const [showJobWorkDialog, setShowJobWorkDialog] = useState(false);
  const [editingJobWork, setEditingJobWork] = useState<{ index: number; name: string; description: string } | null>(null);
  const [jwName, setJwName] = useState("");
  const [jwDesc, setJwDesc] = useState("");

  const loadPositions = useCallback(async () => {
    if (!teamId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/positions?teamId=${teamId}`);
      const data = await res.json();
      if (data.success) setPositions(data.data || data.positions || []);
    } catch (err) {
      console.error("加载岗位失败:", err);
    } finally {
      setLoading(false);
    }
  }, [teamId]);

  const loadDepartments = useCallback(async () => {
    if (!teamId) return;
    try {
      const res = await fetch(`/api/departments?teamId=${teamId}`);
      const data = await res.json();
      if (data.success) {
        const mapped = (data.data || []).map((d: Record<string, unknown>) => ({
          id: d.id as string,
          name: d.name as string,
          parentId: d.parent_id as string | null,
        }));
        setDepartments(mapped);
      }
    } catch (err) {
      console.error("加载部门失败:", err);
    }
  }, [teamId]);

  useEffect(() => { loadPositions(); loadDepartments(); }, [loadPositions, loadDepartments]);

  const resetForm = () => {
    setFormName("");
    setFormDesc("");
    setFormIcon("Briefcase");
    setFormColor("#3B82F6");
    setFormDepartmentId("");
  };

  const openCreate = () => {
    resetForm();
    setEditingPosition(null);
    setShowCreateDialog(true);
  };

  const openEdit = (pos: Position) => {
    setFormName(pos.name);
    setFormDesc(pos.description || "");
    setFormIcon(pos.icon || "Briefcase");
    setFormColor(pos.color || "#3B82F6");
    setFormDepartmentId(pos.departmentId || "");
    setEditingPosition(pos);
    setShowCreateDialog(true);
  };

  const handleSave = async () => {
    if (!formName.trim() || !teamId) return;
    setSubmitting(true);
    try {
      const body = {
        name: formName.trim(),
        description: formDesc.trim(),
        icon: formIcon,
        color: formColor,
        departmentId: formDepartmentId || undefined,
        teamId,
      };
      const url = editingPosition
        ? `/api/positions?id=${editingPosition.id}`
        : "/api/positions";
      const method = editingPosition ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.success) {
        setShowCreateDialog(false);
        resetForm();
        loadPositions();
      }
    } catch (err) {
      console.error("保存岗位失败:", err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    try {
      const res = await fetch(`/api/positions?id=${deleteConfirm.id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        setDeleteConfirm(null);
        loadPositions();
      }
    } catch (err) {
      console.error("删除岗位失败:", err);
    }
  };

  // 加载岗位详情
  const loadDetail = async (posId: string) => {
    try {
      const res = await fetch(`/api/positions/detail?id=${posId}`);
      const data = await res.json();
      if (data.success) {
        let jobWorks = data.position?.jobWorks || [];
        if (typeof jobWorks === "string") jobWorks = JSON.parse(jobWorks);
        setSelectedPosition({ ...data.position, jobWorks, agentCount: data.agentCount || 0 });
      }
    } catch (err) {
      console.error("加载岗位详情失败:", err);
    }
  };

  // 职能工作操作
  const openCreateJobWork = () => {
    setEditingJobWork(null);
    setJwName("");
    setJwDesc("");
    setShowJobWorkDialog(true);
  };

  const openEditJobWork = (index: number, jw: JobWork) => {
    setEditingJobWork({ index, name: jw.name, description: jw.description });
    setJwName(jw.name);
    setJwDesc(jw.description);
    setShowJobWorkDialog(true);
  };

  const saveJobWork = async () => {
    if (!selectedPosition || !jwName.trim()) return;
    const jobWorks = [...(selectedPosition.jobWorks || [])];
    if (editingJobWork) {
      jobWorks[editingJobWork.index] = { name: jwName.trim(), description: jwDesc.trim() };
    } else {
      jobWorks.push({ name: jwName.trim(), description: jwDesc.trim() });
    }
    try {
      const res = await fetch(`/api/positions?id=${selectedPosition.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobWorks, teamId }),
      });
      const data = await res.json();
      if (data.success) {
        setShowJobWorkDialog(false);
        loadDetail(selectedPosition.id);
      }
    } catch (err) {
      console.error("保存职能工作失败:", err);
    }
  };

  const deleteJobWork = async (index: number) => {
    if (!selectedPosition) return;
    const jobWorks = (selectedPosition.jobWorks || []).filter((_, i) => i !== index);
    try {
      const res = await fetch(`/api/positions?id=${selectedPosition.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobWorks, teamId }),
      });
      const data = await res.json();
      if (data.success) loadDetail(selectedPosition.id);
    } catch (err) {
      console.error("删除职能工作失败:", err);
    }
  };

  const renderIcon = (iconName: string) => {
    const IconComp = (Icons as unknown as Record<string, React.ComponentType<{ className?: string }>>)[iconName];
    return IconComp ? <IconComp className="w-5 h-5" /> : <Briefcase className="w-5 h-5" />;
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold">岗位列表</h1>
          <p className="text-sm text-muted-foreground mt-0.5">定义岗位和职能工作，创建成员时自动生成配置</p>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          {filterDepartmentId && (
            <span className="text-xs text-muted-foreground whitespace-nowrap">
              {departments.find(d => d.id === filterDepartmentId)?.name || "部门"}
              <span className="ml-1">({filteredPositions.length})</span>
            </span>
          )}
          <DepartmentTreeSelect
            departments={departments}
            value={filterDepartmentId}
            onChange={(id) => {
              setFilterDepartmentId(id || undefined);
            }}
            placeholder="按部门查看"
            allowClear
          />
          <Button onClick={openCreate} className="whitespace-nowrap">
            <Plus className="w-4 h-4 mr-1.5" />新建岗位
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      ) : filteredPositions.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <Briefcase className="w-12 h-12 mb-3 opacity-30" />
          <p className="text-sm">暂无岗位</p>
          <p className="text-xs mt-1">创建岗位后，可在创建数字成员时选择</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredPositions.map((pos) => (
            <Card
              key={pos.id}
              className="group hover:shadow-md transition-all duration-200 cursor-pointer"
              onClick={() => loadDetail(pos.id)}
            >
              <CardContent className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-11 h-11 rounded-xl flex items-center justify-center text-white"
                      style={{ backgroundColor: pos.color }}
                    >
                      {renderIcon(pos.icon)}
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-semibold text-sm">{pos.name}</h3>
                      {pos.code && (
                        <span className="text-[10px] text-muted-foreground">{pos.code}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={(e) => { e.stopPropagation(); openEdit(pos); }}
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive"
                      onClick={(e) => { e.stopPropagation(); setDeleteConfirm(pos); }}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
                {pos.description && (
                  <p className="text-xs text-muted-foreground line-clamp-2 mb-3">{pos.description}</p>
                )}
                <div className="grid grid-cols-2 gap-1.5">
                  <div className="text-center p-1.5 rounded-md bg-muted/40">
                    <div className="text-sm font-bold">{pos.agentCount || 0}</div>
                    <div className="text-[10px] text-muted-foreground">成员</div>
                  </div>
                  <div className="text-center p-1.5 rounded-md bg-muted/40">
                    <div className="text-sm font-bold">{(pos.jobWorks || []).length}</div>
                    <div className="text-[10px] text-muted-foreground">职能工作</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* 创建/编辑弹窗 */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingPosition ? "编辑岗位" : "新建岗位"}</DialogTitle>
            <DialogDescription>定义岗位名称、图标和颜色</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium mb-1.5 block">岗位名称 *</label>
              <Input
                placeholder="例如：新媒体运营"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">描述</label>
              <Input
                placeholder="岗位职责简述"
                value={formDesc}
                onChange={(e) => setFormDesc(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">所属部门</label>
              <DepartmentTreeSelect
                departments={departments}
                value={formDepartmentId}
                onChange={setFormDepartmentId}
                placeholder="选择部门（可选）"
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">图标</label>
              <div className="grid grid-cols-5 gap-2">
                {ICON_OPTIONS.map((icon) => (
                  <button
                    key={icon}
                    type="button"
                    className={`p-2 rounded-lg border flex items-center justify-center transition-colors ${
                      formIcon === icon ? "border-primary bg-primary/10" : "border-border hover:bg-muted"
                    }`}
                    onClick={() => setFormIcon(icon)}
                  >
                    {renderIcon(icon)}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">颜色</label>
              <div className="flex gap-2 flex-wrap">
                {COLOR_OPTIONS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    className={`w-8 h-8 rounded-full border-2 transition-all ${
                      formColor === color ? "border-foreground scale-110" : "border-transparent"
                    }`}
                    style={{ backgroundColor: color }}
                    onClick={() => setFormColor(color)}
                  />
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>取消</Button>
            <Button onClick={handleSave} disabled={submitting}>
              {submitting ? "保存中..." : editingPosition ? "保存" : "创建"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 删除确认 */}
      <Dialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>确认删除</DialogTitle>
            <DialogDescription>
              删除岗位「{deleteConfirm?.name}」后，关联的成员将失去岗位归属。此操作不可撤销。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>取消</Button>
            <Button variant="destructive" onClick={handleDelete}>确认删除</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 岗位详情面板 */}
      <Sheet open={!!selectedPosition} onOpenChange={() => setSelectedPosition(null)}>
        <SheetContent className="w-[420px] sm:max-w-[420px] overflow-y-auto">
          {selectedPosition && (
            <>
              <SheetHeader>
                <div className="flex items-center gap-3">
                  <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center text-white"
                    style={{ backgroundColor: selectedPosition.color }}
                  >
                    {renderIcon(selectedPosition.icon)}
                  </div>
                  <div>
                    <SheetTitle>{selectedPosition.name}</SheetTitle>
                    {selectedPosition.code && (
                      <p className="text-xs text-muted-foreground">{selectedPosition.code}</p>
                    )}
                  </div>
                </div>
                {selectedPosition.description && (
                  <p className="text-sm text-muted-foreground mt-2">{selectedPosition.description}</p>
                )}
                <div className="flex items-center gap-4 mt-3 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Users className="w-4 h-4" />
                    {selectedPosition.agentCount}个成员
                  </span>
                  <span className="flex items-center gap-1">
                    <ListTodo className="w-4 h-4" />
                    {(selectedPosition.jobWorks || []).length}项职能工作
                  </span>
                </div>
              </SheetHeader>

              <div className="mt-6">
                <Tabs defaultValue="jobWorks">
                  <TabsList className="w-full grid grid-cols-1">
                    <TabsTrigger value="jobWorks">职能工作</TabsTrigger>
                  </TabsList>
                  <TabsContent value="jobWorks" className="mt-4 space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-medium">职能工作（{(selectedPosition.jobWorks || []).length}）</h4>
                      <Button variant="outline" size="sm" onClick={openCreateJobWork}>
                        <Plus className="w-4 h-4 mr-1" />新建
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      职能工作定义该岗位"做什么"。创建成员时，LLM 将根据职能工作自动生成 Skill 操作流程。
                    </p>
                    {(!selectedPosition.jobWorks || selectedPosition.jobWorks.length === 0) ? (
                      <div className="text-center py-8 border rounded-lg bg-muted/5">
                        <ListTodo className="w-10 h-10 mx-auto text-muted-foreground/50 mb-2" />
                        <p className="text-sm text-muted-foreground">暂无职能工作</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {selectedPosition.jobWorks.map((jw, index) => (
                          <div key={index} className="p-3 rounded-lg border bg-card">
                            <div className="flex items-start justify-between">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <ListTodo className="w-4 h-4 text-primary shrink-0" />
                                  <span className="font-medium text-sm">{jw.name}</span>
                                </div>
                                {jw.description && (
                                  <p className="text-xs text-muted-foreground mt-1 ml-6">{jw.description}</p>
                                )}
                              </div>
                              <div className="flex gap-1 ml-2">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7"
                                  onClick={() => openEditJobWork(index, jw)}
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 text-destructive"
                                  onClick={() => deleteJobWork(index)}
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
          )}
        </SheetContent>
      </Sheet>

      {/* 职能工作编辑弹窗 */}
      <Dialog open={showJobWorkDialog} onOpenChange={setShowJobWorkDialog}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{editingJobWork ? "编辑职能工作" : "新建职能工作"}</DialogTitle>
            <DialogDescription>定义该岗位需要完成的一项具体工作</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <label className="text-sm font-medium mb-1.5 block">名称 *</label>
              <Input
                placeholder="例如：账号矩阵管理"
                value={jwName}
                onChange={(e) => setJwName(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">描述</label>
              <Textarea
                placeholder="简述这项工作做什么"
                value={jwDesc}
                onChange={(e) => setJwDesc(e.target.value)}
                className="min-h-[80px]"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowJobWorkDialog(false)}>取消</Button>
            <Button onClick={saveJobWork}>保存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
