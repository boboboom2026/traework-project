"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, History, ListChecks, Play, RotateCcw } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { NaturalInput, type InputKeySpec, type InputMode } from "@/components/tasks/natural-input";
import { RunTimeline, type TimelineStep } from "@/components/tasks/run-timeline";
import { MarkdownContent } from "@/components/ui/markdown";
import { cn } from "@/lib/utils";

/** 原型预览：模拟 5 种运行状态 */
type PreviewState = "idle" | "running" | "waiting" | "completed" | "failed";

const PREVIEW_STATES: Array<{ value: PreviewState; label: string }> = [
  { value: "idle", label: "未运行" },
  { value: "running", label: "运行中" },
  { value: "waiting", label: "待审批" },
  { value: "completed", label: "已完成" },
  { value: "failed", label: "失败" },
];

const INPUT_KEYS: InputKeySpec[] = [
  {
    key: "user_input",
    label: "你的需求",
    placeholder: "例如：帮我写一篇关于「AI 如何改变中小企业获客」的公众号文章，读者是企业老板，1200 字左右，语气专业但通俗",
    description: "这段描述会作为 user_input 传给「生成初稿」节点。",
  },
];

const REASONING_DRAFT = `拆解需求：
1. 主题是 AI 改变中小企业获客，不是泛泛讲 AI 趋势
2. 读者是企业老板 —— 关心成本、转化率、可落地性，不要术语堆砌
3. 1200 字左右 → 控制在 3 个核心论点，每个配一个案例
4. 语气专业但通俗 → 短句 + 类比，避免"赋能/抓手"这类黑话

结构规划：
- 开篇用具体场景切入（老板砸钱投流没效果）
- 三个论点：线索精准度、投放效率、跟进转化
- 结尾给行动建议 + 互动钩子

风险点：不能写成工具清单，必须始终回到"获客效率"这个主题词。`;

const DRAFT_MARKDOWN = `好不容易赚了点预算做活动，引来的都是薅羊毛的，转化率不到 5%。

其实不是获客越来越难，是你还在用 5 年前的老方法，跟已经用上 AI 的对手抢客户。今天掰扯清楚：普通人摸得着的 AI 工具，到底能帮中小企业把获客效率提多少。

---

## 第一：从"撒网"到"精准捞"，线索精准度直接翻 3 倍

传统获客是广撒网：投信息流、发传单、买名单，来 100 个人可能只有 3 个对口。

AI 的做法是先**定义画像**，再去**人群库里找相似的人**：把老客户的特征（行业、规模、区域、决策人职位）喂进去，系统会自动圈出一批高相似度线索。

> 一个做全屋定制的老板，把 40 个成交客户信息录进去，两周内圈出 320 条线索，最终签了 11 单，获客成本从 480 元降到 190 元。

## 第二：广告费再也不打水漂

同样的预算，AI 投放会**按小时调整人群包**：哪个素材在哪个时段转化好，预算就往哪里倾斜，而不是一投投一周再看报表。

## 第三：线索进来不流失

中小企业最大的浪费不是没线索，而是**线索来了没人跟**。晚上 9 点客户发来的咨询，第二天上午才回，人早就在别家下单了。

AI 客服能 7×24 小时应答初询、自动打标签、给出跟进话术。

---

## 给老板的三个行动建议

1. **先算账**：把你现在的获客成本算出来，这是后面一切对比的基准
2. **挑一个环节**：别一上来就全流程上 AI，优先做"线索筛选"或"AI 客服"
3. **从几百块的轻量工具开始**：不要一上来就买大几万的系统

互动：你最近在获客上遇到最大的难题是什么？评论区留言。`;

const FINAL_MARKDOWN = `${DRAFT_MARKDOWN.split("\n").slice(0, 8).join("\n")}

---

## 第一：从"撒网"到"精准捞"

传统获客是广撒网：投信息流、发传单、买名单，来 100 个人可能只有 3 个对口。AI 的做法是先定义画像，再去人群库里找相似的人。

> 一个做全屋定制的老板，把 40 个成交客户信息录进去，两周内圈出 320 条线索，最终签了 11 单。

## 第二：广告费再也不打水漂

同样预算，AI 投放按小时调整人群包：哪个素材、哪个时段转化好，预算就往哪里倾斜。

## 第三：线索进来不流失

晚上 9 点客户发来的咨询，第二天上午才回，人早就在别家下单了。AI 客服 7×24 小时应答初询、自动标签、给出跟进话术。

---

**给老板的三个行动建议**

1. 先算账：把现在的获客成本算出来
2. 挑一个环节：优先做"线索筛选"或"AI 客服"
3. 从几百块的轻量工具开始，别一上来就买大几万的系统

*（终稿已完成，全文共 1180 字，可在运行记录中导出）*`;

