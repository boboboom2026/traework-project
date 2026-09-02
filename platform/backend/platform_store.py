# -*- coding: utf-8 -*-
"""平台配置存储：智能体 / 协作编排 / LLM 提供商 / 会话 / 运行记录 / 知识库 / 记忆。

复用 agent_framework.DataDomain（JSON 落盘 + 线程安全），
所有集合归入平台数据域 platform。
"""
from __future__ import annotations

import os
import uuid
from typing import Any, Dict, List, Optional

from agent_framework import DataDomain


def _new_id() -> str:
    return uuid.uuid4().hex[:8]


class PlatformStore:
    def __init__(self, data_dir: str):
        self.domain = DataDomain("platform", data_dir)
        d = self.domain
        # ------- 集合：agents / crews / llm_providers / sessions / traces / knowledge / memory / approvals
        d.set_seed("agents", SEED_AGENTS)
        d.set_seed("crews", SEED_CREWS)
        d.set_seed("llm_providers", SEED_PROVIDERS)
        d.set_seed("sessions", SEED_SESSIONS)
        d.set_seed("traces", [])
        d.set_seed("knowledge", [])
        d.set_seed("memory", [])
        d.set_seed("approvals", [])

    # ---------- 通用 ----------
    def all(self, coll: str) -> List[Dict[str, Any]]:
        return self.domain.all(coll)

    def get(self, coll: str, _id: str) -> Optional[Dict[str, Any]]:
        rows = self.domain.find(coll, id=_id)
        return rows[0] if rows else None

    def save(self, coll: str, record: Dict[str, Any]) -> Dict[str, Any]:
        return self.domain.append(coll, record)

    def update(self, coll: str, _id: str, patch: Dict[str, Any]) -> bool:
        return self.domain.update(coll, "id", _id, patch)

    def delete(self, coll: str, _id: str) -> bool:
        return self.domain.delete(coll, "id", _id)

    # ---------- 会话相关 ----------
    def list_sessions(self) -> List[Dict[str, Any]]:
        rows = self.domain.all("sessions")
        rows.sort(key=lambda r: r.get("updated_at", ""), reverse=True)
        return rows

    def get_session(self, sid: str) -> Optional[Dict[str, Any]]:
        return self.get("sessions", sid)

    def add_message(self, sid: str, msg: Dict[str, Any]) -> bool:
        s = self.get_session(sid)
        if s is None:
            return False
        msgs = s.get("messages") or []
        msgs.append(msg)
        from datetime import datetime
        self.domain.update("sessions", "id", sid, {
            "messages": msgs,
            "updated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        })
        return True

    def touch_session(self, sid: str) -> None:
        from datetime import datetime
        self.domain.update("sessions", "id", sid, {
            "updated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        })


# ==================== 种子数据 ====================

SEED_PROVIDERS = [
    {
        "id": "demo",
        "name": "演示模型（无需 Key）",
        "provider": "demo",
        "model": "demo/chat",
        "api_key": "",
        "base_url": "",
        "temperature": 0.2,
        "builtin": True,
        "notes": "内置演示模型：无需 API Key，确定性输出，用于跑通平台全流程",
    },
]

SEED_AGENTS = [
    {
        "id": _new_id(), "name": "资深市场调研员", "role": "调研员",
        "goal": "快速、准确地搜集并整理目标市场信息，输出结构化调研结论",
        "backstory": "十年行研经验，擅长数据搜集与事实核查，先调研再下结论。",
        "provider_id": "demo", "model": "demo/chat", "temperature": 0.2,
        "tools": ["web_search"], "memory": False, "allow_delegation": False,
        "status": "ready", "avatar": "🔍",
    },
    {
        "id": _new_id(), "name": "数据分析师", "role": "分析师",
        "goal": "基于调研数据完成商业分析，给出洞察与建议",
        "backstory": "擅长用数据讲故事，能从杂乱信息中提炼关键洞见。",
        "provider_id": "demo", "model": "demo/chat", "temperature": 0.2,
        "tools": ["calc"], "memory": False, "allow_delegation": False,
        "status": "ready", "avatar": "📊",
    },
    {
        "id": _new_id(), "name": "报告撰稿人", "role": "撰稿人",
        "goal": "把调研与分析结论整理成结构清晰、可读性强的报告",
        "backstory": "资深内容生产者，擅长把复杂内容讲得通俗且专业。",
        "provider_id": "demo", "model": "demo/chat", "temperature": 0.2,
        "tools": [], "memory": False, "allow_delegation": False,
        "status": "ready", "avatar": "✍️",
    },
]

SEED_CREWS = [
    {
        "id": _new_id(),
        "name": "市场分析工作流",
        "description": "调研 → 分析 → 成稿 的三步协作流程",
        "process": "sequential",
        "manager_agent_id": None,
        "planning": False,
        "memory": False,
        "tasks": [
            {"id": _new_id(), "title": "调研", "agent_name": "资深市场调研员",
             "description": "对目标市场进行调研，搜集规模、增速、玩家与趋势信息",
             "expected_output": "结构化调研结论；工具：web_search"},
            {"id": _new_id(), "title": "分析", "agent_name": "数据分析师",
             "description": "基于调研结论做商业分析，输出洞察与建议",
             "expected_output": "分析洞察 + 行动建议"},
            {"id": _new_id(), "title": "成稿", "agent_name": "报告撰稿人",
             "description": "汇总调研与分析结论，撰写结构完整的分析报告",
             "expected_output": "《目标课题分析报告》完整初稿"},
        ],
    },
]

_invited = [a["name"] for a in SEED_AGENTS]

SEED_SESSIONS = [
    {
        "id": "session-demo",
        "name": "AI 助手团 · 协作演示",
        "kind": "task",
        "crew_id": SEED_CREWS[0]["id"],
        "members": _invited,
        "messages": [],
        "created_at": "2026-09-02 09:00:00",
        "updated_at": "2026-09-02 09:00:00",
        "starred": True,
    },
]