# -*- coding: utf-8 -*-
"""托管应用注册表：底座以「应用」的形式承载业务（如 menu-ordering 点餐系统）。"""

import importlib
import pkgutil
from typing import Dict, Optional

from .menu_ordering.app import HostedApp  # 当前仅内置一个托管应用


def get_app(name: str) -> Optional[HostedApp]:
    if name == "menu-ordering":
        return HostedApp()
    return None


def list_apps() -> list:
    return [{"name": "menu-ordering", "title": "点餐系统", "version": "2.0"}]