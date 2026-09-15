/**
 * RAG 知识库处理模块
 * 
 * 核心能力：
 * 1. 文档解析：通过 FetchClient 解析上传的文档（PDF/DOCX/TXT/MD 等）
 * 2. 文本分块：按 token 数智能分块，保留语义连贯性
 * 3. Embedding 生成：为每个块生成向量并写入数据库
 * 4. 语义检索：根据用户问题检索最相关的知识块
 */

import { getSupabaseClient } from "@/storage/database/supabase-client";
import { EmbeddingClient, FetchClient, S3Storage, type ContentPart } from "@/lib/sdk";

// ============ 常量 ============

const CHUNK_MAX_TOKENS = 500;     // 每个块的最大 token 数
const CHUNK_OVERLAP_TOKENS = 50;  // 块之间的重叠 token 数
const EMBEDDING_DIMENSIONS = 1024;

// ============ 文本分块 ============

/**
 * 将文本按 token 数分块
 * 简化方案：1 个中文字 ≈ 1 token，1 个英文单词 ≈ 1 token
 * 按段落/句子边界分割，保持语义连贯
 */
export function splitTextIntoChunks(
  text: string,
  maxTokens: number = CHUNK_MAX_TOKENS,
  overlapTokens: number = CHUNK_OVERLAP_TOKENS
): Array<{
  content: string;
  tokenCount: number;
  chunkType: "title" | "heading" | "text";
}> {
  if (!text || text.trim().length === 0) return [];

  // 按段落分割
  const paragraphs = text.split(/\n{2,}/).filter(p => p.trim().length > 0);

  const chunks: Array<{
    content: string;
    tokenCount: number;
    chunkType: "title" | "heading" | "text";
  }> = [];
  let currentChunk = "";
  let currentTokens = 0;

  for (const paragraph of paragraphs) {
    const paraTokens = estimateTokenCount(paragraph);
    const trimmedPara = paragraph.trim();

    // 判断段落类型
    let chunkType: "title" | "heading" | "text" = "text";
    if (/^#{1,2}\s/.test(trimmedPara)) {
      chunkType = "title";
    } else if (/^#{3,6}\s/.test(trimmedPara)) {
      chunkType = "heading";
    }

    // 如果单个段落就超过最大 token，按句子分割
    if (paraTokens > maxTokens) {
      // 先保存当前块
      if (currentChunk.trim()) {
        chunks.push({ content: currentChunk.trim(), tokenCount: currentTokens, chunkType: "text" });
        const overlapText = getLastNTokenText(currentChunk, overlapTokens);
        currentChunk = overlapText;
        currentTokens = estimateTokenCount(overlapText);
      }

      // 按句子分割长段落
      const sentences = paragraph.split(/(?<=[。！？.!?\n])/g).filter(s => s.trim().length > 0);
      for (const sentence of sentences) {
        const sentTokens = estimateTokenCount(sentence);
        if (currentTokens + sentTokens > maxTokens && currentChunk.trim()) {
          chunks.push({ content: currentChunk.trim(), tokenCount: currentTokens, chunkType: "text" });
          const overlapText = getLastNTokenText(currentChunk, overlapTokens);
          currentChunk = overlapText;
          currentTokens = estimateTokenCount(overlapText);
        }
        currentChunk += sentence;
        currentTokens += sentTokens;
      }
    } else {
      // 段落可以加入当前块
      if (currentTokens + paraTokens > maxTokens && currentChunk.trim()) {
        chunks.push({ content: currentChunk.trim(), tokenCount: currentTokens, chunkType: "text" });
        const overlapText = getLastNTokenText(currentChunk, overlapTokens);
        currentChunk = overlapText;
        currentTokens = estimateTokenCount(overlapText);
      }
      currentChunk += (currentChunk ? "\n\n" : "") + paragraph;
      currentTokens += paraTokens;
    }
  }

  // 保存最后一个块
  if (currentChunk.trim()) {
    chunks.push({ content: currentChunk.trim(), tokenCount: currentTokens, chunkType: "text" });
  }

  return chunks;
}

/**
 * 估算 token 数（简化：中文按字数，英文按词数）
 */
