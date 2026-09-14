import { NextRequest, NextResponse } from "next/server";
import { S3Storage } from "coze-coding-dev-sdk";

const storage = new S3Storage({
  endpointUrl: process.env.COZE_BUCKET_ENDPOINT_URL,
  accessKey: "",
  secretKey: "",
  bucketName: process.env.COZE_BUCKET_NAME,
  region: "cn-beijing",
});

// 上传头像到对象存储
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
    const allowedTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json({ error: "仅支持 JPG、PNG、GIF、WebP 格式的图片" }, { status: 400 });
    }

    // 校验文件大小（最大 5MB）
    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
      return NextResponse.json({ error: "图片大小不能超过 5MB" }, { status: 400 });
    }

    // 读取文件内容
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // 生成文件名：avatars/userId_原始文件名
    const ext = file.name.split(".").pop() || "jpg";
    const fileName = `avatars/${userId}_${Date.now()}.${ext}`;

    // 上传到对象存储
    const fileKey = await storage.uploadFile({
      fileContent: buffer,
      fileName,
      contentType: file.type,
    });

    // 生成签名 URL 用于即时预览
    const avatarUrl = await storage.generatePresignedUrl({
      key: fileKey,
      expireTime: 86400, // 1天有效期
    });

    return NextResponse.json({
      success: true,
      key: fileKey,
      url: avatarUrl,
    });
  } catch (error) {
    console.error("上传头像失败:", error);
    return NextResponse.json({ error: "上传失败，请重试" }, { status: 500 });
  }
}

// 根据存储 key 生成签名访问 URL
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const key = searchParams.get("key");

    if (!key) {
      return NextResponse.json({ error: "key 参数不能为空" }, { status: 400 });
    }

    // 如果是完整 URL（非 S3 key），直接返回
    if (key.startsWith("http://") || key.startsWith("https://")) {
      return NextResponse.json({ url: key });
    }

    const url = await storage.generatePresignedUrl({
      key,
      expireTime: 86400, // 1天有效期
    });

    return NextResponse.json({ url });
  } catch (error) {
    console.error("生成头像URL失败:", error);
    return NextResponse.json({ error: "生成URL失败" }, { status: 500 });
  }
}
