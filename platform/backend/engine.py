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

        # ---- 任务链执行（委派 + 上下文串联） ----
        outputs: List[str] = []
        outputs_map: Dict[str, str] = {}
        tasks_output: List[Dict[str, Any]] = []
        for i, task_cfg in enumerate(task_cfgs):
            agent_cfg = self.agent_by_name(task_cfg.get("agent_name", ""))
            if agent_cfg is None:
                emit({"type": "error", "message": f"任务 {task_cfg.get('title')} 关联的智能体不存在"})
                continue
            agent = self.build_agent(agent_cfg)
            emit({"type": "agent_start", "index": i, "agent": agent_cfg["name"],
                  "avatar": agent_cfg.get("avatar", "🤖"), "role": agent_cfg.get("role", ""),
                  "task": task_cfg.get("description", "")})

            # 1) 思考：任务描述 + 上游上下文（use_upstream / context）+ 管理者指示
            output_type = task_cfg.get("output_type") or "text"
            ctx_blocks = self._context_blocks(task_cfg, task_cfgs, outputs_map, manager_plan)
            thinking = self._think(agent_cfg, task_cfg.get("description", ""), input_text,
                                   ctx_blocks, emit, output_type=output_type)

            # 2) 工具调用（JSON 任务不拼接工具文本，保证输出可解析）
            tool_out = ""
            if agent.tools and output_type != "json":
                tool_out = self._call_tool(agent.tools[0], agent_cfg["name"], input_text, emit)

            output = thinking + (("\n\n" + tool_out) if tool_out else "")

            # 3) 任务级结构化输出（CrewOutput.tasks_output）
            json_dict = self._parse_json(output) if output_type == "json" else None
            tasks_output.append({
                "task": task_cfg.get("title", f"任务{i + 1}"),
                "agent": agent_cfg["name"],
                "output_type": output_type,
                "raw": output,
                "json_dict": json_dict,
            })

            outputs.append(output)
            outputs_map[task_cfg.get("title", f"任务{i + 1}")] = output
            emit({"type": "agent_done", "agent": agent_cfg["name"], "output": output})
            self.domain.update("agents", "id", agent_cfg["id"], {"status": "ready"})

            # 4) 写会话消息
            self.store.add_message(session_id, {
                "id": f"m{i}-{int(time.time() * 1000)}",
                "role": "agent", "agent": agent_cfg["name"],
                "avatar": agent_cfg.get("avatar", "🤖"),
                "content": output, "created_at": self._now(),
            })

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