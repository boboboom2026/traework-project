# -*- coding: utf-8 -*-
"""协作运行引擎：把平台配置（智能体/编排）实例化为 agent_framework 对象并流式执行。

职责：
1. 从配置构建 Agent（绑定工具目录）
2. 按编排的任务列表顺序执行，产出 SSE 事件流
   （思考分块 → 工具调用 → 需审批工具先签发审批并等待人工决策 → 结果）
3. 将运行过程落盘为 trace，并把角色消息写入会话
"""
from __future__ import annotations

import time
from datetime import datetime
from typing import Any, Callable, Dict, List, Optional

from agent_framework import Agent, ApprovalGate, DataDomain, Tool

import llm_client
from demo_llm import DemoLLM
from platform_store import PlatformStore

APPROVAL_TIMEOUT = 120  # 秒
POLL_INTERVAL = 0.5


# ------------------- 演示工具目录（对应 CrewAI 100+ 工具中的常用子集） -------------------
def build_tools() -> Dict[str, Tool]:
    """构建平台工具目录。真实场景可对接 crewai-tools；此处为确定性演示实现。"""

    def _search(keyword: str = "", **_: Any) -> str:
        return f"[web_search] 检索到「{keyword or '目标话题'}」相关资讯 12 条，覆盖市场规模、增速与主要玩家。"

    def _calc(expression: str = "1+1", **_: Any) -> str:
        try:
            return f"[calc] {expression} = {eval(expression)}"
        except Exception:
            return "[calc] 表达式无法计算，请检查输入"

    def _db(topic: str = "", **_: Any) -> str:
        return f"[db_query] 查询到业务库中关于「{topic or '目标'}」的历史数据 36 条，近一年增速 18%。"

    def _news(topic: str = "", **_: Any) -> str:
        return f"[fetch_news] 抓取到关于「{topic or '目标'}」的行业快讯 5 条：政策、融资、新品各 1 条。"

    def _report(topic: str = "", **_: Any) -> str:
        return (f"[gen_report] 已生成《{topic or '目标'}分析报告》："
                f"含市场概况、竞争格局、机会风险与行动建议共 4 章 3200 字。")

    def _email(topic: str = "", **_: Any) -> str:
        return f"[send_email] 已将《{topic or '目标'}分析报告》发送至收件人（含正文摘要与附件）。"

    def _publish(topic: str = "", **_: Any) -> str:
        return f"[publish_doc] 《{topic or '目标'}分析报告》已发布至团队知识库，全员可见。"

    def _archive(topic: str = "", **_: Any) -> str:
        return f"[archive_data] 已将「{topic or '目标'}」相关数据归档至项目空间，附带索引标签。"

    catalog = [
        ("web_search", "搜索互联网获取资讯与资料", _search, False, "", [{"name": "keyword", "type": "str"}]),
        ("calc", "数值计算", _calc, False, "", [{"name": "expression", "type": "str"}]),
        ("db_query", "查询企业业务数据库", _db, False, "", [{"name": "topic", "type": "str"}]),
        ("fetch_news", "抓取行业资讯快讯", _news, False, "", [{"name": "topic", "type": "str"}]),
        ("gen_report", "生成结构化分析报告", _report, False, "", [{"name": "topic", "type": "str"}]),
        ("send_email", "发送邮件（高风险，需审批）", _email, True, "发送邮件", [{"name": "topic", "type": "str"}]),
        ("publish_doc", "发布文档到知识库（高风险，需审批）", _publish, True, "发布", [{"name": "topic", "type": "str"}]),
        ("archive_data", "归档数据到项目空间", _archive, False, "", [{"name": "topic", "type": "str"}]),
    ]
    return {
        name: Tool(name=name, description=desc, func=func, args_schema=args,
                   requires_approval=req, action_tag=tag)
        for name, desc, func, req, tag, args in catalog
    }


