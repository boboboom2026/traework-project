# -*- coding: utf-8 -*-
"""多智能体协作平台 API（扩展现有 FastAPI 后端，复用 agent_framework 底座）。

路由前缀 /api（与托管应用 /api/menu 等无冲突）：
    agents / crews / llm-providers / tools / sessions(+run SSE) / approvals / traces / knowledge / memory / summary / health
"""
from __future__ import annotations

import json
import queue
import threading
from datetime import datetime
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Body, HTTPException
from fastapi.responses import StreamingResponse

from engine import CrewRunEngine
import llm_client
import retriever
import app_runtime
import app_store
from platform_store import PlatformStore

DATA_DIR = "data"  # 相对 platform/backend 运行目录

_store = PlatformStore(DATA_DIR)
_engine = CrewRunEngine(_store)


def _now() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def _new_id() -> str:
    import uuid
    return uuid.uuid4().hex[:8]


router = APIRouter(prefix="/api", tags=["platform"])

# =================== 健康 / 概览 ===================
@router.get("/health")
def health():
    return {"status": "ok", "time": _now()}


@router.get("/summary")
def summary():
    agents = _store.all("agents")
    crews = _store.all("crews")
    tools = list(_engine.tools_raw.keys())
    traces = _store.all("traces")
    approvals = _store.all("approvals")
    runs = len(traces)
    recent = sorted(traces, key=lambda r: r.get("started_at", ""), reverse=True)[:6]
    return {
        "agents": len(agents),
        "crews": len(crews),
        "tools": len(tools),
        "runs": runs,
        "pending_approvals": len([a for a in approvals if a.get("status") == "pending"]),
        "recent_runs": recent,
        "runnable_crews": [
            {"id": c["id"], "name": c["name"], "description": c.get("description", "")}
            for c in crews
        ],
    }


# =================== 智能体 CRUD ===================
@router.get("/agents")
def list_agents():
    return {"agents": _store.all("agents")}


@router.post("/agents")
def create_agent(payload: Dict[str, Any] = Body(...)):
    rec = dict(payload)
    rec["id"] = rec.get("id") or _new_id()
    rec.setdefault("status", "ready")
    rec.setdefault("memory", False)
    rec.setdefault("allow_delegation", False)
    rec.setdefault("tools", [])
    return _store.save("agents", rec)


@router.put("/agents/{aid}")
def update_agent(aid: str, payload: Dict[str, Any] = Body(...)):
    if _store.get("agents", aid) is None:
        raise HTTPException(404, "智能体不存在")
    _store.update("agents", aid, payload)
    return {"ok": True}


@router.delete("/agents/{aid}")
def delete_agent(aid: str):
    if not _store.delete("agents", aid):
        raise HTTPException(404, "智能体不存在")
    return {"ok": True}


# =================== 协作编排 CRUD ===================
@router.get("/crews")
def list_crews():
    return {"crews": _store.all("crews")}


@router.post("/crews")
def create_crew(payload: Dict[str, Any] = Body(...)):
    rec = dict(payload)
    rec["id"] = rec.get("id") or _new_id()
    rec.setdefault("tasks", [])
    rec.setdefault("process", "sequential")
    rec.setdefault("planning", False)
    rec.setdefault("memory", False)
    return _store.save("crews", rec)


@router.put("/crews/{cid}")
def update_crew(cid: str, payload: Dict[str, Any] = Body(...)):
    if _store.get("crews", cid) is None:
        raise HTTPException(404, "编排不存在")
    _store.update("crews", cid, payload)
    return {"ok": True}


@router.delete("/crews/{cid}")
def delete_crew(cid: str):
    if not _store.delete("crews", cid):
        raise HTTPException(404, "编排不存在")
    return {"ok": True}


# =================== LLM 提供商 CRUD ===================
@router.get("/llm-providers")
def list_providers():
    return {"providers": _store.all("llm_providers")}


@router.post("/llm-providers")
def create_provider(payload: Dict[str, Any] = Body(...)):
    rec = dict(payload)
    rec["id"] = rec.get("id") or _new_id()
    rec.setdefault("builtin", False)
    rec.setdefault("kind", "chat")
    return _store.save("llm_providers", rec)


@router.put("/llm-providers/{pid}")
def update_provider(pid: str, payload: Dict[str, Any] = Body(...)):
    if _store.get("llm_providers", pid) is None:
        raise HTTPException(404, "提供商不存在")
    _store.update("llm_providers", pid, payload)
    return {"ok": True}


