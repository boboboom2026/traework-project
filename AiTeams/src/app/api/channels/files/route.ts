import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";
import { batchGenerateSignedUrls } from "@/storage/database/shared/signed-url-cache";
import { recordChannelFiles, removeChannelFile, inferFileType } from "@/lib/channel-files";
import { S3Storage } from "coze-coding-dev-sdk";

const storage = new S3Storage({
  endpointUrl: process.env.COZE_BUCKET_ENDPOINT_URL,
  accessKey: "",
  secretKey: "",
  bucketName: process.env.COZE_BUCKET_NAME,
  region: "cn-beijing",
});

// 允许的文件类型
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];
const VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime"];
const FILE_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
  "text/csv",
  "application/zip",
  "application/x-rar-compressed",
  "application/json",
  "text/markdown",
];
const ALL_ALLOWED_TYPES = [...IMAGE_TYPES, ...VIDEO_TYPES, ...FILE_TYPES];

// 判断用户是否为频道成员
async function isChannelMember(channelId: string, userId: string): Promise<boolean> {
  const client = getSupabaseClient();
  const { data } = await client
    .from("channel_members")
    .select("id")
    .eq("channel_id", channelId)
    .eq("user_id", userId)
    .limit(1);
  return !!(data && data.length > 0);
}

// 获取频道文件列表
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const channelId = searchParams.get("channelId");
    const userId = searchParams.get("userId");
    const type = searchParams.get("type") || "all"; // all | image | video | file

    if (!channelId || !userId) {
      return NextResponse.json({ error: "参数不完整" }, { status: 400 });
    }

    const client = getSupabaseClient();

    // 验证频道存在
    const { data: channel } = await client
      .from("channels")
      .select("id, type, is_active")
      .eq("id", channelId)
      .single();

    if (!channel || !(channel as { is_active: boolean }).is_active) {
      return NextResponse.json({ error: "频道不存在" }, { status: 404 });
    }

    // 私密频道仅成员可见文件
    if ((channel as { type: string }).type === "private") {
      if (!(await isChannelMember(channelId, userId))) {
        return NextResponse.json({ error: "无权查看此频道文件" }, { status: 403 });
      }
    }

    let query = client
      .from("channel_files")
      .select("*")
      .eq("channel_id", channelId)
      .eq("is_active", true);

    if (type === "image") query = query.eq("file_type", "image");
    else if (type === "video") query = query.eq("file_type", "video");
    else if (type === "file") query = query.eq("file_type", "file");

    const { data: files, error } = await query.order("created_at", { ascending: false });

    if (error) {
      console.error("查询频道文件失败:", error);
      return NextResponse.json({ error: "查询频道文件失败" }, { status: 500 });
    }

    if (!files || files.length === 0) {
      return NextResponse.json({ success: true, files: [] });
    }

    // 批量生成签名 URL
    const keys = (files as { file_key: string }[]).map((f) => f.file_key);
    const urlMap = await batchGenerateSignedUrls(keys);

    // 查询上传者信息
    const uploaderIds: string[] = [];
    for (const f of files as { uploader_type: string; uploader_id: string }[]) {
      if (f.uploader_type === "user") uploaderIds.push(f.uploader_id);
    }
    const agentIds = new Set(
      (files as { uploader_type: string; uploader_id: string }[])
        .filter((f) => f.uploader_type === "agent")
        .map((f) => f.uploader_id)
    );

    const userMap = new Map<string, { name: string; avatar: string | null }>();
    if (uploaderIds.length > 0) {
      const { data: users } = await client
        .from("users")
        .select("id, name, nickname, avatar")
        .in("id", [...new Set(uploaderIds)]);
      for (const u of users || []) {
        userMap.set(u.id, {
          name: (u as { nickname?: string | null; name: string }).nickname || (u as { name: string }).name,
          avatar: (u as { avatar: string | null }).avatar,
        });
      }
    }

    const agentMap = new Map<string, { name: string; avatar: string | null }>();
    if (agentIds.size > 0) {
      const { data: agents } = await client
        .from("agents")
        .select("id, name, avatar")
        .in("id", [...agentIds]);
      for (const a of agents || []) {
        agentMap.set(a.id, {
          name: (a as { name: string }).name,
          avatar: (a as { avatar: string | null }).avatar,
        });
      }
    }

    interface ChannelFileRow {
      id: string;
      channel_id: string;
      team_id: string;
      uploader_id: string;
      uploader_type: string;
      message_id: string | null;
      name: string;
      file_key: string;
      file_size: number;
      mime_type: string | null;
      file_type: string;
      source: string;
      created_at: string;
    }

    const result = (files as ChannelFileRow[]).map((f) => ({
      id: f.id,
      channelId: f.channel_id,
      teamId: f.team_id,
      uploaderId: f.uploader_id,
      uploaderType: f.uploader_type,
      messageId: f.message_id,
      name: f.name,
      fileKey: f.file_key,
      fileSize: f.file_size,
      mimeType: f.mime_type,
      fileType: f.file_type,
      source: f.source,
      createdAt: f.created_at,
      url: urlMap[f.file_key] || "",
      uploaderName: f.uploader_type === "user"
        ? userMap.get(f.uploader_id)?.name || "未知用户"
        : agentMap.get(f.uploader_id)?.name || "智能体",
      uploaderAvatar: f.uploader_type === "user"
        ? userMap.get(f.uploader_id)?.avatar || null
        : agentMap.get(f.uploader_id)?.avatar || null,
    }));

    return NextResponse.json({ success: true, files: result });
  } catch (error) {
    console.error("获取频道文件错误:", error);
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}

