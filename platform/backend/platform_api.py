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
        rows.append({
            "name": name, "description": t.description,
            "requires_approval": t.requires_approval,
            "args": t.args_schema,
        })
    return {"tools": rows, "total": len(rows)}


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
    return {"approvals": rows}


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