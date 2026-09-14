"use client";

import { useState, useEffect } from "react";

// 缓存 key -> url 的映射，避免重复请求
const avatarUrlCache = new Map<string, string>();

/**
 * 将 avatar key（对象存储 key）解析为可访问的签名 URL。
 * 如果 avatar 已经是完整 URL（http/https 开头），直接返回。
 */
export function useAvatarUrl(avatarKey: string | undefined | null): string | undefined {
  const [url, setUrl] = useState<string | undefined>(() => {
    if (!avatarKey) return undefined;
    // 如果是完整 URL，直接返回
    if (avatarKey.startsWith("http://") || avatarKey.startsWith("https://")) {
      return avatarKey;
    }
    // 查缓存
    return avatarUrlCache.get(avatarKey);
  });

  useEffect(() => {
    if (!avatarKey) {
      setUrl(undefined);
      return;
    }

    // 如果是完整 URL，直接使用
    if (avatarKey.startsWith("http://") || avatarKey.startsWith("https://")) {
      setUrl(avatarKey);
      return;
    }

    // 查缓存
    const cached = avatarUrlCache.get(avatarKey);
    if (cached) {
      setUrl(cached);
      return;
    }

    // 请求签名 URL
    let cancelled = false;
    fetch(`/api/upload/avatar?key=${encodeURIComponent(avatarKey)}`)
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled && data.url) {
          avatarUrlCache.set(avatarKey, data.url);
          setUrl(data.url);
        }
      })
      .catch(() => {
        // 静默处理
      });

    return () => {
      cancelled = true;
    };
  }, [avatarKey]);

  return url;
}
