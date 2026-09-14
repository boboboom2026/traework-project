import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";
import { calculateNextRun } from "./cron-utils";

// GET /api/agents/schedules?teamId=xxx&agentId=xxx
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const teamId = searchParams.get("teamId");
    const agentId = searchParams.get("agentId");

    if (!teamId) {
      return NextResponse.json({ error: "缺少 teamId 参数" }, { status: 400 });
    }

    const client = getSupabaseClient();
    let query = client
      .from("agent_schedules")
      .select("*")
      .eq("team_id", teamId)
      .order("created_at", { ascending: false });

    if (agentId) {
      query = query.eq("agent_id", agentId);
    }

    const { data, error } = await query;
    if (error) {
      console.error("查询调度任务失败:", error);
      return NextResponse.json({ error: "查询调度任务失败" }, { status: 500 });
    }

    return NextResponse.json(data || []);
  } catch (err) {
    console.error("查询调度任务异常:", err);
    return NextResponse.json({ error: "查询调度任务失败" }, { status: 500 });
  }
}

// POST /api/agents/schedules
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const team_id = body.team_id || body.teamId;
    const agent_id = body.agent_id || body.agentId;
    const name = body.name;
    const description = body.description;
    const schedule_type = body.schedule_type || body.scheduleType;
    const cron_expr = body.cron_expr || body.cronExpr;
    const interval_ms = body.interval_ms || body.intervalMs;
    const at_time = body.at_time || body.atTime;
    const timezone = body.timezone;
    const trigger_msg = body.trigger_msg || body.triggerMsg;
    const target_type = body.target_type || body.targetType;
    const target_id = body.target_id || body.targetId;
    const model_override = body.model_override || body.modelOverride;
    const thinking_override = body.thinking_override || body.thinkingOverride;
    const session_target = body.session_target || body.sessionTarget;
    const timeout_ms = body.timeout_ms || body.timeoutMs;
    const delete_after_run = body.delete_after_run || body.deleteAfterRun;
    const enabled = body.enabled;
    const created_by = body.created_by || body.createdBy;

    if (!team_id || !agent_id || !name || !trigger_msg || !target_type || !target_id) {
      return NextResponse.json({ error: "缺少必填参数" }, { status: 400 });
    }

    // Calculate next_run_at
    const nextRunAt = calculateNextRun(
      schedule_type || "cron",
      cron_expr,
      interval_ms,
      at_time,
      timezone || "Asia/Shanghai"
    );

    const client = getSupabaseClient();
    const { data, error } = await client
      .from("agent_schedules")
      .insert({
        team_id,
        agent_id,
        name,
        description: description || null,
        schedule_type: schedule_type || "cron",
        cron_expr: cron_expr || null,
        interval_ms: interval_ms || null,
        at_time: at_time || null,
        timezone: timezone || "Asia/Shanghai",
        trigger_msg,
        target_type,
        target_id,
        model_override: model_override || null,
        thinking_override: thinking_override || null,
        session_target: session_target || "isolated",
        timeout_ms: timeout_ms || 120000,
        delete_after_run: delete_after_run || false,
        next_run_at: nextRunAt,
        enabled: enabled !== false,
        created_by: created_by || null,
      })
      .select()
      .single();

    if (error) {
      console.error("创建调度任务失败:", error);
      return NextResponse.json({ error: "创建调度任务失败: " + error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (err) {
    console.error("创建调度任务异常:", err);
    return NextResponse.json({ error: "创建调度任务失败" }, { status: 500 });
  }
}

// PUT /api/agents/schedules
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, ...rest } = body;

    if (!id) {
      return NextResponse.json({ error: "缺少任务 ID" }, { status: 400 });
    }

    // Convert camelCase to snake_case for Supabase
    const updates: Record<string, unknown> = {};
    if (rest.agentId !== undefined) updates.agent_id = rest.agentId;
    if (rest.name !== undefined) updates.name = rest.name;
    if (rest.description !== undefined) updates.description = rest.description;
    if (rest.scheduleType !== undefined) updates.schedule_type = rest.scheduleType;
    if (rest.cronExpr !== undefined) updates.cron_expr = rest.cronExpr;
    if (rest.intervalMs !== undefined) updates.interval_ms = rest.intervalMs;
    if (rest.atTime !== undefined) updates.at_time = rest.atTime;
    if (rest.triggerMsg !== undefined) updates.trigger_msg = rest.triggerMsg;
    if (rest.targetType !== undefined) updates.target_type = rest.targetType;
    if (rest.targetId !== undefined) updates.target_id = rest.targetId;
    if (rest.enabled !== undefined) updates.enabled = rest.enabled;
    if (rest.timezone !== undefined) updates.timezone = rest.timezone;
    if (rest.sessionTarget !== undefined) updates.session_target = rest.sessionTarget;
    if (rest.modelOverride !== undefined) updates.model_override = rest.modelOverride;
    if (rest.thinkingOverride !== undefined) updates.thinking_override = rest.thinkingOverride;
    if (rest.timeoutMs !== undefined) updates.timeout_ms = rest.timeoutMs;
    if (rest.deleteAfterRun !== undefined) updates.delete_after_run = rest.deleteAfterRun;

    // Recalculate next_run_at if schedule changed
    if (updates.schedule_type || updates.cron_expr || updates.interval_ms || updates.at_time || updates.timezone) {
      const scheduleType = updates.schedule_type as string | undefined;
      const cronExpr = updates.cron_expr as string | undefined;
      const intervalMs = updates.interval_ms as number | null | undefined;
      const atTime = updates.at_time as string | null | undefined;
      const timezone = updates.timezone as string | undefined;

      const client = getSupabaseClient();
      const { data: current } = await client
        .from("agent_schedules")
        .select("schedule_type, cron_expr, interval_ms, at_time, timezone")
        .eq("id", id)
        .single();

      if (current) {
        const merged = {
          schedule_type: scheduleType ?? current.schedule_type,
          cron_expr: cronExpr ?? current.cron_expr,
          interval_ms: intervalMs ?? current.interval_ms,
          at_time: atTime ?? current.at_time,
          timezone: timezone ?? (current.timezone || "Asia/Shanghai"),
        };
        updates.next_run_at = calculateNextRun(
          merged.schedule_type,
          merged.cron_expr,
          merged.interval_ms,
          merged.at_time,
          merged.timezone || "Asia/Shanghai"
        );
      }
    }

    const client = getSupabaseClient();
    const { data, error } = await client
      .from("agent_schedules")
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.error("更新调度任务失败:", error);
      return NextResponse.json({ error: "更新调度任务失败: " + error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (err) {
    console.error("更新调度任务异常:", err);
    return NextResponse.json({ error: "更新调度任务失败" }, { status: 500 });
  }
}

// DELETE /api/agents/schedules?id=xxx
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "缺少任务 ID" }, { status: 400 });
    }

    const client = getSupabaseClient();
    const { error } = await client
      .from("agent_schedules")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("删除调度任务失败:", error);
      return NextResponse.json({ error: "删除调度任务失败" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("删除调度任务异常:", err);
    return NextResponse.json({ error: "删除调度任务失败" }, { status: 500 });
  }
}
