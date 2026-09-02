# -*- coding: utf-8 -*-
"""协作运行引擎：把平台配置（智能体/编排）实例化为 agent_framework 对象并流式执行。

职责：
1. 从配置构建 Agent（绑定工具目录）
2. 按编排的任务列表顺序执行，产出 SSE 事件流
   （思考分块 → 工具调用 → 需审批工具先签发审批并等待人工决策 → 结果）
3. 将运行过程落盘为 trace，并把角色消息写入会话
"""
from __future__ import annotations

import threading
import time
from datetime import datetime
from typing import Any, Callable, Dict, List, Optional

from agent_framework import Agent, ApprovalGate, DataDomain, Tool

import llm_client
import retriever
import crewai_tools_registry
from platform_store import PlatformStore

APPROVAL_TIMEOUT = 120  # 秒
POLL_INTERVAL = 0.5


# ------------------- 工具目录（对齐 crewai-tools；real=True 为真实调用，False 为演示 stub） -------------------

# ---- 真实：DuckDuckGo Instant Answer（无需 Key） ----
def _tool_search(keyword: str = "", **_: Any) -> str:
    import json as _json
    import urllib.parse
    import urllib.request
    last_err = ""
    for _attempt in range(2):  # 偶发握手失败重试一次
        try:
            url = ("https://api.duckduckgo.com/?q=" + urllib.parse.quote(keyword or "")
                   + "&format=json&no_html=1&skip_disambig=1")
            with urllib.request.urlopen(url, timeout=10) as r:
                d = _json.loads(r.read().decode("utf-8", "replace"))
            topics: list = list(d.get("RelatedTopics") or [])
            items: list = []
            for t in topics[:8]:
                if "Topics" in t:
                    items += [s for s in t["Topics"][:2] if s.get("Text")]
                elif t.get("Text"):
                    items.append(t)
            if d.get("AbstractText"):
                items = [{"Text": d.get("AbstractText"), "FirstURL": d.get("AbstractURL")}] + items
            lines = [f"- {it.get('Text', '')[:160]}（{it.get('FirstURL', '')}）" for it in items[:6]]
            if not lines:
                return f"[web_search] 未找到「{keyword or '目标'}」相关的即时信息，建议更换关键词。"
            return f"[web_search] 「{keyword or '目标'}」真实搜索结果 {len(items)} 条：\n" + "\n".join(lines)
        except Exception as exc:  # noqa: BLE001
            last_err = str(exc)[:150]
    return f"[web_search] 检索服务当前网络不可达（{last_err}）；可改用 url_fetch 或 python_exec 完成信息获取。"


# ---- 真实：受限 Python 沙箱执行 ----
def _tool_py(code: str = "", **_: Any) -> str:
    import contextlib
    import io
    safe_builtins = {
        "len": len, "range": range, "abs": abs, "min": min, "max": max, "sum": sum,
        "str": str, "int": int, "float": float, "list": list, "dict": dict,
        "tuple": tuple, "set": set, "enumerate": enumerate, "zip": zip,
        "sorted": sorted, "round": round, "print": print,
    }
    buf = io.StringIO()
    try:
        with contextlib.redirect_stdout(buf), contextlib.redirect_stderr(buf):
            exec((code or ""), {"__builtins__": safe_builtins})  # noqa: S102 演示级受限执行
        out = buf.getvalue()
        return f"[python_exec] 执行成功，输出：\n{out[:1500]}" if out else "[python_exec] 执行成功（无输出）"
    except Exception as exc:  # noqa: BLE001
        return f"[python_exec] 执行出错：{str(exc)[:200]}"


