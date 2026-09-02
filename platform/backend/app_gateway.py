# -*- coding: utf-8 -*-
"""能力网关（应用运行时 · 阶段 3）。

统一入口 /api/app-gateway/{app_id}/{tenant_id}/...
    - 身份上下文：role(customer/merchant/admin)；merchant/admin 由 PIN 签发（env APP_MERCHANT_PIN，默认 123456）
    - runFlow：推进该「应用 × 租户」的流程实例（业务支撑主路径；转现有 flows 引擎，仅注入租户上下文）
    - runCrew：转现有编排引擎（现有 run 链路），注入租户上下文
    - approvals：submit（签发带租户归属的平台审批）/ decide（复用审批门）
    - data：app_store 租户数据域 CRUD（merchant/admin 可写，customer 只读）

原则：网关严禁重建编排，runFlow/runCrew 一律转发现有引擎。
"""
from __future__ import annotations

import copy
import json
import os
import threading
from collections import Counter
from datetime import datetime
from typing import Any, Callable, Dict, Optional

from fastapi import APIRouter, Body, Header, HTTPException

from agent_framework import Tool
import app_runtime
import app_store
import llm_client
from apps.hosted.menu_ordering.seed import SEED_MENU
from platform_api import _engine, _store, _subscribed_tenant_or_404

PIN_ENV = "APP_MERCHANT_PIN"
DEFAULT_PIN = "123456"
WRITABLE_ROLES = ("merchant", "admin")

router = APIRouter(prefix="/api/app-gateway/{app_id}/{tenant_id}", tags=["app-gateway"])


def _now() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def _ctx(app_id: str, tenant_id: str, x_role: Optional[str], x_pin: Optional[str]) -> Dict[str, Any]:
    """提取并校验调用身份上下文：应用注册 + 租户启用订阅 + 角色/PIN。"""
    _subscribed_tenant_or_404(app_id, tenant_id)
    m = app_runtime.get_app(app_id)
    role = (x_role or "customer").strip().lower()
    if role not in ("customer", "merchant", "admin"):
        raise HTTPException(400, f"非法角色：{role}")
    if role in WRITABLE_ROLES and (x_pin or "") != os.environ.get(PIN_ENV, DEFAULT_PIN):
        raise HTTPException(401, "商家/管理员操作需要正确 PIN（请求头 X-PIN）")
    return {"app_id": app_id, "tenant_id": tenant_id, "role": role, "manifest": m}


def _require_writable(c: Dict[str, Any]) -> None:
    if c["role"] not in WRITABLE_ROLES:
        raise HTTPException(403, "仅商家/管理员可执行该操作")


# =================== 身份上下文 ===================
@router.get("/context")
def get_context(app_id: str, tenant_id: str,
                x_role: Optional[str] = Header(None), x_pin: Optional[str] = Header(None)):
    c = _ctx(app_id, tenant_id, x_role, x_pin)
    tenant = _store.get("tenants", tenant_id)
    return {
        "app_id": c["app_id"], "tenant_id": c["tenant_id"], "role": c["role"],
        "app_name": c["manifest"].get("name"),
        "tenant_name": (tenant or {}).get("name", tenant_id),
        "permissions": {
            "data_write": c["role"] in WRITABLE_ROLES,
            "approval_decide": c["role"] in WRITABLE_ROLES,
        },
    }


# =================== 数据域 CRUD（merchant/admin 可写） ===================
@router.get("/data/{collection}")
def data_list(app_id: str, tenant_id: str, collection: str,
              x_role: Optional[str] = Header(None), x_pin: Optional[str] = Header(None)):
    c = _ctx(app_id, tenant_id, x_role, x_pin)
    try:
        rows = app_store.store.list(c["app_id"], c["tenant_id"], collection)
    except ValueError as e:
        raise HTTPException(400, str(e))
    return {"app_id": c["app_id"], "tenant_id": c["tenant_id"], "collection": collection, "rows": rows}


@router.post("/data/{collection}")
def data_create(app_id: str, tenant_id: str, collection: str, payload: Dict[str, Any] = Body(...),
                x_role: Optional[str] = Header(None), x_pin: Optional[str] = Header(None)):
    c = _ctx(app_id, tenant_id, x_role, x_pin)
    _require_writable(c)
    try:
        rec = app_store.store.create(c["app_id"], c["tenant_id"], collection, payload)
    except ValueError as e:
        raise HTTPException(400, str(e))
    return rec


