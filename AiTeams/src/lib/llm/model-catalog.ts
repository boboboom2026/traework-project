/**
 * 模型目录（客户端安全，不依赖环境变量）
 *
 * 供前端模型下拉列表与服务端 /api/models 兜底共用，保证前后端选项一致。
 * 部署到自有网关时，按网关实际提供的模型 ID 修改此列表即可。
 *
 * 说明：数组第一项为内置默认模型，服务端默认值见 ./models.ts
 */

export interface ModelOption {
  id: string;
  name: string;
  provider: string;
  description: string;
  supportsMultimodal: boolean;
}

export const MODEL_CATALOG: ModelOption[] = [
  {
    id: "gpt-4o-mini",
    name: "GPT-4o mini",
    provider: "OpenAI",
    description: "轻量高性价比，适合日常对话、摘要与信息抽取",
    supportsMultimodal: true,
  },
  {
    id: "gpt-4o",
    name: "GPT-4o",
    provider: "OpenAI",
    description: "旗舰多模态模型，适合复杂推理与长链路任务",
    supportsMultimodal: true,
  },
  {
    id: "gpt-4.1",
    name: "GPT-4.1",
    provider: "OpenAI",
    description: "长上下文与代码能力增强，适合工程类任务",
    supportsMultimodal: true,
  },
  {
    id: "gpt-4.1-mini",
    name: "GPT-4.1 mini",
    provider: "OpenAI",
    description: "均衡型模型，兼顾性能与成本",
    supportsMultimodal: true,
  },
  {
    id: "o4-mini",
    name: "o4-mini",
    provider: "OpenAI",
    description: "推理优化模型，适合复杂分析与规划",
    supportsMultimodal: false,
  },
];

/** 内置默认模型 ID（模型目录首项） */
export const DEFAULT_MODEL_ID: string = MODEL_CATALOG[0].id;
