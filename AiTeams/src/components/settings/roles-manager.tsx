"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Briefcase, Plus, Pencil, Trash2, Bot, Loader2 } from "lucide-react";

interface Role {
  id: string;
  name: string;
  description: string;
  responsibilities: string;
  status: string;
  sortOrder: number;
  createdBy: string;
  createdAt: string;
  agentCount?: number;
}

export default function RolesManager({ teamId }: { teamId: string }) {
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // 创建/编辑弹窗
  const [showDialog, setShowDialog] = useState(false);
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [formName, setFormName] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formResp, setFormResp] = useState("");
  const [saving, setSaving] = useState(false);

  // 删除确认
  const [deleteRole, setDeleteRole] = useState<Role | null>(null);
  const [deleting, setDeleting] = useState(false);

  const showMessage = (type: "success" | "error", text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 3000);
  };

  const loadRoles = useCallback(async () => {
    if (!teamId) return;
    try {
      const res = await fetch(`/api/roles?teamId=${teamId}`);
      const data = await res.json();
      if (data.success) {
        setRoles(data.roles || []);
      }
    } catch (err) {
      console.error("加载角色失败:", err);
    } finally {
      setLoading(false);
    }
  }, [teamId]);

  useEffect(() => {
    loadRoles();
  }, [loadRoles]);

  // 打开创建弹窗
  const openCreate = () => {
    setEditingRole(null);
    setFormName("");
    setFormDesc("");
    setFormResp("");
    setShowDialog(true);
  };

  // 打开编辑弹窗
  const openEdit = (role: Role) => {
    setEditingRole(role);
    setFormName(role.name);
    setFormDesc(role.description || "");
    setFormResp(role.responsibilities || "");
    setShowDialog(true);
  };

  // 保存角色
  const handleSave = async () => {
    if (!formName.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/roles", {
        method: editingRole ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingRole?.id,
          teamId,
          name: formName.trim(),
          description: formDesc.trim(),
          responsibilities: formResp.trim(),
        }),
      });
      const data = await res.json();
      if (data.success) {
        showMessage("success", editingRole ? "岗位已更新" : "岗位已创建");
        setShowDialog(false);
        loadRoles();
      } else {
        showMessage("error", data.error || "操作失败");
      }
    } catch {
      showMessage("error", "网络错误");
    } finally {
      setSaving(false);
    }
  };

  // 删除角色
  const handleDelete = async () => {
    if (!deleteRole) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/roles?id=${deleteRole.id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        showMessage("success", "岗位已删除");
        setDeleteRole(null);
        loadRoles();
      } else {
        showMessage("error", data.error || "删除失败");
      }
    } catch {
      showMessage("error", "网络错误");
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 消息提示 */}
      {message && (
        <div
          className={`px-4 py-3 rounded-lg text-sm ${
            message.type === "success" ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"
          }`}
        >
          {message.text}
        </div>
      )}

      {/* 头部 */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">岗位管理</h3>
          <p className="text-sm text-muted-foreground mt-1">
            定义组织岗位与职责，创建智能体时绑定岗位即可由 AI 自动生成配置
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="w-4 h-4 mr-2" />
          新建岗位
        </Button>
      </div>

      {/* 角色列表 */}
      {roles.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Briefcase className="w-12 h-12 text-muted-foreground/40 mb-4" />
            <h4 className="text-base font-medium text-muted-foreground mb-1">暂无岗位</h4>
            <p className="text-sm text-muted-foreground/60 mb-4">创建第一个岗位，定义其职责，AI 将自动为绑定该岗位的智能体生成配置</p>
            <Button variant="outline" onClick={openCreate}>
              <Plus className="w-4 h-4 mr-2" />
              新建岗位
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {roles.map((role) => (
            <Card key={role.id} className="hover:shadow-sm transition-shadow">
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Briefcase className="w-4 h-4 text-primary" />
                      <h4 className="font-medium">{role.name}</h4>
                      {role.agentCount && role.agentCount > 0 ? (
                        <Badge variant="secondary" className="ml-2 text-xs">
                          <Bot className="w-3 h-3 mr-1" />
                          {role.agentCount} 个智能体
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="ml-2 text-xs text-muted-foreground">
                          未绑定智能体
                        </Badge>
                      )}
                    </div>
                    {role.description && (
                      <p className="text-sm text-muted-foreground line-clamp-2">{role.description}</p>
                    )}
                    {role.responsibilities && (
                      <div className="mt-2 text-xs text-muted-foreground/70 line-clamp-3 whitespace-pre-wrap">
                        {role.responsibilities}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1 ml-4 shrink-0">
                    <Button variant="ghost" size="icon" className="w-8 h-8" onClick={() => openEdit(role)} title="编辑">
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="w-8 h-8 text-destructive" onClick={() => setDeleteRole(role)} title="删除">
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* 创建/编辑弹窗 */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingRole ? "编辑岗位" : "新建岗位"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>岗位名称</Label>
              <Input
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="如：产品经理、客服专员、数据分析师"
              />
            </div>
            <div>
              <Label>岗位描述</Label>
              <Input
                value={formDesc}
                onChange={(e) => setFormDesc(e.target.value)}
                placeholder="简要描述该岗位的定位与核心方向"
              />
            </div>
            <div>
              <Label>岗位职责</Label>
              <Textarea
                value={formResp}
                onChange={(e) => setFormResp(e.target.value)}
                placeholder="详细描述该岗位的职责与工作内容，AI 将根据此内容自动生成智能体配置&#10;&#10;例如：&#10;1. 负责产品战略规划与路线图制定&#10;2. 深入用户需求调研与竞品分析&#10;3. 撰写PRD文档并推动产品迭代&#10;4. 通过数据分析驱动产品优化"
                rows={8}
              />
              <p className="text-xs text-muted-foreground mt-1.5">
                职责描述越详细，AI 生成的智能体配置越精准
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>取消</Button>
            <Button onClick={handleSave} disabled={!formName.trim() || saving}>
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {editingRole ? "更新" : "创建"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 删除确认弹窗 */}
      <Dialog open={!!deleteRole} onOpenChange={() => setDeleteRole(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认删除</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            确定要删除岗位「{deleteRole?.name}」吗？绑定该岗位的智能体将失去岗位关联。
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteRole(null)}>取消</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
