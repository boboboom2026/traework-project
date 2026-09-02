# -*- coding: utf-8 -*-
"""托管应用：点餐系统（menu-ordering v2.0）。

以「应用」的形态挂载到多智能体底座：
    HostedApp 完成 数据域 → 工具 → 智能体 → 审批门 → 路由 的装配，
    public/ 下为用户端(index.html)与商家端(merchant.html)，由底座静态托管。
"""
from __future__ import annotations

import os
import threading
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Header, HTTPException

from agent_framework import (Agent, ApprovalGate, Crew, CrewExecutor, DataDomain,
                             Task, Tool)

from . import agents as agents_mod
from .store import MenuOrderingStore
from .seed import APPROVAL_TIMEOUT
from .tools import build_tools

PACKAGE_DIR = os.path.dirname(os.path.abspath(__file__))

# 商家角色校验（匿名 API 需商家角色属正常权限设计）
MERCHANT_ROLE = "merchant"


class HostedApp:
    name = "menu-ordering"
    title = "点餐系统"
    version = "2.0"

    def __init__(self):
        self.store = MenuOrderingStore(os.path.join(PACKAGE_DIR, "data"))
        self.gate = ApprovalGate(self.store.domain, timeout=APPROVAL_TIMEOUT)
        self.executor = CrewExecutor()

        # 底座装配：工具（经审批门包装） → 智能体
        raw_tools = build_tools(self.store)
        self.tools: Dict[str, Tool] = {n: self.gate.wrap(t) for n, t in raw_tools.items()}
        self.agents: Dict[str, Agent] = agents_mod.build_agents(self.tools)

    # ---------- 对外静态资源 ----------
    @property
    def public_dir(self) -> str:
        return os.path.join(PACKAGE_DIR, "public")

    # ---------- 业务：下单（后台线程跑 Crew，审批等待期间不阻塞 HTTP） ----------
    def place_order(self, dish_ids: List[int], seat_count: int) -> Dict[str, Any]:
        task = Task(
            description="用户请求下单，请调用 order_process 完成下单",
            inputs={"dish_ids": dish_ids, "seat_count": seat_count},
            agent=self.agents["能力网关"],
        )
        crew = Crew(name="点餐下单", agents=list(self.agents.values()), tasks=[task])
        t = threading.Thread(target=self._run_crew, args=(crew,), daemon=True)
        t.start()
        return {"status": "pending", "message": "订单已提交，等待商家确认"}

    def _run_crew(self, crew: Crew) -> None:
        try:
            self.executor.kickoff(crew)
        except Exception:  # 后台线程异常不致命，落盘记录即可
            pass

    # ---------- 底座元信息（供管理页） ----------
    def platform_info(self) -> Dict[str, Any]:
        d = self.store.domain
        return {
            "app": {"name": self.name, "title": self.title, "version": self.version},
            "agents": [
                {
                    "name": a.name, "role": a.role, "goal": a.goal,
                    "backstory": a.backstory,
                    "tools": [t.name for t in a.tools],
                    "status": a.status,
                }
                for a in self.agents.values()
            ],
            "tools": [
                {
                    "name": t.name, "description": t.description,
                    "action_tag": t.action_tag,
                    "requires_approval": t.requires_approval,
                    "args": t.args_schema,
                }
                for t in self.tools.values()
            ],
            "counts": {
                "menu": d.count("menu"),
                "orders": d.count("orders"),
                "approvals": d.count("approvals"),
                "pending_approvals": len(d.find("approvals", status="pending")),
            },
        }

    # ---------- 路由 ----------
    def build_router(self) -> APIRouter:
        router = APIRouter(prefix="/api")
        st = self.store

        def _merchant_or_401(x_role: Optional[str]) -> str:
            if x_role != MERCHANT_ROLE:
                raise HTTPException(status_code=401, detail="需要商家角色")
            return x_role

        @router.get("/menu")
        def get_menu():
            return {"menu": st.menu()}

        @router.get("/orders")
        def get_orders():
            return {"orders": st.orders()}

        @router.post("/orders/place")
        def place_order(payload: Dict[str, Any]):
            dish_ids = payload.get("dish_ids") or []
            seat_count = int(payload.get("seat_count") or 1)
            return self.place_order([int(i) for i in dish_ids], seat_count)

        @router.get("/approvals")
        def get_approvals():
            rows = st.domain.all("approvals")
            return {"approvals": sorted(rows, key=lambda r: r.get("created_at", ""), reverse=True)}

        @router.post("/approvals/{approval_id}/decide")
        def decide(approval_id: str, payload: Dict[str, Any],
                   x_role: Optional[str] = Header(None)):
            _merchant_or_401(x_role)
            decision = payload.get("decision")
            reason = payload.get("reason") or ""
            if decision not in ("approved", "rejected"):
                raise HTTPException(status_code=400, detail="decision 必须为 approved/rejected")
            ok = self.gate.decide(approval_id, decision, reason)
            if not ok:
                raise HTTPException(status_code=404, detail="审批记录不存在")
            return {"ok": True, "decision": decision}

        @router.post("/orders/{order_no}/status")
        def advance_order(order_no: str, x_role: Optional[str] = Header(None)):
            _merchant_or_401(x_role)
            ok, msg = st.advance(order_no)
            if not ok:
                raise HTTPException(status_code=400, detail=msg)
            return {"ok": True, "message": msg}

        @router.get("/stats")
        def stats(x_role: Optional[str] = Header(None)):
            _merchant_or_401(x_role)
            return st.stats()

        @router.get("/platform/info")
        def info():
            return self.platform_info()

        return router