@router.put("/data/{collection}/{rid}")
def data_update(app_id: str, tenant_id: str, collection: str, rid: str, payload: Dict[str, Any] = Body(...),
                x_role: Optional[str] = Header(None), x_pin: Optional[str] = Header(None)):
    c = _ctx(app_id, tenant_id, x_role, x_pin)
    _require_writable(c)
    try:
        ok = app_store.store.update(c["app_id"], c["tenant_id"], collection, rid, payload)
    except ValueError as e:
        raise HTTPException(400, str(e))
    if not ok:
        raise HTTPException(404, "记录不存在")
    return {"ok": True}


@router.delete("/data/{collection}/{rid}")
def data_delete(app_id: str, tenant_id: str, collection: str, rid: str,
                x_role: Optional[str] = Header(None), x_pin: Optional[str] = Header(None)):
    c = _ctx(app_id, tenant_id, x_role, x_pin)
    _require_writable(c)
    try:
        ok = app_store.store.delete(c["app_id"], c["tenant_id"], collection, rid)
    except ValueError as e:
        raise HTTPException(400, str(e))
    if not ok:
        raise HTTPException(404, "记录不存在")
    return {"ok": True}


# =================== 审批（复用底座审批门，记录带租户归属） ===================
def _submit_approval(c: Dict[str, Any], tool_name: str, action_tag: str,
                     collection: str, payload: Dict[str, Any],
                     on_approved: Optional[Callable[[Dict[str, Any]], str]] = None) -> Dict[str, Any]:
    """签发带 app/tenant 归属的平台审批；通过后在后台线程执行落地（默认写入租户数据域）。"""
    tool = Tool(
        name=tool_name, description=action_tag or tool_name, func=None,
        args_schema=[{"name": "payload", "type": "string", "description": "业务负载"}],
        requires_approval=True, action_tag=action_tag,
    )
    approval = _engine.gate.create(tool, {"payload": payload}, requester=f"{c['role']}@{c['tenant_id']}")
    _store.domain.update("approvals", "id", approval["id"],
                         {"app_id": c["app_id"], "tenant_id": c["tenant_id"]})

    def _worker() -> None:
        decision = _engine.gate._wait_for_decision(approval["id"])
        if decision == "approved":
            try:
                if on_approved is not None:
                    result = on_approved(payload)
                else:
                    rec = app_store.store.create(c["app_id"], c["tenant_id"], collection, payload)
                    result = f"已写入记录 {rec['id']}（{collection}）"
                _store.domain.update("approvals", "id", approval["id"], {"result": str(result)})
            except Exception as exc:  # noqa: BLE001
                _store.domain.update("approvals", "id", approval["id"], {"result": f"执行失败：{exc}"})

    threading.Thread(target=_worker, daemon=True).start()
    return approval


@router.post("/approvals/submit")
def submit_approval(app_id: str, tenant_id: str, payload: Dict[str, Any] = Body(...),
                    x_role: Optional[str] = Header(None), x_pin: Optional[str] = Header(None)):
    c = _ctx(app_id, tenant_id, x_role, x_pin)
    if "collection" not in payload:
        raise HTTPException(400, "缺少 collection")
    approval = _submit_approval(
        c,
        tool_name=payload.get("tool_name") or "app_business_action",
        action_tag=payload.get("action_tag") or "业务审批",
        collection=payload["collection"],
        payload=payload.get("payload") or {},
    )
    return {"ok": True, "approval_id": approval["id"], "title": approval["title"],
            "tool": approval["tool"], "status": approval["status"]}


@router.get("/approvals")
def list_approvals(app_id: str, tenant_id: str,
                   x_role: Optional[str] = Header(None), x_pin: Optional[str] = Header(None)):
    """商家端审批列表：仅本应用 × 本租户的审批记录。"""
    c = _ctx(app_id, tenant_id, x_role, x_pin)
    _require_writable(c)
    rows = [r for r in _store.all("approvals")
            if r.get("app_id") == c["app_id"] and r.get("tenant_id") == c["tenant_id"]]
    rows.sort(key=lambda r: r.get("created_at", ""), reverse=True)
    return {"approvals": rows}


@router.post("/approvals/{aid}/decide")
def decide_approval(app_id: str, tenant_id: str, aid: str, payload: Dict[str, Any] = Body(...),
                    x_role: Optional[str] = Header(None), x_pin: Optional[str] = Header(None)):
    c = _ctx(app_id, tenant_id, x_role, x_pin)
    _require_writable(c)
    decision = payload.get("decision")
    if decision not in ("approved", "rejected"):
        raise HTTPException(400, "decision 必须为 approved/rejected")
    if not _engine.gate.decide(aid, decision, payload.get("reason") or ""):
        raise HTTPException(404, "审批记录不存在")
    return {"ok": True, "decision": decision, "approval_id": aid}


