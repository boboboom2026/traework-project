"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAvatarUrl } from "@/hooks/use-avatar-url";

interface UserAvatarProps {
  /** 对象存储 key 或完整 URL */
  avatarKey?: string | null;
  /** 直接指定图片 src（优先级高于 avatarKey，用于本地预览等场景） */
  src?: string | null;
  /** 用户名，用于生成文字回退和 alt */
  name: string;
  /** Avatar 尺寸 class，如 "w-8 h-8" */
  className?: string;
  /** Fallback 文字尺寸 class，如 "text-xs" */
  fallbackClassName?: string;
  /** 点击回调 */
  onClick?: (e: React.MouseEvent) => void;
}

/**
 * 通用用户头像组件
 * - 有 src 时直接使用 src 作为图片地址（本地预览等场景）
 * - 有 avatarKey 时通过 useAvatarUrl 解析签名 URL
 * - 无图片时回退为首字文字头像
 */
export function UserAvatar({
  avatarKey,
  src,
  name,
  className,
  fallbackClassName,
  onClick,
}: UserAvatarProps) {
  const resolvedUrl = useAvatarUrl(avatarKey);
  const imageSrc = src || resolvedUrl;

  return (
    <Avatar className={className} onClick={onClick}>
      {imageSrc && <AvatarImage src={imageSrc} alt={name} />}
      <AvatarFallback
        className={`bg-primary/10 text-primary font-medium ${fallbackClassName ?? ""}`}
      >
        {name.charAt(0)}
      </AvatarFallback>
    </Avatar>
  );
}