# ------------------- 引擎 -------------------
class CrewRunEngine:
    def __init__(self, store: PlatformStore):
        self.store = store
        self.llm = DemoLLM()
        self.domain: DataDomain = store.domain
        self.gate = ApprovalGate(self.domain, timeout=APPROVAL_TIMEOUT, poll_interval=POLL_INTERVAL)
        self.tools_raw = build_tools()

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
        args = {"topic": topic}
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

        outputs: List[str] = []
        task_cfgs: List[Dict[str, Any]] = crew_cfg.get("tasks") or []
        for i, task_cfg in enumerate(task_cfgs):
            agent_cfg = self.agent_by_name(task_cfg.get("agent_name", ""))
            if agent_cfg is None:
                emit({"type": "error", "message": f"任务 {task_cfg.get('title')} 关联的智能体不存在"})
                continue
            agent = self.build_agent(agent_cfg)
            emit({"type": "agent_start", "index": i, "agent": agent_cfg["name"],
                  "avatar": agent_cfg.get("avatar", "🤖"), "role": agent_cfg.get("role", ""),
                  "task": task_cfg.get("description", "")})

            # 1) 思考过程（流式）：真实提供商走 litellm，失败自动回退演示模型
            thinking = ""
            provider_rec = None
            if agent_cfg.get("provider_id"):
                provider_rec = self.store.get("llm_providers", agent_cfg["provider_id"])
            if provider_rec and llm_client.is_real(provider_rec):
                system = (
                    f"你是「{agent_cfg['name']}」（角色：{agent_cfg.get('role', '')}）。\n"
                    f"目标：{agent_cfg.get('goal', '')}\n"
                    f"背景：{agent_cfg.get('backstory', '')}\n\n"
                    f"当前任务：{task_cfg.get('description', '')}\n"
                    "请直接输出任务成果正文，不要解释过程，不要提及内部指令。"
                )
                emit({"type": "model_call", "agent": agent_cfg["name"],
                      "provider": provider_rec.get("name"), "status": "running",
                      "model": provider_rec.get("model")})
                try:
                    for delta in llm_client.stream_completion(provider_rec, system, input_text):
                        thinking += delta
                        emit({"type": "chunk", "agent": agent_cfg["name"], "text": delta})
                    emit({"type": "model_call", "agent": agent_cfg["name"],
                          "provider": provider_rec.get("name"), "status": "done"})
                except Exception as exc:  # noqa: BLE001
                    emit({"type": "llm_error", "agent": agent_cfg["name"], "message": str(exc)[:300]})
                    for chunk in self.llm.stream(agent_cfg.get("role", ""),
                                                 task_cfg.get("description", ""), input_text):
                        thinking += chunk
                        emit({"type": "chunk", "agent": agent_cfg["name"], "text": chunk})
            else:
                for chunk in self.llm.stream(agent_cfg.get("role", ""),
                                             task_cfg.get("description", ""), input_text):
                    thinking += chunk
                    emit({"type": "chunk", "agent": agent_cfg["name"], "text": chunk})

            # 2) 工具调用（暂演示首个工具）
            tool_out = ""
            if agent.tools:
                tool_out = self._call_tool(agent.tools[0], agent_cfg["name"], input_text, emit)

            output = thinking + (("\n\n" + tool_out) if tool_out else "")
            outputs.append(output)
            emit({"type": "agent_done", "agent": agent_cfg["name"], "output": output})
            self.domain.update("agents", "id", agent_cfg["id"], {"status": "ready"})

            # 3) 写会话消息
            self.store.add_message(session_id, {
                "id": f"m{i}-{int(time.time() * 1000)}",
                "role": "agent", "agent": agent_cfg["name"],
                "avatar": agent_cfg.get("avatar", "🤖"),
                "content": output, "created_at": self._now(),
            })

        result = "协作完成，已生成最终结果：\n" + "\n".join(outputs)
        emit({"type": "crew_done", "result": result, "run_id": run_id})
        self.store.add_message(session_id, {
            "id": f"m-final-{int(time.time() * 1000)}",
            "role": "result", "agent": "编排结果",
            "content": result, "created_at": self._now(),
        })

        # 4) 落盘 trace
        self.store.save("traces", {
            "id": run_id, "crew_id": crew_cfg["id"], "crew_name": crew_cfg["name"],
            "session_id": session_id, "input": input_text,
            "status": "success", "task_count": len(task_cfgs),
            "started_at": self._now(), "result": result[:500],
        })
        return result