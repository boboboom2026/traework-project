# -*- coding: utf-8 -*-
"""真实模型网关：基于 litellm 统一路由多提供商（OpenAI / Anthropic / Gemini / Azure / Bedrock / 兼容接口）。

支持 base_url + api_key 的自定义兼容端点（DeepSeek / 通义 / 智谱 / Kimi 等均可）。
"""
from __future__ import annotations

import litellm  # noqa: F401  确保导入即触发环境检查

litellm.suppress_debug_info = True
litellm.drop_params = True  # 忽略不支持的参数（如部分兼容接口的 max_tokens 差异）

from typing import Any, Dict, Iterator


def _model(provider: Dict[str, Any]) -> str:
    model = (provider.get("model") or "").strip()
    if not model:
        raise ValueError("提供商未配置模型（model）")
    if "/" in model:  # 用户已显式带 provider 前缀（如 openai/gpt-4o、anthropic/claude-…）
        return model
    prov = provider.get("provider") or ""
    prefix = {
        "openai": "openai/", "openai_compatible": "openai/",
        "anthropic": "anthropic/", "gemini": "gemini/",
        "azure": "azure/", "bedrock": "bedrock/", "snowflake": "snowflake/",
    }.get(prov, "")
    if not prefix:
        # 未知/自定义路径统一按 OpenAI 兼容协议处理
        prefix = "openai/"
    return prefix + model


def _kwargs(provider: Dict[str, Any]) -> Dict[str, Any]:
    kw: Dict[str, Any] = {"temperature": float(provider.get("temperature") or 0.2)}
    if provider.get("api_key"):
        kw["api_key"] = provider["api_key"]
    if provider.get("base_url"):
        kw["api_base"] = provider["base_url"]
    return kw


def stream_completion(
    provider: Dict[str, Any],
    system: str,
    user: str,
    max_tokens: int = 800,
    timeout: int = 120,
) -> Iterator[str]:
    """调用真实模型，以生成器形式流式产出文本增量。"""
    messages = [
        {"role": "system", "content": system},
        {"role": "user", "content": user},
    ]
    kwargs = _kwargs(provider)
    resp = litellm.completion(
        model=_model(provider),
        messages=messages,
        max_tokens=max_tokens,
        stream=True,
        timeout=timeout,
        **kwargs,
    )
    for part in resp:
        try:
            delta = part.choices[0].delta.content
        except Exception:  # noqa: BLE001  部分流片无 choices/delta
            delta = None
        if delta:
            yield delta


def test_completion(provider: Dict[str, Any], timeout: int = 25) -> Dict[str, Any]:
    """连接测试：发起一次最小非流式请求，返回结构化结果（成功含回复摘要）。"""
    try:
        messages = [{"role": "user", "content": "请回复两个字：收到"}]
        kwargs = _kwargs(provider)
        resp = litellm.completion(
            model=_model(provider),
            messages=messages,
            max_tokens=8,
            timeout=timeout,
            stream=False,
            **kwargs,
        )
        try:
            content = resp.choices[0].message.content or ""
        except Exception:  # noqa: BLE001
            content = str(resp)[:80]
        return {"ok": True, "reply": content.strip()[:80]}
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "error": str(exc)[:300]}