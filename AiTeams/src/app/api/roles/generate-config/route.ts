import { NextRequest, NextResponse } from "next/server";
import { LLMClient, Config, HeaderUtils } from "coze-coding-dev-sdk";

// POST /api/roles/generate-config - AI 根据岗位职责自动生成 Hermes 6层配置
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, description, responsibilities } = body;

    if (!name?.trim()) {
      return NextResponse.json({ error: "岗位名称不能为空" }, { status: 400 });
    }

    const customHeaders = HeaderUtils.extractForwardHeaders(request.headers);
    const config = new Config();
    const client = new LLMClient(config, customHeaders);

    const prompt = `你是一个企业 AI 智能体配置专家。请根据以下岗位信息，生成该岗位对应的 AI Agent 完整配置。

## 岗位信息
- 岗位名称：${name}
- 岗位描述：${description || "无"}
- 岗位职责：
${responsibilities || "无"}

## 输出要求
请直接输出一个 JSON 对象，包含以下字段（不要输出其他文字说明，不要用 Markdown 代码块包裹）：

{
  "system_prompt": "根据岗位职责推导的完整系统提示词，定义该岗位 AI 的角色、行为准则、能力范围和工作方式",
  "greeting": "符合该岗位风格的友好开场白，1-2句话",
  "user_guidance": "输入框引导提示，提示用户可以向该岗位 AI 提问的方向",
  "prompt_guard_enabled": true,
  "tool_approval_mode": "auto",
  "memory_enabled": true,
  "memory_config": { "recall_count": 5, "strategy": "semantic" },
  "channel_context_enabled": true,
  "channel_context_limit": 20,
  "context_compress_enabled": false,
  "model_config": { "model": "doubao-seed-2-0-pro-260215", "temperature": 0.7, "max_tokens": 2000 },
  "max_iterations": 10,
  "notify_enabled": false,
  "notify_config": {}
}

## 生成原则
1. system_prompt 是最重要的字段，需涵盖：角色定义、核心职责、行为规范、回复风格、注意事项
2. system_prompt 应该具体且可执行，不要泛泛而谈
3. greeting 应符合岗位的专业风格（如客服岗位热情友好，技术岗位专业严谨）
4. user_guidance 应引导用户提出该岗位最擅长回答的问题
5. 对于需要严谨输出的岗位（如法务、财务），temperature 建议 0.3；创意类岗位建议 0.8
6. 对于需要频繁查阅资料的岗位，channel_context_enabled 设为 true
7. 对于需要记住历史信息的岗位，memory_enabled 设为 true
8. 请根据岗位特性合理设置各开关，不要全部默认开启`;

    const messages = [
      {
        role: "system" as const,
        content: "你是一个企业 AI 智能体配置专家，擅长根据岗位职责描述，自动推导出合理的 AI Agent 配置。你总是输出纯 JSON 格式，不包含任何其他文字。",
      },
      { role: "user" as const, content: prompt },
    ];

    const response = await client.invoke(messages, {
      model: "doubao-seed-2-0-lite-260215",
      temperature: 0.3,
    });

    let content = response.content.trim();

    // 清理可能的 Markdown 代码块包裹
    content = content.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");

    // 解析 JSON
    let generatedConfig;
    try {
      generatedConfig = JSON.parse(content);
    } catch {
      // 尝试提取 JSON 部分
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        generatedConfig = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("AI 返回内容无法解析为 JSON");
      }
    }

    // 确保必要字段存在，提供默认值
    const result = {
      system_prompt: generatedConfig.system_prompt || "",
      greeting: generatedConfig.greeting || "",
      user_guidance: generatedConfig.user_guidance || "",
      prompt_guard_enabled: generatedConfig.prompt_guard_enabled ?? true,
      tool_approval_mode: generatedConfig.tool_approval_mode || "auto",
      memory_enabled: generatedConfig.memory_enabled ?? true,
      memory_config: generatedConfig.memory_config || { recall_count: 5, strategy: "semantic" },
      channel_context_enabled: generatedConfig.channel_context_enabled ?? true,
      channel_context_limit: generatedConfig.channel_context_limit || 20,
      context_compress_enabled: generatedConfig.context_compress_enabled ?? false,
      model_config: generatedConfig.model_config || { model: "doubao-seed-2-0-pro-260215", temperature: 0.7, max_tokens: 2000 },
      max_iterations: generatedConfig.max_iterations || 10,
      notify_enabled: generatedConfig.notify_enabled ?? false,
      notify_config: generatedConfig.notify_config || {},
    };

    return NextResponse.json({
      success: true,
      config: result,
    });
  } catch (error) {
    console.error("生成岗位配置失败:", error);
    return NextResponse.json({ error: "生成岗位配置失败: " + (error instanceof Error ? error.message : "未知错误") }, { status: 500 });
  }
}
