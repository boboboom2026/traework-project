/**
 * S3 存储客户端
 *
 * 基于 @aws-sdk/client-s3 实现，兼容 S3 协议（AWS S3 / MinIO / 其它兼容服务）。
 *
 * 环境变量：
 *   S3_ENDPOINT_URL   可选，自定义 endpoint（MinIO 等）
 *   S3_ACCESS_KEY     必填
 *   S3_SECRET_KEY     必填
 *   S3_BUCKET_NAME    默认桶名
 *   S3_REGION         可选，默认 cn-beijing
 */

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { Readable } from "stream";
import { randomUUID } from "crypto";
import path from "path";

export class S3Config {
  static readonly DEFAULT_REGION = "cn-beijing";
  static readonly DEFAULT_MAX_KEYS = 1000;
  static readonly DEFAULT_PRESIGNED_EXPIRE_TIME = 86400;
  static readonly DEFAULT_UPLOAD_TIMEOUT = 30000;
}

export interface S3StorageConfig {
  endpointUrl?: string;
  accessKey?: string;
  secretKey?: string;
  bucketName?: string;
  region?: string;
}

export interface ListFilesResult {
  keys: string[];
  isTruncated: boolean;
  nextContinuationToken?: string;
}

export const FILE_NAME_ALLOWED_RE = /^[a-zA-Z0-9._\-\u4e00-\u9fa5 ]+$/;

