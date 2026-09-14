/**
 * Coze Coding Dev SDK 本地兼容层
 *
 * 提供与 coze-coding-dev-sdk 相同的导出面，内部全部基于开源实现：
 *   - LLM / Embedding / Image：openai SDK（OpenAI 兼容协议）
 *   - S3 存储：@aws-sdk/client-s3（S3 兼容协议）
 *   - 搜索：Serper.dev 协议通用搜索服务
 *   - 抓取：原生 fetch
 *
 * 环境变量见各模块注释（无 COZE_ 前缀）。
 */

export { Config, type CozeConfig } from "./config";
export { LLMClient, LLMDefaults, type LLMConfig, type Message, type LLMResponse, type ContentPart } from "./llm";
export { EmbeddingClient, type EmbedOptions } from "./embedding";
export { S3Storage, S3Config, FILE_NAME_ALLOWED_RE, type S3StorageConfig, type ListFilesResult } from "./s3";
export { SearchClient, type SearchRequest, type SearchResponse, type WebItem, type ImageItem, type SearchFilter } from "./search";
export { ImageGenerationClient, ImageGenerationResponseHelper, type ImageGenerationRequest, type ImageGenerationResponse, type ImageData, type UsageInfo } from "./image";
export { FetchClient, type FetchRequest, type FetchResponse, type FetchContentItem, type FetchImage, type FetchDisplayInfo } from "./fetch";
export { HeaderUtils, FORWARD_HEADER_KEYS, type ForwardHeaderKey } from "./headers";
export { VERSION } from "./version";
