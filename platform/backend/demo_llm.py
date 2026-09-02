# -*- coding: utf-8 -*-
"""演示模型（无需 API Key 即可跑通完整协作闭环）。

行为与真实 LLM 对齐：支持"思考过程"流式输出（逐块生成长文本），
引擎将其通过 SSE 推给前端以实现「思考中…」逐字增长效果。
"""
from __future__ import annotations

import time
from typing import Iterator


def _templates(role: str) -> list:
    """不同角色的演示文案骨架，让输出带有『角色感』。"""
    tpl = {
        "调研员": "已完成 {topic} 的市场调研：市场规模约 {size} 亿元，年增速 {growth}%，"
                 "核心玩家包括 {players}。主要发现：{finding}。",
        "分析师": "基于调研数据对 {topic} 进行深入分析：用户需求{need}，竞争格局{competition}。"
                 "SWOT 摘要：优势{sw}，风险{rw}。建议关注 {sugg}。",
        "撰稿人": "已根据上游材料撰写《{topic} 分析报告》初稿：开篇阐述背景与意义，"
                 "正文按『市场概况 → 竞争格局 → 机会与风险 → 行动建议』展开，"
                 "结尾给出 3 条可落地建议并附数据附表。",
        "代码": "已根据需求完成编码任务：设计模块结构、实现核心函数并通过单元测试，"
                "输出文件与调用示例整理完毕。",
        "客服": "已回复该咨询：首段致谢，正文分条解答核心疑问，结尾提供后续帮助入口，"
                "语气专业友好且口径一致。",
        "策划": "已产出活动策划初稿：主题创意、目标人群、节奏排期、预算分配、效果衡量指标，"
                "以及风险预案。",
    }
    for k, v in tpl.items():
        if k in (role or ""):
            return [v]
    return ["已围绕 {topic} 完成本轮任务：梳理要点、产出结构化结论，并提炼出后续行动项。"]


class DemoLLM:
    """确定性演示模型：按角色模板生成文本，可逐块流式输出。"""

    def __init__(self, chunk_size: int = 4, interval: float = 0.055):
        self.chunk_size = chunk_size
        self.interval = interval

    def generate(self, role: str, task: str, topic: str = "") -> str:
        """整体生成（一次性返回）。"""
        kw = {
            "topic": topic or "目标课题",
            "size": "120", "growth": "18%", "players": "头部厂商与新锐玩家",
            "finding": "需求侧渗透率快速提升，供给侧集中度开始分化",
            "need": "偏向个性化与效率工具，付费意愿较强",
            "competition": "头部集中 + 长尾并存，差异化空间明显",
            "sw": "生态协同与自动化能力", "rw": "合规与幻觉风险",
            "sugg": "垂直场景深耕与人工兜底机制",
        }
        role_key = None
        for k in ("调研员", "分析师", "撰稿人", "代码", "客服", "策划"):
            if k in (role or ""):
                role_key = k
                break
        tpls = _templates(role)
        text = tpls[0]
        try:
            return text.format(**kw)
        except Exception:
            return text

    def stream(self, role: str, task: str, topic: str = "") -> Iterator[str]:
        """流式生成：逐字符块产出，模拟 LLM token 流。"""
        text = self.generate(role, task, topic)
        for i in range(0, len(text), self.chunk_size):
            time.sleep(self.interval)
            yield text[i:i + self.chunk_size]