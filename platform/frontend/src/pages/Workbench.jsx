import { useEffect, useRef, useState } from "react";
import { api, get, post, streamSSE } from "../api.js";

const EMOJI = { "资深市场调研员": "🔍", "数据分析师": "📊", "报告撰稿人": "✍️" };

const CHIP_COLORS = [
  { bg: "linear-gradient(135deg,#2C56A8,#1E3E7E)" },
  { bg: "linear-gradient(135deg,#2E9E6B,#1F7A52)" },
  { bg: "linear-gradient(135deg,#F26B3A,#C8532B)" },
  { bg: "linear-gradient(135deg,#2E7FA0,#1E546E)" },
  { bg: "linear-gradient(135deg,#C2761B,#9A5D14)" },
  { bg: "linear-gradient(135deg,#7A5AC9,#5B3E9E)" },
];

function MemberChips({ members }) {
  return (
    <>
      {members.map((m, i) => {
        const c = CHIP_COLORS[i % CHIP_COLORS.length];
        return (
          <span key={m} className="member-chip" title={m}>
            <span className="mav" style={{ background: c.bg }}>{EMOJI[m] ? "" : (m[0] || "A")}</span>
            {EMOJI[m] ? `${EMOJI[m]} ${m}` : m}
          </span>
        );
      })}
      <span className="mcount-badge">{members.length} 名成员</span>
    </>
  );
}