@router.post("/llm-providers/{pid}/test")
def test_provider(pid: str, payload: Dict[str, Any] = Body(default={})):
    """连接测试：对话提供商走最小 completion；嵌入提供商（kind=embedding）走嵌入接口。"""
    base = _store.get("llm_providers", pid)
    if base is None:
        raise HTTPException(404, "提供商不存在")
    merged = {**base, **{k: v for k, v in (payload or {}).items() if v not in (None, "")}}
    if merged.get("kind") == "embedding":
        return llm_client.test_embedding(merged)
    return llm_client.test_completion(merged)


@router.delete("/llm-providers/{pid}")
def delete_provider(pid: str):
    if not _store.delete("llm_providers", pid):
        raise HTTPException(404, "提供商不存在")
    return {"ok": True}


# =================== 工具目录 ===================
@router.get("/tools")
def list_tools():
    rows = []
    for name, t in _engine.tools_raw.items():
        meta = _engine.tool_meta.get(name, {})
        rows.append({
            "name": name, "description": t.description,
            "requires_approval": t.requires_approval,
            "args": t.args_schema,
            "category": meta.get("category", "其他"),
            "real": bool(meta.get("real")),
            "source": meta.get("source", "builtin"),
            "status": meta.get("status", "ready"),
            "note": meta.get("note", ""),
        })
    return {"tools": rows, "total": len(rows), "categories": sorted({r["category"] for r in rows})}


# =================== 协作会话 ===================
def _session_view(s: Dict[str, Any]) -> Dict[str, Any]:
    view = {k: v for k, v in s.items() if k != "messages"}
    view["message_count"] = len(s.get("messages") or [])
    return view


@router.get("/sessions")
def list_sessions():
    return {"sessions": [_session_view(s) for s in _store.list_sessions()]}


@router.post("/sessions")
def create_session(payload: Dict[str, Any] = Body(...)):
    rec = dict(payload)
    rec["id"] = rec.get("id") or _new_id()
    rec.setdefault("messages", [])
    rec.setdefault("starred", False)
    rec.setdefault("kind", "task")
    if not rec.get("created_at"):
        rec["created_at"] = _now()
    rec["updated_at"] = _now()
    return _store.save("sessions", rec)


@router.get("/sessions/{sid}")
def get_session(sid: str):
    s = _store.get_session(sid)
    if s is None:
        raise HTTPException(404, "会话不存在")
    return s


@router.delete("/sessions/{sid}")
def delete_session(sid: str):
    if not _store.delete("sessions", sid):
        raise HTTPException(404, "会话不存在")
    return {"ok": True}


@router.post("/sessions/{sid}/messages")
def post_message(sid: str, payload: Dict[str, Any] = Body(...)):
    s = _store.get_session(sid)
    if s is None:
        raise HTTPException(404, "会话不存在")
    msg = {
        "id": f"u-{int(datetime.now().timestamp() * 1000)}",
        "role": "user", "agent": "我",
        "content": payload.get("content", ""),
        "created_at": _now(),
    }
    _store.add_message(sid, msg)
    return {"ok": True, "message": msg}


@router.post("/sessions/{sid}/run")
def run_session(sid: str, payload: Dict[str, Any] = Body(...)):
    """以 SSE 流式执行会话绑定的协作编排。"""
    s = _store.get_session(sid)
    if s is None:
        raise HTTPException(404, "会话不存在")
    crew_cfg = _store.get("crews", s.get("crew_id", ""))
    if crew_cfg is None:
        crews = _store.all("crews")
        crew_cfg = crews[0] if crews else None
    if crew_cfg is None:
        raise HTTPException(400, "会话未绑定任何编排配置")
    input_text = (payload.get("input") or "").strip() or "目标课题"

    def event_stream():
        q: "queue.Queue[Optional[dict]]" = queue.Queue()
        emit = q.put

        def _run():
            try:
                _engine.run_crew(crew_cfg, sid, input_text, emit)
            except Exception as exc:  # noqa: BLE001
                emit({"type": "error", "message": str(exc)})
            finally:
                emit(None)

        threading.Thread(target=_run, daemon=True).start()
        # 注意：不可无超时阻塞 queue.get()（会冻结事件循环，审批等待期间其他请求将无法响应）
        while True:
            try:
                item = q.get(timeout=0.1)
            except queue.Empty:
                continue
            if item is None:
                break
            yield f"data: {json.dumps(item, ensure_ascii=False)}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# =================== 审批（人工介入） ===================
