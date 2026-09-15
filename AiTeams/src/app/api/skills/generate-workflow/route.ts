import { DEFAULT_LLM_MODEL } from "@/lib/llm/models";
import { NextRequest, NextResponse } from "next/server";
import { LLMClient, Config, HeaderUtils } from "@/lib/sdk";
import { getSupabaseClient } from "@/storage/database/supabase-client";

export async function POST(request: NextRequest) {
  try {
    const { skill_id } = await request.json();
    if (!skill_id) {
      return NextResponse.json({ error: "skill_id is required" }, { status: 400 });
    }

    const supabase = getSupabaseClient();
    const { data: skill, error } = await supabase
      .from("skills")
      .select("id, name, content, position_id")
      .eq("id", skill_id)
      .single();

    if (error || !skill) {
      return NextResponse.json({ error: "Skill not found" }, { status: 404 });
    }

    const customHeaders = HeaderUtils.extractForwardHeaders(request.headers);
    const config = new Config();
    const client = new LLMClient(config, customHeaders);

    const systemPrompt = `你是一个工作流解析器。你的任务是将SOP（标准操作流程）文档解析为可执行的工作流步骤。

请严格按以下JSON格式输出，不要包含其他内容：

{
  "name": "工作流名称（从SOP标题提取）",
  "description": "工作流描述（从SOP摘要提取）",
  "trigger_condition": "触发条件描述，如'用户要求生成日报、日报、daily report'",
  "steps": [
    {
      "step_id": "s1",
      "name": "步骤名称",
      "description": "步骤描述",
      "type": "tool_call | llm_generate | human_review",
      "input_template": "LLM输入模板，用{{key}}引用上一步的output_key。如果type=human_review，这里是展示给用户的消息",
      "output_key": "本步骤输出存入上下文中的key名",
      "tool_name": "如果type=tool_call，指定工具名（如query_data, send_message等），否则留空",
      "config": {}
    }
  ]
}

步骤类型说明：
- tool_call: 调用工具，需要指定tool_name和input_template
- llm_generate: LLM生成内容，需要指定input_template（提示词模板）
- human_review: 人工审批，执行到此步暂停，等待用户确认

规则：
1. 每个步骤的output_key必须是唯一的
2. 步骤之间通过{{key}}引用上一步的输出
3. 通常最后一步是human_review，让用户确认后再执行
4. 保持步骤简洁明了，每个步骤职责单一
5. 步骤数量控制在3-8个之间`;

    const userMessage = `请解析以下SOP文档，生成工作流步骤：

${skill.content}`;

    const response = await client.invoke(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      {
        model: DEFAULT_LLM_MODEL,
        temperature: 0.3,
      }
    );

    // 解析 JSON 响应
    let workflow;
    try {
      workflow = JSON.parse(response.content);
    } catch {
      // 尝试从 markdown 代码块中提取 JSON
      const jsonMatch = response.content.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        workflow = JSON.parse(jsonMatch[1]);
      } else {
        throw new Error("Failed to parse LLM response as JSON");
      }
    }

    return NextResponse.json({
      ...workflow,
      skill_id: skill.id,
      position_id: skill.position_id,
    });
  } catch (error: any) {
    console.error("Generate workflow error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to generate workflow" },
      { status: 500 }
    );
  }
}