# =================== runFlow（业务支撑主路径 · 事件步骤/动作步骤） ===================
# 点餐业务流（代码侧注册的内置模板；平台「流程编排」可创建同名流程覆盖）
BUILTIN_MENU_ORDER_FLOW: Dict[str, Any] = {
    "id": "builtin-menu-order-flow",
    "name": "点餐业务流",
    "description": "智能推荐 →（顾客确认）→ 下单（审批）→ 出餐通知 · 由应用运行时 Flows 承载",
    "builtin": True,
    "steps": [
        {"name": "智能推荐", "action": "recommend"},
        {"name": "顾客确认下单", "action": "place_order", "approval_tool": "order_process"},
        {"name": "出餐通知", "action": "notify"},
    ],
}


def _flow_template(flow_name: str) -> Optional[Dict[str, Any]]:
    return (next((f for f in _store.all("flows") if f.get("name") == flow_name), None)
            or (BUILTIN_MENU_ORDER_FLOW if flow_name == BUILTIN_MENU_ORDER_FLOW["name"] else None))


def _tenant_flow(c: Dict[str, Any], restart: bool = False) -> Dict[str, Any]:
    """按 manifest.flow_ref 找流程模板，在该租户数据域维护实例（每租户一份；restart 开启新会话）。"""
    flow_name = (c["manifest"].get("flow_ref") or "").strip()
    if not flow_name:
        raise HTTPException(400, f"应用 {c['app_id']} 未绑定流程（flow_ref）")
    template = _flow_template(flow_name)
    if template is None:
        raise HTTPException(404, f"流程模板不存在：{flow_name}")
    rows = app_store.store.list(c["app_id"], c["tenant_id"], "flows")
    inst = next((r for r in rows if r.get("flow_id") == template["id"]), None)
    if restart or inst is None:
        inst = app_store.store.create(c["app_id"], c["tenant_id"], "flows", {
            "flow_id": template["id"], "flow_name": template["name"], "name": template["name"],
            "steps": copy.deepcopy(template.get("steps") or []),
            "current": 0, "status": "未启动",
        })
    return inst


# 动作步骤处理器：action 命中的确定性业务步骤（下单/审批等仍由 flows 状态机驱动）
def _ensure_menu(c: Dict[str, Any]) -> None:
    """租户菜单首启种子（菜谱由商家端维护，首次为空时写入内置菜单）。"""
    d = app_store.store.domain(c["app_id"], c["tenant_id"])
    if d.count("menu") == 0:
        app_store.store.seed(c["app_id"], c["tenant_id"], "menu", SEED_MENU)


def _default_provider() -> Optional[Dict[str, Any]]:
    return next((p for p in _store.all("llm_providers") if p.get("api_key")), None)


def _action_record(c: Dict[str, Any], step: Dict[str, Any], input_text: str) -> str:
    coll = step.get("collection") or "records"
    try:
        rec = app_store.store.create(c["app_id"], c["tenant_id"], coll,
                                     {"note": input_text[:500], "step": step.get("name", "")})
    except ValueError as e:
        raise HTTPException(400, str(e))
    return f"已写入记录 {rec['id']}（{coll}）"


def _action_request_approval(c: Dict[str, Any], step: Dict[str, Any], input_text: str) -> str:
    coll = step.get("collection") or "records"
    approval = _submit_approval(c, tool_name=step.get("approval_tool") or "app_business_action",
                                action_tag="业务审批", collection=coll,
                                payload={"note": input_text[:500], "step": step.get("name", "")})
    return f"已提交审批 {approval['id']}，等待商家确认"


def _rule_recommend(menu: list, pref: str) -> str:
    lines = [f"- {d['name']}（¥{d['price']}）{d.get('desc', '')}" for d in menu[:6]]
    tip = f"（偏好：{pref or '不限'}）" if pref else ""
    return f"今日推荐{tip}：\n" + "\n".join(lines)