function estimateTokenCount(text: string): number {
  // 中文字符数
  const chineseChars = (text.match(/[\u4e00-\u9fff]/g) || []).length;
  // 英文单词数
  const englishWords = (text.match(/[a-zA-Z]+/g) || []).length;
  // 其他字符粗略估算
  const otherChars = text.length - chineseChars - (text.match(/[a-zA-Z]+/g) || []).join("").length;
  return chineseChars + englishWords + Math.floor(otherChars / 2);
}

/**
 * 获取文本最后 N 个 token 的内容（用于块重叠）
 */
function getLastNTokenText(text: string, n: number): string {
  const sentences = text.split(/(?<=[。！？.!?\n])/g);
  let result = "";
  let tokens = 0;
  for (let i = sentences.length - 1; i >= 0; i--) {
    const s = sentences[i];
    const t = estimateTokenCount(s);
    if (tokens + t > n) break;
    result = s + result;
    tokens += t;
  }
  return result;
}

// ============ 文档解析 ============

/**
 * 从 S3 下载文件并通过 FetchClient 解析文档内容
 */
export async function parseDocumentFromFile(
  fileKey: string,
  fileType: string,
  customHeaders?: Record<string, string>
): Promise<string> {
  const storage = new S3Storage({
    endpointUrl: process.env.S3_ENDPOINT_URL,
    accessKey: "",
    secretKey: "",
    bucketName: process.env.S3_BUCKET_NAME,
    region: "cn-beijing",
  });

  // 生成签名 URL
  const signedUrl = await storage.generatePresignedUrl({ key: fileKey, expireTime: 3600 });

  // 使用 FetchClient 解析文档
  const fetchClient = new FetchClient(undefined, customHeaders);
  const response = await fetchClient.fetch(signedUrl);

  if (response.status_code !== 0) {
    throw new Error(`文档解析失败: ${response.status_message || "未知错误"}`);
  }

  // 提取文本内容
  const textParts: string[] = [];
  for (const item of response.content) {
    if (item.type === "text" && item.text) {
      textParts.push(item.text);
    }
  }

  const fullText = textParts.join("\n\n");
  if (!fullText.trim()) {
    throw new Error("文档内容为空或无法提取文本");
  }

  return fullText;
}

/**
 * 直接从文件内容解析文本（用于纯文本类型）
 */
export function parseTextContent(content: string): string {
  return content.trim();
}

/**
 * 从 S3 下载纯文本文件并读取内容
 * 适用于 TXT、MD、CSV 等纯文本格式
 */
export async function parseTextFileFromS3(fileKey: string): Promise<string> {
  const { S3Storage } = await import("@/lib/sdk");
  const storage = new S3Storage({
    endpointUrl: process.env.S3_ENDPOINT_URL,
    accessKey: "",
    secretKey: "",
    bucketName: process.env.S3_BUCKET_NAME,
    region: "cn-beijing",
  });

  // 下载文件内容
  const buffer = await storage.readFile({ fileKey });
  const text = buffer.toString("utf-8");
  
  if (!text.trim()) {
    throw new Error("文件内容为空");
  }
  
  return text;
}

// ============ Embedding 生成 ============

/**
 * 为文档的所有块生成 Embedding 并写入数据库
 * 批量处理，每批最多 20 个块
 */
export async function generateChunksEmbedding(
  documentId: string,
  customHeaders?: Record<string, string>
): Promise<number> {
  const client = getSupabaseClient();

  // 获取该文档所有没有 embedding 的块
  const { data: chunks, error } = await client
    .from("rag_chunks")
    .select("id, content")
    .eq("document_id", documentId)
    .is("embedding", null);

  if (error) {
    throw new Error(`查询文档块失败: ${error.message}`);
  }

  if (!chunks || chunks.length === 0) {
    return 0;
  }

  const embeddingClient = new EmbeddingClient(undefined, customHeaders);
  const BATCH_SIZE = 20;
  let processedCount = 0;

  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    const batch = chunks.slice(i, i + BATCH_SIZE);
    const texts = batch.map((c: { content: string }) => c.content.slice(0, 2000));

    try {
      // 逐个生成 embedding（batchEmbed 适合大批量，这里用循环确保稳定性）
      for (const chunk of batch) {
        try {
          const embedding = await embeddingClient.embedText(
            (chunk as { content: string }).content.slice(0, 2000),
            { dimensions: EMBEDDING_DIMENSIONS }
          );

          const { error: updateError } = await client
            .from("rag_chunks")
            .update({ embedding })
            .eq("id", (chunk as { id: string }).id);

          if (updateError) {
            console.error(`写入块 Embedding 失败 [${(chunk as { id: string }).id}]:`, updateError.message);
          } else {
            processedCount++;
          }
        } catch (err) {
          console.error(`生成块 Embedding 失败 [${(chunk as { id: string }).id}]:`, err);
        }
      }
    } catch (err) {
      console.error(`批量 Embedding 生成失败 [batch ${i}]:`, err);
    }
  }

  return processedCount;
}

