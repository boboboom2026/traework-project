"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search as SearchIcon, Hash, Users, FileText, MessageSquare, X, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface SearchResult {
  id: string;
  type: "message" | "channel" | "user";
  title: string;
  content: string;
  meta?: string;
  link?: string;
  created_at?: string;
}

interface SearchResponse {
  success: boolean;
  items: SearchResult[];
  total: number;
  page: number;
  limit: number;
  error?: string;
}

export default function SearchPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(searchParams.get("q") || "");
  const [hasSearched, setHasSearched] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults([]);
      setTotal(0);
      setError("");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}&type=all&limit=30`);
      const data: SearchResponse = await res.json();

      if (data.success) {
        setResults(data.items);
        setTotal(data.total);
      } else {
        setError(data.error || "搜索失败");
        setResults([]);
        setTotal(0);
      }
    } catch (e: any) {
      setError(e.message || "搜索请求失败");
      setResults([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const q = searchParams.get("q");
    if (q) {
      setQuery(q);
      setHasSearched(true);
      doSearch(q);
    }
  }, [searchParams, doSearch]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      router.push(`/search?q=${encodeURIComponent(query)}`);
      setHasSearched(true);
    }
  };

  const handleClear = () => {
    setQuery("");
    setResults([]);
    setTotal(0);
    setError("");
    setHasSearched(false);
    router.push("/search");
  };

  const handleNavigate = (result: SearchResult) => {
    if (result.link) {
      router.push(result.link);
    }
  };

  const getIcon = (type: string) => {
    switch (type) {
      case "message":
        return <MessageSquare className="w-4 h-4" />;
      case "channel":
        return <Hash className="w-4 h-4" />;
      case "user":
        return <Users className="w-4 h-4" />;
      default:
        return <SearchIcon className="w-4 h-4" />;
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case "message": return "text-blue-500";
      case "channel": return "text-emerald-500";
      case "user": return "text-violet-500";
      default: return "text-muted-foreground";
    }
  };

  const filteredByType = (type: string) => {
    if (type === "all") return results;
    return results.filter((r) => r.type === type);
  };

  const counts = {
    all: results.length,
    messages: results.filter((r) => r.type === "message").length,
    channels: results.filter((r) => r.type === "channel").length,
    users: results.filter((r) => r.type === "user").length,
  };

  return (
    <div className="h-full flex flex-col">
      {/* 搜索框 */}
      <div className="p-4 border-b border-border">
        <form onSubmit={handleSearch} className="relative max-w-2xl mx-auto">
          <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
          <Input
            type="search"
            placeholder="搜索消息、用户、频道..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-12 pr-12 h-12 text-base"
            autoFocus
          />
          {query && (
            <button
              type="button"
              onClick={handleClear}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </form>
      </div>

      {/* 搜索结果 */}
      <div className="flex-1 overflow-auto p-4">
        {!hasSearched ? (
          <div className="text-center py-12 text-muted-foreground">
            <SearchIcon className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p className="text-lg">输入关键词开始搜索</p>
            <p className="text-sm mt-2">可以搜索消息、用户和频道</p>
          </div>
        ) : loading ? (
          <div className="max-w-2xl mx-auto">
            <div className="space-y-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="flex items-start gap-3 p-4 rounded-lg animate-pulse">
                  <div className="w-4 h-4 bg-muted rounded mt-1" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-muted rounded w-24" />
                    <div className="h-3 bg-muted rounded w-full" />
                    <div className="h-3 bg-muted rounded w-32" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : error ? (
          <div className="max-w-2xl mx-auto text-center py-12 text-muted-foreground">
            <p className="text-red-500 text-lg">搜索出错</p>
            <p className="text-sm mt-2">{error}</p>
          </div>
        ) : query.trim() === "" ? (
          <div className="text-center py-12 text-muted-foreground">
            <SearchIcon className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>请输入搜索关键词</p>
          </div>
        ) : total === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <p className="text-lg">未找到相关结果</p>
            <p className="text-sm mt-2">尝试其他关键词</p>
          </div>
        ) : (
          <div className="max-w-2xl mx-auto">
            <p className="text-sm text-muted-foreground mb-4">
              找到 {total} 个结果
            </p>

            <Tabs defaultValue="all" className="w-full">
              <TabsList className="w-full justify-start">
                <TabsTrigger value="all">
                  全部 ({counts.all})
                </TabsTrigger>
                <TabsTrigger value="messages">
                  消息 ({counts.messages})
                </TabsTrigger>
                <TabsTrigger value="channels">
                  频道 ({counts.channels})
                </TabsTrigger>
                <TabsTrigger value="users">
                  用户 ({counts.users})
                </TabsTrigger>
              </TabsList>

              {["all", "messages", "channels", "users"].map((tabType) => (
                <TabsContent key={tabType} value={tabType} className="mt-4">
                  <div className="space-y-2">
                    {filteredByType(tabType).map((result) => (
                      <ResultCard
                        key={result.id}
                        result={result}
                        icon={getIcon(result.type)}
                        colorClass={getTypeColor(result.type)}
                        onClick={() => handleNavigate(result)}
                      />
                    ))}
                  </div>
                </TabsContent>
              ))}
            </Tabs>
          </div>
        )}
      </div>
    </div>
  );
}

function ResultCard({
  result,
  icon,
  colorClass,
  onClick,
}: {
  result: SearchResult;
  icon: React.ReactNode;
  colorClass: string;
  onClick: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className="flex items-start gap-3 p-4 rounded-lg hover:bg-muted/50 cursor-pointer transition-colors"
    >
      <div className={cn("mt-1", colorClass)}>{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm text-foreground truncate">{result.title}</span>
          <span className="text-xs text-muted-foreground shrink-0">{result.meta}</span>
        </div>
        <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{result.content}</p>
      </div>
    </div>
  );
}