import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";
import { LLMClient, Config, HeaderUtils } from "@/lib/sdk";
import { generateAgentMd } from "@/lib/agents/agent-md-parser";

// 获取智能体列表
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const teamId = searchParams.get("teamId");

    if (!teamId) {
      return NextResponse.json({ error: "团队ID不能为空" }, { status: 400 });
    }

    const client = getSupabaseClient();

    // 1. 获取智能体基本信息
    const { data, error } = await client
      .from("agents")
      .select("id, name, description, avatar, system_prompt, role_identity, boundaries, tool_ids, skill_ids, rag_dataset_ids, agent_md, workflow_id, prompt_guard_enabled, tool_approval_mode, memory_enabled, memory_config, greeting, user_guidance, context_compress_enabled, model_config, max_iterations, channel_context_enabled, channel_context_limit, channel_context_scope, notify_enabled, notify_config, position_id, status, created_by, created_at, updated_at, few_shot_examples, output_format, json_schema, max_tokens")
      .eq("team_id", teamId)
      .eq("status", "active")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("查询智能体失败:", error);
      return NextResponse.json({ error: "查询智能体失败" }, { status: 500 });
    }

    const allAgentIds = (data || []).map((d: { id: string }) => d.id);

    // 2. 获取创建人信息
    const creatorIds = [...new Set((data || []).map((d: { created_by: string | null }) => d.created_by).filter(Boolean))];
    const creatorMap: Record<string, string> = {};
    if (creatorIds.length > 0) {
      const { data: creatorsData } = await client
        .from("users")
        .select("id, name")
        .in("id", creatorIds);
      if (creatorsData) {
        for (const c of creatorsData) {
          creatorMap[c.id as string] = c.name as string;
        }
      }
    }

    // 3. 从 agents 表的 skill_ids 字段获取 Skill 名称
    const skillBindingsMap: Record<string, { id: string; name: string }[]> = {};
    const allSkillIds = new Set<string>();
    for (const agent of data || []) {
      const ids = (agent.skill_ids as string[]) || [];
      if (ids.length > 0) {
        skillBindingsMap[agent.id as string] = ids.map((id: string) => ({ id, name: id }));
        ids.forEach((id: string) => allSkillIds.add(id));
      }
    }
    const skillMap: Record<string, string> = {};
    if (allSkillIds.size > 0) {
      const { data: skillData } = await client
        .from("skills")
        .select("id, name")
        .in("id", [...allSkillIds]);
      if (skillData) {
        for (const s of skillData) {
          skillMap[s.id as string] = s.name as string;
        }
      }
    }

    // 5. 批量获取关联的 RAG 知识库名称
    const allRagIds = (data || []).flatMap((d: { rag_dataset_ids: unknown }) => (d.rag_dataset_ids as string[]) || []);
    const uniqueRagIds = [...new Set(allRagIds)];
    const ragMap: Record<string, string> = {};
    if (uniqueRagIds.length > 0) {
      const { data: ragData } = await client
        .from("rag_datasets")
        .select("id, name")
        .in("id", uniqueRagIds);
      if (ragData) {
        for (const r of ragData) {
          ragMap[r.id as string] = r.name as string;
        }
      }
    }

    // 6. 批量获取智能体绑定的工具（Tools）
    const toolBindingsMap: Record<string, { id: string; name: string }[]> = {};
    if (allAgentIds.length > 0) {
      const { data: bindingsData } = await client
        .from("agent_tool_bindings")
        .select("agent_id, skill_id, tools!inner(id, name)")
        .in("agent_id", allAgentIds);
      if (bindingsData) {
        for (const b of bindingsData) {
          const agentId = b.agent_id as string;
          const tool = (b.tools as unknown) as { id: string; name: string };
          if (!toolBindingsMap[agentId]) toolBindingsMap[agentId] = [];
          toolBindingsMap[agentId].push({ id: tool.id, name: tool.name });
        }
      }
    }

    // 7. 批量获取角色名称
    const roleNamesMap: Record<string, string> = {};
    const uniqueRoleIds = [...new Set((data || []).map((d: Record<string, unknown>) => d.role_id as string).filter(Boolean))];
    if (uniqueRoleIds.length > 0) {
      const { data: rolesData } = await client
        .from("roles")
        .select("id, name")
        .in("id", uniqueRoleIds);
      if (rolesData) {
        for (const r of rolesData) {
          roleNamesMap[r.id as string] = r.name as string;
        }
      }
    }

    // 8. 批量获取岗位名称
    const positionNamesMap: Record<string, string> = {};
    const uniquePositionIds = [...new Set((data || []).map((d: Record<string, unknown>) => d.position_id as string).filter(Boolean))];
    if (uniquePositionIds.length > 0) {
      const { data: positionsData } = await client
        .from("positions")
        .select("id, name")
        .in("id", uniquePositionIds);
      if (positionsData) {
        for (const p of positionsData) {
          positionNamesMap[p.id as string] = p.name as string;
        }
      }
    }

    const agentList = (data || []).map((d: Record<string, unknown>) => {
      const agentId = d.id as string;
      const skills = skillBindingsMap[agentId] || [];
      // 用 skillMap 填充技能名称
      const mappedSkills = skills.map(s => ({
        id: s.id,
        name: skillMap[s.id] || s.name,
      }));
      return {
        id: d.id,
        name: d.name,
        description: d.description || "",
        avatar: d.avatar || "",
        systemPrompt: d.system_prompt || "",
        toolIds: (d.tool_ids as string[]) || (toolBindingsMap[agentId] || []).map((t) => t.id),
        skillIds: mappedSkills.map((s) => s.id),
        ragDatasetIds: d.rag_dataset_ids || [],
        promptGuardEnabled: d.prompt_guard_enabled || false,
        toolApprovalMode: d.tool_approval_mode || "auto",
        memoryEnabled: d.memory_enabled || false,
        memoryConfig: d.memory_config || { recallCount: 5, strategy: "semantic" },
        greeting: d.greeting || "",
        userGuidance: d.user_guidance || "",
        contextCompressEnabled: d.context_compress_enabled || false,
        modelConfig: d.model_config || { model: "doubao-seed-2-0-pro-260215", temperature: 0.7, maxTokens: 2000 },
        maxIterations: d.max_iterations || 10,
        channelContextEnabled: d.channel_context_enabled || false,
        channelContextLimit: d.channel_context_limit || 20,
        channelContextScope: d.channel_context_scope || "channel",
        roleId: d.role_id || null,
        roleName: d.role_id && roleNamesMap ? (roleNamesMap[d.role_id as string] || "") : "",
        positionId: d.position_id || null,
        positionName: d.position_id && positionNamesMap ? (positionNamesMap[d.position_id as string] || "") : "",
        roleIdentity: d.role_identity || "",
        boundaries: (d.boundaries as any[]) || [],
        notifyEnabled: d.notify_enabled || false,
        notifyConfig: d.notify_config || {},
        skillNames: mappedSkills.map((s) => s.name),
        ragDatasetNames: ((d.rag_dataset_ids as string[]) || []).map((id: string) => ragMap[id] || id),
        toolNames: (toolBindingsMap[agentId] || []).map((t) => t.name),
        // 高级 Prompt 配置（保留兼容）
        fewShotExamples: d.few_shot_examples || "",
        outputFormat: d.output_format || "auto",
        jsonSchema: d.json_schema || "",
        maxTokens: d.max_tokens || 2000,
        status: d.status,
        workflowId: d.workflow_id || null,
        createdBy: d.created_by,
        creatorName: creatorMap[d.created_by as string] || "",
        createdAt: d.created_at,
        updatedAt: d.updated_at,
        agentMd: d.agent_md || "",
      };
    });

    return NextResponse.json({ success: true, agents: agentList });
  } catch (error) {
    console.error("获取智能体列表错误:", error);
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}

