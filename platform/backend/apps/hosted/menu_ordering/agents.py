# -*- coding: utf-8 -*-
"""点餐系统智能体（CrewAI 底座）。

- 能力网关   ：统一受理用户请求，解析意图并调用平台能力（下单走审批门）
- 订单处理专员：负责下单与订单流转的专职智能体
"""
from __future__ import annotations

from typing import Dict

from agent_framework import Agent, Tool


def build_agents(tools: Dict[str, Tool]) -> Dict[str, Agent]:
    agents = {
        "能力网关": Agent(
            name="能力网关",
            role="能力网关 · 统一受理用户请求，按需调度平台能力",
            goal="准确理解用户意图，安全地调用平台工具完成请求（涉及下单需等待商家审批）",
            backstory=("我是平台的能力网关，负责把用户的自然语言请求转化为工具调用。"
                       "对于『下单』这类有权限且需确认的操作，会先整理好参数并提交审批。"),
            tools=[tools["query_menu"], tools["order_process"]],
        ),
        "订单处理专员": Agent(
            name="订单处理专员",
            role="订单处理专员 · 负责下单与订单后续流转",
            goal="安全、准确地完成下单，并在商家审批通过后生成订单记录",
            backstory=("我负责订单相关操作，下单前会核价并检查库存，"
                       "审批通过后才真正扣减库存并生成订单。"),
            tools=[tools["order_process"]],
        ),
    }
    return agents