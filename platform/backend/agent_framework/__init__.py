# -*- coding: utf-8 -*-
"""多智能体底座（CrewAI 兼容）

提供与 CrewAI 对齐的核心抽象：
- Tool          : 工具定义（name / description / args_schema / requires_approval / _run）
- Agent         : 智能体（role / goal / backstory / tools）
- Crew / Task   : 编排（顺序执行，内存保留）
- ApprovalGate  : 审批拦截器（权限 + 需确认的工具先签发审批，阻塞等待决策后执行）
- DataDomain    : 应用数据域（JSON 落盘，线程安全）

默认执行器是确定性本地规划器（无需 LLM/API key 即可完成演示闭环）；
可通过配置切换到真实 CrewAI + 任意 LLM（见 README「接入真实 CrewAI」）。
"""
from .base import Tool, Agent, Task, Crew
from .approval_gate import ApprovalGate
from .domain import DataDomain
from .executor import CrewExecutor

__all__ = ["Tool", "Agent", "Task", "Crew", "ApprovalGate", "DataDomain", "CrewExecutor"]