const USER_PROMPT =
  "帮我写一篇关于「AI 如何改变中小企业获客」的公众号文章，读者是企业老板，1200 字左右，语气专业但通俗";

interface PreviewData {
  steps: TimelineStep[];
  result?: string;
  error?: string;
  showApproval?: boolean;
}

function buildPreview(state: PreviewState): PreviewData {
  const base: TimelineStep[] = [
    { nodeId: "generate_draft", nodeName: "生成初稿", nodeType: "llm_generate", status: "pending" },
    { nodeId: "pengsi_review", nodeName: "彭Sir审批", nodeType: "human_review", status: "pending" },
    { nodeId: "finalize", nodeName: "最终成稿", nodeType: "llm_generate", status: "pending" },
  ];

  if (state === "idle") return { steps: base };

  if (state === "running") {
    return {
      steps: [
        {
          nodeId: "generate_draft",
          nodeName: "生成初稿",
          nodeType: "llm_generate",
          status: "running",
          reasoning: REASONING_DRAFT,
          content: DRAFT_MARKDOWN.slice(0, 260),
        },
        base[1],
        base[2],
      ],
    };
  }

  if (state === "failed") {
    return {
      steps: [
        {
          nodeId: "generate_draft",
          nodeName: "生成初稿",
          nodeType: "llm_generate",
          status: "error",
          durationMs: 2400,
          message: "模型调用失败：请求超时（30s），已自动重试 1 次",
        },
        base[1],
        base[2],
      ],
      error: "节点「生成初稿」执行失败，可修复后重新运行。",
    };
  }

  const done: TimelineStep[] = [
    {
      nodeId: "generate_draft",
      nodeName: "生成初稿",
      nodeType: "llm_generate",
      status: "done",
      durationMs: 8240,
      summary: "生成 1180 字初稿 → draft",
      reasoning: REASONING_DRAFT,
    },
    base[1],
    base[2],
  ];

  if (state === "waiting") {
    return {
      steps: [
        done[0],
        { ...base[1], status: "running", durationMs: 0, summary: "等待审批人处理：彭Sir（任一通过）" },
        base[2],
      ],
      showApproval: true,
    };
  }

  return {
    steps: [
      done[0],
      { ...base[1], status: "done", durationMs: 46000, summary: "审批通过 · 意见：标题再口语一点" },
      { ...base[2], status: "done", durationMs: 9120, summary: "生成 1180 字终稿 → result" },
    ],
    result: FINAL_MARKDOWN,
  };
}

