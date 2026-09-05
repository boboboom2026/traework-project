# -*- coding: utf-8 -*-
"""应用数据域：JSON 落盘 + 线程安全读写。

每个托管应用拥有独立数据域（如 menu-ordering），下辖若干集合：
    menu、orders、approvals → data/<domain>/<collection>.json
"""
from __future__ import annotations

import json
import os
import threading
from typing import Any, Dict, List, Optional


class DataDomain:
    def __init__(self, name: str, data_dir: str):
        self.name = name
        self._dir = os.path.join(data_dir, name)
        os.makedirs(self._dir, exist_ok=True)
        self._lock = threading.RLock()
        self._cache: Dict[str, List[Dict[str, Any]]] = {}

    # ---------- 集合路径 ----------
    def _path(self, collection: str) -> str:
        return os.path.join(self._dir, f"{collection}.json")

    def _load(self, collection: str) -> List[Dict[str, Any]]:
        with self._lock:
            if collection not in self._cache:
                path = self._path(collection)
                if os.path.exists(path):
                    with open(path, "r", encoding="utf-8") as f:
                        self._cache[collection] = json.load(f)
                else:
                    self._cache[collection] = []
            return self._cache[collection]

    def _save(self, collection: str) -> None:
        with self._lock:
            path = self._path(collection)
            with open(path, "w", encoding="utf-8") as f:
                json.dump(self._cache[collection], f, ensure_ascii=False, indent=2)

    # ---------- CRUD ----------
    def all(self, collection: str) -> List[Dict[str, Any]]:
        with self._lock:
            return list(self._load(collection))

    def find(self, collection: str, **filters: Any) -> List[Dict[str, Any]]:
        with self._lock:
            return [r for r in self._load(collection) if all(r.get(k) == v for k, v in filters.items())]

    def append(self, collection: str, record: Dict[str, Any]) -> Dict[str, Any]:
        with self._lock:
            self._load(collection).append(record)
            self._save(collection)
            return record

    def update(self, collection: str, id_field: str, id_value: Any, patch: Dict[str, Any]) -> bool:
        with self._lock:
            rows = self._load(collection)
            for r in rows:
                if r.get(id_field) == id_value:
                    r.update(patch)
                    self._save(collection)
                    return True
            return False

    def delete(self, collection: str, id_field: str, id_value: Any) -> bool:
        with self._lock:
            rows = self._load(collection)
            nxt = [r for r in rows if r.get(id_field) != id_value]
            if len(nxt) == len(rows):
                return False
            self._cache[collection] = nxt
            self._save(collection)
            return True

    def count(self, collection: str) -> int:
        return len(self._load(collection))

    def set_seed(self, collection: str, rows: List[Dict[str, Any]]) -> None:
        """首次启动写入种子数据（已存在则跳过）。"""
        with self._lock:
            if not os.path.exists(self._path(collection)):
                self._cache[collection] = list(rows)
                self._save(collection)