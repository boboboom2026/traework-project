import { NextRequest, NextResponse } from "next/server";
import { LLMClient, Config, HeaderUtils } from "coze-coding-dev-sdk";

// POST /api/skills/generate - AI 生成技能（Markdown 格式）
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, description, type } = body;

    if (!name?.trim() && !description?.trim()) {
      return NextResponse.json({ error: "技能名称或描述不能为空" }, { status: 400 });
    }

    const customHeaders = HeaderUtils.extractForwardHeaders(request.headers);
    const config = new Config();
    const client = new LLMClient(config, customHeaders);

    const prompt = `请帮我生成一个 AI Agent 技能（SOP）的完整内容。

## 技能需求
技能名称：${name || "未命名技能"}
描述：${description || "用户希望创建一个自动化执行特定任务的技能"}
类型：${type || "通用技能"}

## 输出格式要求
请直接输出 Markdown 格式的技能文档，遵循以下结构：

---
name: ${name || "skill-name"}
description: "技能简短描述"
---

# 技能名称

目标：一句话说明该技能的核心目标。

## 适用范围

- 列出该技能适用的场景

## 执行步骤

每个步骤用 "Step N:" 标记，包含：
- 步骤描述
- 如果需要调用工具，直接描述要执行的动作目标（如"向XX发送消息"、"搜索成员"），无需特殊格式标记
- 如果存在条件分支，用 "- 若 A：执行 Step X" 进行说明

## 输出规范

- 输出要求1
- 输出要求2

## 异常处理

- 可能出现的问题
- 应对措施

## 实操经验

- 经验1
- 经验2

## 生成原则
1. 技能应该专注于特定领域，有清晰的目标和执行步骤
2. 步骤应该具体可执行，包含输入、处理、输出
3. 包含角色定义，确保 AI 以一致的方式执行
4. 包含实际可用的示例
5. 规则应该帮助 AI 在各种情况下做出正确决策
6. 输出纯 Markdown 文本

在文档末尾，用 <!-- metadata --> 注释块输出以下 JSON 元数据：
{
  "trigger_condition": "什么情况下触发此技能",
  "input_schema": {"type":"object","properties":{"keyword":{"type":"string"}}},
  "output_schema": {"type":"object","properties":{"result":{"type":"string"}}},
  "expected_output": "预期的输出描述"
}

请先输出 Markdown 文档，然后在 <!-- metadata --> 块中输出 JSON 元数据。`;

    const messages = [
      { role: "system" as const, content: "你是一个专业的 AI Agent 技能设计师，擅长将各种业务场景转化为可执行的 SOP 流程文档。你总是输出纯 Markdown 格式。" },
      { role: "user" as const, content: prompt }
    ];

    const response = await client.invoke(messages, {
      model: "doubao-seed-2-0-lite-260215",
      temperature: 0.7,
    });

    let content = response.content.trim();
    
    // 清理可能的 Markdown 代码块包裹
    content = content.replace(/^```\n?/, '').replace(/\n?```$/, '');

    // 解析 metadata
    let triggerCondition = "";
    let inputSchema = "";
    let outputSchema = "";
    let expectedOutput = "";
    const metaMatch = content.match(/<!-- metadata -->\s*({[\s\S]*?})\s*<!-- \/metadata -->/);
    if (metaMatch) {
      try {
        const meta = JSON.parse(metaMatch[1]);
        triggerCondition = meta.trigger_condition || "";
        inputSchema = JSON.stringify(meta.input_schema || {});
        outputSchema = JSON.stringify(meta.output_schema || {});
        expectedOutput = meta.expected_output || "";
      } catch (e) {
        console.warn("解析技能 metadata 失败:", e);
      }
    }
    // 从返回内容中移除 metadata 注释块
    const cleanContent = content.replace(/<!-- metadata -->[\s\S]*?<!-- \/metadata -->\n?/, '').trim();

    return NextResponse.json({
      success: true,
      content: cleanContent,
      triggerCondition,
      inputSchema,
      outputSchema,
      expectedOutput
    });
  } catch (error) {
    console.error("生成技能失败:", error);
    return NextResponse.json({ error: "生成技能失败" }, { status: 500 });
  }
}