def _action_recommend(c: Dict[str, Any], step: Dict[str, Any], input_text: str) -> str:
    """智能推荐：优先 LLM（读租户菜单），未配置 Key 时回退规则推荐。"""
    _ensure_menu(c)
    menu = app_store.store.list(c["app_id"], c["tenant_id"], "menu")
    pref = (input_text or "").strip()
    provider = _default_provider()
    if provider:
        try:
            menu_txt = "；".join(f"{d['name']}¥{d['price']}（{d.get('desc', '')}）" for d in menu)
            user = (f"口味/预算偏好：{pref or '不限'}。今日菜单：{menu_txt}。"
                    "请推荐 3 道菜并给出一句话理由，最后给出合计价格。直接输出。")
            text = "".join(llm_client.stream_completion(
                provider, "你是点餐推荐助手，只输出推荐结果，不使用 markdown 标题。", user, max_tokens=400))
            if text.strip():
                return f"AI 智能推荐：\n{text.strip()}"
        except Exception:  # noqa: BLE001  LLM 不可用时回退规则推荐
            pass
    return _rule_recommend(menu, pref)


def _next_order_no(c: Dict[str, Any]) -> str:
    rows = app_store.store.list(c["app_id"], c["tenant_id"], "orders")
    nums = [int(str(r.get("order_no", "")).lstrip("#")) for r in rows
            if str(r.get("order_no", "")).lstrip("#").isdigit()]
    return f"#{max(nums) + 1 if nums else 1}"


def _place_order_approved(c: Dict[str, Any], payload: Dict[str, Any]) -> str:
    """审批通过后的落地：核价/验库存 → 扣库存 → 生成订单（status=已下单）。"""
    menu = app_store.store.list(c["app_id"], c["tenant_id"], "menu")
    counts: Dict[Any, int] = Counter(map(str, payload["dish_ids"]))
    dish_map: Dict[str, dict] = {}
    for did in counts:
        dish = next((m for m in menu if str(m.get("id")) == str(did)), None)
        if dish is None:
            raise ValueError(f"菜品 #{did} 不存在")
        dish_map[str(did)] = dish
    for did, qty in counts.items():
        if dish_map[did]["inventory"] < qty:
            raise ValueError(f"{dish_map[did]['name']} 库存不足（剩余 {dish_map[did]['inventory']}，需要 {qty}）")
    for did, qty in counts.items():
        dish = dish_map[did]
        app_store.store.update(c["app_id"], c["tenant_id"], "menu", dish["id"],
                               {"inventory": dish["inventory"] - qty})
    names = [dish_map[did]["name"] for did, qty in counts.items() for _ in range(qty)]
    total = sum(dish_map[did]["price"] * qty for did, qty in counts.items())
    order = app_store.store.create(c["app_id"], c["tenant_id"], "orders", {
        "order_no": _next_order_no(c), "dish_names": names, "total": total,
        "seat_count": payload.get("seat_count", 1), "status": "已下单",
        "note": payload.get("note") or "",
    })
    return f"已接单 #{order['order_no']}（¥{total}）：{', '.join(names)}"


def _action_place_order(c: Dict[str, Any], step: Dict[str, Any], input_text: str) -> str:
    """下单（触发审批门）：输入 JSON {dish_ids, seat_count, note}，审批通过后落地。"""
    _ensure_menu(c)
    try:
        data = json.loads(input_text or "{}")
    except Exception:  # noqa: BLE001
        raise HTTPException(400, "下单参数需为 JSON：{\"dish_ids\": [1,2], \"seat_count\": 2}")
    dish_ids = [str(i) for i in (data.get("dish_ids") or [])]
    if not dish_ids:
        raise HTTPException(400, "未选择菜品（dish_ids 不可为空）")
    menu = app_store.store.list(c["app_id"], c["tenant_id"], "menu")
    for did in dish_ids:
        if not any(str(m.get("id")) == str(did) for m in menu):
            raise HTTPException(400, f"菜品 #{did} 不存在")
    approval = _submit_approval(
        c, tool_name=step.get("approval_tool") or "order_process", action_tag="下单",
        collection="orders",
        payload={"dish_ids": dish_ids, "seat_count": int(data.get("seat_count") or 1),
                 "note": (data.get("note") or "")[:200]},
        on_approved=lambda p: _place_order_approved(c, p),
    )
    return f"订单已提交（审批 {approval['id'][:8]}），等待商家确认"


def _action_notify(c: Dict[str, Any], step: Dict[str, Any], input_text: str) -> str:
    """出餐通知：取本租户最近订单生成通知文案（出餐/完成由商家端流转状态）。"""
    rows = sorted(app_store.store.list(c["app_id"], c["tenant_id"], "orders"),
                  key=lambda r: r.get("created_at", ""), reverse=True)
    if not rows:
        return "暂无订单，无法生成出餐通知"
    o = rows[0]
    return (f"〔出餐通知〕订单 {o.get('order_no', '-')} 已接单，含 {', '.join(o.get('dish_names') or [])}，"
            f"合计 ¥{o.get('total', 0)}（桌 {o.get('seat_count', 1)}），请稍候，出餐后将为您上桌。")


