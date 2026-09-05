# -*- coding: utf-8 -*-
"""应用数据域（App Store · 阶段 2）：每租户独立 DataDomain，强制显式 (app_id, tenant_id)。

落盘：data/apps/{app_id}@{tenant_id}/{collection}.json
  - 目录即隔离：两个租户使用同一应用，菜单/订单/审批互不可见
  - 写入记录自动带上 app_id / tenant_id 归属，平台审批页可查归属
  - 集合名白名单 + 保留集合保护，防止离开租户目录/写平台集合
"""
from __future__ import annotations

import os
import re
import threading
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional

from agent_framework import DataDomain

DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data", "apps")

TENANT_RE = re.compile(r"^[a-zA-Z0-9_-]{1,64}$")
COLL_RE = re.compile(r"^[a-z0-9_-]{1,48}$")

# 平台保留集合，应用不得写入
RESERVED_COLLS = {"tenants"}


def validate_tenant(tenant_id: str) -> bool:
    return bool(tenant_id) and bool(TENANT_RE.match(tenant_id))


def _now() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


class AppStore:
    """app_id × tenant_id → DataDomain 的注册表（懒加载，幂等）。"""

    def __init__(self, data_dir: str = DATA_DIR):
        self.data_dir = data_dir
        os.makedirs(self.data_dir, exist_ok=True)
        self._domains: Dict[tuple, DataDomain] = {}
        self._lock = threading.RLock()

    def domain(self, app_id: str, tenant_id: str) -> DataDomain:
        key = (app_id, tenant_id)
        with self._lock:
            d = self._domains.get(key)
            if d is None:
                d = DataDomain(f"{app_id}@{tenant_id}", self.data_dir)
                self._domains[key] = d
            return d

    def seed(self, app_id: str, tenant_id: str, coll: str, rows: List[Dict[str, Any]]) -> None:
        """租户首启种子：集合不存在时写入（保持原始 id，如菜品 1/2/3）。"""
        self._check_collection(coll)
        self.domain(app_id, tenant_id).set_seed(coll, rows)

    # ---------- CRUD ----------
    def _check_collection(self, coll: str) -> None:
        if not COLL_RE.match(coll) or coll in RESERVED_COLLS:
            raise ValueError(f"非法集合名：{coll!r}")

    def list(self, app_id: str, tenant_id: str, coll: str) -> List[Dict[str, Any]]:
        self._check_collection(coll)
        return self.domain(app_id, tenant_id).all(coll)

    def get(self, app_id: str, tenant_id: str, coll: str, _id: str) -> Optional[Dict[str, Any]]:
        self._check_collection(coll)
        rows = self.domain(app_id, tenant_id).find(coll, id=_id)
        return rows[0] if rows else None

    def create(self, app_id: str, tenant_id: str, coll: str, record: Dict[str, Any]) -> Dict[str, Any]:
        self._check_collection(coll)
        d = self.domain(app_id, tenant_id)
        d.set_seed(coll, [])
        rec = dict(record)
        rec.setdefault("id", uuid.uuid4().hex[:8])
        rec.setdefault("created_at", _now())
        rec["app_id"] = app_id
        rec["tenant_id"] = tenant_id
        d.append(coll, rec)
        return rec

    def update(self, app_id: str, tenant_id: str, coll: str, _id: str, patch: Dict[str, Any]) -> bool:
        self._check_collection(coll)
        patch = {k: v for k, v in patch.items() if k not in ("id", "app_id", "tenant_id")}
        return self.domain(app_id, tenant_id).update(coll, "id", _id, patch)

    def delete(self, app_id: str, tenant_id: str, coll: str, _id: str) -> bool:
        self._check_collection(coll)
        return self.domain(app_id, tenant_id).delete(coll, "id", _id)


# 全局实例（与平台 store 同生命周期）
store = AppStore()