# 注意：/api/approvals 被托管应用（menu-ordering）占用，平台审批使用独立路径 /api/platform/approvals
@router.get("/platform/approvals")
def list_approvals():
    rows = _store.all("approvals")
    rows.sort(key=lambda r: r.get("created_at", ""), reverse=True)
    tenants = {t["id"]: t.get("name") for t in _store.all("tenants")}
    views = [{**r, "tenant_name": tenants.get(r.get("tenant_id"), "")} for r in rows]
    return {"approvals": views}


@router.post("/platform/approvals/{approval_id}/decide")
def decide_approval(approval_id: str, payload: Dict[str, Any] = Body(...)):
    decision = payload.get("decision")
    if decision not in ("approved", "rejected"):
        raise HTTPException(400, "decision 必须为 approved/rejected")
    ok = _engine.gate.decide(approval_id, decision, payload.get("reason") or "")
    if not ok:
        raise HTTPException(404, "审批记录不存在")
    return {"ok": True, "decision": decision}


# =================== 运行观测 ===================
@router.get("/traces")
def list_traces():
    rows = _store.all("traces")
    rows.sort(key=lambda r: r.get("started_at", ""), reverse=True)
    return {"traces": rows}


# =================== 知识库（Knowledge + RAG） ===================
def _embedding_provider() -> Optional[Dict[str, Any]]:
    """当前可用的嵌入提供商（kind=embedding），无则 None（走本地哈希回退）。"""
    return retriever.pick_embedding_provider(_store.all("llm_providers"))


def _reindex(rec: Dict[str, Any]) -> None:
    """写入前分块并向量化：有 embedding provider 用真实嵌入（vectors 缓存），否则本地哈希。"""
    content = (rec.get("content") or "").strip()
    chunks = retriever.chunk_text(content) if content else []
    rec["chunk_count"] = len(chunks)
    rec["vectors"] = None
    if content:
        prov = _embedding_provider()
        vecs = None
        if prov:
            try:
                vecs = llm_client.embed_texts(prov, chunks)
            except Exception:  # noqa: BLE001  嵌入失败回退本地索引
                vecs = None
        if vecs is not None:
            rec["vectors"] = vecs
            rec["embed_status"] = f"真实嵌入 {prov.get('name', '')}/{prov.get('model', '')}"
        else:
            rec["embed_status"] = "本地哈希索引"
        rec["status"] = "已嵌入"
    else:
        rec["embed_status"] = "待嵌入"
        rec["status"] = "待嵌入"


@router.get("/knowledge")
def list_knowledge():
    return {"docs": _store.all("knowledge")}


@router.post("/knowledge")
def add_knowledge(payload: Dict[str, Any] = Body(...)):
    rec = dict(payload)
    rec["id"] = rec.get("id") or _new_id()
    rec["created_at"] = _now()
    _reindex(rec)
    return _store.save("knowledge", rec)


@router.put("/knowledge/{kid}")
def update_knowledge(kid: str, payload: Dict[str, Any] = Body(...)):
    if _store.get("knowledge", kid) is None:
        raise HTTPException(404, "文档不存在")
    rec = dict(payload)
    _reindex(rec)
    _store.update("knowledge", kid, rec)
    return {"ok": True}


@router.delete("/knowledge/{kid}")
def delete_knowledge(kid: str):
    if not _store.delete("knowledge", kid):
        raise HTTPException(404, "文档不存在")
    return {"ok": True}


@router.get("/knowledge/search")
def search_knowledge(q: str = "", ids: str = "", top_k: int = 3):
    """RAG 检索测试：对知识库（可按 ids 限定范围）执行相似度检索（真实嵌入 / 本地哈希均可）。"""
    docs = _store.all("knowledge")
    if ids:
        id_set = {x for x in ids.split(",") if x}
        docs = [d for d in docs if d["id"] in id_set]
    prov = _embedding_provider()
    qv = retriever.embed_query(q, prov) or retriever.embed(q)
    hits = retriever.search_docs(q, qv, docs, top_k=max(1, min(top_k, 10)))
    mode = f"embedding/{prov.get('model')}" if (isinstance(qv, list) and prov) else "local-hash"
    return {"query": q, "total": len(hits), "hits": hits, "embed_mode": mode}


