import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";

export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from("models")
      .select("*")
      .eq("is_active", true)
      .order("provider", { ascending: true })
      .order("name", { ascending: true });

    if (error) throw error;

    return NextResponse.json({
      success: true,
      data: data || [],
    });
  } catch (error: any) {
    // 数据库查询失败时，使用硬编码列表作为 fallback
    const fallbackModels = [
      { id: "doubao-seed-2-0-pro-260215", name: "Seed 2.0 Pro", provider: "豆包", description: "旗舰级全能通用模型，适合复杂推理与长链路任务", supportsMultimodal: true },
      { id: "doubao-seed-2-0-lite-260215", name: "Seed 2.0 Lite", provider: "豆包", description: "均衡型模型，兼顾性能与成本", supportsMultimodal: true },
      { id: "doubao-seed-2-0-mini-260215", name: "Seed 2.0 Mini", provider: "豆包", description: "低时延、高并发场景，轻量级任务", supportsMultimodal: true },
      { id: "doubao-seed-1-8-251228", name: "Seed 1.8", provider: "豆包", description: "多模态 Agent 场景优化", supportsMultimodal: true },
      { id: "deepseek-v3-2-251201", name: "DeepSeek V3.2", provider: "DeepSeek", description: "平衡推理能力与输出长度", supportsMultimodal: false },
      { id: "kimi-k2-5-260127", name: "Kimi K2.5", provider: "Kimi", description: "迄今最智能模型，支持 Agent、代码、视觉理解", supportsMultimodal: true },
      { id: "glm-5-0-260211", name: "GLM-5", provider: "智谱", description: "面向 Agentic Engineering 的旗舰基座模型", supportsMultimodal: false },
      { id: "glm-5-turbo-260316", name: "GLM-5 Turbo", provider: "智谱", description: "深度优化的基座模型", supportsMultimodal: false },
      { id: "glm-4-7-251222", name: "GLM-4.7", provider: "智谱", description: "最新旗舰模型，更强的编程与推理能力", supportsMultimodal: false },
      { id: "minimax-m2-5-260212", name: "MiniMax M2.5", provider: "MiniMax", description: "编码与智能体领域 SOTA", supportsMultimodal: false },
      { id: "minimax-m2-7-260318", name: "MiniMax M2.7", provider: "MiniMax", description: "完成高度复杂的生产力任务", supportsMultimodal: false },
      { id: "qwen-3-5-plus-260215", name: "Qwen 3.5 Plus", provider: "千问", description: "混合架构，原生视觉语言，高效推理", supportsMultimodal: true },
      { id: "deepseek-r1-1-250120", name: "DeepSeek R1.1", provider: "DeepSeek", description: "深度推理模型", supportsMultimodal: false },
    ];

    return NextResponse.json({
      success: true,
      data: fallbackModels,
      fallback: true,
    });
  }
}