# ---- 真实：抓取网页正文 ----
def _tool_fetch(url: str = "", **_: Any) -> str:
    import html
    import re
    import urllib.request
    if not (url or "").startswith(("http://", "https://")):
        return "[url_fetch] 仅支持 http(s) 链接"
    try:
        with urllib.request.urlopen(url, timeout=10) as r:
            data = r.read(60000).decode("utf-8", "replace")
        text = re.sub(r"<script[\s\S]*?</script>|<style[\s\S]*?</style>", "", data, flags=re.I)
        text = html.unescape(re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", text))).strip()
        if not text:
            return "[url_fetch] 页面无可提取文本（可能为 JS 渲染站点）"
        return f"[url_fetch] 抓取成功（{len(text)} 字符）：{text[:1500]}"
    except Exception as exc:  # noqa: BLE001
        return f"[url_fetch] 抓取失败：{str(exc)[:150]}"


# ---- 真实：数值计算 ----
def _tool_calc(expression: str = "1+1", **_: Any) -> str:
    try:
        return f"[calc] {expression} = {eval(expression)}"  # noqa: S307 白名单受限算术
    except Exception:
        return "[calc] 表达式无法计算，请检查输入（仅支持基础算术）"


# ---- 真实：当前时间 ----
def _tool_now(_: str = "", **__: Any) -> str:
    from datetime import datetime
    return f"[now] 当前时间：{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}"


# ---- 演示 stub：模拟企业业务系统 ----
def _tool_db(topic: str = "", **_: Any) -> str:
    return f"[db_query] 查询到业务库中关于「{topic or '目标'}」的历史数据 36 条，近一年增速 18%。"


def _tool_news(topic: str = "", **_: Any) -> str:
    return f"[fetch_news] 抓取到关于「{topic or '目标'}」的行业快讯 5 条：政策、融资、新品各 1 条。"


def _tool_report(topic: str = "", **_: Any) -> str:
    return f"[gen_report] 已生成《{topic or '目标'}分析报告》：含市场概况、竞争格局、机会风险与行动建议共 4 章 3200 字。"


def _tool_email(topic: str = "", **_: Any) -> str:
    return f"[send_email] 已将《{topic or '目标'}分析报告》发送至收件人（含正文摘要与附件）。"


def _tool_publish(topic: str = "", **_: Any) -> str:
    return f"[publish_doc] 《{topic or '目标'}分析报告》已发布至团队知识库，全员可见。"


def _tool_archive(topic: str = "", **_: Any) -> str:
    return f"[archive_data] 已将「{topic or '目标'}」相关数据归档至项目空间，附带索引标签。"


# name, 描述, func, 需审批, 动作标签, 参数, 分类, real
_TOOL_CATALOG: List[tuple] = [
    ("web_search", "真实搜索互联网获取资讯与资料（DuckDuckGo）", _tool_search, False, "", [{"name": "keyword", "type": "str"}], "搜索与信息", True),
    ("url_fetch", "抓取网页正文文本（真实 http 请求）", _tool_fetch, False, "", [{"name": "url", "type": "str"}], "搜索与信息", True),
    ("fetch_news", "抓取行业资讯快讯（演示数据）", _tool_news, False, "", [{"name": "topic", "type": "str"}], "搜索与信息", False),
    ("calc", "数值计算（真实白名单算术）", _tool_calc, False, "", [{"name": "expression", "type": "str"}], "数据与计算", True),
    ("python_exec", "受限 Python 沙箱代码执行（真实）", _tool_py, False, "", [{"name": "code", "type": "str"}], "数据与计算", True),
    ("db_query", "查询企业业务数据库（演示数据）", _tool_db, False, "", [{"name": "topic", "type": "str"}], "数据与计算", False),
    ("now", "获取当前日期时间（真实）", _tool_now, False, "", [], "数据与计算", True),
    ("gen_report", "生成结构化分析报告（演示数据）", _tool_report, False, "", [{"name": "topic", "type": "str"}], "报告与发布", False),
    ("send_email", "发送邮件（高风险，需审批）（演示）", _tool_email, True, "发送邮件", [{"name": "topic", "type": "str"}], "报告与发布", False),
    ("publish_doc", "发布文档到知识库（高风险，需审批）（演示）", _tool_publish, True, "发布", [{"name": "topic", "type": "str"}], "报告与发布", False),
    ("archive_data", "归档数据到项目空间（演示）", _tool_archive, False, "", [{"name": "topic", "type": "str"}], "报告与发布", False),
]

TOOL_META: Dict[str, Dict[str, Any]] = {
    name: {"category": cat, "real": real, "source": "builtin"}
    for name, _desc, _func, _req, _tag, _args, cat, real in _TOOL_CATALOG
}
# 合并 CrewAI 官方工具适配层元数据
TOOL_META.update(crewai_tools_registry.crewai_tool_meta())


def build_tools() -> Dict[str, Tool]:
    """构建平台工具目录：内置工具 + CrewAI 官方工具适配层。"""
    tools: Dict[str, Tool] = {
        name: Tool(name=name, description=desc, func=func, args_schema=args,
                   requires_approval=req, action_tag=tag)
        for name, desc, func, req, tag, args, _cat, _real in _TOOL_CATALOG
    }
    tools.update(crewai_tools_registry.build_crewai_tools())
    return tools


# ------------------- 引擎 -------------------
class CrewRunEngine:
    def __init__(self, store: PlatformStore):
        self.store = store
        self.domain: DataDomain = store.domain
        self.gate = ApprovalGate(self.domain, timeout=APPROVAL_TIMEOUT, poll_interval=POLL_INTERVAL)
        self.tools_raw = build_tools()
        self.tool_meta = dict(TOOL_META)

    # ---------- 配置 → agent_framework 对象 ----------
    def build_agent(self, cfg: Dict[str, Any]) -> Agent:
        tools: List[Tool] = []
        for tname in (cfg.get("tools") or []):
            raw = self.tools_raw.get(tname)
            if raw:
                # 需审批工具由引擎人工介入流程处理（先发事件、再等待决策）
                tools.append(raw)
        return Agent(
            name=cfg["name"], role=cfg.get("role", ""), goal=cfg.get("goal", ""),
            backstory=cfg.get("backstory", ""), tools=tools,
            allow_delegation=bool(cfg.get("allow_delegation")),
            memory=bool(cfg.get("memory")),
        )

    def agent_by_name(self, name: str) -> Optional[Dict[str, Any]]:
        rows = self.domain.find("agents", name=name)
        return rows[0] if rows else None

    @staticmethod
    def _now() -> str:
        return datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    # ---------- 审批等待（阻塞，直到决策或超时） ----------
    def _wait_decision(self, approval_id: str) -> Optional[str]:
        deadline = time.time() + APPROVAL_TIMEOUT
        while time.time() < deadline:
            rows = self.domain.find("approvals", id=approval_id)
            if rows and rows[0].get("status") in ("approved", "rejected"):
                return rows[0]["status"]
            time.sleep(POLL_INTERVAL)
        return None

    def _call_tool(self, tool: Tool, agent_name: str, topic: str, emit: Callable[[Dict[str, Any]], None]) -> str:
        """执行工具。需审批工具：先签发审批事件 → 等待人工决策 → 通过才真正执行。"""
        param = "topic"
        if tool.args_schema:
            param = tool.args_schema[0]["name"]
        args = {param: topic}
        if not tool.requires_approval:
            emit({"type": "tool_call", "agent": agent_name, "tool": tool.name,
                  "status": "running", "requires_approval": False})
            result = tool.func(**args)
            emit({"type": "tool_call", "agent": agent_name, "tool": tool.name,
                  "status": "done", "requires_approval": False, "result": result[:200]})
            return result

        approval = self.gate.create(tool, args, requester=agent_name)
        emit({"type": "approval", "approval_id": approval["id"], "agent": agent_name,
              "tool": tool.name, "title": approval["title"],
              "args": approval["args"], "status": "pending"})
        decision = self._wait_decision(approval["id"])
        if decision == "approved":
            result = tool.func(**args)
            self.domain.update("approvals", "id", approval["id"], {"result": result})
            emit({"type": "approval", "approval_id": approval["id"], "agent": agent_name,
                  "tool": tool.name, "status": "approved", "result": result})
            emit({"type": "tool_call", "agent": agent_name, "tool": tool.name,
                  "status": "done", "requires_approval": True, "result": result[:200]})
            return result
        reason = ""
        if decision == "rejected":
            rows = self.domain.find("approvals", id=approval["id"])
            reason = (rows[0].get("reason") or "") if rows else ""
        msg = f"[审批未通过] 工具 {tool.name} 被拒绝执行" + (f"：{reason}" if reason else "")
        emit({"type": "approval", "approval_id": approval["id"], "agent": agent_name,
              "tool": tool.name, "status": "rejected", "reason": reason})
        emit({"type": "tool_call", "agent": agent_name, "tool": tool.name,
              "status": "intercepted", "requires_approval": True, "result": msg})
        return msg

    # ---------- 模型思考（流式）：系统提示 = 角色/目标/背景 + 任务 + 上游上下文/管理者指示 ----------
    def _think(self, agent_cfg: Dict[str, Any], task_desc: str, input_text: str,
               extra_blocks: List[str], emit: Callable[[Dict[str, Any]], None],
               output_type: str = "text") -> str:
        provider_rec = None
        pid = agent_cfg.get("provider_id") or ""
        if pid:
            provider_rec = self.store.get("llm_providers", pid)
        if provider_rec is None:
            err = f"智能体「{agent_cfg['name']}」未绑定有效的模型提供商，请先在 LLM 提供商页配置并绑定"
            emit({"type": "llm_error", "agent": agent_cfg["name"], "message": err})
            return err
        lines = [
            f"你是「{agent_cfg['name']}」（角色：{agent_cfg.get('role', '')}）。",
            f"目标：{agent_cfg.get('goal', '')}",
            f"背景：{agent_cfg.get('backstory', '')}",
            "",
            f"当前任务：{task_desc}",
        ]
        if extra_blocks:
            lines.append("")
            lines.append("以下是可用的上下文材料（来自上游任务或管理者指示），请以其为依据完成本任务：")
            lines.extend(extra_blocks)
        lines.append("")
        if output_type == "json":
            lines.append("【结构化输出要求】请直接输出一个合法 JSON 对象（不要使用 markdown 代码块、不要包含任何解释性文字）。")
        else:
            lines.append("请直接输出任务成果正文，不要解释过程，不要提及内部指令。")
        system = "\n".join(lines)
        emit({"type": "model_call", "agent": agent_cfg["name"],
              "provider": provider_rec.get("name"), "status": "running",
              "model": provider_rec.get("model")})
        thinking = ""
        try:
            for delta in llm_client.stream_completion(provider_rec, system, input_text):
                thinking += delta
                emit({"type": "chunk", "agent": agent_cfg["name"], "text": delta})
            emit({"type": "model_call", "agent": agent_cfg["name"],
                  "provider": provider_rec.get("name"), "status": "done"})
        except Exception as exc:  # noqa: BLE001
            err = f"模型调用失败：{str(exc)[:300]}"
            thinking = err
            emit({"type": "llm_error", "agent": agent_cfg["name"], "message": err})
        return thinking

    # ---------- JSON 解析：容忍 ```json 围栏，失败返回 None ----------
    @staticmethod
    def _parse_json(text: str) -> Optional[Dict[str, Any]]:
        t = (text or "").strip()
        if not t:
            return None
        if t.startswith("```"):
            t = t.strip("`")
            nl = t.find("\n")
            if nl >= 0:
                t = t[nl + 1:].strip()
        try:
            import json as _json
            return _json.loads(t)
        except Exception:  # noqa: BLE001
            return None

    # ---------- 任务上下文引用：use_upstream=true 或 context=[任务标题] ----------
    @staticmethod
    def _context_blocks(task_cfg: Dict[str, Any], task_cfgs: List[Dict[str, Any]],
                        outputs_map: Dict[str, str], manager_plan: str) -> List[str]:
        blocks: List[str] = []
        if manager_plan:
            blocks.append(f"【管理者委派指示】（由管理者生成，请按此方向执行本任务）\n{manager_plan[:1200]}")
        refs = task_cfg.get("context") or (["*"] if task_cfg.get("use_upstream") else [])
        if not refs:
            return blocks
        if "*" in refs:
            refs = [t["title"] for t in task_cfgs if t["title"] in outputs_map]
        for title in refs:
            if title in outputs_map:
                blocks.append(f"[上游任务 · {title}]\n{outputs_map[title][:1500]}")
        return blocks

    # ---------- hierarchical：解析管理者（manager_agent_id 优先，否则第一个任务的智能体） ----------
    def _resolve_manager(self, crew_cfg: Dict[str, Any], task_cfgs: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
        mid = crew_cfg.get("manager_agent_id")
        if mid:
            a = self.store.get("agents", mid)
            if a:
                return a
        for t in task_cfgs:
            a = self.agent_by_name(t.get("agent_name", ""))
            if a:
                return a
        return None

    # ---------- 知识检索（RAG）：任务/智能体级绑定，命中片段注入上下文 ----------
    def _knowledge_blocks(self, task_cfg: Dict[str, Any], agent_cfg: Dict[str, Any],
                          input_text: str, emit: Callable[[Dict[str, Any]], None]) -> List[str]:
        task_kids = list(task_cfg.get("knowledge_ids") or [])
        agent_kids = list(agent_cfg.get("knowledge_ids") or [])
        use_kb = bool(task_cfg.get("use_knowledge")) or bool(task_kids)
        if not use_kb and not agent_kids:
            return []
        scope: Optional[List[str]] = task_kids or agent_kids or None  # None=全库
        docs = self.store.all("knowledge")
        if scope is not None:
            docs = [d for d in docs if d["id"] in scope]
        if not docs:
            return []
        query = f"{task_cfg.get('description', '')} {input_text}"
        prov = retriever.pick_embedding_provider(self.store.all("llm_providers"))
        qv = retriever.embed_query(query, prov) or retriever.embed(query)
        hits = retriever.search_docs(query, qv, docs, top_k=3)
        embed_mode = ("embedding" if isinstance(qv, list) else "local-hash")
        emit({"type": "knowledge_retrieved", "agent": agent_cfg["name"],
              "task": task_cfg.get("title", ""), "query": query[:80],
              "scope": "task/绑定" if task_kids else ("agent/绑定" if agent_kids else "全库"),
              "embed_mode": embed_mode,
              "hit_count": len(hits),
              "docs": [{"doc_name": h["doc_name"], "score": h["score"], "kind": h["kind"]} for h in hits]})
        return [
            f"【知识库 · {h['doc_name']}】（相关度 {h['score']:.2f}）\n{h['text']}"
            for h in hits
        ]

    # ---------- 记忆（Memory）：短期 = 会话近期消息；长期 = 跨会话沉淀的事实/结论 ----------
    def _memory_blocks(self, agent_cfg: Dict[str, Any], session_id: str,
                       input_text: str, emit: Callable[[Dict[str, Any]], None]) -> List[str]:
        if not agent_cfg.get("memory"):
            return []
        blocks: List[str] = []
        # 短期记忆：本会话最近的用户/智能体消息
        s = self.store.get_session(session_id)
        recent = [(m.get("role"), m.get("agent", ""), m.get("content", ""))
                  for m in (s.get("messages") or []) if m.get("role") in ("user", "agent")]
        short = [f"- {r}: {a}: {c[:200]}" for r, a, c in recent[-4:]]
        if short:
            blocks.append("【短期记忆 · 本会话近期对话】\n" + "\n".join(short))
            emit({"type": "memory_retrieved", "kind": "short", "agent": agent_cfg["name"], "count": len(short)})
        # 长期记忆：memory 集合中与本输入相关的沉淀记录（top 2）
        recs = [r for r in self.store.all("memory") if r.get("type") == "long"]
        if recs:
            scored = sorted(recs, key=lambda r: retriever.score(input_text, r.get("content", "")), reverse=True)
            tops = [r for r in scored if retriever.score(input_text, r.get("content", "")) >= 0.05][:2]
            if tops:
                blocks.append("【长期记忆 · 历史沉淀】\n"
                              + "\n".join(f"- {r.get('agent', '')}：{r.get('content', '')[:200]}" for r in tops))
                emit({"type": "memory_retrieved", "kind": "long", "agent": agent_cfg["name"], "count": len(tops)})
        return blocks

    def _save_memory(self, session_id: str, agent_name: str, content: str,
                     emit: Callable[[Dict[str, Any]], None]) -> None:
        text = (content or "").strip()
        if not text:
            return
        _FLAKY = ("模型调用失败", "Insufficient Balance", "llm_error", "连接中断")
        if any(k in text for k in _FLAKY):
            return  # 失败信息不沉淀为记忆
        recs = self.store.all("memory")
        if any(r.get("type") == "long" and r.get("summary") and r["summary"] in text for r in recs):
            return  # 与已有记忆高度重复，跳过
        self.store.save("memory", {
            "id": f"mem-{int(time.time() * 1000)}",
            "type": "long", "session_id": session_id, "agent": agent_name,
            "summary": text[:80], "content": text[:800], "created_at": self._now(),
        })
        emit({"type": "memory_saved", "kind": "long", "agent": agent_name, "summary": text[:80]})

    # ---------- 单任务执行（顺序或并行批内调用；返回结构化结果由主线程合并） ----------
    def _run_task(self, task_cfg: Dict[str, Any], index: int, session_id: str,
                  input_text: str, outputs_map: Dict[str, str], manager_plan: str,
                  task_cfgs: List[Dict[str, Any]],
                  emit: Callable[[Dict[str, Any]], None]) -> Optional[Dict[str, Any]]:
        agent_cfg = self.agent_by_name(task_cfg.get("agent_name", ""))
        if agent_cfg is None:
            emit({"type": "error", "message": f"任务 {task_cfg.get('title')} 关联的智能体不存在"})
            return None
        agent = self.build_agent(agent_cfg)
        emit({"type": "agent_start", "index": index, "agent": agent_cfg["name"],
              "avatar": agent_cfg.get("avatar", "🤖"), "role": agent_cfg.get("role", ""),
              "task": task_cfg.get("description", "")})

        output_type = task_cfg.get("output_type") or "text"
        ctx_blocks = self._context_blocks(task_cfg, task_cfgs, outputs_map, manager_plan)
        ctx_blocks += self._knowledge_blocks(task_cfg, agent_cfg, input_text, emit)
        ctx_blocks += self._memory_blocks(agent_cfg, session_id, input_text, emit)
        thinking = self._think(agent_cfg, task_cfg.get("description", ""), input_text,
                               ctx_blocks, emit, output_type=output_type)

        tool_out = ""
        if agent.tools and output_type != "json":
            tool_out = self._call_tool(agent.tools[0], agent_cfg["name"], input_text, emit)

        output = thinking + (("\n\n" + tool_out) if tool_out else "")
        json_dict = self._parse_json(output) if output_type == "json" else None
        emit({"type": "agent_done", "agent": agent_cfg["name"], "output": output})
        return {
            "i": index, "title": task_cfg.get("title", f"任务{index + 1}"),
            "agent": agent_cfg["name"], "agent_id": agent_cfg["id"],
            "output": output, "output_type": output_type, "json_dict": json_dict,
        }

    # ---------- 顺序编排 planning：planner 自动拆解目标为任务清单（可替换原任务链） ----------
    def _plan_tasks(self, crew_cfg: Dict[str, Any], task_cfgs: List[Dict[str, Any]],
                    input_text: str, session_id: str,
                    emit: Callable[[Dict[str, Any]], None]) -> List[Dict[str, Any]]:
        planner = self._resolve_manager(crew_cfg, task_cfgs)
        if planner is None:
            return task_cfgs
        names = "、".join(a["name"] for a in self.store.all("agents"))
        plan_prompt = (
            f"你是团队的任务规划员。本轮协作目标：{input_text}。\n"
            "请把目标拆解为 2-4 个可直接执行的子任务，输出一个 JSON 数组，每项包含："
            "{\"title\": 任务名, \"agent_name\": 指定智能体, \"description\": 任务描述, \"expected_output\": 期望输出}。\n"
            f"可选智能体：{names}。\n"
            "只输出 JSON 数组本身，不要 markdown 代码块与解释文字。"
        )
        emit({"type": "agent_start", "index": -3, "agent": planner["name"],
              "avatar": planner.get("avatar", "🧭"), "role": "规划员",
              "task": "任务规划：自动拆解本轮目标为任务清单"})
        plan_raw = self._think(planner, plan_prompt, input_text, [], emit, output_type="json")
        parsed = self._parse_json(plan_raw)
        plan_list = parsed if isinstance(parsed, list) else None
        if isinstance(parsed, dict):
            plan_list = parsed.get("tasks") or parsed.get("plan") or parsed.get("items")
        valid: List[Dict[str, Any]] = []
        if isinstance(plan_list, list):
            for t in plan_list:
                if not isinstance(t, dict):
                    continue
                if t.get("title") and self.agent_by_name(str(t.get("agent_name", ""))):
                    valid.append({
                        "title": str(t["title"])[:50],
                        "agent_name": str(t["agent_name"]),
                        "description": str(t.get("description") or t["title"])[:200],
                        "expected_output": str(t.get("expected_output") or "完成任务")[:200],
                        "output_type": "text",
                    })
        emit({"type": "planning_done", "agent": planner["name"], "count": len(valid),
              "titles": [t["title"] for t in valid], "raw": plan_raw[:400]})
        emit({"type": "agent_done", "agent": planner["name"], "output": plan_raw})
        if valid:
            self.store.add_message(session_id, {
                "id": f"m-plan-{int(time.time() * 1000)}",
                "role": "agent", "agent": planner["name"], "avatar": planner.get("avatar", "🧭"),
                "content": "〔任务规划〕\n" + "\n".join(
                    f"- {t['title']}（{t['agent_name']}）：{t['description']}" for t in valid),
                "created_at": self._now(),
            })
            return valid
        return task_cfgs

    # ---------- Flows：事件驱动工作流（顺序步骤 + 条件分支，每次运行推进一个步骤） ----------
    def run_flow_step(self, flow_cfg: Dict[str, Any], step: Dict[str, Any],
                      input_text: str, emit: Callable[[Dict[str, Any]], None]) -> str:
        agent_cfg = self.agent_by_name(step.get("agent_name", ""))
        if agent_cfg is None:
            msg = f"流程步骤「{step.get('name', '')}」关联的智能体不存在"
            emit({"type": "flow_step", "status": "error", "agent": step.get("agent_name", ""), "message": msg})
            return msg
        emit({"type": "flow_step_start", "flow": flow_cfg["name"], "agent": agent_cfg["name"],
              "step": step.get("name", ""), "task": step.get("action") or step.get("description", "")})
        agent = self.build_agent(agent_cfg)
        desc = step.get("action") or step.get("description") or "执行任务"
        output = self._think(agent_cfg, desc, input_text, [], emit)
        if agent.tools:
            tool_out = self._call_tool(agent.tools[0], agent_cfg["name"], input_text, emit)
            if tool_out:
                output += "\n\n" + tool_out
        emit({"type": "flow_step_done", "flow": flow_cfg["name"], "step": step.get("name", ""),
              "agent": agent_cfg["name"], "output": output[:600]})
        return output

    # ---------- 执行（生成器：产出 SSE 事件） ----------
    def run_crew(
        self,
        crew_cfg: Dict[str, Any],
        session_id: str,
        input_text: str,
        emit: Callable[[Dict[str, Any]], None],
    ) -> str:
        run_id = f"run-{int(datetime.now().timestamp() * 1000)}"
        emit({"type": "run_start", "run_id": run_id, "crew": crew_cfg["name"],
              "session_id": session_id, "topic": input_text})

        process = crew_cfg.get("process", "sequential")
        task_cfgs: List[Dict[str, Any]] = crew_cfg.get("tasks") or []

        # ---- hierarchical：管理者先规划（委派依据） ----
        manager_cfg: Optional[Dict[str, Any]] = None
        manager_plan = ""
        if process == "hierarchical":
            manager_cfg = self._resolve_manager(crew_cfg, task_cfgs)
            if manager_cfg:
                plan_desc = (
                    f"你是团队管理者，本轮协作目标：{input_text}。\n"
                    "请审阅以下任务清单，制定职责分工与执行要点（谁负责什么、输出什么、注意事项），简洁输出。\n"
                    + "\n".join(
                        f"- 任务{i + 1}「{t.get('title', '')}」由 {t.get('agent_name', '')} 负责：{t.get('description', '')}"
                        for i, t in enumerate(task_cfgs)
                    )
                )
                emit({"type": "agent_start", "index": -1, "agent": manager_cfg["name"],
                      "avatar": manager_cfg.get("avatar", "🛡"), "role": "管理者",
                      "task": "统筹规划：制定团队分工与执行要点"})
                manager_plan = self._think(manager_cfg, plan_desc, input_text, [], emit)
                emit({"type": "manager", "phase": "plan", "agent": manager_cfg["name"], "output": manager_plan})
                emit({"type": "agent_done", "agent": manager_cfg["name"], "output": manager_plan})
                self.store.add_message(session_id, {
                    "id": f"m-mgr-{int(time.time() * 1000)}",
                    "role": "agent", "agent": manager_cfg["name"],
                    "avatar": manager_cfg.get("avatar", "🛡"),
                    "content": f"〔管理者规划〕\n{manager_plan}", "created_at": self._now(),
                })

        # ---- 顺序编排 + planning：planner 自动拆解任务清单 ----
        if process == "sequential" and crew_cfg.get("planning"):
            task_cfgs = self._plan_tasks(crew_cfg, task_cfgs, input_text, session_id, emit)

        # ---- 任务链执行：无上游依赖的连续任务并入同一批次并行执行 ----
        outputs: List[str] = []
        outputs_map: Dict[str, str] = {}
        tasks_output: List[Dict[str, Any]] = []

        batches: List[List[Dict[str, Any]]] = []
        cur: List[Dict[str, Any]] = []
        for task_cfg in task_cfgs:
            depends = bool(task_cfg.get("use_upstream") or task_cfg.get("context"))
            if process == "hierarchical" or depends:  # 层级模式与有依赖任务强制串行
                if cur:
                    batches.append(cur)
                    cur = []
                batches.append([task_cfg])
            else:
                cur.append(task_cfg)
        if cur:
            batches.append(cur)

        global_idx = 0
        for batch in batches:
            if len(batch) == 1:
                results = [self._run_task(batch[0], global_idx, session_id, input_text,
                                          outputs_map, manager_plan, task_cfgs, emit)]
            else:
                # 并行批次：各任务读取批次前的上下文快照，互不写共享状态
                slots: List[Optional[Dict[str, Any]]] = [None] * len(batch)
                snapshot = dict(outputs_map)

                def worker(j: int, tc: Dict[str, Any]) -> None:
                    slots[j] = self._run_task(tc, global_idx + j, session_id, input_text,
                                              snapshot, manager_plan, task_cfgs, emit)

                threads = [threading.Thread(target=worker, args=(j, tc), daemon=True)
                           for j, tc in enumerate(batch)]
                for th in threads:
                    th.start()
                for th in threads:
                    th.join()
                results = list(slots)

            # 主线程合并（保持任务顺序与确定性）
            for r in results:
                if r is None:
                    global_idx += 1
                    continue
                outputs.append(r["output"])
                outputs_map[r["title"]] = r["output"]
                title = r["title"]
                tasks_output.append({
                    "task": title, "agent": r["agent"],
                    "output_type": r["output_type"], "raw": r["output"],
                    "json_dict": r["json_dict"],
                })
                self.domain.update("agents", "id", r["agent_id"], {"status": "ready"})
                self.store.add_message(session_id, {
                    "id": f"m{global_idx}-{int(time.time() * 1000)}",
                    "role": "agent", "agent": r["agent"],
                    "avatar": "🤖", "content": r["output"], "created_at": self._now(),
                })
                global_idx += 1

        # ---- hierarchical：管理者汇总最终结论 ----
        if process == "hierarchical" and manager_cfg:
            sum_desc = (
                f"你是团队管理者，本轮协作目标：{input_text}。\n"
                "请汇总以下各成员的任务成果，输出一份结构完整、面向管理层的最终结论"
                "（合并要点、指出整体结论与后续行动项）。"
            )
            sum_blocks = [f"[{t.get('title', '')} · {t.get('agent_name', '')}]\n{outputs[i][:1500]}"
                          for i, t in enumerate(task_cfgs) if i < len(outputs)]
            emit({"type": "agent_start", "index": -2, "agent": manager_cfg["name"],
                  "avatar": manager_cfg.get("avatar", "🛡"), "role": "管理者",
                  "task": "汇总团队成果为最终结论"})
            result = self._think(manager_cfg, sum_desc, input_text, sum_blocks, emit)
            emit({"type": "manager", "phase": "summary", "agent": manager_cfg["name"], "output": result})
            emit({"type": "agent_done", "agent": manager_cfg["name"], "output": result})
        else:
            result = "协作完成，已生成最终结果：\n" + "\n".join(outputs)

        # ---- CrewOutput 多形态：raw / json_dict / tasks_output ----
        json_tasks = [t for t in tasks_output if t.get("json_dict") is not None]
        result_json: Optional[Dict[str, Any]] = None
        if json_tasks:
            if len(json_tasks) == 1:
                result_json = json_tasks[0]["json_dict"]
            else:
                result_json = {t["task"]: t["json_dict"] for t in json_tasks}

        # ---- 长期记忆沉淀：本轮协作结论写入 memory 集合 ----
        self._save_memory(session_id, crew_cfg["name"], result, emit)

        emit({"type": "crew_done", "result": result, "run_id": run_id,
              "outputs": tasks_output, "json_dict": result_json})
        msg_record = {
            "id": f"m-final-{int(time.time() * 1000)}",
            "role": "result",
            "agent": manager_cfg["name"] if (process == "hierarchical" and manager_cfg) else "编排结果",
            "content": result,
            "output_json": result_json,
            "tasks_output": tasks_output,
            "created_at": self._now(),
        }
        self.store.add_message(session_id, msg_record)

        # 4) 落盘 trace
        self.store.save("traces", {
            "id": run_id, "crew_id": crew_cfg["id"], "crew_name": crew_cfg["name"],
            "session_id": session_id, "input": input_text, "process": process,
            "status": "success", "task_count": len(task_cfgs),
            "started_at": self._now(), "result": result[:500],
        })
        return result