# =================== 应用注册表（薄应用托管层 · 阶段 0） ===================
@router.get("/apps")
def list_apps():
    """已注册应用清单（manifest 即注册）。"""
    apps = []
    for m in app_runtime.list_apps():
        caps = []
        for c in (m.get("capabilities") or []):
            meta = _engine.tool_meta.get(c, {})
            caps.append({"name": c, "real": bool(meta.get("real")),
                         "platform": bool(meta), "category": meta.get("category", "应用自管")})
        crew_ok = bool(m.get("crew_ref")) and any(c["name"] == m["crew_ref"] for c in _store.all("crews"))
        flow_ok = bool(m.get("flow_ref")) and any(f.get("name") == m["flow_ref"] for f in _store.all("flows"))
        apps.append({
            "app_id": m["app_id"], "name": m.get("name"), "version": m.get("version", "1.0"),
            "description": m.get("description", ""), "enabled": m.get("enabled", True),
            "entry": m.get("entry", {}), "endpoints": m.get("endpoints", []),
            "capabilities": caps, "crew_ref": m.get("crew_ref"),
            "flow_ref": m.get("flow_ref"), "data_models": m.get("data_models", []),
            "approval_required": m.get("approval_required", []),
            "crew_bound": crew_ok, "flow_bound": flow_ok,
        })
    return {"apps": apps, "total": len(apps), "errors": app_runtime.load_errors()}


# =================== 租户模型 + 应用数据域（阶段 2） ===================
def _tenant_or_404(tid: str) -> Dict[str, Any]:
    t = _store.get("tenants", tid)
    if t is None or t.get("status") != "active":
        raise HTTPException(404, f"租户不存在或已停用：{tid}")
    return t


def _subscribed_tenant_or_404(app_id: str, tid: str) -> Dict[str, Any]:
    t = _tenant_or_404(tid)
    if app_id not in (t.get("apps") or []):
        raise HTTPException(404, f"租户 {tid} 未订阅应用 {app_id}")
    return t


@router.get("/tenants")
def list_tenants():
    return {"tenants": _store.all("tenants")}


@router.post("/tenants")
def create_tenant(payload: Dict[str, Any] = Body(...)):
    tid = str(payload.get("id") or "").strip()
    if not app_store.validate_tenant(tid):
        raise HTTPException(400, "tenant_id 非法：字母/数字/下划线/连字符，最长 64")
    if _store.get("tenants", tid) is not None:
        raise HTTPException(409, f"租户已存在：{tid}")
    rec = {
        "id": tid,
        "name": payload.get("name") or tid,
        "status": payload.get("status") or "active",
        "apps": payload.get("apps") or [],
        "created_at": _now(),
        "note": payload.get("note") or "",
    }
    _store.save("tenants", rec)
    return rec


@router.put("/tenants/{tid}")
def update_tenant(tid: str, payload: Dict[str, Any] = Body(...)):
    if _store.get("tenants", tid) is None:
        raise HTTPException(404, "租户不存在")
    payload = {k: v for k, v in payload.items() if k != "id"}
    _store.update("tenants", tid, payload)
    return {"ok": True}


@router.delete("/tenants/{tid}")
def delete_tenant(tid: str):
    if not _store.delete("tenants", tid):
        raise HTTPException(404, "租户不存在")
    return {"ok": True}


# 数据域只读/写入（隔离验证入口；能力网关阶段 3 将包装为应用侧 data API）
@router.get("/app-store/{app_id}/{tenant_id}/{collection}")
def app_data_list(app_id: str, tenant_id: str, collection: str):
    _subscribed_tenant_or_404(app_id, tenant_id)
    if not app_runtime.get_app(app_id):
        raise HTTPException(404, f"应用未注册：{app_id}")
    try:
        rows = app_store.store.list(app_id, tenant_id, collection)
    except ValueError as e:
        raise HTTPException(400, str(e))
    return {"app_id": app_id, "tenant_id": tenant_id, "collection": collection, "rows": rows}


@router.post("/app-store/{app_id}/{tenant_id}/{collection}")
def app_data_create(app_id: str, tenant_id: str, collection: str,
                    payload: Dict[str, Any] = Body(...)):
    _subscribed_tenant_or_404(app_id, tenant_id)
    if not app_runtime.get_app(app_id):
        raise HTTPException(404, f"应用未注册：{app_id}")
    try:
        rec = app_store.store.create(app_id, tenant_id, collection, payload)
    except ValueError as e:
        raise HTTPException(400, str(e))
    return rec


# =================== 流程编排（Flows：事件驱动工作流） ===================
def _flow_view(f: Dict[str, Any]) -> Dict[str, Any]:
    view = {k: v for k, v in f.items() if k != "steps"}
    steps = f.get("steps") or []
    total = len(steps)
    done = sum(1 for s in steps if s.get("status") in ("done", "skipped"))
    view["total_steps"] = total
    view["done_steps"] = done
    view["progress"] = round(done / total, 2) if total else 0
    # 精简 steps 元数据（供前端节点画布渲染，不含 action/output 详情）
    view["steps"] = [
        {"id": s.get("id"), "name": s.get("name"), "agent_name": s.get("agent_name"),
         "status": s.get("status", "pending")}
        for s in steps
    ]
    return view