export default function Workbench({ onNav }) {
  const [sessions, setSessions] = useState([]);
  const [sid, setSid] = useState(null);
  const [session, setSession] = useState(null);
  const [input, setInput] = useState("");
  const [running, setRunning] = useState(false);
  const [live, setLive] = useState([]); // 流式实时项
  const [log, setLog] = useState([]);
  const [crews, setCrews] = useState([]);
  const [creating, setCreating] = useState(false);
  const [toast, setToast] = useState("");
  const liveRef = useRef([]);
  const areaRef = useRef(null);

  const toastTimer = useRef(null);
  const notify = (msg) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 2600);
  };

  useEffect(() => {
    refreshSessions();
    get("/api/crews").then((r) => setCrews(r.crews || [])).catch(() => {});
  }, []);

  useEffect(() => {
    if (sid) {
      get(`/api/sessions/${sid}`).then(setSession).catch(() => {});
    }
  }, [sid]);

  useEffect(() => {
    areaRef.current?.scrollTo({ top: areaRef.current.scrollHeight, behavior: "smooth" });
  }, [live, session?.messages?.length, log]);

  function refreshSessions() {
    get("/api/sessions").then((r) => {
      setSessions(r.sessions || []);
      setSid((s) => s || (r.sessions?.[0]?.id ?? null));
    }).catch(() => {});
  }

  const patchLive = (fn) => {
    liveRef.current = fn(liveRef.current);
    setLive(liveRef.current);
  };

  async function handleRun() {
    const text = input.trim();
    if (!text || !session || running) return;
    // 先把用户消息落库
    try {
      await post(`/api/sessions/${session.id}/messages`, { content: text });
      const s = await get(`/api/sessions/${session.id}`);
      setSession(s);
    } catch (e) { notify(`发送失败：${e.message}`); return; }
    setInput("");
    setRunning(true);
    setLog(["编排已启动 · 等待智能体执行…"]);
    liveRef.current = [];
    setLive([]);
    let agentIdx = {}; // agent → live 数组下标

    const pushLog = (t) => setLog((l) => [...l, t]);

    streamSSE(`/api/sessions/${session.id}/run`, {
      body: { input: text },
      onEvent: (ev) => {
        switch (ev.type) {
          case "run_start":
            pushLog(`▶ 运行开始：${ev.crew}（${ev.run_id}）`);
            break;
          case "planning_done": {
            pushLog(`🧭 规划完成：自动拆解为 ${ev.count} 个子任务${(ev.titles || []).length ? `：${ev.titles.join("、")}` : ""}`);
            if (!ev.count) pushLog("· 规划结果不可用，沿用原始任务清单");
            break;
          }
          case "agent_start": {
            const item = { type: "agent_run", agent: ev.agent, avatar: ev.avatar || EMOJI[ev.agent] || "🤖", role: ev.role, task: ev.task, text: "", done: false };
            patchLive((l) => { agentIdx[ev.agent] = l.length; return [...l, item]; });
            pushLog(`· ${ev.agent} 开始执行：${ev.task}`);
            break;
          }
          case "chunk": {
            patchLive((l) => {
              const i = agentIdx[ev.agent];
              if (i == null) return l;
              const next = [...l];
              next[i] = { ...next[i], text: next[i].text + ev.text };
              return next;
            });
            break;
          }
          case "tool_call": {
            const st = ev.status === "running" ? "running" : ev.status === "done" ? "done" : "blocked";
            pushLog(`· ${ev.agent} 调用工具 ${ev.tool} ${st === "running" ? "调用中" : st === "done" ? "✓ 完成" : "⛔ 被拦截"}`);
            patchLive((l) => [...l, { type: "tool_call", agent: ev.agent, tool: ev.tool, status: st, dur: ev.duration_ms }]);
            break;
          }
          case "knowledge_retrieved": {
            const names = (ev.docs || []).map((d) => d.doc_name).join("、");
            pushLog(`📚 ${ev.agent} 检索知识库（${ev.scope}）命中 ${ev.hit_count} 篇${names ? `：${names}` : ""}`);
            break;
          }
          case "memory_retrieved": {
            const label = ev.kind === "short" ? "短期" : "长期";
            pushLog(`🧠 ${ev.agent} 读取${label}记忆 ${ev.count} 条`);
            break;
          }
          case "memory_saved": {
            pushLog(`🧠 ${ev.agent} 沉淀长期记忆：${(ev.summary || "").slice(0, 40)}…`);
            break;
          }
          case "model_call": {
            if (ev.status === "running") pushLog(`· ${ev.agent} 调用模型 ${ev.provider}（${ev.model || ""}）▪ 推理中`);
            else pushLog(`· ${ev.agent} 模型推理 ✓ 完成`);
            break;
          }
          case "llm_error": {
            pushLog(`✗ ${ev.agent}：${ev.message}`);
            break;
          }
          case "approval":
            if (ev.status === "pending") {
              patchLive((l) => [...l, { type: "approval", approval_id: ev.approval_id, agent: ev.agent, tool: ev.tool, title: ev.title, args: ev.args, status: "pending" }]);
              pushLog(`⚠ ${ev.agent} 触发审批：${ev.title}（等待人工决策）`);
            } else {
              const st = ev.status === "approved" ? "已通过 ✓" : "已拒绝 ✗";
              pushLog(`· 审批 ${ev.title} ${st}`);
              patchLive((l) => l.map((it) =>
                it.type === "approval" && it.approval_id === ev.approval_id
                  ? { ...it, status: ev.status, reason: ev.reason || "", result: ev.result || "" } : it));
            }
            break;
          case "agent_done": {
            patchLive((l) => {
              const i = agentIdx[ev.agent];
              if (i == null || !l[i]) return l;
              const next = [...l];
              next[i] = { ...next[i], done: true, final: ev.output };
              return next;
            });
            pushLog(`✓ ${ev.agent} 完成`);
            break;
          }
          case "crew_done":
            pushLog(`✓ 协作完成 → 编排结果已生成`);
            break;
          case "error":
            pushLog(`✗ 错误：${ev.message}`);
            break;
          default:
            break;
        }
      },
      onDone: async (err) => {
        setRunning(false);
        if (err) pushLog(`✗ 连接中断：${err.message}`);
        setLive([]);
        liveRef.current = [];
        // 重新拉取会话（agent/result 消息已由后端落库）
        const s = await get(`/api/sessions/${session.id}`).catch(() => null);
        if (s) setSession(s);
        refreshSessions();
      },
    });
  }

  async function decide(approval_id, decision) {
    try {
      await post(`/api/platform/approvals/${approval_id}/decide`, { decision, reason: decision === "rejected" ? "参数不完整" : "" });
      notify(decision === "approved" ? "已通过审批，继续执行" : "已拒绝，工具将被拦截");
    } catch (e) { notify(`操作失败：${e.message}`); }
  }

  async function createSession(e) {
    e.preventDefault();
    const fd = new FormData(e.target);
    const crewId = fd.get("crew_id");
    const crew = crews.find((c) => c.id === crewId);
    const rec = {
      name: fd.get("name") || crew?.name || "新协作会话",
      kind: "task",
      crew_id: crewId,
      members: crew ? crew.tasks.map((t) => t.agent_name) : [],
    };
    try {
      await post("/api/sessions", rec);
      setCreating(false);
      refreshSessions();
      notify("会话已创建");
    } catch (err) { notify(`创建失败：${err.message}`); }
  }

  const msgs = session?.messages || [];

  const crew = crews.find((c) => c.id === session?.crew_id);
  const tasks = crew?.tasks || [];

  return (
    <div className="workbench">
      <div className="wb-side">
        <div className="hd">
          <div className="wb-side-title">
            <span className="t">协作会话</span>
            <button className="btn ghost sm" onClick={() => setCreating(true)}>＋ 新建</button>
          </div>
        </div>
        <div className="wb-chats">
          {sessions.map((s) => (
            <div key={s.id} className={`chat-item ${sid === s.id ? "active" : ""}`} onClick={() => setSid(s.id)}>
              <div className="ci">⛓</div>
              <div>
                <div className="cn">{s.name}</div>
                <div className="cs">{(s.members || []).join(" · ") || "空团队"} · {s.message_count || 0} 条</div>
              </div>
            </div>
          ))}
          {!sessions.length && <div className="empty">还没有会话<br /><br />点击上方按钮创建一个</div>}
        </div>
      </div>

      <div className="wb-main">
        <div className="wb-hero">
        <div className="wb-hero-row">
          <div>
            <div className="wb-hero-title">协作工作台</div>
            <div className="wb-hero-sub">群聊式多智能体对话协作（群 / 任务）</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {session && (
              <button className="btn ghost sm" onClick={() => { if (confirm("删除该会话？")) { api(`/api/sessions/${session.id}`, { method: "DELETE" }).then(() => { setSid(null); setSession(null); refreshSessions(); }); } }}>删除会话</button>
            )}
            <button className="btn pri" onClick={() => setCreating(true)}>＋ 新建协作会话</button>
          </div>
        </div>
        {session && (
          <div className="wb-members">
            <MemberChips members={session.members || []} />
          </div>
        )}
      </div>

        {!session ? (
          <div className="empty" style={{ flex: 1, display: "grid", placeItems: "center" }}>
            <div>选择一个会话开始协作，或前往 协作编排 创建新的智能体团队</div>
          </div>
        ) : (
          <>
            {log.length > 0 && (
              <div className="run-log">
                {log.map((l, i) => <span key={i} className={l.startsWith("✓") ? "ok" : ""}>{l}</span>)}
              </div>
            )}

            <div className="msg-area" ref={areaRef}>
              {msgs.map((m) => <MsgView key={m.id} m={m} />)}
              {live.map((it, i) => {
                if (it.type === "agent_run") {
                  return (
                    <div className="msg" key={i}>
                      <div className="av" style={{ background: "linear-gradient(135deg,#2C56A8,#1E3E7E)" }}>{it.avatar}</div>
                      <div className="body">
                        <div className="meta">
                          <b>{it.agent}</b>
                          <span className="tag info">{it.role}</span>
                          {!it.done && <span className="thinking"><span className="dots">思考中</span></span>}
                        </div>
                        <div className="bubble" style={{ borderColor: it.done ? "var(--border)" : "rgba(242,107,58,.45)" }}>
                          {it.text || "…"}
                          {it.done && it.final}
                        </div>
                      </div>
                    </div>
                  );
                }
                if (it.type === "tool_call") {
                  const tag = it.status === "done" ? <span className="tag ok">✓ 完成</span>
                    : it.status === "running" ? <span className="tag warn">调用中</span>
                    : <span className="tag danger">被拦截</span>;
                  return (
                    <div className="tool-line" key={i}>
                      <span>🛠</span><span className="tn">{it.tool}</span>
                      <span>{it.agent}</span>
                      {it.dur != null && <span className="du">{it.dur}ms</span>}
                      {tag}
                    </div>
                  );
                }
                if (it.type === "approval") {
                  return <ApprovalCard key={i} it={it} onDecide={decide} />;
                }
                return null;
              })}
            </div>

            <div className="wb-input">
              <div className="attach">
                <span className="ai-chip2" onClick={() => { setInput("拆解点餐系统下周交付计划，UI 与后端并行推进，周五前完成联调验收"); }}>💡 拆解下周交付计划</span>
                <span className="ai-chip2" onClick={() => { setInput("生成一份本周项目进展周报，汇总三个并行任务的结果"); }}>💡 生成项目周报</span>
                <span className="ai-chip2" onClick={() => { setInput("检索知识库中的餐饮 SOP，并给出出餐时效优化建议"); }}>🧠 知识库 · 餐饮 SOP</span>
              </div>
              <div className="composer-row">
                <textarea
                  placeholder="输入任务或话题，回车发送；填写后可让智能体团队协作执行…"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); if (!running) handleRun(); } }}
                />
                <button className="btn pri" style={{ flex: "none" }} disabled={running || !input.trim()} onClick={handleRun}>
                  {running ? "协作运行中…" : "发送 ↗"}
                </button>
              </div>
              <div className="row" style={{ marginTop: 6, gap: 8 }}>
                <span className="hint-kbd">⌘ ↵ 发送 · Shift ↵ 换行</span>
                {running && <button className="btn ghost sm" style={{ marginLeft: "auto" }} disabled>停止</button>}
              </div>
            </div>
          </>
        )}
      </div>

      {/* 右栏：任务链 / 参与者 / 上下文（设计稿三面板） */}
      <div className="wb-panel">
        <div>
          <h6>编排 · 任务链</h6>
          {(tasks || []).map((t, i) => (
            <div className="titem" key={i}>
              <span style={{ width: 18, height: 18, borderRadius: 6, background: "var(--brand)", color: "#fff", fontSize: 10, fontWeight: 700, display: "grid", placeItems: "center", flex: "none" }}>{i + 1}</span>
              <b>{t.title || t.description || "任务"}</b>
              <span className="tag neutral" style={{ flex: "none" }}>{t.agent_name}</span>
            </div>
          ))}
          {!(tasks || []).length && <div className="ctx-box">会话未绑定任务链（可在编排配置中设置）</div>}
        </div>
        <div>
          <h6>参与者</h6>
          {(session?.members || []).map((m, i) => {
            const c = CHIP_COLORS[i % CHIP_COLORS.length];
            return (
              <div className="pitem" key={m}>
                <span style={{ width: 18, height: 18, borderRadius: 6, background: c.bg, color: "#fff", fontSize: 10, fontWeight: 700, display: "grid", placeItems: "center", flex: "none" }}>{m[0] || "A"}</span>
                <b>{m}</b><span className="tag ok" style={{ flex: "none" }}>就绪</span>
              </div>
            );
          })}
          {!(session?.members || []).length && <div className="ctx-box">暂无参与者</div>}
        </div>
        <div>
          <h6>上下文串联</h6>
          <div className="ctx-box">任务输出将按编排顺序注入下一任务上下文（upstream）</div>
        </div>
      </div>

      {creating && (
        <div className="modal-mask" onClick={() => setCreating(false)}>
          <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={createSession}>
            <h2>新建协作会话</h2>
            <div className="field">
              <label>会话名称</label>
              <input className="input" name="name" placeholder="如：AI 助手团 · 周报小组" />
            </div>
            <div className="field">
              <label>绑定协作编排（Crew）</label>
              <select className="input" name="crew_id" required>
                <option value="">选择编排…</option>
                {crews.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}（{c.tasks?.length || 0} 个任务）</option>
                ))}
              </select>
              <div className="hint">会话将按该编排的任务链执行多智能体协作；成员自动取自任务绑定的智能体。</div>
            </div>
            <div className="ft">
              <button type="button" className="btn" onClick={() => setCreating(false)}>取消</button>
              <button type="submit" className="btn pri">创建</button>
            </div>
          </form>
        </div>
      )}

      {toast && <div style={{ position: "fixed", top: 66, right: 22, background: "var(--panel)", border: "1px solid var(--brand)", borderRadius: 10, padding: "9px 16px", fontSize: 13, zIndex: 99 }}>{toast}</div>}
    </div>
  );
}

