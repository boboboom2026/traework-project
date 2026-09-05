# -*- coding: utf-8 -*-
"""应用注册表（薄应用托管层 · 阶段 0）：manifest 即注册，配置即登记。

应用清单让底座像认识"工具/编排"一样认识"整个应用"：
    app_id / name / version / entry(端) / endpoints / capabilities / crew_ref / flow_ref /
    data_models / approval_required
加载器启动时扫描 apps/manifests/*.json，结构校验失败不阻断启动。
"""
from __future__ import annotations

import json
import os
import re
from typing import Any, Dict, List, Optional

MANIFEST_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "apps", "manifests")

_APP_ID_RE = re.compile(r"^[a-z0-9][a-z0-9-]{1,63}$")

# 记忆化加载结果：{app_id: manifest}
_APPS: Dict[str, Dict[str, Any]] = {}
_LOADED = False
_ERRORS: List[str] = []


def _validate(m: Dict[str, Any]) -> Optional[str]:
    """结构校验：必填字段、id 合法性；能力/编排/流程存在性由 API 层结合注册表校验。"""
    app_id = m.get("app_id")
    if not app_id or not _APP_ID_RE.match(app_id):
        return f"app_id 非法或缺失：{app_id!r}"
    if not m.get("name"):
        return f"应用 {app_id} 缺少 name"
    entry = m.get("entry") or {}
    if not entry.get("url"):
        return f"应用 {app_id} 缺少 entry.url"
    if entry.get("type") not in ("static", "remote", None):
        return f"应用 {app_id} entry.type 仅支持 static/remote"
    return None


def load_apps() -> Dict[str, Dict[str, Any]]:
    """扫描 manifest 目录并加载（幂等）。失败条目记入 _ERRORS，不阻断。"""
    global _APPS, _LOADED, _ERRORS
    if _LOADED:
        return _APPS
    _APPS = {}
    _ERRORS = []
    if not os.path.isdir(MANIFEST_DIR):
        _LOADED = True
        return _APPS
    for fn in sorted(os.listdir(MANIFEST_DIR)):
        if not fn.endswith(".json"):
            continue
        path = os.path.join(MANIFEST_DIR, fn)
        try:
            with open(path, "r", encoding="utf-8") as f:
                m = json.load(f)
            err = _validate(m)
            if err:
                _ERRORS.append(f"{fn}: {err}")
                continue
            aid = m["app_id"]
            if aid in _APPS:
                _ERRORS.append(f"{fn}: app_id 与其它 manifest 重复（{aid}）")
                continue
            _APPS[aid] = m
        except Exception as exc:  # noqa: BLE001
            _ERRORS.append(f"{fn}: {exc}")
    _LOADED = True
    return _APPS


def reload_apps() -> Dict[str, Dict[str, Any]]:
    """重新扫描（文件变更后调用）。"""
    global _LOADED
    _LOADED = False
    return load_apps()


def get_app(app_id: str) -> Optional[Dict[str, Any]]:
    return load_apps().get(app_id)


def list_apps() -> List[Dict[str, Any]]:
    return list(load_apps().values())


def load_errors() -> List[str]:
    return list(_ERRORS)


def enabled_app_ids() -> List[str]:
    return [m["app_id"] for m in load_apps().values() if m.get("enabled", True)]