// 上传文件到频道文件库
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const channelId = formData.get("channelId") as string | null;
    const teamId = formData.get("teamId") as string | null;
    const userId = formData.get("userId") as string | null;

    if (!file || !channelId || !teamId || !userId) {
      return NextResponse.json({ error: "参数不完整" }, { status: 400 });
    }

    // 校验文件类型
    if (!ALL_ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json({ error: "不支持的文件类型" }, { status: 400 });
    }

    // 校验文件大小（最大 50MB）
    const maxSize = 50 * 1024 * 1024;
    if (file.size > maxSize) {
      return NextResponse.json({ error: "文件大小不能超过 50MB" }, { status: 400 });
    }

    // 校验频道成员权限
    if (!(await isChannelMember(channelId, userId))) {
      return NextResponse.json({ error: "仅频道成员可上传文件" }, { status: 403 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const fileName = `channel-files/${channelId}/${Date.now()}_${safeName}`;

    const fileKey = await storage.uploadFile({
      fileContent: buffer,
      fileName,
      contentType: file.type,
    });

    const fileType = inferFileType(file.type);

    await recordChannelFiles([
      {
        channelId,
        teamId,
        uploaderId: userId,
        uploaderType: "user",
        name: file.name,
        fileKey,
        fileSize: file.size,
        mimeType: file.type,
        fileType,
        source: "upload",
      },
    ]);

    const url = await storage.generatePresignedUrl({ key: fileKey, expireTime: 86400 });

    return NextResponse.json({
      success: true,
      file: {
        id: fileKey,
        name: file.name,
        fileKey,
        fileSize: file.size,
        mimeType: file.type,
        fileType,
        source: "upload",
        url,
      },
    });
  } catch (error) {
    console.error("上传频道文件失败:", error);
    return NextResponse.json({ error: "上传失败，请重试" }, { status: 500 });
  }
}

// 删除频道文件
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const fileId = searchParams.get("fileId");
    const userId = searchParams.get("userId");

    if (!fileId || !userId) {
      return NextResponse.json({ error: "参数不完整" }, { status: 400 });
    }

    await removeChannelFile(fileId, userId);
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "删除失败";
    const status = ["文件不存在", "只能删除自己上传的文件", "文件已删除"].includes(message) ? 400 : 500;
    console.error("删除频道文件错误:", error);
    return NextResponse.json({ error: message }, { status });
  }
}