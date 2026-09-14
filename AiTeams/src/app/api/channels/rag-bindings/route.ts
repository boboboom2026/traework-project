import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";

// 获取频道绑定的知识库列表
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const channelId = searchParams.get("channelId");
    const teamId = searchParams.get("teamId");

    if (!channelId && !teamId) {
      return NextResponse.json({ error: "频道ID或团队ID不能为空" }, { status: 400 });
    }

    const client = getSupabaseClient();

    let query = client
      .from("channel_rag_bindings")
      .select(`
        id,
        channel_id,
        rag_dataset_id,
        scope,
        created_by,
        created_at,
        rag_datasets (
          id,
          name,
          description,
          document_count
        )
      `);

    if (channelId) {
      query = query.eq("channel_id", channelId);
    } else if (teamId) {
      // 获取团队所有频道的绑定（需要先获取团队频道）
      const { data: channels } = await client
        .from("channels")
        .select("id")
        .eq("team_id", teamId)
        .eq("is_active", true);
      
      if (channels && channels.length > 0) {
        const channelIds = channels.map(c => c.id);
        query = query.in("channel_id", channelIds);
      } else {
        return NextResponse.json({ success: true, bindings: [] });
      }
    }

    const { data, error } = await query.order("created_at", { ascending: false });

    if (error) {
      console.error("查询频道知识库绑定失败:", error);
      return NextResponse.json({ error: "查询失败" }, { status: 500 });
    }

    const bindings = (data || []).map((d: Record<string, unknown>) => ({
      id: d.id,
      channelId: d.channel_id,
      ragDatasetId: d.rag_dataset_id,
      scope: d.scope,
      createdBy: d.created_by,
      createdAt: d.created_at,
      dataset: d.rag_datasets,
    }));

    return NextResponse.json({ success: true, bindings });
  } catch (error) {
    console.error("获取频道知识库绑定错误:", error);
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}

// 创建频道知识库绑定
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { channelId, ragDatasetId, scope = "channel", createdBy } = body;

    if (!channelId || !ragDatasetId) {
      return NextResponse.json({ error: "频道ID和知识库ID不能为空" }, { status: 400 });
    }

    const client = getSupabaseClient();

    // 检查是否已存在相同绑定
    const { data: existing } = await client
      .from("channel_rag_bindings")
      .select("id")
      .eq("channel_id", channelId)
      .eq("rag_dataset_id", ragDatasetId)
      .single();

    if (existing) {
      return NextResponse.json({ error: "该知识库已绑定到此频道" }, { status: 400 });
    }

    const { data, error } = await client
      .from("channel_rag_bindings")
      .insert({
        channel_id: channelId,
        rag_dataset_id: ragDatasetId,
        scope,
        created_by: createdBy || null,
      })
      .select("id, channel_id, rag_dataset_id, created_at")
      .single();

    if (error) {
      console.error("创建频道知识库绑定失败:", error);
      return NextResponse.json({ error: "创建失败" }, { status: 500 });
    }

    return NextResponse.json({ success: true, binding: data });
  } catch (error) {
    console.error("创建频道知识库绑定错误:", error);
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}

// 批量创建频道知识库绑定
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { channelId, ragDatasetIds, createdBy } = body;

    if (!channelId || !ragDatasetIds || !Array.isArray(ragDatasetIds)) {
      return NextResponse.json({ error: "频道ID和知识库ID列表不能为空" }, { status: 400 });
    }

    const client = getSupabaseClient();

    // 先删除该频道现有绑定
    const { error: deleteError } = await client
      .from("channel_rag_bindings")
      .delete()
      .eq("channel_id", channelId);

    if (deleteError) {
      console.error("删除旧绑定失败:", deleteError);
    }

    // 创建新绑定
    if (ragDatasetIds.length > 0) {
      const bindings = ragDatasetIds.map((datasetId: string) => ({
        channel_id: channelId,
        rag_dataset_id: datasetId,
        scope: "channel",
        created_by: createdBy || null,
      }));

      const { error: insertError } = await client
        .from("channel_rag_bindings")
        .insert(bindings);

      if (insertError) {
        console.error("批量创建绑定失败:", insertError);
        return NextResponse.json({ error: "批量创建失败" }, { status: 500 });
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("批量创建频道知识库绑定错误:", error);
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}

// 删除频道知识库绑定
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    const channelId = searchParams.get("channelId");
    const ragDatasetId = searchParams.get("datasetId");

    if (!id && !(channelId && ragDatasetId)) {
      return NextResponse.json({ error: "ID或频道ID+知识库ID不能为空" }, { status: 400 });
    }

    const client = getSupabaseClient();

    let query = client.from("channel_rag_bindings").delete();

    if (id) {
      query = query.eq("id", id);
    } else {
      query = query.eq("channel_id", channelId).eq("rag_dataset_id", ragDatasetId);
    }

    const { error } = await query;

    if (error) {
      console.error("删除频道知识库绑定失败:", error);
      return NextResponse.json({ error: "删除失败" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("删除频道知识库绑定错误:", error);
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}