function MsgView({ m }) {
  if (m.role === "result") {
    return <ResultCard m={m} />;
  }
  const me = m.role === "user";
  return (
    <div className={`msg ${me ? "me" : ""}`}>
      <div className="av">{me ? "🧑" : (EMOJI[m.agent] || "🤖")}</div>
      <div className="body">
        <div className="meta"><b>{me ? "我" : m.agent}</b></div>
        <div className="bubble">{m.content}</div>
      </div>
    </div>
  );
}

/** 编排结果：CrewOutput 多形态视图（raw / JSON） */
function ResultCard({ m }) {
  const tasks = m.tasks_output || [];
  const hasJson = m.output_json || tasks.some((t) => t.json_dict);
  const [view, setView] = useState("raw");
  return (
    <div className="msg result">
      <div className="meta" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%" }}>
        <div>🧾 {m.agent} · 编排结果{hasJson ? "（多形态视图）" : ""}</div>
        {hasJson && (
          <div style={{ display: "flex", gap: 6 }}>
            <button className={`btn sm ${view === "raw" ? "pri" : "ghost"}`} onClick={() => setView("raw")}>成果文本</button>
            <button className={`btn sm ${view === "json" ? "pri" : "ghost"}`} onClick={() => setView("json")}>结构化 JSON</button>
          </div>
        )}
      </div>
      {view === "raw" ? (
        <div style={{ whiteSpace: "pre-wrap", fontSize: 13.5, lineHeight: 1.7 }}>{m.content}</div>
      ) : (
        <ResultJsonView m={m} />
      )}
    </div>
  );
}

