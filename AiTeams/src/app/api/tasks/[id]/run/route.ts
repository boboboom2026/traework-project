import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";
import { getTeamMembership, requireAuth } from "@/lib/api-auth";
import { runTask } from "@/lib/task/task-runner";
import {
  SSE_HEADERS,
  createTaskStream,
  mapEngineEvent,
} from "@/lib/task/task-stream";
import type { TaskStreamRunShape } from "@/lib/task/task-stream";
import type { WorkflowDefinitionV2 } from "@/lib/workflow/types";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * 启动任务实例（SSE 流式）
 *
 * 响应为 text/event-stream，事件见 src/lib/task/task-stream.ts：
 *   node_start / node_stream / node_complete / node_error / waiting_human / run / failed / done
 * 参数校验失败时仍返回普通 JSON 错误（便于前端统一 toast）。
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireAuth(request);
    const { id } = await context.params;

    const body = (await request.json().catch(() => ({}))) as {
      input?: Record<string, unknown>;
    };

    const client = getSupabaseClient();

    const { data: task } = await client
      .from("tasks")
      .select("id, team_id, definition, status")
      .eq("id", id)
      .maybeSingle();

    if (!task) {
      return NextResponse.json({ error: "任务不存在" }, { status: 404 });
    }

    const membership = await getTeamMembership(client, auth.id, task.team_id);
    if (!membership) {
      return NextResponse.json({ error: "无权访问该任务" }, { status: 403 });
    }

    const definition = task.definition as WorkflowDefinitionV2 | null;
    if (!definition?.nodes?.length) {
      return NextResponse.json({ error: "任务未配置流程" }, { status: 400 });
    }

    const initialState: Record<string, unknown> =
      body.input && typeof body.input === "object" ? body.input : {};

    const { stream, write, close } = createTaskStream();
    const startedAt = new Map<string, number>();

    // 后台执行：边跑边把事件推给前端
    void (async () => {
      try {
        const result = await runTask(
          { teamId: task.team_id, userId: auth.id },
          {
            taskId: id,
            definition,
            initialState,
            onEvent: (event) => mapEngineEvent(event, { write, startedAt }),
            onStream: (e) =>
              write({
                type: "node_stream",
                nodeId: e.nodeId,
                kind: e.kind,
                text: e.text,
              }),
          },
        );

        const { data: run } = await client
          .from("task_runs")
          .select("*")
          .eq("id", result.runId)
          .maybeSingle();

        write({
          type: "run",
          run: (run ?? null) as TaskStreamRunShape | null,
        });
      } catch (err) {
        console.error("启动任务失败:", err);
        write({
          type: "failed",
          message: err instanceof Error ? err.message : "任务执行失败",
        });
      } finally {
        write({ type: "done" });
        close();
      }
    })();

    return new Response(stream, { headers: SSE_HEADERS });
  } catch (error) {
    if (error instanceof NextResponse) return error;
    console.error("启动任务失败:", error);
    return NextResponse.json({ error: "启动任务失败" }, { status: 500 });
  }
}