// 创建智能体
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
	let roleIdentity: string | null = null;
	let boundaries: { action: string; permission: string }[] | null = null;
	let modelConfig: string | null = null;

    const { 
      teamId, name, description, avatar, 
      roleId, positionId,
      systemPrompt,
      skillIds, toolIds, ragDatasetIds, 
      channelContextEnabled, channelContextLimit, channelContextScope, 
      notifyEnabled, notifyConfig, createdBy, 
      fewShotExamples, outputFormat, jsonSchema, maxTokens,
      promptGuardEnabled, toolApprovalMode, 
      memoryEnabled, memoryConfig,
      greeting, userGuidance,
      contextCompressEnabled, maxIterations,
      workflowId,
      selectedJobWorkNames,
    } = body;

    if (!teamId || !name?.trim()) {
      return NextResponse.json({ error: "团队ID和名称不能为空" }, { status: 400 });
    }

    const client = getSupabaseClient();

    // 自动生成：如果选了岗位但没有传 systemPrompt，从岗位职责自动生成
    let finalSystemPrompt = systemPrompt?.trim() || null;
    let finalSkillIds = skillIds || [];
    let autoGreeting: string | null = null;
    let autoUserGuidance: string | null = null;
    let autoDescription: string | null = null;
    let autoAvatar: string | null = null;

    if (positionId && !finalSystemPrompt) {
      // 1. 获取岗位信息（含 job_works）
      const { data: positionData } = await client
        .from("positions")
        .select("name, description, icon, job_works")
        .eq("id", positionId)
        .single();

      if (positionData) {
        // 解析 job_works（Supabase 返回 JSONB 时可能为字符串）
        const rawJobWorks = positionData.job_works || [];
        const jobWorks = (Array.isArray(rawJobWorks) ? rawJobWorks : (typeof rawJobWorks === 'string' ? JSON.parse(rawJobWorks) : [])) as { name: string; description: string }[];
        const positionName = positionData.name || "";
        const positionDesc = positionData.description || "";

        // 自动映射头像：使用岗位的 icon 作为默认头像
        autoAvatar = positionData.icon || null;

        // 2. 获取团队可用的工具列表
        const { data: availableTools } = await client
          .from("tools")
          .select("id, name, description, action, parameters, category")
          .eq("team_id", teamId)
          .eq("enabled", true);

        const toolList = availableTools || [];
        const toolDesc = toolList.length > 0
          ? toolList.map((t: any) => `- ${t.name}（${t.description || t.action}）${t.parameters ? `参数: ${JSON.stringify(t.parameters)}` : ""}`).join("\n")
          : "暂无可用工具";

        // 3. 为选中的职能工作生成 Skill（Markdown SOP）
        const generatedSkillIds: string[] = [];
        // 过滤：只处理用户选择的 jobWorks
        const selectedJobWorks = selectedJobWorkNames?.length
          ? jobWorks.filter(jw => selectedJobWorkNames.includes(jw.name))
          : jobWorks; // 兼容旧版：未传 selectedJobWorkNames 时全选

        if (selectedJobWorks.length > 0) {
          for (const jw of selectedJobWorks) {
            const skillPrompt = `你是一位AI智能体流程设计专家。请根据以下信息，为一个智能体生成一份可执行的 Skill 操作流程文档（Markdown 格式）。

## 岗位信息
- 岗位名称：${positionName}
- 岗位描述：${positionDesc || "无"}

## 职能工作
- 工作名称：${jw.name}
- 工作描述：${jw.description || "无"}

## 可用的工具/函数列表
${toolDesc}

## 要求
1. 输出一份完整的 Markdown 格式的 SOP 文档
2. 标题使用 ## 层级
3. 包含以下章节：
   - **概述**：简要说明这项工作的目标
   - **前置条件**：执行前需要准备什么
   - **执行步骤**：详细的分步操作流程，在适当的步骤中说明可调用的功能及其用途（例如发送消息、搜索成员、创建工作流等），但不要使用任何 XML 标签**
   - **输出物**：完成后的交付物
   - **异常处理**：执行过程中可能出现的异常情况及处理方式
4. 工具与功能的使用用自然语言描述即可（如"调用发送消息功能通知用户"），不要使用任何 XML/标签包裹
5. 语言简洁专业，步骤清晰可执行
6. 只输出 Markdown 文档内容，不要额外解释

最后，请以 JSON 格式补充以下元数据（放在 Markdown 文档之后，用 --- 分隔）：
{
  "trigger_condition": "什么情况下触发此技能",
  "input_schema": {"type": "object", "properties": {}, "description": "执行此技能需要哪些输入参数"},
  "output_schema": {"type": "object", "properties": {}, "description": "执行完成后输出什么结果"},
  "expected_output": "预期输出的简要描述"
}`;

            try {
              const llmConfig = new Config();
              const llmClient = new LLMClient(llmConfig);
              const llmResponse = await llmClient.invoke(
                [{ role: "user", content: skillPrompt }],
                { model: "doubao-seed-2-0-pro-260215", temperature: 0.5 }
              );
              const skillContent = llmResponse.content.trim();

              // 解析 Markdown 内容与 JSON 元数据（用 --- 分隔）
              const metaSeparator = '\n---\n';
              const metaIdx = skillContent.indexOf(metaSeparator);
              let markdownContent = skillContent;
              let triggerCondition = null;
              let inputSchema = null;
              let outputSchema = null;
              let expectedOutput = null;
              
              if (metaIdx > 0) {
                markdownContent = skillContent.substring(0, metaIdx).trim();
                const metaJson = skillContent.substring(metaIdx + metaSeparator.length).trim();
                try {
                  const meta = JSON.parse(metaJson);
                  triggerCondition = meta.trigger_condition || null;
                  inputSchema = meta.input_schema || null;
                  outputSchema = meta.output_schema || null;
                  expectedOutput = meta.expected_output || null;
                } catch (e) {
                  console.warn(`解析技能"${jw.name}"元数据失败，使用默认值`);
                }
              }

              // 保存 Skill 到 skills（含新架构字段）
              const { data: newSkill, error: skillError } = await client
                .from("skills")
                .insert({
                  team_id: teamId,
                  position_id: positionId,
                  name: jw.name,
                  description: jw.description || "",
                  content: markdownContent,
                  source_type: "generated",
                  is_executable: true,
                  trigger_condition: triggerCondition,
                  input_schema: inputSchema,
                  output_schema: outputSchema,
                  expected_output: expectedOutput,
                })
                .select("id")
                .single();

              if (!skillError && newSkill) {
                generatedSkillIds.push(newSkill.id as string);
              }
            } catch (e) {
              console.error(`生成技能"${jw.name}"失败:`, e);
            }
          }
        }

        finalSkillIds = generatedSkillIds;

        // 4. 用 LLM 一次性生成所有文本字段
        const llmPrompt = `你是一位AI智能体配置专家。请根据以下岗位信息，为该岗位的AI智能体生成完整的配置信息。

岗位名称：${positionName}
岗位职责描述：${positionDesc || "无"}

该岗位的职能工作：
${selectedJobWorks.map((jw: any) => `- ${jw.name}${jw.description ? `: ${jw.description}` : ""}`).join("\n") || "无"}

可用工具：
${toolDesc}

请以 JSON 格式输出以下 7 个字段（不要额外解释，直接输出 JSON）：

{
  "role_identity": "SO.md 灵魂文档——一句话定义你是谁，然后描述你的核心信念、价值观、性格特质。用有温度的语言，不是职位描述，而是身份认同。例如：'你是这个团队的技术顾问——技术方案的守护者。你相信好的技术方案应该经得起推敲...'",
  "system_prompt": "一份完整的 System Prompt，使用结构化格式：\n## 核心能力\n（列出该岗位的核心能力，分点说明）\n\n## 工作原则\n（列出工作原则，分点说明）\n\n## 工具使用说明\n（说明可用的功能及其用途，用自然语言描述，不要使用任何 XML 标签）\n\n## 工作流程\n（列出典型工作流程）\n\n## 限制\n（列出该岗位的限制）",
  "greeting": "一段友好的开场白，例如'你好！我是{岗位名}，有什么可以帮助你的？'，要自然亲切",
  "user_guidance": "一行输入框引导提示文字，例如'请输入你的需求，例如：帮我写一篇公众号推文...'，要具体可操作",
  "description": "一行简短的智能体描述（40字以内），概括该智能体的核心职责",
  "boundaries": [{"action": "示例动作", "permission": "allow"}],
  "model_config": {"model": "doubao-seed-2-0-pro-260215", "temperature": 0.7, "max_tokens": 4096}
}

注意：
- role_identity 是智能体的灵魂，用有温度的语言描述智能体的身份认同和信念，不要写"负责XX"这种职位描述
- system_prompt 要结构化，使用 ## 标题分段，在工具使用说明中自然语言描述有哪些功能可用（不要使用任何 XML 标签）
- boundaries 定义智能体的安全边界，permission 可选 allow/deny/approval
- model_config 给出推荐的模型和参数`;

        try {
          const llmConfig = new Config();
          const llmClient = new LLMClient(llmConfig);
          const llmResponse = await llmClient.invoke(
            [{ role: "user", content: llmPrompt }],
            { model: "doubao-seed-2-0-pro-260215", temperature: 0.5 }
          );
          const raw = llmResponse.content.trim();
          // 尝试解析 JSON（可能包含 markdown 代码块包裹）
          let parsed: any;
          const jsonMatch = raw.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            parsed = JSON.parse(jsonMatch[0]);
          } else {
            parsed = JSON.parse(raw);
          }
          finalSystemPrompt = parsed.system_prompt?.trim() || null;
          autoGreeting = parsed.greeting?.trim() || null;
          autoUserGuidance = parsed.user_guidance?.trim() || null;
          autoDescription = parsed.description?.trim() || null;
          if (parsed.role_identity) {
            roleIdentity = parsed.role_identity.trim();
          }
          if (parsed.boundaries) {
            boundaries = parsed.boundaries;
          }
          if (parsed.model_config) {
            modelConfig = JSON.stringify(parsed.model_config);
          }
        } catch (e) {
          console.error("LLM 生成配置失败，使用默认模板:", e);
          roleIdentity = `你是这个团队的「${positionName}」——${positionDesc || "专业角色"}。\n你相信专业创造价值，用行动推动团队进步。\n你善于发现问题、解决问题，在每一次协作中不断成长。\n你坚信：做好每一件小事，就是成就大事。`;
          finalSystemPrompt = `## 核心能力\n1. ${positionName}相关工作：${positionDesc || "根据岗位职责完成工作"}\n${selectedJobWorks.map((jw: any) => `2. ${jw.name}${jw.description ? `：${jw.description}` : ""}`).join("\n") || ""}\n\n## 工作原则\n- 以目标为导向，高效完成任务\n- 遇到问题主动沟通，及时反馈\n- 持续学习，不断提升专业能力\n\n## 工具使用说明\n在执行操作或调用技能时，使用可用的工具（如发送消息、搜索成员、执行技能等）来完成，用自然语言调用即可。\n\n## 工作流程\n1. 理解用户需求，明确任务目标\n2. 调用相关技能或工具执行任务\n3. 输出结果供用户确认\n\n可用工具：\n${toolDesc}`;
          autoGreeting = `你好！我是${positionName}，很高兴为你服务！`;
          autoUserGuidance = `请输入你的需求，例如：我需要...`;
          autoDescription = `专业的${positionName}，负责${positionDesc || "相关工作"}`;
          boundaries = [{ action: "发送消息", permission: "allow" }];
          modelConfig = JSON.stringify({ model: "doubao-seed-2-0-pro-260215", temperature: 0.7, max_tokens: 4096 });
        }
      }
    }

    const { data, error } = await client
      .from("agents")
      .insert({
        team_id: teamId,
        name: name.trim(),
        description: description?.trim() || autoDescription || null,
        avatar: avatar || autoAvatar || null,
        role_id: roleId || null,
        position_id: positionId || null,
        system_prompt: finalSystemPrompt,
        tool_ids: toolIds || [],
        skill_ids: finalSkillIds,
        rag_dataset_ids: ragDatasetIds || [],
        role_identity: roleIdentity?.trim() || null,
        boundaries: boundaries || [],
        prompt_guard_enabled: promptGuardEnabled || false,
        tool_approval_mode: toolApprovalMode || "auto",
        memory_enabled: memoryEnabled || false,
        memory_config: memoryConfig || null,
        greeting: greeting?.trim() || autoGreeting || null,
        user_guidance: userGuidance?.trim() || autoUserGuidance || null,
        context_compress_enabled: contextCompressEnabled || false,
        model_config: modelConfig || null,
        max_iterations: maxIterations || 10,
        channel_context_enabled: channelContextEnabled || false,
        channel_context_limit: channelContextLimit || 20,
        channel_context_scope: channelContextScope || "channel",
        notify_enabled: notifyEnabled || false,
        notify_config: notifyConfig || {},
        status: "active",
        created_by: createdBy || null,
        few_shot_examples: fewShotExamples?.trim() || null,
        output_format: outputFormat || "auto",
        json_schema: jsonSchema?.trim() || null,
        max_tokens: maxTokens || 2000,
      })
      .select("id, name, created_at")
      .single();

    if (error) {
      console.error("创建智能体失败:", error);
      return NextResponse.json({ error: "创建智能体失败" }, { status: 500 });
    }

    // 绑定工具（Tools）
    if (data && toolIds && toolIds.length > 0) {
      const bindings = toolIds.map((toolId: string) => ({
        id: crypto.randomUUID(),
        agent_id: data.id,
        skill_id: toolId,
      }));
      await client.from("agent_tool_bindings").insert(bindings);
    }

    // 自动生成 agent.md
    try {
      const finalToolIds = toolIds || [];
      const finalRagIds = ragDatasetIds || [];

      const skillNames: string[] = [];
      if (finalSkillIds.length > 0) {
        const { data: skills } = await client.from("skills").select("name").in("id", finalSkillIds);
        if (skills) skillNames.push(...skills.map(s => s.name as string));
      }

      const toolNames: string[] = [];
      if (finalToolIds.length > 0) {
        const { data: tools } = await client.from("tools").select("name").in("id", finalToolIds);
        if (tools) toolNames.push(...tools.map(t => t.name as string));
      }

      const ragNames: string[] = [];
      if (finalRagIds.length > 0) {
        const { data: rags } = await client.from("rag_datasets").select("name").in("id", finalRagIds);
        if (rags) ragNames.push(...rags.map(r => r.name as string));
      }

      const generatedMd = generateAgentMd({
        name: name.trim(),
        description: description?.trim(),
        roleIdentity: roleIdentity || undefined,
        systemPrompt: systemPrompt || undefined,
        greeting: greeting?.trim() || autoGreeting || undefined,
        userGuidance: userGuidance?.trim() || autoUserGuidance || undefined,
        skillNames,
        toolNames,
        ragNames,
        fewShotExamples: fewShotExamples || undefined,
        outputFormat: outputFormat || undefined,
        jsonSchema: jsonSchema || undefined,
        maxTokens: maxTokens || undefined,
        modelConfig: modelConfig ? JSON.parse(modelConfig) : undefined,
        promptGuardEnabled: promptGuardEnabled || undefined,
        toolApprovalMode: toolApprovalMode || undefined,
        memoryEnabled: memoryEnabled || undefined,
        contextCompressEnabled: contextCompressEnabled || undefined,
        channelContextEnabled: channelContextEnabled || undefined,
      });

      await client.from("agents").update({ agent_md: generatedMd }).eq("id", data.id);
    } catch (e) {
      console.warn("自动生成 agent.md 失败:", e);
    }

    return NextResponse.json({ success: true, agent: data });
  } catch (error) {
    console.error("创建智能体错误:", error);
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}

