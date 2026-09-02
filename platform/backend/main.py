# -*- coding: utf-8 -*-
"""多智能体平台（CrewAI 底座 + 托管应用）FastAPI 入口。

路由布局：
    /api/*            底座 + 应用 API（menu / orders / approvals / stats / platform/info）
    /                 用户端（点餐系统 public/index.html）
    /merchant.html    商家端（审批 + 订单管理）
    /platform/manage.html  CrewAI 管理页（底座 UI）
"""
from __future__ import annotations

import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from apps.hosted.menu_ordering.app import HostedApp
from apps.hosted import list_apps
from platform_api import router as platform_router

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


@app.get("/api/platform/apps")
def platform_apps():
    """底座注册的托管应用列表。"""
    return {"apps": list_apps()}


# ---------- 底座 UI：管理页 ----------
platform_public = os.path.join(BASE_DIR, "public")
app.mount("/platform", StaticFiles(directory=platform_public, html=True), name="platform")

# ---------- 托管应用前端：用户端 / 商家端 ----------
app.mount("/", StaticFiles(directory=hosted_app.public_dir, html=True), name="apps")