// ============ 知识库语义检索 ============

/**
 * 在指定知识库中检索与用户问题最相关的文档块
 * 
 * 策略（分层检索）：
 * 1. 将用户问题生成 Embedding
 * 2. 先检索最相关的文档（按文档聚合）
 * 3. 再检索这些文档中最相关的块
 * 4. 优先返回标题/摘要块，再返回内容块
 * 5. 支持按 chunk_type 过滤
 */
export async function searchKnowledgeBase(params: {
  datasetIds: string[];
  query: string;
  topK?: number;
  topDocs?: number; // 先取最相关的 N 个文档
  customHeaders?: Record<string, string>;
  filter?: {
    chunkTypes?: ("title" | "heading" | "text")[];
  };
}): Promise<
  Array<{
    content: string;
    documentId: string;
    similarity: number;
    chunkType: string;
    documentTitle: string | null;
  }>
> {
  const {
    datasetIds,
    query,
    topK = 8,
    topDocs = 3,
    customHeaders,
    filter,
  } = params;

  if (datasetIds.length === 0 || !query.trim()) return [];

  // 1. 生成查询 Embedding
  let queryEmbedding: number[] | null = null;
  try {
    const embeddingClient = new EmbeddingClient(undefined, customHeaders);
    queryEmbedding = await embeddingClient.embedText(query.slice(0, 2000), {
      dimensions: EMBEDDING_DIMENSIONS,
    });
  } catch (err) {
    console.error("生成查询 Embedding 失败:", err);
    return [];
  }

  if (!queryEmbedding) return [];

  const client = getSupabaseClient();
  const embeddingStr = `[${queryEmbedding.join(",")}]`;

  try {
    // 2. 第一阶段：检索足够多的候选块（用于确定最相关文档）
    const { data: candidates, error } = await client.rpc("search_rag_chunks", {
      query_embedding: embeddingStr,
      p_dataset_ids: datasetIds,
      match_limit: topK * 3, // 取更多候选，用于分层筛选
      match_threshold: 0.25,
    });

    if (error) {
      console.error("知识库语义检索失败:", error.message);
      return [];
    }

    if (!candidates || candidates.length === 0) return [];

    // 3. 第二阶段：按文档聚合，找出最相关的 topDocs 个文档
    const docScores: Map<
      string,
      { maxSim: number; chunks: typeof candidates }
    > = new Map();

    for (const c of candidates) {
      const docId = c.document_id;
      if (!docScores.has(docId)) {
        docScores.set(docId, { maxSim: c.similarity, chunks: [] });
      }
      const doc = docScores.get(docId)!;
      doc.chunks.push(c);
      if (c.similarity > doc.maxSim) {
        doc.maxSim = c.similarity;
      }
    }

    // 按文档最高相似度排序，取 topDocs
    const topDocIds = [...docScores.entries()]
      .sort((a, b) => b[1].maxSim - a[1].maxSim)
      .slice(0, topDocs)
      .map(([id]) => id);

    // 4. 第三阶段：从 top 文档中精选块
    const selectedChunks: typeof candidates = [];

    for (const docId of topDocIds) {
      const docInfo = docScores.get(docId);
      if (!docInfo) continue;

      // 按 chunk_type 过滤
      let docChunks = docInfo.chunks;
      if (filter?.chunkTypes && filter.chunkTypes.length > 0) {
        docChunks = docChunks.filter((c: { chunk_type?: string }) =>
          filter.chunkTypes!.includes(c.chunk_type as "title" | "heading" | "text")
        );
      }

      // 按相似度排序
      docChunks.sort(
        (a: { similarity: number }, b: { similarity: number }) =>
          b.similarity - a.similarity
      );

      // 每个文档最多取 3 个块（标题优先）
      const titleChunks = docChunks.filter(
        (c: { chunk_type?: string }) => c.chunk_type === "title" || c.chunk_type === "heading"
      );
      const textChunks = docChunks.filter(
        (c: { chunk_type?: string }) => c.chunk_type === "text"
      );

      // 优先取标题块，再取内容块
      selectedChunks.push(...titleChunks.slice(0, 1));
      selectedChunks.push(...textChunks.slice(0, 2));
    }

    // 5. 最终排序，取 topK
    selectedChunks.sort(
      (a: { similarity: number }, b: { similarity: number }) =>
        b.similarity - a.similarity
    );

    return selectedChunks.slice(0, topK).map((r: { content: string; document_id: string; similarity: number; chunk_type?: string; document_title?: string | null }) => ({
      content: r.content,
      documentId: r.document_id,
      similarity: r.similarity,
      chunkType: r.chunk_type || "text",
      documentTitle: r.document_title || null,
    }));
  } catch (err) {
    console.error("知识库语义检索异常:", err);
    return [];
  }
}

