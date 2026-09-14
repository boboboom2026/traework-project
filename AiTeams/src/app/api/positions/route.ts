import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";
import { syncAgentSystemPrompt } from "./utils";

// 重新导出，供其他路由使用
export { syncAgentSystemPrompt };

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const teamId = searchParams.get("teamId");
    const id = searchParams.get("id");

    if (!teamId) {
      return NextResponse.json({ error: "teamId 参数缺失" }, { status: 400 });
    }

    const client = getSupabaseClient();

    if (id) {
      // 单个岗位详情（含智能体列表和技能列表）
      const { data: position, error } = await client
        .from("positions")
        .select("*")
        .eq("id", id)
        .eq("team_id", teamId)
        .single();

      if (error) {
        const notFound = error.code === "PGRST116" || (error as any).details?.includes("0 rows");
        return NextResponse.json(
          { error: notFound ? "岗位不存在" : "查询失败" },
          { status: notFound ? 404 : 500 }
        );
      }

      // 获取岗位下的智能体
      const { data: agents } = await client
        .from("agents")
        .select("id, name, avatar, status")
        .eq("position_id", id)
        .eq("is_active", true);

      // 获取岗位下的技能（职能工作）
      const { data: skills } = await client
        .from("skills")
        .select("id, name, description, content, source_type, created_at")
        .eq("position_id", id)
        .order("created_at", { ascending: true });

      return NextResponse.json({
        success: true,
        data: position,
        agents: agents || [],
        skills: skills || [],
      });
    }

    // 获取部门列表
    const { data: depts } = await client
      .from("departments")
      .select("id, name")
      .eq("team_id", teamId);
    const deptMap = new Map((depts || []).map(d => [d.id, d.name]));

    // 列表查询
    const { data, error } = await client
      .from("positions")
      .select("id, name, description, icon, color, status, job_works, department_id, created_at")
      .eq("team_id", teamId)
      .order("created_at", { ascending: false });

    if (error) return NextResponse.json({ error: "查询失败" }, { status: 500 });

    // 获取每个岗位的智能体数量和技能数量
    const positionsWithCounts = await Promise.all(
      (data || []).map(async (pos) => {
        const { count: agentCount } = await client
          .from("agents")
          .select("*", { count: "exact", head: true })
          .eq("position_id", pos.id)
          .eq("status", "active");

        const { count: skillCount } = await client
          .from("skills")
          .select("*", { count: "exact", head: true })
          .eq("position_id", pos.id);

        return {
          ...pos,
          jobWorks: typeof pos.job_works === 'string' ? JSON.parse(pos.job_works) : (pos.job_works || []),
          departmentId: pos.department_id,
          departmentName: pos.department_id ? deptMap.get(pos.department_id) || null : null,
          agentCount: agentCount || 0,
          skillCount: skillCount || 0,
        };
      })
    );

    return NextResponse.json({ success: true, data: positionsWithCounts });
  } catch (error) {
    console.error("获取岗位列表失败:", error);
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { teamId, name, description, icon, color, departmentId, department_id } = body;

    if (!teamId || !name?.trim()) {
      return NextResponse.json({ error: "参数错误" }, { status: 400 });
    }

    const client = getSupabaseClient();
    const deptId = departmentId || department_id || null;

    // 创建岗位（不再自动创建智能体）
    const { data, error } = await client
      .from("positions")
      .insert({
        team_id: teamId,
        name: name.trim(),
        description: description?.trim() || null,
        icon: icon || "Briefcase",
        color: color || "#3B82F6",
        department_id: deptId || null,
        created_by: body.createdBy || null,
      })
      .select("id, name, description, icon, color, status, department_id, created_at")
      .single();

    if (error) return NextResponse.json({ error: "创建失败" }, { status: 500 });

    return NextResponse.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error("创建岗位失败:", error);
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { searchParams } = new URL(request.url);
    const queryId = searchParams.get("id");
    const { id: bodyId, name, description, icon, color, status, job_works, jobWorks, departmentId, department_id } = body;
    const id = queryId || bodyId;

    if (!id) {
      return NextResponse.json({ error: "参数错误" }, { status: 400 });
    }

    const client = getSupabaseClient();
    const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (name !== undefined) updateData.name = name.trim();
    if (description !== undefined) updateData.description = description?.trim() || null;
    if (icon !== undefined) updateData.icon = icon;
    if (color !== undefined) updateData.color = color;
    if (status !== undefined) updateData.status = status;
    if (departmentId !== undefined) updateData.department_id = departmentId || null;
    if (department_id !== undefined) updateData.department_id = department_id || null;
    if (job_works !== undefined) updateData.job_works = JSON.stringify(job_works);
    else if (jobWorks !== undefined) updateData.job_works = JSON.stringify(jobWorks);

    const { data, error } = await client
      .from("positions")
      .update(updateData)
      .eq("id", id)
      .select("id, name, description, icon, color, status, department_id, created_at")
      .single();

    if (error) return NextResponse.json({ error: "更新失败" }, { status: 500 });

    // 同步更新关联智能体的名称、描述和 system_prompt（含最新岗位职责+技能）
    if (name !== undefined || description !== undefined) {
      const agentUpdate: Record<string, unknown> = {};
      if (name !== undefined) agentUpdate.name = `${name.trim()}AI助手`;
      if (description !== undefined) agentUpdate.description = description?.trim() || null;

      if (Object.keys(agentUpdate).length > 0) {
        await client.from("agents").update(agentUpdate).eq("position_id", id).eq("status", "active");
      }

      // 同步 system_prompt（含最新岗位职责+技能）
      await syncAgentSystemPrompt(client, id);
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("更新岗位失败:", error);
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "参数错误" }, { status: 400 });
    }

    const client = getSupabaseClient();

    // 软删除该岗位下所有智能体
    await client.from("agents").update({ status: "deleted", position_id: null, updated_at: new Date().toISOString() }).eq("position_id", id);

    // 删除岗位下的技能
    await client.from("skills").delete().eq("position_id", id);

    // 删除岗位
    const { error } = await client.from("positions").delete().eq("id", id);

    if (error) return NextResponse.json({ error: "删除失败" }, { status: 500 });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("删除岗位失败:", error);
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}