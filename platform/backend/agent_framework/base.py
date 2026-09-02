# -*- coding: utf-8 -*-
"""底座核心类型：Tool / Agent / Task / Crew（CrewAI 兼容语义）"""
from __future__ import annotations

import threading
import uuid
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, List, Optional


class Tool:
    """工具定义。

    属性（与 crewai 对齐）：
        name             工具名，如 order_process
        description      描述，供智能体/规划器理解用途
        args_schema      [{name, type, required, desc}] 参数声明
        requires_approval 是否属于「有权限且需确认」→ 触发强制审批
        requester        当前执行者（由执行器注入，用于审批记录署名）
    """

    def __init__(
        self,
        name: str,
        description: str,
        func: Callable[..., str],
        args_schema: Optional[List[Dict[str, Any]]] = None,
        requires_approval: bool = False,
        action_tag: str = "",   # 审批标题中的动作标签，如 下单
    ):
        self.name = name
        self.description = description
        self.func = func
        self.args_schema = args_schema or []
        self.requires_approval = requires_approval
        self.action_tag = action_tag
        self.requester = "系统"

    def run(self, **kwargs: Any) -> str:
        return self.func(**kwargs)

    def __repr__(self) -> str:  # 管理页展示
        return f"<Tool {self.name} requires_approval={self.requires_approval}>"


@dataclass
class Agent:
    """智能体定义（与 crewai 对齐）。"""

    name: str                    # 如 订单处理专员
    role: str
    goal: str
    backstory: str = ""
    tools: List[Tool] = field(default_factory=list)
    allow_delegation: bool = False
    memory: bool = True
    status: str = "ready"

    def tool(self, name: str) -> Optional[Tool]:
        for t in self.tools:
            if t.name == name:
                return t
        return None


@dataclass
class Task:
    """任务：由某个 agent 执行的一段工作。"""

    description: str
    agent: Optional[Agent] = None
    expected_output: str = ""
    inputs: Dict[str, Any] = field(default_factory=dict)  # 任务输入（如 dish_ids/seat_count）
    id: str = field(default_factory=lambda: uuid.uuid4().hex[:8])


@dataclass
class Crew:
    """Crew 编排：顺序执行任务列表，agent 可共享内存。"""

    name: str
    agents: List[Agent]
    tasks: List[Task] = field(default_factory=list)
    process: str = "sequential"
    memory: Dict[str, str] = field(default_factory=dict)
    _lock: threading.Lock = field(default_factory=threading.Lock, repr=False)

    def add(self, task: Task) -> "Crew":
        self.tasks.append(task)
        return self

    def remember(self, key: str, value: str) -> None:
        with self._lock:
            self.memory[key] = value

    def recall(self, key: str) -> Optional[str]:
        with self._lock:
            return self.memory.get(key)