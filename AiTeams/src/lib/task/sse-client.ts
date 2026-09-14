"use client";

import type { TaskStreamEvent } from "./task-stream";

/**
 * 消费任务执行 SSE 流（fetch + reader，逐帧解析）。
 */
export async function consumeTaskStream(
  response: Response,
  onEvent: (event: TaskStreamEvent) => void,
): Promise<void> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("当前响应不支持流式读取");

  const decoder = new TextDecoder();
  let buffer = "";

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const frames = buffer.split("\n\n");
    buffer = frames.pop() ?? "";

    for (const frame of frames) {
      const line = frame
        .split("\n")
        .find((item) => item.startsWith("data:"));
      if (!line) continue;
      const payload = line.slice(5).trim();
      if (!payload) continue;
      try {
        onEvent(JSON.parse(payload) as TaskStreamEvent);
      } catch {
        // 忽略无法解析的帧，避免个别脏数据打断整个流
      }
    }
  }
}

/** 从非 2xx 响应里取出后端错误文案 */
export async function readStreamError(response: Response): Promise<string> {
  try {
    const json = (await response.json()) as { error?: string };
    if (json?.error) return json.error;
  } catch {
    // fallthrough
  }
  return `请求失败（${response.status}）`;
}