// 更新智能体
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    console.log("[PUT /api/agents] Received body:", JSON.stringify({ ...body, toolIds: body.toolIds }));
    const { 
      id, name, description, avatar, 
      roleId,
      positionId,
      systemPrompt,
      skillIds, toolIds, ragDatasetIds, 
      channelContextEnabled, channelContextLimit, channelContextScope, 
      notifyEnabled, notifyConfig, 
      fewShotExamples, outputFormat, jsonSchema, maxTokens,
      promptGuardEnabled, toolApprovalMode,
      memoryEnabled, memoryConfig,
      greeting, userGuidance,
      contextCompressEnabled, modelConfig, maxIterations,
      workflowId,
      roleIdentity, boundaries,
    } = body;

    if (!id || !name?.trim()) {
      return NextResponse.json({ error: "智能体ID和名称不能为空" }, { status: 400 });
    }

    const client = getSupabaseClient();

    const updateData: Record<string, unknown> = {
      name: name.trim(),
      description: description?.trim() || null,
      updated_at: new Date().toISOString(),
    };
    if (avatar !== undefined) updateData.avatar = avatar;
    if (systemPrompt !== undefined) updateData.system_prompt = systemPrompt?.trim() || null;
    if (toolIds !== undefined) updateData.tool_ids = toolIds;
    if (ragDatasetIds !== undefined) updateData.rag_dataset_ids = ragDatasetIds;
    if (promptGuardEnabled !== undefined) updateData.prompt_guard_enabled = promptGuardEnabled;
    if (toolApprovalMode !== undefined) updateData.tool_approval_mode = toolApprovalMode;
    if (memoryEnabled !== undefined) updateData.memory_enabled = memoryEnabled;
    if (memoryConfig !== undefined) updateData.memory_config = memoryConfig;
    if (greeting !== undefined) updateData.greeting = greeting?.trim() || null;
    if (userGuidance !== undefined) updateData.user_guidance = userGuidance?.trim() || null;
    if (contextCompressEnabled !== undefined) updateData.context_compress_enabled = contextCompressEnabled;
    if (modelConfig !== undefined) updateData.model_config = modelConfig;
    if (maxIterations !== undefined) updateData.max_iterations = maxIterations;
    if (channelContextEnabled !== undefined) updateData.channel_context_enabled = channelContextEnabled;
    if (channelContextLimit !== undefined) updateData.channel_context_limit = channelContextLimit;
    if (channelContextScope !== undefined) updateData.channel_context_scope = channelContextScope;
    if (notifyEnabled !== undefined) updateData.notify_enabled = notifyEnabled;
    if (notifyConfig !== undefined) updateData.notify_config = notifyConfig;
    if (fewShotExamples !== undefined) updateData.few_shot_examples = fewShotExamples?.trim() || null;
    if (outputFormat !== undefined) updateData.output_format = outputFormat || "auto";
    if (jsonSchema !== undefined) updateData.json_schema = jsonSchema?.trim() || null;
    if (maxTokens !== undefined) updateData.max_tokens = maxTokens || 2000;
    if (roleId !== undefined) updateData.role_id = roleId || null;
    if (positionId !== undefined) updateData.position_id = positionId || null;
    if (roleIdentity !== undefined) updateData.role_identity = roleIdentity?.trim() || null;
    if (boundaries !== undefined) updateData.boundaries = boundaries;
    if (skillIds !== undefined) updateData.skill_ids = skillIds;
    if (workflowId !== undefined) updateData.workflow_id = workflowId || null;

    const { data, error } = await client
      .from("agents")
      .update(updateData)
      .eq("id", id)
      .select("id, name")
      .single();

    if (error) {
      console.error("更新智能体失败:", error);
      return NextResponse.json({ error: "更新智能体失败" }, { status: 500 });
    }

    // 更新工具绑定（Tools）
    if (toolIds !== undefined) {
      await client.from("agent_tool_bindings").delete().eq("agent_id", id);
      if (toolIds.length > 0) {
        const bindings = toolIds.map((toolId: string) => ({
          id: crypto.randomUUID(),
          agent_id: id,
          skill_id: toolId,
        }));
        const { data: insertData, error: insertError } = await client.from("agent_tool_bindings").insert(bindings);
        if (insertError) {
          console.error("[PUT] Insert tool bindings failed:", insertError);
        }
      }
      // 同步更新 tool_ids 数组字段
      await client.from("agents").update({ tool_ids: toolIds }).eq("id", id);
    }

    // 自动生成 agent.md
    try {
      const finalSkillIds = skillIds || [];
      const finalToolIds = toolIds || [];
      const finalRagIds = ragDatasetIds || [];

      // 查询技能名称
      const skillNames: string[] = [];
      if (finalSkillIds.length > 0) {
        const { data: skills } = await client.from("skills").select("name").in("id", finalSkillIds);
        if (skills) skillNames.push(...skills.map(s => s.name as string));
      }

      // 查询工具名称
      const toolNames: string[] = [];
      if (finalToolIds.length > 0) {
        const { data: tools } = await client.from("tools").select("name").in("id", finalToolIds);
        if (tools) toolNames.push(...tools.map(t => t.name as string));
      }

      // 查询知识库名称
      const ragNames: string[] = [];
      if (finalRagIds.length > 0) {
        const { data: rags } = await client.from("rag_datasets").select("name").in("id", finalRagIds);
        if (rags) ragNames.push(...rags.map(r => r.name as string));
      }

      const generatedMd = generateAgentMd({
        name: name.trim(),
        description: description?.trim(),
        roleIdentity: roleIdentity || undefined,
        systemPrompt: systemPrompt || undefined,
        greeting: greeting || undefined,
        userGuidance: userGuidance || undefined,
        skillNames,
        toolNames,
        ragNames,
        fewShotExamples: fewShotExamples || undefined,
        outputFormat: outputFormat || undefined,
        jsonSchema: jsonSchema || undefined,
        maxTokens: maxTokens || undefined,
        modelConfig: modelConfig || undefined,
        promptGuardEnabled: promptGuardEnabled || undefined,
        toolApprovalMode: toolApprovalMode || undefined,
        memoryEnabled: memoryEnabled || undefined,
        contextCompressEnabled: contextCompressEnabled || undefined,
        channelContextEnabled: channelContextEnabled || undefined,
      });

      await client.from("agents").update({ agent_md: generatedMd }).eq("id", id);
    } catch (e) {
      console.warn("自动生成 agent.md 失败:", e);
    }

    return NextResponse.json({ success: true, agent: data });
  } catch (error) {
    console.error("更新智能体错误:", error);
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}

// 删除智能体（软删除）
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "智能体ID不能为空" }, { status: 400 });
    }

    const client = getSupabaseClient();

    const { error } = await client
      .from("agents")
      .update({ status: "deleted", updated_at: new Date().toISOString() })
      .eq("id", id);

    if (error) {
      console.error("删除智能体失败:", error);
      return NextResponse.json({ error: "删除智能体失败" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("删除智能体错误:", error);
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}
