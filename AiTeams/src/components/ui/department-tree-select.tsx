"use client";

import { useState, useMemo } from "react";
import { Check, ChevronRight, FolderOpen, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

export interface Department {
  id: string;
  name: string;
  parentId?: string | null;
}

interface TreeNode {
  dept: Department;
  children: TreeNode[];
  depth: number;
}

interface DepartmentTreeSelectProps {
  departments: Department[];
  value?: string;
  onChange: (departmentId: string, departmentName: string) => void;
  placeholder?: string;
  allowClear?: boolean;
}

function buildTree(departments: Department[]): TreeNode[] {
  const map = new Map<string, TreeNode>();
  const roots: TreeNode[] = [];

  // 创建所有节点
  for (const dept of departments) {
    map.set(dept.id, { dept, children: [], depth: 0 });
  }

  // 构建父子关系
  for (const node of map.values()) {
    if (node.dept.parentId && map.has(node.dept.parentId)) {
      const parent = map.get(node.dept.parentId)!;
      parent.children.push(node);
      node.depth = parent.depth + 1;
    } else {
      roots.push(node);
    }
  }

  return roots;
}

function flattenTree(nodes: TreeNode[]): { dept: Department; depth: number; path: string }[] {
  const result: { dept: Department; depth: number; path: string }[] = [];

  function walk(node: TreeNode, parentPath: string) {
    const path = parentPath ? `${parentPath} / ${node.dept.name}` : node.dept.name;
    result.push({ dept: node.dept, depth: node.depth, path });
    for (const child of node.children) {
      walk(child, path);
    }
  }

  for (const root of nodes) {
    walk(root, "");
  }

  return result;
}

export function DepartmentTreeSelect({
  departments,
  value,
  onChange,
  placeholder = "选择部门",
  allowClear = false,
}: DepartmentTreeSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const tree = useMemo(() => buildTree(departments), [departments]);
  const flatItems = useMemo(() => flattenTree(tree), [tree]);

  const selected = useMemo(
    () => departments.find((d) => d.id === value),
    [departments, value]
  );
  const selectedPath = useMemo(
    () => flatItems.find((item) => item.dept.id === value)?.path ?? selected?.name ?? "",
    [flatItems, selected, value]
  );

  const filtered = useMemo(() => {
    if (!search.trim()) return flatItems;
    const q = search.toLowerCase();
    return flatItems.filter(
      (item) =>
        item.dept.name.toLowerCase().includes(q) ||
        item.path.toLowerCase().includes(q)
    );
  }, [flatItems, search]);

  const handleSelect = (dept: Department) => {
    onChange(dept.id, dept.name);
    setOpen(false);
    setSearch("");
  };

  return (
    <div className="flex items-center gap-1">
      {allowClear && value && (
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 shrink-0"
          onClick={() => {
            onChange("", "");
          }}
        >
          <X className="h-4 w-4" />
        </Button>
      )}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-[180px] justify-between text-left font-normal"
          >
            <span className={cn("truncate", !value && "text-muted-foreground")}>
              {value ? selectedPath : placeholder}
            </span>
            <ChevronRight
              className={cn(
                "h-4 w-4 shrink-0 transition-transform",
                open && "rotate-90"
              )}
            />
          </Button>
        </PopoverTrigger>
      <PopoverContent className="w-[320px] p-0" align="start">
        <div className="flex items-center border-b px-3">
          <Search className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" />
          <Input
            placeholder="搜索部门..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="border-0 bg-transparent p-2 text-sm outline-none focus-visible:ring-0 focus-visible:ring-offset-0"
          />
        </div>
        <ScrollArea className="h-[300px]">
          {filtered.length === 0 ? (
            <div className="py-6 text-center text-sm text-muted-foreground">
              未找到匹配的部门
            </div>
          ) : (
            <div className="p-1">
              {filtered.map((item) => (
                <button
                  key={item.dept.id}
                  onClick={() => handleSelect(item.dept)}
                  className={cn(
                    "relative flex w-full cursor-pointer items-center gap-2 rounded-sm px-2 py-2 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground",
                    value === item.dept.id && "bg-accent text-accent-foreground"
                  )}
                  style={{ paddingLeft: `${12 + item.depth * 20}px` }}
                >
                  <FolderOpen className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="flex-1 truncate text-left">{item.dept.name}</span>
                  {item.depth > 0 && (
                    <span className="text-xs text-muted-foreground/60 truncate max-w-[100px]">
                      {item.path.split(" / ").slice(0, -1).join(" / ")}
                    </span>
                  )}
                  {value === item.dept.id && (
                    <Check className="h-4 w-4 shrink-0 text-primary" />
                  )}
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
    </div>
  );
}