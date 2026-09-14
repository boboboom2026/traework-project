// ============ 频道文件共享模块 ============
// 提供频道文件的录入与删除能力，供 /api/channels/files、消息发送、智能体回复复用。

import { getSupabaseClient } from "@/storage/database/supabase-client";
import { S3Storage } from "coze-coding-dev-sdk";

const storage = new S3Storage({
  endpointUrl: process.env.COZE_BUCKET_ENDPOINT_URL,
  accessKey: "",
  secretKey: "",
  bucketName: process.env.COZE_BUCKET_NAME,
  region: "cn-beijing",
});

export interface ChannelFileInput {
  channelId: string;
  teamId: string;
  uploaderId: string;
  uploaderType: "user" | "agent";
  messageId?: string | null;
  name: string;
  fileKey: string;
  fileSize: number;
  mimeType?: string | null;
  fileType: "image" | "video" | "file";
  source: "upload" | "agent";
}

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];
const VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime"];

export function inferFileType(mimeType: string): "image" | "video" | "file" {
  if (IMAGE_TYPES.includes(mimeType)) return "image";
  if (VIDEO_TYPES.includes(mimeType)) return "video";
  return "file";
}

/**
 * 批量录入频道文件（幂等：按 file_key 去重，已存在则跳过）
 */
export async function recordChannelFiles(
  files: ChannelFileInput[]
): Promise<{ recorded: number; skipped: number }> {
  if (files.length === 0) return { recorded: 0, skipped: 0 };

  const client = getSupabaseClient();
  const keys = files.map((f) => f.fileKey);

  // 查询已存在的 file_key，避免重复归档
  const { data: existing } = await client
    .from("channel_files")
    .select("file_key")
    .in("file_key", keys);

  const existingKeys = new Set((existing || []).map((r: { file_key: string }) => r.file_key));
  const toInsert = files.filter((f) => !existingKeys.has(f.fileKey));

  if (toInsert.length === 0) {
    return { recorded: 0, skipped: files.length };
  }

  const { error } = await client.from("channel_files").insert(
    toInsert.map((f) => ({
      channel_id: f.channelId,
      team_id: f.teamId,
      uploader_id: f.uploaderId,
      uploader_type: f.uploaderType,
      message_id: f.messageId || null,
      name: f.name,
      file_key: f.fileKey,
      file_size: f.fileSize,
      mime_type: f.mimeType || null,
      file_type: f.fileType,
      source: f.source,
      is_active: true,
    }))
  );

  if (error) {
    console.error("录入频道文件失败:", error);
    throw new Error("录入频道文件失败");
  }

  return { recorded: toInsert.length, skipped: files.length - toInsert.length };
}

/**
 * 删除频道文件（软删除，并清理 S3 对象，仅上传者可操作）
 */
export async function removeChannelFile(fileId: string, userId: string): Promise<void> {
  const client = getSupabaseClient();

  const { data: file, error: fetchError } = await client
    .from("channel_files")
    .select("id, uploader_id, file_key, is_active")
    .eq("id", fileId)
    .single();

  if (fetchError || !file) {
    throw new Error("文件不存在");
  }

  // 仅上传者可删除（智能体文件由成员删除时不校验 uploader，改为频道成员权限在 API 层校验）
  if ((file as { uploader_id: string }).uploader_id !== userId) {
    throw new Error("只能删除自己上传的文件");
  }

  if (!(file as { is_active: boolean }).is_active) {
    throw new Error("文件已删除");
  }

  const { error: updateError } = await client
    .from("channel_files")
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq("id", fileId);

  if (updateError) {
    console.error("删除频道文件记录失败:", updateError);
    throw new Error("删除文件失败");
  }

  // 异步清理 S3 对象
  const fileKey = (file as { file_key: string }).file_key;
  if (fileKey) {
    storage.deleteFile({ fileKey }).catch((err) => {
      console.error(`删除频道文件 S3 对象失败 (key: ${fileKey}):`, err);
    });
  }
}