@router.get("/flows")
def list_flows():
    return {"flows": [_flow_view(f) for f in _store.all("flows")]}


@router.get("/flows/{fid}")
def get_flow(fid: str):
    f = _store.get("flows", fid)
    if f is None:
        raise HTTPException(404, "流程不存在")
    return f


@router.post("/flows")
def create_flow(payload: Dict[str, Any] = Body(...)):
    rec = dict(payload)
    rec["id"] = rec.get("id") or _new_id()
    for s in (rec.get("steps") or []):
        s.setdefault("status", "pending")
    rec.setdefault("steps", [])
    rec.setdefault("current", 0)
    rec.setdefault("status", "未启动")
    rec.setdefault("created_at", _now())
    return _store.save("flows", rec)


@router.put("/flows/{fid}")
def update_flow(fid: str, payload: Dict[str, Any] = Body(...)):
    if _store.get("flows", fid) is None:
        raise HTTPException(404, "流程不存在")
    rec = dict(payload)
    rec.pop("id", None)
    _store.update("flows", fid, rec)
    return {"ok": True}


@router.delete("/flows/{fid}")
def delete_flow(fid: str):
    if not _store.delete("flows", fid):
        raise HTTPException(404, "流程不存在")
    return {"ok": True}


@router.post("/flows/{fid}/reset")
def reset_flow(fid: str):
    f = _store.get("flows", fid)
    if f is None:
        raise HTTPException(404, "流程不存在")
    steps = f.get("steps") or []
    for s in steps:
        s["status"] = "pending"
        s.pop("output", None)
    _store.update("flows", fid, {"steps": steps, "current": 0, "status": "未启动", "last_output": None})
    return {"ok": True}


@router.post("/flows/{fid}/run")
def run_flow(fid: str, payload: Dict[str, Any] = Body(...)):
    """推进流程一个步骤：SSE 事件流（跳过条件未命中的步骤）。"""
    f = _store.get("flows", fid)
    if f is None:
        raise HTTPException(404, "流程不存在")
    if len(f.get("steps") or []) == 0:
        raise HTTPException(400, "流程无步骤")
    input_text = (payload.get("input") or "").strip() or "流程环节"

    def event_stream():
        q: "queue.Queue[Optional[dict]]" = queue.Queue()
        emit = q.put

        def _run():
            try:
                steps = f.get("steps") or []
                idx = int(f.get("current") or 0)
                while idx < len(steps):
                    step = steps[idx]
                    cond = (step.get("if_contains") or "").strip()
                    prev_out = ""
                    if idx > 0:
                        prev_out = (steps[idx - 1].get("output") or "")
                    if cond and cond not in (prev_out or ""):
                        step["status"] = "skipped"
                        emit({"type": "flow_step", "status": "skipped", "step": step.get("name", ""),
                              "condition": cond, "message": "上一步输出未命中条件，跳过该步骤"})
                        idx += 1
                        _store.update("flows", fid, {"steps": steps, "current": idx})
                        continue
                    step["status"] = "running"
                    _store.update("flows", fid, {"steps": steps, "current": idx, "status": "运行中"})
                    output = _engine.run_flow_step(f, step, input_text, emit)
                    step["output"] = output
                    step["status"] = "done"
                    idx += 1
                    _store.update("flows", fid, {
                        "steps": steps, "current": idx,
                        "last_output": output[:300],
                        "status": "已完成" if idx >= len(steps) else "运行中",
                    })
                    break  # 每次推进一个步骤
            except Exception as exc:  # noqa: BLE001
                emit({"type": "error", "message": str(exc)})
            finally:
                emit(None)

        threading.Thread(target=_run, daemon=True).start()
        while True:
            try:
                item = q.get(timeout=0.1)
            except queue.Empty:
                continue
            if item is None:
                break
            yield f"data: {json.dumps(item, ensure_ascii=False)}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# =================== 记忆 ===================
@router.get("/memory")
def list_memory():
    return {"records": _store.all("memory")}


@router.post("/memory/reset")
def reset_memory(payload: Optional[Dict[str, Any]] = Body(default={})):
    scope = (payload or {}).get("scope", "all")
    domain = _store.domain
    domain._cache["memory"] = []  # noqa: SLF001
    domain._save("memory")  # noqa: SLF001
    return {"ok": True, "scope": scope, "cleared": True}