GATEWAY_ACTIONS: Dict[str, Callable[[Dict[str, Any], Dict[str, Any], str], str]] = {
    "record": _action_record,
    "request_approval": _action_request_approval,
    "recommend": _action_recommend,
    "place_order": _action_place_order,
    "notify": _action_notify,
}


@router.get("/flow")
def flow_status(app_id: str, tenant_id: str,
                x_role: Optional[str] = Header(None), x_pin: Optional[str] = Header(None)):
    """流程实例状态（步骤名/状态/当前进度），供 H5 判断先跑推荐还是直接下单。"""
    c = _ctx(app_id, tenant_id, x_role, x_pin)
    inst = _tenant_flow(c)
    return {
        "flow_id": inst.get("id"), "flow_name": inst.get("flow_name"),
        "status": inst.get("status", "未启动"), "current": int(inst.get("current") or 0),
        "steps": [{"name": s.get("name", ""), "action": s.get("action", ""),
                   "status": s.get("status", "pending")} for s in (inst.get("steps") or [])],
    }


@router.post("/runFlow")
def run_flow(app_id: str, tenant_id: str, payload: Dict[str, Any] = Body(...),
             x_role: Optional[str] = Header(None), x_pin: Optional[str] = Header(None)):
    """推进流程实例一个步骤（含条件跳过）。agent 步骤走现有 flows 引擎，注入租户上下文；
    传 restart=true 开启新会话（每次点餐 = 一条完整业务流程）。"""
    c = _ctx(app_id, tenant_id, x_role, x_pin)
    inst = _tenant_flow(c, restart=bool(payload.get("restart")))
    steps = inst["steps"]
    idx = int(inst.get("current") or 0)
    input_text = ((payload.get("input") or "").strip() or "流程步骤")
    prev_out = (steps[idx - 1].get("output") or "") if idx > 0 else ""

    while idx < len(steps):
        step = steps[idx]
        cond = (step.get("if_contains") or "").strip()
        if cond and cond not in (prev_out or ""):
            step["status"] = "skipped"
            idx += 1
            app_store.store.update(c["app_id"], c["tenant_id"], "flows", inst["id"],
                                   {"steps": steps, "current": idx})
            continue

        step["status"] = "running"
        app_store.store.update(c["app_id"], c["tenant_id"], "flows", inst["id"],
                               {"steps": steps, "current": idx, "status": "运行中"})
        action = str(step.get("action") or "").strip()
        if action in GATEWAY_ACTIONS:
            output = GATEWAY_ACTIONS[action](c, step, input_text)
        else:
            # agent 步骤：转现有 flows 引擎（run_flow_step）；客户上下文注入 input
            events: list = []
            output = _engine.run_flow_step(inst, step, input_text, events.append)
        step["output"] = output
        step["status"] = "done"
        idx += 1
        flow_status = "已完成" if idx >= len(steps) else "运行中"
        app_store.store.update(c["app_id"], c["tenant_id"], "flows", inst["id"],
                               {"steps": steps, "current": idx, "status": flow_status,
                                "last_output": output[:300]})
        return {"step": step.get("name", ""), "status": "done", "output": output,
                "flow_id": inst["id"], "flow_status": flow_status, "current": idx}

    return {"step": None, "status": "done", "output": "流程已完成", "flow_id": inst["id"],
            "flow_status": "已完成", "current": idx}


# =================== runCrew（转现有编排引擎） ===================
@router.post("/runCrew")
def run_crew(app_id: str, tenant_id: str, payload: Dict[str, Any] = Body(...),
             x_role: Optional[str] = Header(None), x_pin: Optional[str] = Header(None)):
    c = _ctx(app_id, tenant_id, x_role, x_pin)
    crew_id = payload.get("crew_id")
    if not crew_id:
        raise HTTPException(400, "缺少 crew_id")
    crew_cfg = _store.get("crews", crew_id)
    if crew_cfg is None:
        raise HTTPException(404, "编排不存在")
    tenant_note = f"〔应用 {c['app_id']} · 租户 {c['tenant_id']} · 角色 {c['role']}〕"
    input_text = f"{tenant_note}\n{payload.get('input') or ''}"
    events: list = []
    output = _engine.run_crew(crew_cfg, session_id=f"app-gw-{c['app_id']}-{c['tenant_id']}-{int(__import__('time').time() * 1000)}",
                              input_text=input_text, emit=events.append)
    return {"ok": True, "output": output, "events": events[-20:]}