function sanitizeFileName(fileName: string): string {
  const base = path.basename(fileName || "file");
  // 非法字符替换为 "-"，中文等非 ASCII 保留（S3 key 支持 UTF-8）
  const cleaned = base.replace(/[\\/:*?"<>|\s]+/g, "-").replace(/^-+|-+$/g, "");
  return cleaned || "file";
}

function generateObjectKey(fileName: string): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const name = sanitizeFileName(fileName);
  const uniq = `${Date.now()}-${randomUUID().slice(0, 8)}`;
  return `uploads/${yyyy}/${mm}/${uniq}-${name}`;
}

export class S3Storage {
  private endpointUrl?: string;
  private accessKey: string;
  private secretKey: string;
  private bucketName: string;
  private region: string;
  private client: S3Client | null = null;

  constructor(config?: S3StorageConfig) {
    this.endpointUrl = config?.endpointUrl || process.env.S3_ENDPOINT_URL || undefined;
    this.accessKey = config?.accessKey || process.env.S3_ACCESS_KEY || "";
    this.secretKey = config?.secretKey || process.env.S3_SECRET_KEY || "";
    this.bucketName = config?.bucketName || process.env.S3_BUCKET_NAME || "";
    this.region = config?.region || process.env.S3_REGION || S3Config.DEFAULT_REGION;
  }

  /**
   * 惰性创建客户端：未配置对象存储时不影响模块加载，
   * 仅在真正执行文件操作时抛错。
   */
  private getClient(): S3Client {
    if (this.client) return this.client;

    if (!this.accessKey || !this.secretKey || !this.bucketName) {
      throw new Error(
        "缺少 S3 环境变量：S3_ACCESS_KEY / S3_SECRET_KEY / S3_BUCKET_NAME"
      );
    }

    this.client = new S3Client({
      region: this.region,
      credentials: {
        accessKeyId: this.accessKey,
        secretAccessKey: this.secretKey,
      },
      ...(this.endpointUrl ? { endpoint: this.endpointUrl, forcePathStyle: true } : {}),
    });
    return this.client;
  }

  private resolveBucket(bucket?: string): string {
    return bucket || this.bucketName;
  }

  async uploadFile(options: {
    fileContent: Buffer;
    fileName: string;
    contentType?: string;
    bucket?: string;
  }): Promise<string> {
    const key = generateObjectKey(options.fileName);
    await this.getClient().send(
      new PutObjectCommand({
        Bucket: this.resolveBucket(options.bucket),
        Key: key,
        Body: options.fileContent,
        ContentType: options.contentType || "application/octet-stream",
      }),
    );
    return key;
  }

  async readFile(options: { fileKey: string; bucket?: string }): Promise<Buffer> {
    const res = await this.getClient().send(
      new GetObjectCommand({
        Bucket: this.resolveBucket(options.bucket),
        Key: options.fileKey,
      }),
    );
    const body = res.Body as Readable | undefined;
    if (!body) return Buffer.alloc(0);
    const chunks: Buffer[] = [];
    for await (const chunk of body as unknown as AsyncIterable<Buffer>) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }

  async deleteFile(options: { fileKey: string; bucket?: string }): Promise<boolean> {
    await this.getClient().send(
      new DeleteObjectCommand({
        Bucket: this.resolveBucket(options.bucket),
        Key: options.fileKey,
      }),
    );
    return true;
  }

  async fileExists(options: { fileKey: string; bucket?: string }): Promise<boolean> {
    try {
      await this.getClient().send(
        new HeadObjectCommand({
          Bucket: this.resolveBucket(options.bucket),
          Key: options.fileKey,
        }),
      );
      return true;
    } catch {
      return false;
    }
  }

  async listFiles(options?: {
    prefix?: string;
    bucket?: string;
    maxKeys?: number;
    continuationToken?: string;
  }): Promise<ListFilesResult> {
    const res = await this.getClient().send(
      new ListObjectsV2Command({
        Bucket: this.resolveBucket(options?.bucket),
        Prefix: options?.prefix,
        MaxKeys: options?.maxKeys || S3Config.DEFAULT_MAX_KEYS,
        ContinuationToken: options?.continuationToken,
      }),
    );
    return {
      keys: (res.Contents || []).map((o) => o.Key || "").filter(Boolean),
      isTruncated: res.IsTruncated ?? false,
      nextContinuationToken: res.NextContinuationToken,
    };
  }

  async generatePresignedUrl(options: {
    key: string;
    bucket?: string;
    expireTime?: number;
  }): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.resolveBucket(options.bucket),
      Key: options.key,
    });
    return getSignedUrl(this.getClient(), command, {
      expiresIn: options.expireTime || S3Config.DEFAULT_PRESIGNED_EXPIRE_TIME,
    });
  }

  async streamUploadFile(options: {
    stream: Readable;
    fileName: string;
    contentType?: string;
    bucket?: string;
  }): Promise<string> {
    const chunks: Buffer[] = [];
    for await (const chunk of options.stream as unknown as AsyncIterable<Buffer>) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return this.uploadFile({
      fileContent: Buffer.concat(chunks),
      fileName: options.fileName,
      contentType: options.contentType,
      bucket: options.bucket,
    });
  }

  async uploadFromUrl(options: {
    url: string;
    bucket?: string;
    timeout?: number;
  }): Promise<string> {
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      options.timeout || S3Config.DEFAULT_UPLOAD_TIMEOUT,
    );
    try {
      const res = await fetch(options.url, { signal: controller.signal });
      if (!res.ok) throw new Error(`下载失败: ${res.status}`);
      const buffer = Buffer.from(await res.arrayBuffer());
      const urlPath = new URL(options.url).pathname;
      return this.uploadFile({
        fileContent: buffer,
        fileName: path.basename(urlPath) || "download",
        contentType: res.headers.get("content-type") || undefined,
        bucket: options.bucket,
      });
    } finally {
      clearTimeout(timer);
    }
  }

  async chunkUploadFile(options: {
    chunks: AsyncIterable<Buffer>;
    fileName: string;
    contentType?: string;
    bucket?: string;
  }): Promise<string> {
    const chunks: Buffer[] = [];
    for await (const chunk of options.chunks) {
      chunks.push(chunk);
    }
    return this.uploadFile({
      fileContent: Buffer.concat(chunks),
      fileName: options.fileName,
      contentType: options.contentType,
      bucket: options.bucket,
    });
  }
}

export default S3Storage;
