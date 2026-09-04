# -*- coding: utf-8 -*-
"""多智能体平台（CrewAI 底座 + 托管应用）FastAPI 入口。

路由布局：
    /api/*            底座 + 应用 API（menu / orders / approvals / stats / platform/info）
    /app/{app}/{tenant}  统一入口：应用运行时静态托管 / 远端分发（阶段 1 + 租户校验 阶段 2）
    /             用户端（点餐系统 public/index.html）
    /merchant.html 商家端（审批 + 订单管理）
"""
from __future__ import annotations

import json
import os

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles

from apps.hosted.menu_ordering.app import HostedApp
from apps.hosted import list_apps
import app_runtime
import app_store
from platform_api import router as platform_router, _store
from app_gateway import router as gateway_router

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

app = FastAPI(
    title="多智能体平台（CrewAI 底座）",
    description="CrewAI 多智能体底座 + 企业 AI 协作办公平台 + 托管应用（点餐系统 v2.0）",
    version="2.1",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------- 装配托管应用 ----------
hosted_app = HostedApp()
app.include_router(hosted_app.build_router())

# ---------- 装配协作办公平台 API ----------
app.include_router(platform_router)
app.include_router(gateway_router)


def _ensure_builtin_flows() -> None:
    """把应用侧内置业务流模板 seed 进平台 flows（幂等）：点餐业务流 → 平台流程编排可见、可运行、可覆盖。"""
    import app_gateway
    tpl = app_gateway.BUILTIN_MENU_ORDER_FLOW
    if any(f.get("name") == tpl["name"] for f in _store.all("flows")):
        return
    _store.save("flows", {
        "id": tpl["id"],
        "name": tpl["name"],
        "description": tpl["description"],
        "builtin": True,
        "steps": [
            {"id": f"b{i}", "name": s.get("name", ""), "agent_name": "", "action": s.get("action", ""),
             "if_contains": "", "status": "pending"}
            for i, s in enumerate(tpl.get("steps") or [])
        ],
        "status": "未启动",
        "current": 0,
    })


# 首次启动 seed 内置业务流（重启幂等；同名字段对「点餐业务流」模板覆盖生效）
_ensure_builtin_flows()


@app.get("/api/platform/apps")
def platform_apps():
    """底座注册的托管应用列表。"""
    return {"apps": list_apps()}


# ================= 统一入口（应用运行时 · 阶段 1） =================
def _manifest_or_404(app_id: str):
    m = app_runtime.get_app(app_id)
    if not m or not m.get("enabled", True):
        raise HTTPException(status_code=404, detail=f"应用不存在或未启用：{app_id}")
    return m


def _static_root(manifest) -> str:
    """manifest entry.static_dir（相对 backend 目录）解析为绝对路径。"""
    rel = (manifest.get("entry") or {}).get("static_dir")
    if not rel:
        raise HTTPException(status_code=404, detail=f"应用 {manifest['app_id']} 未声明 static_dir")
    root = os.path.normpath(os.path.join(BASE_DIR, rel))
    if not os.path.isdir(root):
        raise HTTPException(status_code=404, detail=f"应用 {manifest['app_id']} 静态目录不存在：{root}")
    return root


def _redirect_to_remote(manifest, tenant_id: str, suffix: str = "") -> RedirectResponse:
    base = (manifest.get("entry") or {}).get("url", "").rstrip("/")
    sep = "&" if "?" in base else "?"
    return RedirectResponse(f"{base}{suffix}{sep}tenant={tenant_id}")


def _require_tenant(app_id: str, tenant_id: str) -> None:
    """阶段 2：租户必须已注册、启用且订阅该应用，否则视为入口失效。"""
    if not app_store.validate_tenant(tenant_id):
        raise HTTPException(status_code=400, detail="tenant_id 格式非法")
    tid = _store.get("tenants", tenant_id)
    if tid is None or tid.get("status") != "active":
        raise HTTPException(status_code=404, detail=f"租户不存在或已停用：{tenant_id}")
    if app_id not in (tid.get("apps") or []):
        raise HTTPException(status_code=404, detail=f"租户 {tenant_id} 未订阅应用 {app_id}")


@app.get("/app/{app_id}/{tenant_id}")
def app_home(app_id: str, tenant_id: str):
    """统一入口首页：static 返回 index.html；remote 302 到远端并带 tenant 参数。"""
    _require_tenant(app_id, tenant_id)
    m = _manifest_or_404(app_id)
    if (m.get("entry") or {}).get("type") == "remote":
        return _redirect_to_remote(m, tenant_id)
    return FileResponse(os.path.join(_static_root(m), "index.html"))


@app.get("/app/{app_id}/{tenant_id}/{path:path}")
def app_static(app_id: str, tenant_id: str, path: str):
    """统一入口静态资源：/app/{app}/{tenant}/index.html、merchant.html、css/js 等。"""
    _require_tenant(app_id, tenant_id)
    m = _manifest_or_404(app_id)
    if (m.get("entry") or {}).get("type") == "remote":
        return _redirect_to_remote(m, tenant_id, "/" + path)
    root = _static_root(m)
    rel = path.replace("\\", "/")
    if rel.startswith("/") or ".." in rel.split("/"):
        raise HTTPException(status_code=403, detail="非法路径")
    full = os.path.normpath(os.path.join(root, *rel.split("/")))
    if not full.startswith(root) or not os.path.isfile(full):
        raise HTTPException(status_code=404, detail="资源不存在")
    # HTML 页面注入应用上下文：供 AppSDK 在任意挂载路径/预览环境解析 app_id/tenant_id
    if rel.lower().endswith(".html"):
        html = open(full, encoding="utf-8").read()
        if "window.APP_CONFIG" not in html:
            cfg = json.dumps({"app_id": app_id, "tenant_id": tenant_id}, ensure_ascii=False)
            inject = f'<script>window.APP_CONFIG={cfg};</script>'
            if "</head>" in html:
                html = html.replace("</head>", inject + "</head>", 1)
            else:
                html = inject + html
        return HTMLResponse(html)
    return FileResponse(full)


# ---------- 应用 SDK：任意 H5 直引 /app-sdk/sdk.js ----------
app.mount("/app-sdk", StaticFiles(directory=os.path.join(BASE_DIR, "public", "apps")), name="app-sdk")

# ---------- 平台前端（React SPA 生产构建产物；同源托管，不依赖 Vite dev server） ----------
_frontend_dist = os.path.abspath(os.path.join(BASE_DIR, "..", "frontend", "dist"))
if os.path.isdir(_frontend_dist):
    app.mount("/platform", StaticFiles(directory=_frontend_dist, html=True), name="platform-ui")

# ---------- 托管应用前端：用户端 / 商家端 ----------
app.mount("/", StaticFiles(directory=hosted_app.public_dir, html=True), name="apps")