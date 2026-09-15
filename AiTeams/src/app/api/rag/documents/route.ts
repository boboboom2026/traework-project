import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";
import { S3Storage, HeaderUtils } from "@/lib/sdk";
import { splitTextIntoChunks, parseDocumentFromFile, parseTextFileFromS3, generateChunksEmbedding } from "@/lib/rag-context";

const storage = new S3Storage({
  endpointUrl: process.env.S3_ENDPOINT_URL,
  accessKey: "",
  secretKey: "",
  bucketName: process.env.S3_BUCKET_NAME,
  region: "cn-beijing",
});

// 支持的文档类型
const SUPPORTED_TYPES: Record<string, string> = {
  "application/pdf": "pdf",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "text/plain": "txt",
  "text/markdown": "md",
  "text/csv": "csv",
  "application/csv": "csv",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
};

// 根据文件扩展名检测类型
const EXTENSION_TYPES: Record<string, string> = {
  ".pdf": "pdf",
  ".doc": "doc",
  ".docx": "docx",
  ".txt": "txt",
  ".md": "md",
  ".csv": "csv",
  ".xls": "xls",
  ".xlsx": "xlsx",
};

function getFileTypeByName(fileName: string, mimeType: string): string | null {
  // 先根据扩展名判断
  const ext = fileName.toLowerCase().substring(fileName.lastIndexOf("."));
  if (EXTENSION_TYPES[ext]) {
    return EXTENSION_TYPES[ext];
  }
  // 再根据 MIME 类型判断
  return SUPPORTED_TYPES[mimeType] || null;
}

// 获取知识库的文档列表 或 获取单个文档内容
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const datasetId = searchParams.get("datasetId");
    const docId = searchParams.get("docId");
    const download = searchParams.get("download");

    // 获取单个文档内容和下载链接
    if (docId) {
      try {
        const client = getSupabaseClient();
        
        // 查询文档信息（不使用 .single() 以便更好地处理结果）
        // 注意：content 字段可能不存在，所以不查询它
        const { data: doc, error } = await client
          .from("rag_documents")
          .select("id, file_name, file_type, file_size, file_key, status, chunk_count, created_at")
          .eq("id", docId)
          .limit(1);

        if (error || !doc || doc.length === 0) {
          return NextResponse.json({ error: "文档不存在" }, { status: 404 });
        }
        
        const record = doc[0];

      // 返回下载链接
      if (download === "true") {
        try {
          const signedUrl = await storage.generatePresignedUrl({ key: record.file_key, expireTime: 3600 }); // 1小时有效期
          return NextResponse.json({ success: true, downloadUrl: signedUrl, fileName: record.file_name });
        } catch (err) {
          console.error("获取下载链接失败:", err);
          return NextResponse.json({ error: "获取下载链接失败" }, { status: 500 });
        }
      }

      // 返回文档基本信息（content 字段不在数据库中，需要通过其他方式获取）
      return NextResponse.json({ 
        success: true, 
        document: {
          id: record.id,
          fileName: record.file_name,
          fileType: record.file_type,
          fileSize: record.file_size,
          status: record.status,
          chunkCount: record.chunk_count,
          content: null,
        }
      });
      } catch (err) {
        console.error("查询文档异常:", err);
        return NextResponse.json({ error: "查询文档失败" }, { status: 500 });
      }
    }

    if (!datasetId) {
      return NextResponse.json({ error: "知识库ID不能为空" }, { status: 400 });
    }

    const client = getSupabaseClient();

    const { data, error } = await client
      .from("rag_documents")
      .select("id, file_name, file_type, file_size, status, chunk_count, error_message, created_by, created_at, updated_at")
      .eq("dataset_id", datasetId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("查询文档列表失败:", error);
      return NextResponse.json({ error: "查询文档列表失败" }, { status: 500 });
    }

    // 获取上传者信息
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

    const documents = (data || []).map((d: Record<string, unknown>) => ({
      id: d.id,
      fileName: d.file_name,
      fileType: d.file_type,
      fileSize: d.file_size || 0,
      fileKey: d.file_key,
      status: d.status,
      chunkCount: d.chunk_count || 0,
      errorMessage: d.error_message,
      createdBy: d.created_by,
      creatorName: creatorMap[d.created_by as string] || "",
      createdAt: d.created_at,
      updatedAt: d.updated_at,
    }));

    return NextResponse.json({ success: true, documents });
  } catch (error) {
    console.error("获取文档列表错误:", error);
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}

