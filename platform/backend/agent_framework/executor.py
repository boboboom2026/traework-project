# -*- coding: utf-8 -*-
"""Crew 执行器。

默认使用确定性本地规划器（LocalPlanner）：无需 LLM / API Key 即可跑通
「意图 → 选工具 → 调用（可被审批门接管）」的完整闭环，方便离线演示与测试。

接入真实 CrewAI：定义结构完全一致，将 execute_task 内部替换为
`crewai.Crew(agents=[...], tasks=[...]).kickoff(inputs)` 即可（见 README）。
"""
from __future__ import annotations

import re
from typing import Any, Dict, List, Optional

from .base import Agent, Crew, Task, Tool


class LocalPlanner:
    """按任务意图关键词匹配工具（可扩展为 LLM 选择）。"""

    RULES: List[tuple] = [
        (r"(下单|点餐|order|下单菜品)", "order_process"),
        (r"(菜单|菜品|menu|查询)", "query_menu"),
    ]

    def select_tool(self, task: Task, agent: Agent) -> Optional[str]:
        text = f"{task.description} {task.inputs}"
        for pattern, tool_name in self.RULES:
            if re.search(pattern, text, re.IGNORECASE):
                if agent.tool(tool_name):
                    return tool_name
        # 兜底：取该 agent 的第一个工具
        return agent.tools[0].name if agent.tools else None


class CrewExecutor:
    def __init__(self, planner: Optional[LocalPlanner] = None):
        self.planner = planner or LocalPlanner()

    def execute_task(self, task: Task, agent: Agent) -> str:
        tool_name = self.planner.select_tool(task, agent)
        if tool_name is None:
            return f"[{agent.name}] 无可用工具，任务未执行"
        tool = agent.tool(tool_name)
        # 记录本次请求者（用于审批记录署名）
        tool.requester = agent.name
        result = tool.run(**task.inputs)
        agent.status = "busy"
        return result

    def kickoff(self, crew: Crew, inputs: Optional[Dict[str, Any]] = None) -> List[str]:
        """顺序执行 crew 中的任务，共享 crew 记忆。"""
        outputs: List[str] = []
        for task in crew.tasks:
            agent = task.agent or crew.agents[0]
            if inputs:
                merged = dict(task.inputs)
                merged.update(inputs)
                task.inputs = merged
            crew.remember("last_agent", agent.name)
            outputs.append(self.execute_task(task, agent))
            crew.remember(f"task:{task.id}", outputs[-1])
        return outputs