function ResultJsonView({ m }) {
  const tasks = m.tasks_output || [];
  const code = (obj) =>
    <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-all", fontSize: 12.5, lineHeight: 1.6, background: "var(--side)", border: "1px solid var(--border)", borderRadius: 10, padding: 12, margin: "6px 0", maxHeight: 340, overflow: "auto" }}>{JSON.stringify(obj, null, 2)}</pre>;
  return (
    <div>
      {m.output_json && (
        <>
          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)", marginBottom: 2 }}>最终结构化输出（json_dict）</div>
          {code(m.output_json)}
        </>
      )}
      <div style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)", margin: "10px 0 2px" }}>
        任务级输出（tasks_output · {tasks.length} 项）
      </div>
      {tasks.map((t) => (
        <div key={t.task} style={{ marginBottom: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
            <b>{t.task}</b><span style={{ color: "var(--muted)" }}>· {t.agent}</span>
            <span className={`tag ${t.json_dict ? "ok" : t.output_type === "json" ? "danger" : "neutral"}`}>
              {t.output_type === "json" ? (t.json_dict ? "JSON ✓" : "JSON 解析失败") : "文本"}
            </span>
          </div>
          {t.json_dict ? code(t.json_dict) : <div style={{ fontSize: 12, color: "var(--muted)", whiteSpace: "pre-wrap" }}>{(t.raw || "").slice(0, 240)}{(t.raw || "").length > 240 ? "…" : ""}</div>}
        </div>
      ))}
    </div>
  );
}

function ApprovalCard({ it, onDecide }) {
  const done = it.status !== "pending";
  return (
    <div className="msg">
      <div className="av">🛡</div>
      <div className="body">
        <div className="meta"><b>人工介入 · 审批</b><span className="tag warn">{it.agent}</span></div>
        <div className={`approval-card ${done ? "done" : ""}`}>
          <div className="t">🛡 {it.title || it.tool}</div>
          <div className="args">参数：{it.args}（由 {it.agent} 发起，需人工确认后执行）</div>
          {it.status === "pending" ? (
            <div className="act">
              <button className="btn green sm" onClick={() => onDecide(it.approval_id, "approved")}>✓ 通过并执行</button>
              <button className="btn sm" onClick={() => onDecide(it.approval_id, "rejected")}>✗ 拒绝</button>
            </div>
          ) : (
            <div className="act">
              <span className={`tag ${it.status === "approved" ? "ok" : "danger"}`}>
                {it.status === "approved" ? "已通过 · 已执行" : "已拒绝"}
              </span>
              {it.reason && <span style={{ color: "var(--muted)", fontSize: 12 }}>原因：{it.reason}</span>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}