import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";
import { verificationCodes, users } from "@/storage/database/shared/schema";

// 生成6位验证码
function generateCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// 发送验证码
export async function POST(request: NextRequest) {
  try {
    const { phone, type = "login" } = await request.json();

    if (!phone) {
      return NextResponse.json({ error: "手机号不能为空" }, { status: 400 });
    }

    const client = getSupabaseClient();

    // 生成验证码
    const code = generateCode();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5分钟后过期

    // 先删除该手机号旧验证码
    await client.from("verification_codes").delete().eq("phone", phone).eq("used", false);

    // 插入新验证码
    const { error: insertError } = await client.from("verification_codes").insert({
      phone,
      code,
      type,
      expires_at: expiresAt.toISOString(),
    });

    if (insertError) {
      console.error("插入验证码失败:", insertError);
      return NextResponse.json({ error: "发送验证码失败" }, { status: 500 });
    }

    // TODO: 实际项目中应该发送短信，这里仅返回验证码用于测试
    console.log(`[测试] 验证码: ${code}`);

    return NextResponse.json({
      success: true,
      message: "验证码已发送",
      // 测试环境下返回验证码
      code: process.env.NODE_ENV === "development" ? code : undefined,
    });
  } catch (error) {
    console.error("发送验证码错误:", error);
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}
