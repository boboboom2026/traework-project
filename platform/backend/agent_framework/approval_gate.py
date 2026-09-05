# -*- coding: utf-8 -*-
"""审批拦截器（_ApprovalGate）。

机制（与 CrewAI 权限 + 需确认语义对齐）：
    工具若声明 requires_approval=True，其调用会被拦截器接管：
      1. approval.create()     → 向数据域签发一条 pending 审批（记录工具名/行为/请求者/参数）
      2. wait_for_decision()   → 阻塞等待商家决策（默认 300s 超时）
      3. 通过  → _approve_and_execute() 真正执行工具（核价/扣库存/写订单等在此时发生）
      4. 拒绝  → 不执行真实工具，返回 "[审批未通过] 工具 <name> 被拒绝执行[:原因]"
      5. 超时  → 视为未通过，同样不执行
"""
from __future__ import annotations

import datetime
import threading
import time
import uuid
from typing import Any, Dict, Optional

from .base import Tool
from .domain import DataDomain


class ApprovalGate:
    def __init__(self, domain: DataDomain, timeout: int = 300, poll_interval: float = 0.5):
        self.domain = domain
        self.timeout = timeout
        self.poll_interval = poll_interval
        self._lock = threading.Lock()

    # ---------------- 对外操作 ----------------
    def create(self, tool: Tool, args: Dict[str, Any], requester: str) -> Dict[str, Any]:
        """签发 pending 审批。args 以 Python repr 字符串形式落盘（与线上行为一致）。"""
        action = f"[{tool.action_tag}]" if tool.action_tag else ""
        record = {
            "id": uuid.uuid4().hex[:12],
            "tool": tool.name,
            "title": f"{tool.name} · {action}".strip(),
            "action": action,
            "requester": requester,
            "args": repr(args),              # Python dict 字符串（单引号），前端需兼容解析
            "status": "pending",             # pending / approved / rejected
            "created_at": datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "decided_at": None,
            "reason": None,
            "result": None,                  # 通过后执行结果文案
        }
        self.domain.append("approvals", record)
        return record

    def decide(self, approval_id: str, decision: str, reason: str = "") -> bool:
        """商家决策：approved / rejected 写入并唤醒等待线程。"""
        now = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        with self._lock:
            ok = self.domain.update("approvals", "id", approval_id, {
                "status": decision,
                "decided_at": now,
                "reason": reason,
            })
        return ok

    def _wait_for_decision(self, approval_id: str) -> Optional[str]:
        """阻塞等待决策，直到 approved / rejected / 超时。"""
        deadline = time.time() + self.timeout
        while time.time() < deadline:
            rows = self.domain.find("approvals", id=approval_id)
            if rows:
                st = rows[0].get("status")
                if st in ("approved", "rejected"):
                    return st
            time.sleep(self.poll_interval)
        return None

    # ---------------- 工具包装 ----------------
    def wrap(self, tool: Tool) -> Tool:
        """返回被拦截的 Tool：需审批的工具执行 → 签发审批→等待决策→按决策放行/拦截。"""
        original = tool

        wrapped = Tool(
            name=original.name,
            description=original.description,
            func=None,  # 下方闭包绑定
            args_schema=original.args_schema,
            requires_approval=original.requires_approval,
            action_tag=original.action_tag,
        )

        def guarded(**kwargs: Any) -> str:
            if not original.requires_approval:
                return original.func(**kwargs)
            # 审批记录署名取包装工具上的 requester（执行器调用前注入当前 agent 名）
            return self._approve_and_execute(original, wrapped, kwargs)

        wrapped.func = guarded
        return wrapped

    def _approve_and_execute(self, original: Tool, wrapped: Tool, kwargs: Dict[str, Any]) -> str:
        """审批后的执行：通过 → 真实执行原始工具；拒绝/超时 → 拦截并说明。"""
        approval = self.create(wrapped, kwargs, requester=getattr(wrapped, "requester", "系统"))
        decision = self._wait_for_decision(approval["id"])

        if decision == "approved":
            result = original.func(**kwargs)   # 执行原始 _run，而非包装后的递归调用
            self.domain.update("approvals", "id", approval["id"], {"result": result})
            return result

        reason = ""
        if decision == "rejected":
            rows = self.domain.find("approvals", id=approval["id"])
            if rows:
                reason = rows[0].get("reason") or ""
        tail = f":{reason}" if reason else ""
        return f"[审批未通过] 工具 {tool.name} 被拒绝执行{tail}"