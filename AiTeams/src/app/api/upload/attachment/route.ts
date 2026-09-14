import { NextRequest, NextResponse } from "next/server";
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
];

const ALL_ALLOWED_TYPES = [...IMAGE_TYPES, ...VIDEO_TYPES, ...FILE_TYPES];

// 上传附件到对象存储
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const userId = formData.get("userId") as string | null;

    if (!file) {
      return NextResponse.json({ error: "请选择要上传的文件" }, { status: 400 });
    }

    if (!userId) {
      return NextResponse.json({ error: "用户ID不能为空" }, { status: 400 });
    }

    // 校验文件类型
    if (!ALL_ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json({ error: "不支持的文件类型" }, { status: 400 });
    }

    // 校验文件大小（最大 20MB）
    const maxSize = 20 * 1024 * 1024;
    if (file.size > maxSize) {
      return NextResponse.json({ error: "文件大小不能超过 20MB" }, { status: 400 });
    }

    // 判断附件类型
    let attachmentType: "image" | "video" | "file" = "file";
    if (IMAGE_TYPES.includes(file.type)) attachmentType = "image";
    else if (VIDEO_TYPES.includes(file.type)) attachmentType = "video";

    // 读取文件内容
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // 生成文件名
    const ext = file.name.split(".").pop() || "bin";
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const fileName = `attachments/${userId}/${Date.now()}_${safeName}`;

    // 上传到对象存储
    const fileKey = await storage.uploadFile({
      fileContent: buffer,
      fileName,
      contentType: file.type,
    });

    // 生成签名 URL 用于即时预览
    const url = await storage.generatePresignedUrl({
      key: fileKey,
      expireTime: 86400,
    });

    return NextResponse.json({
      success: true,
      key: fileKey,
      url,
      type: attachmentType,
      name: file.name,
      size: file.size,
      contentType: file.type,
    });
  } catch (error) {
    console.error("上传附件失败:", error);
    return NextResponse.json({ error: "上传失败，请重试" }, { status: 500 });
  }
}
