"use client";

import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  Users,
  Briefcase,
  BookOpen,
  Database,
  Wrench,
  Workflow,
  Globe,
} from "lucide-react";

type SubNavItem = {
  id: string;
  label: string;
  icon: React.ReactNode;
  href: string;
};

const subNavItems: SubNavItem[] = [
  { id: "members", label: "数字成员", icon: <Users className="w-4 h-4" />, href: "/members" },
  { id: "positions", label: "岗位管理", icon: <Briefcase className="w-4 h-4" />, href: "/members/positions" },
  { id: "skills", label: "工作技能", icon: <BookOpen className="w-4 h-4" />, href: "/members/skills" },
  { id: "workflows", label: "工作流", icon: <Workflow className="w-4 h-4" />, href: "/members/workflows" },
  { id: "knowledge", label: "知识库", icon: <Database className="w-4 h-4" />, href: "/members/knowledge" },
  { id: "tools", label: "工具", icon: <Wrench className="w-4 h-4" />, href: "/members/tools" },
  { id: "services", label: "服务", icon: <Globe className="w-4 h-4" />, href: "/members/services" },
];

export default function MembersLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <div className="flex h-full">
      {/* 二级菜单栏 */}
      <div className="w-44 shrink-0 border-r border-border bg-card/50 p-3 flex flex-col gap-1">
        <div className="px-2 py-1.5 mb-1">
          <h2 className="text-sm font-semibold text-foreground">数字成员</h2>
        </div>
        {subNavItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <button
              key={item.id}
              onClick={() => router.push(item.href)}
              className={cn(
                "flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors w-full text-left",
                isActive
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>

      {/* 内容区 */}
      <div className="flex-1 overflow-y-auto">
        {children}
      </div>
    </div>
  );
}