/**
 * 获取频道绑定的知识库ID列表
 */
export async function getChannelBoundDatasetIds(channelId: string): Promise<string[]> {
  const client = getSupabaseClient();

  const { data, error } = await client
    .from("channel_rag_bindings")
    .select("rag_dataset_id")
    .eq("channel_id", channelId);

  if (error) {
    console.error("获取频道绑定知识库失败:", error);
    return [];
  }

  return (data || []).map((d: { rag_dataset_id: string }) => d.rag_dataset_id);
}

/**
 * 为智能体构建知识库上下文
 * 在智能体对话时调用，检索相关文档块并格式化为 LLM 可消费的文本
 * 支持合并智能体全局关联的知识库 + 频道绑定的知识库
 */
export async function buildRagContext(params: {
  datasetIds: string[];
  userMessage: string;
  customHeaders?: Record<string, string>;
  channelId?: string;  // 新增：频道ID
}): Promise<{
  contextText: string;
  llmMessages: Array<{ role: "system" | "user" | "assistant"; content: string | ContentPart[] }>;
}> {
  const { datasetIds, userMessage, customHeaders, channelId } = params;

  // 获取合并后的知识库ID列表
  let mergedDatasetIds = [...datasetIds];
  
  // 如果提供了频道ID，获取频道绑定的知识库并合并
  if (channelId) {
    const channelDatasetIds = await getChannelBoundDatasetIds(channelId);
    // 合并去重
    mergedDatasetIds = [...new Set([...mergedDatasetIds, ...channelDatasetIds])];
  }

  const results = await searchKnowledgeBase({
    datasetIds: mergedDatasetIds,
    query: userMessage,
    topK: 8,
    topDocs: 3,
    customHeaders,
  });

  if (results.length === 0) {
    // 检索结果为空时，返回提示但不让智能体停止回答
    return { 
      contextText: "", 
      llmMessages: [{
        role: "system" as const,
        content: `【知识库参考】当前知识库中没有检索到与用户问题直接相关的内容。\n\n请基于你的专业能力正常回答用户的问题。如果用户的问题超出你的知识范围，可以诚实说明，但仍然应该尽力提供有用的通用建议。`,
      }]
    };
  }

  // 格式化检索结果
  const contextParts = results.map((r, i) => 
    `[知识片段 ${i + 1}] (相关度: ${(r.similarity * 100).toFixed(0)}%)\n${r.content}`
  );
  const contextText = contextParts.join("\n\n---\n\n");

  const llmMessages: Array<{ role: "system" | "user" | "assistant"; content: string | ContentPart[] }> = [{
    role: "system" as const,
    content: `以下是从知识库中检索到的相关信息，请参考这些内容回答用户的问题：\n\n${contextText}`,
  }];

  return { contextText, llmMessages };
}
