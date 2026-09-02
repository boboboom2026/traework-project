# -*- coding: utf-8 -*-
"""点餐系统业务存储：菜单 / 下单（核价·验库存·扣减·落单）/ 订单状态流转。"""
from __future__ import annotations

from typing import Any, Dict, List, Optional, Tuple

from agent_framework import DataDomain

from .seed import NEXT, ORDER_STEPS, SEED_MENU


class MenuOrderingStore:
    def __init__(self, data_dir: str):
        d = DataDomain("menu-ordering", data_dir)
        d.set_seed("menu", SEED_MENU)
        d.set_seed("orders", [])
        d.set_seed("approvals", [])
        self.domain = d

    # ---------- 菜单 ----------
    def menu(self) -> List[Dict[str, Any]]:
        return self.domain.all("menu")

    def dish(self, dish_id: int) -> Optional[Dict[str, Any]]:
        rows = self.domain.find("menu", id=int(dish_id))
        return rows[0] if rows else None

    # ---------- 下单 ----------
    def create_order(self, dish_ids: List[int], seat_count: int = 1) -> Tuple[Optional[Dict[str, Any]], str]:
        """按 dish_ids 核价 + 逐道验证库存，通过后扣减库存并写入 orders。

        返回 (order, "") 成功；失败返回 (None, 原因文案)（不扣库存、不入库）。
        """
        if not dish_ids:
            return None, "未选择任何菜品，无法下单"

        # 1) 校验菜品存在
        counts: Dict[int, int] = {}
        for did in dish_ids:
            counts[did] = counts.get(did, 0) + 1
        dishes: Dict[int, Dict[str, Any]] = {}
        for did in counts:
            d = self.dish(did)
            if d is None:
                return None, f"菜品 #{did} 不存在"
            dishes[did] = d

        # 2) 逐道核价 + 验证库存（库存不足返回失败，不入库）
        total = 0
        names: List[str] = []
        for did, qty in counts.items():
            if dishes[did]["inventory"] < qty:
                return None, f"{dishes[did]['name']} 库存不足（剩余 {dishes[did]['inventory']}，需要 {qty}）"
            total += dishes[did]["price"] * qty
            names.append(dishes[did]["name"])

        # 3) 扣减库存
        for did, qty in counts.items():
            self.domain.update("menu", "id", did, {"inventory": dishes[did]["inventory"] - qty})

        # 4) 生成订单号并落单
        order_no = self._next_order_no()
        order = {
            "order_no": order_no,
            "dish_ids": list(counts.keys()),
            "dish_qty": counts,
            "dish_names": names,
            "total": total,
            "seat_count": seat_count,
            "status": "已下单",
            "created_at": __import__("datetime").datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        }
        self.domain.append("orders", order)
        return order, ""

    def _next_order_no(self) -> str:
        rows = self.domain.all("orders")
        nums = []
        for r in rows:
            s = str(r.get("order_no", "")).lstrip("#")
            if s.isdigit():
                nums.append(int(s))
        return f"#{max(nums) + 1 if nums else 1}"

    # ---------- 订单 ----------
    def orders(self) -> List[Dict[str, Any]]:
        rows = self.domain.all("orders")
        return sorted(rows, key=lambda r: r.get("created_at", ""), reverse=True)

    def order(self, order_no: str) -> Optional[Dict[str, Any]]:
        rows = self.domain.find("orders", order_no=order_no)
        return rows[0] if rows else None

    def advance(self, order_no: str) -> Tuple[bool, str]:
        """按状态机前进一步（只前进、不可回退）。"""
        o = self.order(order_no)
        if o is None:
            return False, "订单不存在"
        nxt = NEXT.get(o["status"])
        if nxt is None:
            return False, f"订单 {order_no} 已是终态，无法推进"
        to = nxt[0]
        self.domain.update("orders", "order_no", order_no, {"status": to})
        return True, f"订单 {order_no} 已更新为「{to}」"

    # ---------- 统计 ----------
    def stats(self) -> Dict[str, Any]:
        rows = self.orders()
        by_status = {s: 0 for s in ORDER_STEPS}
        for r in rows:
            by_status[r["status"]] = by_status.get(r["status"], 0) + 1
        pending = len([r for r in rows if r["status"] == "已下单"])
        revenue = sum(r["total"] for r in rows)
        low_stock = [d for d in self.menu() if d["inventory"] <= 3]
        return {
            "total_orders": len(rows),
            "pending_orders": pending,
            "revenue": revenue,
            "by_status": by_status,
            "low_stock": [{"name": d["name"], "inventory": d["inventory"]} for d in low_stock],
        }