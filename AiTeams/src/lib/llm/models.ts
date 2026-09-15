/**
 * LLM 模型解析（服务端单一配置来源）
 *
 * 模型解析优先级（高 → 低）：
 *   1. 调用点显式配置：智能体 / 技能 / 工作流步骤的 model_config.model
 *   2. 环境变量：LLM_MODEL（主力）、LLM_MODEL_LITE（轻量场景）
 *   3. 内置默认：模型目录首项（gpt-4o-mini）
 *
 * 环境变量：
 *   LLM_MODEL        主力模型（对话、智能体、工作流、技能执行）
 *   LLM_MODEL_LITE   轻量模型（摘要、配置生成等低成本场景），默认同 LLM_MODEL
 */

import { DEFAULT_MODEL_ID, MODEL_CATALOG, type ModelOption } from "./model-catalog";

/** 主力模型 */
export const DEFAULT_LLM_MODEL: string =
  process.env.LLM_MODEL || DEFAULT_MODEL_ID;

/** 轻量模型（未单独配置时复用主力模型） */
export const LITE_LLM_MODEL: string =
  process.env.LLM_MODEL_LITE || DEFAULT_LLM_MODEL;

/** 模型目录（供 /api/models 与服务端兜底使用） */
export const AVAILABLE_MODELS: ModelOption[] = MODEL_CATALOG;

/** 解析最终使用的模型名：显式配置优先，空值回退默认 */
export function resolveModel(
  configured?: string | null,
  fallback: string = DEFAULT_LLM_MODEL,
): string {
  const value = typeof configured === "string" ? configured.trim() : "";
  return value || fallback;
}

export type { ModelOption };
