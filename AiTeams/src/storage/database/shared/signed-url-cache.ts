// ============ 签名 URL 服务端缓存（共享模块） ============

const signedUrlCache = new Map<string, { url: string; expiresAt: number }>();
const SIGNED_URL_TTL = 50 * 60 * 1000; // 缓存 50 分钟（签名有效期 60 分钟，留 10 分钟余量）
const SIGNED_URL_MAX_CACHE = 500; // 最大缓存条目数

export function getCachedSignedUrl(key: string): string | null {
  const cached = signedUrlCache.get(key);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.url;
  }
  if (cached) signedUrlCache.delete(key);
  return null;
}

export function setCachedSignedUrl(key: string, url: string) {
  // LRU 淘汰：超过上限时删除最早的条目
  if (signedUrlCache.size >= SIGNED_URL_MAX_CACHE) {
    const firstKey = signedUrlCache.keys().next().value;
    if (firstKey) signedUrlCache.delete(firstKey);
  }
  signedUrlCache.set(key, { url, expiresAt: Date.now() + SIGNED_URL_TTL });
}

// ============ 批量生成签名 URL（共享函数） ============

import { S3Storage } from "@/lib/sdk";

const storage = new S3Storage({
  endpointUrl: process.env.S3_ENDPOINT_URL,
  accessKey: "",
  secretKey: "",
  bucketName: process.env.S3_BUCKET_NAME,
  region: "cn-beijing",
});

/**
 * 批量生成签名 URL（优先走缓存）
 * @param keys S3 对象 key 列表
 * @returns key -> signedUrl 映射
 */
export async function batchGenerateSignedUrls(keys: string[]): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  const missedKeys: string[] = [];

  // 先从缓存拿
  for (const key of keys) {
    const cached = getCachedSignedUrl(key);
    if (cached) {
      result[key] = cached;
    } else {
      missedKeys.push(key);
    }
  }

  // 缓存未命中的再请求 S3
  if (missedKeys.length > 0) {
    await Promise.all(
      missedKeys.map(async (key) => {
        try {
          const url = await storage.generatePresignedUrl({ key, expireTime: 3600 });
          setCachedSignedUrl(key, url);
          result[key] = url;
        } catch {
          result[key] = "";
        }
      })
    );
  }

  return result;
}
