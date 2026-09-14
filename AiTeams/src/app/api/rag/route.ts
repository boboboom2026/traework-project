import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";

// 获取 RAG 知识库列表
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const teamId = searchParams.get("teamId");

    if (!teamId) {
      return NextResponse.json({ error: "团队ID不能为空" }, { status: 400 });
    }

    const client = getSupabaseClient();

    const { data, error } = await client
      .from("rag_datasets")
      .select("id, name, description, document_count, sync_config, status, created_by, created_at, updated_at")
      .eq("team_id", teamId)
      .eq("status", "active")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("查询知识库失败:", error);
      return NextResponse.json({ error: "查询知识库失败" }, { status: 500 });
    }

    // 获取创建人信息
    const creatorIds = [...new Set((data || []).map((d: { created_by: string | null }) => d.created_by).filter(Boolean))];
    const creatorMap: Record<string, string> = {};
    if (creatorIds.length > 0) {
      const { data: creatorsData } = await client
        .from("users")
        .select("id, name")
        .in("id", creatorIds);
      if (creatorsData) {
        for (const c of creatorsData) {
          creatorMap[c.id as string] = c.name as string;
        }
      }
    }

    // 获取所有数据集的文档状态分布
    const datasetIds = (data || []).map((d: Record<string, unknown>) => d.id as string);
    const docStatusMap: Record<string, { ready: number; processing: number; pending: number; failed: number; total: number }> = {};

    if (datasetIds.length > 0) {
      const { data: docStats } = await client
        .from("rag_documents")
        .select("dataset_id, status")
        .in("dataset_id", datasetIds);

      if (docStats) {
        for (const doc of docStats) {
          const dsId = doc.dataset_id as string;
          if (!docStatusMap[dsId]) {
            docStatusMap[dsId] = { ready: 0, processing: 0, pending: 0, failed: 0, total: 0 };
          }
          docStatusMap[dsId].total++;
          switch (doc.status) {
            case "ready": docStatusMap[dsId].ready++; break;
            case "processing": docStatusMap[dsId].processing++; break;
            case "pending": docStatusMap[dsId].pending++; break;
            case "failed": docStatusMap[dsId].failed++; break;
          }
        }
      }
    }

    const datasets = (data || []).map((d: Record<string, unknown>) => {
      const dsId = d.id as string;
      const stats = docStatusMap[dsId];

      // 计算 syncStatus
      let syncStatus: string;
      if (!stats || stats.total === 0) {
        syncStatus = "empty";
      } else if (stats.failed > 0 && stats.ready + stats.processing + stats.pending === 0) {
        syncStatus = "all_failed";
      } else if (stats.failed > 0) {
        syncStatus = "partial_failed";
      } else if (stats.processing > 0 || stats.pending > 0) {
        syncStatus = "processing";
      } else {
        syncStatus = "synced";
      }

      return {
        id: dsId,
        name: d.name,
        description: d.description || "",
        documentCount: d.document_count || 0,
        syncConfig: d.sync_config || {},
        status: d.status,
        syncStatus,
        docStats: stats || { ready: 0, processing: 0, pending: 0, failed: 0, total: 0 },
        createdBy: d.created_by,
        creatorName: creatorMap[d.created_by as string] || "",
        createdAt: d.created_at,
        updatedAt: d.updated_at,
      };
    });

    return NextResponse.json({ success: true, datasets });
  } catch (error) {
    console.error("获取知识库列表错误:", error);
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}

// 创建知识库
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { teamId, name, description, syncConfig, createdBy } = body;

    if (!teamId || !name?.trim()) {
      return NextResponse.json({ error: "团队ID和名称不能为空" }, { status: 400 });
    }

    const client = getSupabaseClient();

    const { data, error } = await client
      .from("rag_datasets")
      .insert({
        team_id: teamId,
        name: name.trim(),
        description: description?.trim() || null,
        document_count: 0,
        sync_config: syncConfig || {},
        status: "active",
        created_by: createdBy || null,
      })
      .select("id, name, created_at")
      .single();

    if (error) {
      console.error("创建知识库失败:", error);
      return NextResponse.json({ error: "创建知识库失败" }, { status: 500 });
    }

    return NextResponse.json({ success: true, dataset: data });
  } catch (error) {
    console.error("创建知识库错误:", error);
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}

// 更新知识库
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, name, description, syncConfig } = body;

    if (!id || !name?.trim()) {
      return NextResponse.json({ error: "知识库ID和名称不能为空" }, { status: 400 });
    }

    const client = getSupabaseClient();

    const updateData: Record<string, unknown> = {
      name: name.trim(),
      description: description?.trim() || null,
      updated_at: new Date().toISOString(),
    };
    if (syncConfig !== undefined) updateData.sync_config = syncConfig;

    const { data, error } = await client
      .from("rag_datasets")
      .update(updateData)
      .eq("id", id)
      .select("id, name")
      .single();

    if (error) {
      console.error("更新知识库失败:", error);
      return NextResponse.json({ error: "更新知识库失败" }, { status: 500 });
    }

    return NextResponse.json({ success: true, dataset: data });
  } catch (error) {
    console.error("更新知识库错误:", error);
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}

// 删除知识库（软删除）
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "知识库ID不能为空" }, { status: 400 });
    }

    const client = getSupabaseClient();

    const { error } = await client
      .from("rag_datasets")
      .update({ status: "deleted", updated_at: new Date().toISOString() })
      .eq("id", id);

    if (error) {
      console.error("删除知识库失败:", error);
      return NextResponse.json({ error: "删除知识库失败" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("删除知识库错误:", error);
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}
