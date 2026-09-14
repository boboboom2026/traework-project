/**
 * 任务（Task）执行过程的流式事件协议
 *
 * 服务端把「确定性内核」执行过程中产生的事件通过 SSE 外推，
 * 前端据此渲染步骤时间线与模型思考过程。
 */

import type { WorkflowEvent } from "@/lib/workflow/engine";

export interface TaskStreamRunShape {
  id: string;
  task_id: string;
  team_id: string;
  status: string;
  current_node_id: string | null;
  snapshot?: unknown;
  result?: unknown;
  error?: string | null;
  [key: string]: unknown;
}

export type TaskStreamEvent =
  /** 节点开始执行 */
  | { type: "node_start"; nodeId: string; nodeName?: string }
  /** 模型流式片段：reasoning=思考过程，content=生成内容 */
  | { type: "node_stream"; nodeId: string; kind: "reasoning" | "content"; text: string }
  /** 节点执行完成 */
  | {
      type: "node_complete";
      nodeId: string;
      nodeName?: string;
      durationMs: number;
      output?: unknown;
    }
  /** 节点执行出错 */
  | { type: "node_error"; nodeId?: string; message: string }
  /** 等待人工处理（审批/选择） */
  | { type: "waiting_human"; nodeId?: string; nodeName?: string; payload?: unknown; run?: TaskStreamRunShape }
  /** 工作流执行完成 */
  | { type: "completed"; run?: TaskStreamRunShape }
  /** 最新运行记录快照（挂起/结束时推送，前端据此刷新状态） */
  | { type: "run"; run?: TaskStreamRunShape | null }
  /** 执行失败 */
  | { type: "failed"; message: string }
  /** 流结束（无论成功失败都会发送） */
  | { type: "done" };

export const SSE_HEADERS = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
  "X-Accel-Buffering": "no",
} as const;

/**
 * 创建任务执行事件流。
 * 通过 write() 推事件，close() 结束流；客户端提前断开时写入会被静默忽略。
 */
export function createTaskStream() {
  const encoder = new TextEncoder();
  let controller: ReadableStreamDefaultController<Uint8Array> | null = null;
  let closed = false;

  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
    },
    cancel() {
      closed = true;
    },
  });

  const write = (event: TaskStreamEvent) => {
    if (closed || !controller) return;
    try {
      controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
    } catch {
      closed = true;
    }
  };

  const close = () => {
    if (closed) return;
    closed = true;
    try {
      controller?.close();
    } catch {
      /* 已关闭 */
    }
  };

  return { stream, write, close };
}

/**
 * 把工作流内核事件（WorkflowEvent）映射为任务流事件并写入。
 * startedAt 用于按节点统计耗时：node_start 记录起点，node_complete 取差值。
 */
export function mapEngineEvent(
  event: WorkflowEvent,
  ctx: {
    write: (event: TaskStreamEvent) => void;
    startedAt: Map<string, number>;
  },
): void {
  const { write, startedAt } = ctx;
  const nodeId = event.nodeId ?? "";

  switch (event.type) {
    case "step_start": {
      if (!nodeId) return;
      startedAt.set(nodeId, Date.now());
      write({ type: "node_start", nodeId, nodeName: event.nodeName });
      return;
    }
    case "step_complete": {
      const started = startedAt.get(nodeId);
      if (started !== undefined) startedAt.delete(nodeId);
      write({
        type: "node_complete",
        nodeId,
        nodeName: event.nodeName,
        durationMs: started !== undefined ? Date.now() - started : 0,
        output: event.payload,
      });
      return;
    }
    case "step_error": {
      const message = event.payload?.message;
      write({
        type: "node_error",
        nodeId: nodeId || undefined,
        message: typeof message === "string" && message ? message : "节点执行出错",
      });
      return;
    }
    case "waiting_human": {
      write({
        type: "waiting_human",
        nodeId: nodeId || undefined,
        nodeName: event.nodeName,
        payload: event.payload,
      });
      return;
    }
    case "workflow_complete": {
      write({ type: "completed" });
      return;
    }
    default:
      return;
  }
}