// 上传文档到知识库
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const datasetId = formData.get("datasetId") as string | null;
    const userId = formData.get("userId") as string | null;

    if (!file) {
      return NextResponse.json({ error: "请选择要上传的文件" }, { status: 400 });
    }

    if (!datasetId) {
      return NextResponse.json({ error: "知识库ID不能为空" }, { status: 400 });
    }

    // 校验文件类型（优先使用扩展名检测，兼容浏览器错误识别 MIME 类型的情况）
    const detectedType = getFileTypeByName(file.name, file.type);
    if (!detectedType) {
      return NextResponse.json({ 
        error: `不支持的文件类型: ${file.type}。支持: PDF, DOC, DOCX, TXT, MD, CSV, XLS, XLSX` 
      }, { status: 400 });
    }

    // 校验文件大小（最大 50MB）
    const maxSize = 50 * 1024 * 1024;
    if (file.size > maxSize) {
      return NextResponse.json({ error: "文件大小不能超过 50MB" }, { status: 400 });
    }

    const client = getSupabaseClient();

    // 1. 验证知识库存在
    const { data: dataset, error: datasetError } = await client
      .from("rag_datasets")
      .select("id, team_id")
      .eq("id", datasetId)
      .eq("status", "active")
      .single();

    if (datasetError || !dataset) {
      return NextResponse.json({ error: "知识库不存在" }, { status: 404 });
    }

    // 2. 上传文件到 S3
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const fileKey = `rag-docs/${datasetId}/${Date.now()}_${safeName}`;

    let actualFileKey: string;
    try {
      actualFileKey = await storage.uploadFile({
        fileContent: buffer,
        fileName: fileKey,
        contentType: file.type || "application/octet-stream",
      });
    } catch (uploadError) {
      console.error("S3上传失败:", uploadError);
      return NextResponse.json({ error: "文件上传失败，请重试" }, { status: 500 });
    }

    // 3. 创建文档记录
    const { data: doc, error: docError } = await client
      .from("rag_documents")
      .insert({
        dataset_id: datasetId,
        file_name: file.name,
        file_type: detectedType,
        file_size: file.size,
        file_key: actualFileKey,
        status: "pending",
        chunk_count: 0,
        created_by: userId || null,
      })
      .select("id")
      .single();

    if (docError || !doc) {
      console.error("创建文档记录失败:", docError);
      return NextResponse.json({ error: "创建文档记录失败" }, { status: 500 });
    }

    // 4. 异步处理文档（解析 + 分块 + Embedding）
    const customHeaders = HeaderUtils.extractForwardHeaders(request.headers);
    processDocumentAsync(doc.id, actualFileKey, detectedType, datasetId, customHeaders).catch(err => {
      console.error("异步文档处理失败:", err);
    });

    return NextResponse.json({ 
      success: true, 
      documentId: doc.id,
      message: "文档上传成功，正在后台处理中",
    });
  } catch (error) {
    console.error("上传文档失败:", error);
    return NextResponse.json({ error: "上传失败，请重试" }, { status: 500 });
  }
}

