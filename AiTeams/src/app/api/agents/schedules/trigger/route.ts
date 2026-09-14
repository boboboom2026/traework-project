import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";
import { executeScheduledTask } from "@/lib/scheduler-service";

// POST /api/agents/schedules/trigger - 手动触发一次调度任务（支持工具调用）
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const schedule_id = body.schedule_id || body.scheduleId;

    if (!schedule_id) {
      return NextResponse.json({ error: "缺少 schedule_id 参数" }, { status: 400 });
    }

    const client = getSupabaseClient();

    // 获取调度任务信息
    const { data: schedule, error: scheduleError } = await client
      .from("agent_schedules")
      .select("*")
      .eq("id", schedule_id)
      .single();

    if (scheduleError || !schedule) {
      return NextResponse.json({ error: "调度任务不存在" }, { status: 404 });
    }

    // 使用 scheduler-service 中的 executeScheduledTask 执行
    // 该函数支持 Function Calling 工具调用（web_search 等）
    await executeScheduledTask(schedule);

    return NextResponse.json({
      success: true,
      message: "任务已触发执行",
    });
  } catch (err) {
    console.error("触发调度任务异常:", err);
    return NextResponse.json({ error: "触发调度任务失败: " + (err instanceof Error ? err.message : String(err)) }, { status: 500 });
  }
}