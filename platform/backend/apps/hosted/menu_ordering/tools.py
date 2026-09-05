# -*- coding: utf-8 -*-
"""点餐系统工具集。

- query_menu    : 查询菜单（只读）
- order_process : 下单。声明 requires_approval=True（有权限 + 需确认）→ 被审批门拦截，
                  商家通过后才真正执行核价/验库存/扣库存/写 orders。
"""
from __future__ import annotations

import json
from typing import Any, Dict

from agent_framework import Tool

from .store import MenuOrderingStore


def build_tools(store: MenuOrderingStore) -> Dict[str, Tool]:

    def _query_menu(**kwargs: Any) -> str:
        rows = store.menu()
        return json.dumps(rows, ensure_ascii=False)

    def _order_process(dish_ids=None, seat_count: int = 1, **kwargs: Any) -> str:
        """核价 + 逐道验库存 → 扣库存 → 写 orders，返回下单成功文案。"""
        order, err = store.create_order(dish_ids or [], int(seat_count or 1))
        if order is None:
            return f"[下单失败] {err}"
        wait = min(10 + len(order["dish_ids"]) * 8, 40)  # 预计等待 X 分钟
        names = "、".join(order["dish_names"])
        return (f"订单 {order['order_no']} 已创建：{names}，合计￥{order['total']}，"
                f"预计等待 {wait} 分钟（{order['seat_count']} 人用餐，状态：已下单）")

    return {
        "query_menu": Tool(
            name="query_menu",
            description="查询本店菜品菜单与库存",
            func=_query_menu,
            args_schema=[{"name": "keyword", "type": "str", "required": False, "desc": "可选：菜品关键字"}],
            requires_approval=False,
        ),
        "order_process": Tool(
            name="order_process",
            description="受理用户下单：按所选菜品购买并生成订单",
            func=_order_process,
            args_schema=[
                {"name": "dish_ids", "type": "int[]", "required": True, "desc": "菜品 ID 列表（可重复表示多份）"},
                {"name": "seat_count", "type": "int", "required": False, "desc": "用餐人数"},
            ],
            requires_approval=True,     # 有权限 + 需确认 → 强制审批
            action_tag="下单",
        ),
    }