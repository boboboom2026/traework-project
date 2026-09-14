import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";
import { getTeamMembership, isTeamAdmin, requireAuth } from "@/lib/api-auth";
import { resumeTask } from "@/lib/task/task-runner";
import {
  SSE_HEADERS,
  createTaskStream,
  mapEngineEvent,
} from "@/lib/task/task-stream";
import type { TaskStreamRunShape } from "@/lib/task/task-stream";
import type { ResumeSignal, WorkflowDefinitionV2, WorkflowNode } from "@/lib/workflow/types";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * 恢复挂起中的任务（SSE 流式）
 *
 * 与 /run 一致：校验失败返回 JSON 错误，校验通过后以 text/event-stream 推送后续节点执行过程。
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireAuth(request);
    const { id } = await params;
    const client = getSupabaseClient();

    const body = await request.json().catch(() => ({}));
    const runId = body.runId as string | undefined;
    const signal = body.signal as ResumeSignal | undefined;

    if (!runId || !signal || typeof signal.decision !== "string") {
      return NextResponse.json(
        { error: "缺少 runId 或 signal.decision" },
        { status: 400 },
      );
    }

    // 读取任务定义
    const { data: task, error: taskError } = await client
      .from("tasks")
      .select("*")
      .eq("id", id)
      .single();

    if (taskError || !task) {
      return NextResponse.json({ error: "任务不存在" }, { status: 404 });
    }

    // 仅任务所属团队成员可处理
    const membership = await getTeamMembership(client, auth.id, task.team_id as string);
    if (!membership) {
      return NextResponse.json({ error: "无权处理该任务" }, { status: 403 });
    }

    const definition = task.definition as WorkflowDefinitionV2 | null;
    if (!definition || !Array.isArray(definition.nodes)) {
      return NextResponse.json({ error: "任务编排无效" }, { status: 400 });
    }

    // 校验 run 归属
    const { data: run } = await client
      .from("task_runs")
      .select("id, task_id, status, current_node_id")
      .eq("id", runId)
      .single();

    if (!run || run.task_id !== id) {
      return NextResponse.json({ error: "运行记录不存在" }, { status: 404 });
    }

    // 已结束的运行不再允许恢复（快照在终态会被清空，直接恢复会 500）
    if (run.status === "completed" || run.status === "failed" || run.status === "canceled") {
      return NextResponse.json({ error: "该运行已结束，无需再次处理" }, { status: 400 });
    }

    // 审批权限校验：human_review 节点若指定了具体审批人，
    // 仅名单内成员或团队管理者（owner/admin）可代为处理。
    const currentNode = (definition.nodes as WorkflowNode[]).find(
      (n) => n.id === run.current_node_id,
    );
    const reviewConfig = currentNode?.human_review_config;
    const approverIds = reviewConfig?.approver_ids ?? [];
    if (
      currentNode?.type === "human_review" &&
      reviewConfig?.approver_type === "user" &&
      approverIds.length > 0 &&
      !approverIds.includes(auth.id)
    ) {
      const isAdmin = await isTeamAdmin(client, auth.id, task.team_id as string);
      if (!isAdmin) {
        return NextResponse.json(
          { error: "你不是该节点的指定审批人，无权审批" },
          { status: 403 },
        );
      }
    }

    const { stream, write, close } = createTaskStream();
    const startedAt = new Map<string, number>();

    void (async () => {
      try {
        await resumeTask(
          { teamId: task.team_id as string, userId: auth.id },
          {
            runId,
            taskId: id,
            definition,
            signal: { ...signal, actorId: auth.id },
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

        const { data: updated } = await client
          .from("task_runs")
          .select("*")
          .eq("id", runId)
          .maybeSingle();

        write({
          type: "run",
          run: (updated ?? null) as TaskStreamRunShape | null,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : "";
        console.error("恢复任务失败:", err);
        write({
          type: "failed",
          message: message.includes("快照")
            ? "该运行没有可恢复的快照，可能已结束"
            : message || "恢复任务失败",
        });
      } finally {
        write({ type: "done" });
        close();
      }
    })();

    return new Response(stream, { headers: SSE_HEADERS });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    console.error("恢复任务失败:", e);
    return NextResponse.json({ error: "恢复任务失败" }, { status: 500 });
  }
}
