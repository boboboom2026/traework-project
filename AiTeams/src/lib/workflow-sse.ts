/**
 * 工作流 SSE 事件辅助函数
 * 用于在工作流执行过程中向客户端推送进度事件
 */

import { WorkflowEvent } from "@/lib/workflow-executor";

/**
 * 将工作流事件序列化为 SSE 数据格式
 */
export function serializeWorkflowEvent(event: WorkflowEvent): string {
  let eventType: string;

  switch (event.type) {
    case "step_start":
      eventType = "workflow_step_start";
      break;
    case "step_complete":
      eventType = "workflow_step_complete";
      break;
    case "step_error":
      eventType = "workflow_step_error";
      break;
    case "waiting_human":
      eventType = "workflow_waiting_human";
      break;
    case "workflow_complete":
      eventType = "workflow_complete";
      break;
    case "branch_taken":
      eventType = "workflow_branch_taken";
      break;
    default:
      eventType = "workflow_event";
  }

  const data = JSON.stringify(event);
  return `event: ${eventType}\ndata: ${data}\n\n`;
}

/**
 * 创建 SSE 工作流事件写入器
 * 绑定到 WritableStream，用于在 API 路由中推送工作流事件
 */
export function createWorkflowSSEStream(
  writer: WritableStreamDefaultWriter<Uint8Array>
): (event: WorkflowEvent) => Promise<void> {
  return async (event: WorkflowEvent) => {
    const encoder = new TextEncoder();
    const sseData = serializeWorkflowEvent(event);
    try {
      await writer.write(encoder.encode(sseData));
    } catch (error) {
      console.error("写入工作流 SSE 事件失败:", error);
    }
  };
}