// 删除文档
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "文档ID不能为空" }, { status: 400 });
    }

    // UUID 格式校验
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) {
      return NextResponse.json({ error: "文档ID格式无效" }, { status: 400 });
    }

    const client = getSupabaseClient();

    // 删除文档的所有块
    const { error: chunksError } = await client
      .from("rag_chunks")
      .delete()
      .eq("document_id", id);

    if (chunksError) {
      console.error("删除文档块失败:", chunksError);
    }

    // 删除文档记录
    const { error: docError } = await client
      .from("rag_documents")
      .delete()
      .eq("id", id);

    if (docError) {
      console.error("删除文档失败:", docError);
      return NextResponse.json({ error: "删除文档失败" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("删除文档错误:", error);
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}

// ============ 异步文档处理 ============

async function processDocumentAsync(
  documentId: string,
  fileKey: string,
  fileType: string,
  datasetId: string,
  customHeaders: Record<string, string>
): Promise<void> {
  const client = getSupabaseClient();

  try {
    // 更新状态为处理中
    await client
      .from("rag_documents")
      .update({ status: "processing", updated_at: new Date().toISOString() })
      .eq("id", documentId);

    // 1. 解析文档内容
    let fullText: string;
    const textFileTypes = ["txt", "md", "csv"];
    
    if (textFileTypes.includes(fileType)) {
      // 纯文本文件：直接下载并读取
      fullText = await parseTextFileFromS3(fileKey);
    } else {
      // 二进制文件：通过 FetchClient 解析
      fullText = await parseDocumentFromFile(fileKey, fileType, customHeaders);
    }

    if (!fullText.trim()) {
      await client
        .from("rag_documents")
        .update({ status: "failed", error_message: "文档内容为空", updated_at: new Date().toISOString() })
        .eq("id", documentId);
      return;
    }

    // 2. 分块
    const chunks = splitTextIntoChunks(fullText);

    if (chunks.length === 0) {
      await client
        .from("rag_documents")
        .update({ status: "failed", error_message: "分块结果为空", updated_at: new Date().toISOString() })
        .eq("id", documentId);
      return;
    }

    // 3. 写入块记录（带上元数据）
    const chunkRecords = chunks.map((chunk, index) => ({
      document_id: documentId,
      dataset_id: datasetId,
      chunk_index: index,
      content: chunk.content,
      token_count: chunk.tokenCount,
      chunk_type: chunk.chunkType,
      document_title: null as string | null, // 后续可从文档内容提取
      document_tags: [] as string[],
    }));

    const { error: insertError } = await client
      .from("rag_chunks")
      .insert(chunkRecords);

    if (insertError) {
      console.error("写入文档块失败:", insertError);
      await client
        .from("rag_documents")
        .update({ status: "failed", error_message: "写入文档块失败", updated_at: new Date().toISOString() })
        .eq("id", documentId);
      return;
    }

    // 4. 更新文档块计数
    await client
      .from("rag_documents")
      .update({ chunk_count: chunks.length, updated_at: new Date().toISOString() })
      .eq("id", documentId);

    // 5. 更新知识库文档计数
    const { count } = await client
      .from("rag_documents")
      .select("*", { count: "exact", head: true })
      .eq("dataset_id", datasetId)
      .neq("status", "failed");
    
    if (count !== null) {
      await client
        .from("rag_datasets")
        .update({ document_count: count, updated_at: new Date().toISOString() })
        .eq("id", datasetId);
    }

    // 6. 异步生成 Embedding
    generateChunksEmbedding(documentId, customHeaders)
      .then(async (processedCount) => {
        console.log(`文档 ${documentId} Embedding 生成完成: ${processedCount}/${chunks.length}`);
        // 标记文档为就绪
        await client
          .from("rag_documents")
          .update({ status: "ready", updated_at: new Date().toISOString() })
          .eq("id", documentId);
      })
      .catch(async (err) => {
        console.error(`文档 ${documentId} Embedding 生成失败:`, err);
        // 即使 Embedding 失败，文档仍标记为 ready（部分块可能已生成）
        await client
          .from("rag_documents")
          .update({ status: "ready", error_message: "部分 Embedding 生成失败", updated_at: new Date().toISOString() })
          .eq("id", documentId);
      });

  } catch (err) {
    console.error(`文档处理失败 [${documentId}]:`, err);
    await client
      .from("rag_documents")
      .update({ 
        status: "failed", 
        error_message: err instanceof Error ? err.message : "处理失败",
        updated_at: new Date().toISOString() 
      })
      .eq("id", documentId);
  }
}
