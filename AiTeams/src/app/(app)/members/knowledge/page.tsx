"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Database, Plus, Edit3, Trash2, Search, FileText, Download, Upload, File, X, FileSpreadsheet, FileImage } from "lucide-react";
import { toast } from "sonner";

interface RAGDataset {
  id: string;
  name: string;
  description: string;
  documentCount?: number;
  status?: string;
  syncStatus?: string;
  docStats?: { ready: number; processing: number; pending: number; failed: number; total: number };
  syncConfig?: any;
}

interface RAGDocument {
  id: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  status: string;
  chunkCount: number;
  errorMessage?: string;
  createdBy?: string;
  creatorName?: string;
  createdAt: string;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

function getFileIcon(fileType: string) {
  switch (fileType) {
    case "pdf": return <FileText className="h-4 w-4 text-red-500" />;
    case "doc":
    case "docx": return <FileText className="h-4 w-4 text-blue-500" />;
    case "xls":
    case "xlsx": return <FileSpreadsheet className="h-4 w-4 text-green-500" />;
    case "csv": return <FileSpreadsheet className="h-4 w-4 text-emerald-500" />;
    case "txt": return <FileText className="h-4 w-4 text-gray-500" />;
    case "md": return <FileText className="h-4 w-4 text-purple-500" />;
    default: return <File className="h-4 w-4 text-muted-foreground" />;
  }
}

function getSyncStatusBadge(ds: RAGDataset) {
  const syncStatus = ds.syncStatus;
  const stats = ds.docStats;

  if (!stats || stats.total === 0) {
    return null; // 没有文档时不显示同步状态
  }

  switch (syncStatus) {
    case "synced":
      return <Badge variant="default" className="text-xs bg-green-100 text-green-700 hover:bg-green-100 border-green-200">已就绪</Badge>;
    case "processing":
      return <Badge variant="secondary" className="text-xs bg-yellow-100 text-yellow-700 border-yellow-200">处理中 ({stats.processing + stats.pending}/{stats.total})</Badge>;
    case "partial_failed":
      return <Badge variant="destructive" className="text-xs bg-orange-100 text-orange-700 hover:bg-orange-100 border-orange-200">部分失败 ({stats.failed}/{stats.total})</Badge>;
    case "all_failed":
      return <Badge variant="destructive" className="text-xs">全部失败</Badge>;
    default:
      return <Badge variant="outline" className="text-xs">待同步</Badge>;
  }
}

function getStatusBadge(status: string) {
  switch (status) {
    case "ready": return <Badge variant="default" className="text-xs bg-green-100 text-green-700 hover:bg-green-100">就绪</Badge>;
    case "processing": return <Badge variant="secondary" className="text-xs bg-yellow-100 text-yellow-700">处理中</Badge>;
    case "pending": return <Badge variant="outline" className="text-xs">等待中</Badge>;
    case "failed": return <Badge variant="destructive" className="text-xs">失败</Badge>;
    default: return <Badge variant="outline" className="text-xs">{status}</Badge>;
  }
}

export default function KnowledgePage() {
  const { user, isLoading: authLoading } = useAuth();
  const [datasets, setDatasets] = useState<RAGDataset[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [showDialog, setShowDialog] = useState(false);
  const [editingDataset, setEditingDataset] = useState<RAGDataset | null>(null);
  const [formName, setFormName] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [saving, setSaving] = useState(false);

  // 文档列表
  const [selectedDataset, setSelectedDataset] = useState<RAGDataset | null>(null);
  const [showDocsDialog, setShowDocsDialog] = useState(false);
  const [documents, setDocuments] = useState<RAGDocument[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const teamId = user?.currentTeamId || "";

  const loadDatasets = useCallback(async () => {
    if (!teamId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/rag?teamId=${teamId}`);
      const data = await res.json();
      if (data.success) setDatasets(data.data || data.datasets || []);
    } catch (e) {
      console.error("Failed to load datasets:", e);
    } finally {
      setLoading(false);
    }
  }, [teamId]);

  useEffect(() => {
    if (!authLoading && teamId) loadDatasets();
  }, [authLoading, teamId, loadDatasets]);

  const loadDocuments = useCallback(async (datasetId: string) => {
    setDocsLoading(true);
    try {
      const res = await fetch(`/api/rag/documents?datasetId=${datasetId}`);
      const data = await res.json();
      if (data.success) {
        setDocuments(data.documents || []);
      } else {
        setDocuments([]);
      }
    } catch (e) {
      console.error("Failed to load documents:", e);
      setDocuments([]);
    } finally {
      setDocsLoading(false);
    }
  }, []);

  const openDataset = (ds: RAGDataset) => {
    setSelectedDataset(ds);
    setShowDocsDialog(true);
    loadDocuments(ds.id);
  };

  const handleDownload = async (doc: RAGDocument) => {
    try {
      const res = await fetch(`/api/rag/documents?docId=${doc.id}&download=true`);
      const data = await res.json();
      if (data.success && data.downloadUrl) {
        // 使用 fetch + blob 下载（跨域安全）
        const response = await fetch(data.downloadUrl);
        const blob = await response.blob();
        const blobUrl = window.URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = blobUrl;
        link.download = doc.fileName;
        link.click();
        window.URL.revokeObjectURL(blobUrl);
      } else {
        toast.error("获取下载链接失败");
      }
    } catch (e) {
      toast.error("下载失败，请重试");
    }
  };

  const handleUpload = async (file: File) => {
    if (!selectedDataset || !user) return;
    if (file.size > 50 * 1024 * 1024) {
      toast.error("文件大小不能超过 50MB");
      return;
    }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("datasetId", selectedDataset.id);
      formData.append("userId", user.id);

      const res = await fetch("/api/rag/documents", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (data.success) {
        toast.success("文档上传成功，后台处理中");
        loadDocuments(selectedDataset.id);
        loadDatasets();
      } else {
        toast.error(data.error || "上传失败");
      }
    } catch (e) {
      toast.error("上传失败，请重试");
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteDocument = async (doc: RAGDocument) => {
    if (!confirm(`确定删除文档「${doc.fileName}」？`)) return;
    try {
      const res = await fetch(`/api/rag/documents?id=${doc.id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        toast.success("文档已删除");
        setDocuments(prev => prev.filter(d => d.id !== doc.id));
        loadDatasets();
      } else {
        toast.error(data.error || "删除失败");
      }
    } catch (e) {
      toast.error("删除失败，请重试");
    }
  };

  const filteredDatasets = datasets.filter(d =>
    !searchQuery || d.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const openCreate = () => {
    setEditingDataset(null);
    setFormName("");
    setFormDesc("");
    setShowDialog(true);
  };

  const openEdit = (ds: RAGDataset, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setEditingDataset(ds);
    setFormName(ds.name);
    setFormDesc(ds.description || "");
    setShowDialog(true);
  };

  const handleSave = async () => {
    if (!formName.trim()) { toast.error("请输入知识库名称"); return; }
    setSaving(true);
    try {
      const url = "/api/rag";
      const method = editingDataset ? "PUT" : "POST";
      const body: any = { name: formName, description: formDesc, teamId };
      if (editingDataset) body.id = editingDataset.id;

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(editingDataset ? "知识库已更新" : "知识库已创建");
        setShowDialog(false);
        loadDatasets();
      } else {
        toast.error(data.error || "操作失败");
      }
    } catch (e) {
      toast.error("操作失败，请重试");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (ds: RAGDataset, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!confirm(`确定删除知识库「${ds.name}」？`)) return;
    try {
      const res = await fetch(`/api/rag?id=${ds.id}&teamId=${teamId}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        toast.success("知识库已删除");
        loadDatasets();
      } else {
        toast.error(data.error || "删除失败");
      }
    } catch (e) {
      toast.error("删除失败，请重试");
    }
  };

  if (authLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-10 w-full" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1,2,3].map(i => <Skeleton key={i} className="h-36" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold">知识库</h2>
          <p className="text-sm text-muted-foreground mt-1">管理 RAG 知识库，为数字成员提供知识检索能力</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4 mr-1" />新建知识库
        </Button>
      </div>

      <div className="relative max-w-sm mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="搜索知识库..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9"
        />
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1,2,3].map(i => <Skeleton key={i} className="h-36" />)}
        </div>
      ) : filteredDatasets.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Database className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p className="text-lg font-medium">暂无知识库</p>
          <p className="text-sm mt-1">创建知识库后，数字成员可以从知识库中检索信息</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredDatasets.map(ds => (
            <Card
              key={ds.id}
              className="hover:shadow-md transition-shadow cursor-pointer"
              onClick={() => openDataset(ds)}
            >
              <CardContent className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1 min-w-0">
                    <h4 className="font-semibold truncate">{ds.name}</h4>
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                      {ds.description || "暂无描述"}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 mb-3">
                  <Badge variant="secondary" className="text-xs">
                    {ds.documentCount ?? 0} 个文档
                  </Badge>
                  {getSyncStatusBadge(ds)}
                </div>
                <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                  <Button variant="ghost" size="sm" onClick={(e) => openEdit(ds, e)}>
                    <Edit3 className="h-3.5 w-3.5 mr-1" />编辑
                  </Button>
                  <Button variant="ghost" size="sm" onClick={(e) => handleDelete(ds, e)}>
                    <Trash2 className="h-3.5 w-3.5 mr-1" />删除
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* 新建/编辑知识库弹窗 */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingDataset ? "编辑知识库" : "新建知识库"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>名称</Label>
              <Input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="知识库名称" />
            </div>
            <div>
              <Label>描述</Label>
              <Textarea value={formDesc} onChange={(e) => setFormDesc(e.target.value)} placeholder="知识库描述（可选）" rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>取消</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? "保存中..." : "保存"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 文档列表弹窗 */}
      <Dialog open={showDocsDialog} onOpenChange={setShowDocsDialog}>
        <DialogContent className="max-w-3xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Database className="h-5 w-5 text-primary" />
              {selectedDataset?.name}
            </DialogTitle>
            <DialogDescription>
              {selectedDataset?.description || "暂无描述"} · 共 {documents.length} 个文档
            </DialogDescription>
          </DialogHeader>

          {/* 上传区域 */}
          <div className="flex items-center gap-3 mb-4">
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept=".pdf,.doc,.docx,.txt,.md,.csv,.xls,.xlsx"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  handleUpload(file);
                  e.target.value = "";
                }
              }}
            />
            <Button
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? (
                <>上传中...</>
              ) : (
                <><Upload className="h-4 w-4 mr-1" />上传文档</>
              )}
            </Button>
            <p className="text-xs text-muted-foreground">支持 PDF、Word、TXT、Markdown、CSV、Excel，最大 50MB</p>
          </div>

          {/* 文档列表 */}
          <div className="flex-1 overflow-y-auto min-h-0">
            {docsLoading ? (
              <div className="space-y-3">
                {[1,2,3].map(i => <Skeleton key={i} className="h-16" />)}
              </div>
            ) : documents.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <FileText className="h-10 w-10 mx-auto mb-2 opacity-30" />
                <p className="text-sm">暂无文档</p>
                <p className="text-xs mt-1">点击上方按钮上传文档</p>
              </div>
            ) : (
              <div className="space-y-2">
                {documents.map((doc) => (
                  <div
                    key={doc.id}
                    className="flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-muted/50 transition-colors"
                  >
                    {getFileIcon(doc.fileType)}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{doc.fileName}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-muted-foreground">{formatFileSize(doc.fileSize)}</span>
                        <span className="text-xs text-muted-foreground">·</span>
                        {getStatusBadge(doc.status)}
                        {doc.chunkCount > 0 && (
                          <>
                            <span className="text-xs text-muted-foreground">·</span>
                            <span className="text-xs text-muted-foreground">{doc.chunkCount} 个片段</span>
                          </>
                        )}
                        {doc.creatorName && (
                          <>
                            <span className="text-xs text-muted-foreground">·</span>
                            <span className="text-xs text-muted-foreground">{doc.creatorName}</span>
                          </>
                        )}
                        {doc.createdAt && (
                          <>
                            <span className="text-xs text-muted-foreground">·</span>
                            <span className="text-xs text-muted-foreground">
                              {new Date(doc.createdAt).toLocaleDateString("zh-CN")}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleDownload(doc)}>
                        <Download className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => handleDeleteDocument(doc)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