function StateSwitch({ value, onChange }: { value: PreviewState; onChange: (next: PreviewState) => void }) {
  return (
    <div className="flex items-center gap-0.5 rounded-md border border-border bg-card p-0.5">
      {PREVIEW_STATES.map((item) => (
        <button
          key={item.value}
          type="button"
          onClick={() => onChange(item.value)}
          className={cn(
            "rounded-[calc(var(--radius)-4px)] px-2.5 py-1 text-xs transition-colors",
            value === item.value
              ? "bg-secondary text-secondary-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

export default function TaskRunPrototypePage() {
  const [preview, setPreview] = useState<PreviewState>("waiting");
  const [mode, setMode] = useState<InputMode>("natural");
  const [values, setValues] = useState<Record<string, string>>({ user_input: USER_PROMPT });
  const [rawJson, setRawJson] = useState<string>(JSON.stringify({ user_input: USER_PROMPT }, null, 2));

  const data = useMemo(() => buildPreview(preview), [preview]);
  const busy = preview === "running";

  return (
    <div className="flex h-full flex-col">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border px-6 py-3">
        <div className="flex items-center gap-3">
          <Link
            href="/tasks"
            className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="返回任务列表"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-semibold text-foreground">执行任务</h1>
              <Badge variant="secondary" className="text-[10px] font-normal">
                原型预览
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">公众号文章</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <StateSwitch value={preview} onChange={setPreview} />
          <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" disabled>
            <History className="h-3.5 w-3.5" />
            运行记录
          </Button>
          <Button size="sm" className="h-8 gap-1.5 text-xs" disabled={busy}>
            {preview === "failed" ? <RotateCcw className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
            {busy ? "运行中…" : preview === "failed" ? "重新运行" : "运行"}
          </Button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
        <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
          <aside className="space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <ListChecks className="h-4 w-4 text-muted-foreground" />
                  流程概览
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {data.steps.map((step, index) => (
                  <div key={step.nodeId} className="flex items-start gap-2.5">
                    <span
                      className={cn(
                        "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border text-[10px]",
                        step.status === "done" && "border-primary/40 bg-primary/10 text-primary",
                        step.status === "running" && "border-primary bg-primary/15 text-primary",
                        step.status === "error" && "border-destructive/40 bg-destructive/10 text-destructive",
                        step.status === "pending" && "border-border text-muted-foreground",
                      )}
                    >
                      {index + 1}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium text-foreground">{step.nodeName}</p>
                      <p className="truncate font-mono text-[10px] text-muted-foreground">{step.nodeType}</p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">初始输入</CardTitle>
                <CardDescription className="text-xs">
                  用自然语言描述需求，无需关心底层字段名
                </CardDescription>
              </CardHeader>
              <CardContent>
                <NaturalInput
                  keys={INPUT_KEYS}
                  mode={mode}
                  onModeChange={setMode}
                  values={values}
                  onValuesChange={setValues}
                  rawJson={rawJson}
                  onRawJsonChange={setRawJson}
                />
              </CardContent>
            </Card>
          </aside>

          <section className="min-w-0 space-y-3">
            <Card className="overflow-hidden">
              <CardHeader className="border-b border-border pb-3">
                <CardTitle className="flex items-center justify-between text-sm">
                  <span>对话区</span>
                  <Badge variant="outline" className="text-[10px] font-normal text-muted-foreground">
                    原型数据 · 非真实执行
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 pt-4">
                {preview === "idle" ? (
                  <p className="py-10 text-center text-xs text-muted-foreground">
                    点击「运行」启动一个任务实例
                  </p>
                ) : (
                  <>
                    <div className="flex justify-end">
                      <div className="max-w-[85%] rounded-lg rounded-br-sm bg-primary px-3.5 py-2.5 text-sm leading-relaxed text-primary-foreground">
                        {USER_PROMPT}
                      </div>
                    </div>

                    <div className="flex gap-3">
                      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-secondary text-[11px] font-medium text-secondary-foreground">
                        AI
                      </span>
                      <div className="min-w-0 flex-1 space-y-3">
                        <RunTimeline steps={data.steps} />

                        {data.showApproval && (
                          <div className="rounded-lg border border-border bg-card p-4">
                            <div className="mb-2 flex items-center gap-2">
                              <Badge variant="secondary" className="text-[10px] font-normal">
                                待你审批
                              </Badge>
                              <span className="text-xs text-muted-foreground">指定成员 · 任一通过</span>
                            </div>
                            <p className="mb-2 text-xs font-medium text-foreground">初稿预览</p>
                            <div className="max-h-72 overflow-y-auto rounded-md border border-border bg-background/60 p-3">
                              <MarkdownContent content={DRAFT_MARKDOWN} />
                            </div>
                            <Separator className="my-3" />
                            <div className="flex items-center gap-2">
                              <input
                                className="h-8 flex-1 rounded-md border border-input bg-background px-2.5 text-xs outline-none placeholder:text-muted-foreground focus-visible:border-ring"
                                placeholder="审批意见（可选），如：标题再口语一点"
                              />
                              <Button variant="outline" size="sm" className="h-8 text-xs">
                                驳回
                              </Button>
                              <Button size="sm" className="h-8 text-xs">
                                通过
                              </Button>
                            </div>
                          </div>
                        )}

                        {data.result && (
                          <div className="rounded-lg border border-border bg-card p-4">
                            <div className="mb-2 flex items-center gap-2">
                              <Badge className="text-[10px] font-normal">已完成</Badge>
                              <span className="text-xs text-muted-foreground">最终成稿 · 1180 字</span>
                            </div>
                            <div className="max-h-96 overflow-y-auto rounded-md border border-border bg-background/60 p-4">
                              <MarkdownContent content={data.result} />
                            </div>
                          </div>
                        )}

                        {data.error && (
                          <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3.5">
                            <p className="flex-1 text-xs text-destructive">{data.error}</p>
                            <Button variant="outline" size="sm" className="h-8 shrink-0 text-xs">
                              重新运行
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardContent className="py-3">
                <div className="flex items-end gap-2">
                  <textarea
                    rows={2}
                    disabled
                    placeholder="继续对话，例如：把字数压到 800，标题更口语一点…"
                    className="min-h-[52px] flex-1 resize-none rounded-md border border-input bg-background px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring disabled:cursor-not-allowed disabled:opacity-60"
                  />
                  <Button size="sm" className="h-9 shrink-0 text-xs" disabled>
                    发送
                  </Button>
                </div>
                <p className="mt-2 text-[11px] text-muted-foreground">
                  原型阶段：底部输入区用于演示多轮修改（正式版将结合驳回重跑 / 追加输入实现）
                </p>
              </CardContent>
            </Card>
          </section>
        </div>
      </div>
    </div>
  );
}
