import { Fragment, useEffect, useState } from "react";
import { del, get, post, put } from "../api.js";
import { streamSSE } from "../api.js";

const STEP_STATUS = { pending: "待执行", running: "执行中", done: "已完成", skipped: "已跳过" };

// 横向节点画布：状态机步骤链（状态色顶边 + 序号 + 执行智能体 + 分支路由提示）
const NODE_COLOR = { done: "var(--ok)", running: "var(--accent)", skipped: "var(--dim)", pending: "var(--border2)" };
function FlowCanvas({ steps = [], style }) {
  if (!steps.length) return null;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", ...style }}>
      {steps.map((s, i) => (
        <Fragment key={s.id || i}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 2, background: "#fff",
            border: "1px solid var(--border)", borderTop: `2px solid ${NODE_COLOR[s.status] || NODE_COLOR.pending}`,
            borderRadius: 10, padding: "5px 10px", minWidth: 92, boxShadow: "var(--shadow)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: "var(--brand)" }}>{i + 1}</span>
              <div>
                <div style={{ fontSize: 11.5, fontWeight: 600, lineHeight: 1.25 }}>{s.name || "步骤"}</div>
                <div style={{ fontSize: 10, color: "var(--dim)" }}>{s.agent_name ? `↳ ${s.agent_name}` : "未绑定"}</div>
              </div>
            </div>
            {(s.branches && s.branches.length > 0) && (
              <div style={{ fontSize: 9.5, color: "var(--brand)", fontWeight: 600, marginLeft: 1 }}>
                ⤵ {s.branches.length} 路分支
              </div>
            )}
          </div>
          {i < steps.length - 1 && <span style={{ color: "var(--dim)", fontSize: 13, flex: "none" }}>→</span>}
        </Fragment>
      ))}
    </div>
  );
}

export default function Flows() {
  const [flows, setFlows] = useState([]);
  const [agents, setAgents] = useState([]);
  const [editing, setEditing] = useState(null);
  const [viewing, setViewing] = useState(null);

  const load = () => {
    get("/api/flows").then((r) => setFlows(r.flows || [])).catch(() => {});
  };
  useEffect(() => {
    load();
    get("/api/agents").then((r) => setAgents(r.agents || [])).catch(() => {});
  }, []);

  function newStep() {
    return { id: "s" + Date.now() + Math.random().toString(36).slice(2, 6), name: "", agent_name: "", action: "", if_contains: "", branches: [], status: "pending" };
  }
  function updateStep(i, patch) {
    const ns = [...editing.steps];
    ns[i] = { ...ns[i], ...patch };
    setEditing({ ...editing, steps: ns });
  }
  function addBranch(i) { updateStep(i, { branches: [...(editing.steps[i].branches || []), { condition: "", to: "" }] }); }
  function updateBranch(i, bi, patch) {
    const nb = (editing.steps[i].branches || []).map((b, k) => k === bi ? { ...b, ...patch } : b);
    updateStep(i, { branches: nb });
  }
  function removeBranch(i, bi) { updateStep(i, { branches: (editing.steps[i].branches || []).filter((_, k) => k !== bi) }); }

  async function submit(e) {
    e.preventDefault();
    const fd = new FormData(e.target);
    const steps = (editing.steps || []).filter((s) => s.name.trim());
    const rec = { name: fd.get("name"), description: fd.get("description"), steps };
    try {
      if (editing.id) await put(`/api/flows/${editing.id}`, rec);
      else await post("/api/flows", rec);
      setEditing(null);
      load();
    } catch (err) { alert(`保存失败：${err.message}`); }
  }

  return (
    <div>
      <div className="panel-h">
        <h3>流程型 · Flows（事件驱动状态机）· {flows.length} 个</h3>
        <button className="btn pri" onClick={() => setEditing({ steps: [newStep()] })}>＋ 新建流程</button>
      </div>
      {flows.length ? (
        <div className="cards">
          {flows.map((f) => (
            <div className="ag-card" key={f.id}>
              <div className="hd">
                <div className="nm"><span className="em">◈</span>{f.name}
                  <span className={"tag " + (f.status === "已完成" ? "ok" : f.status === "运行中" ? "warn" : "neutral")}>{f.status}</span>
                </div>
              </div>
              <div className="role">{f.description}</div>
              <FlowCanvas steps={f.steps || []} style={{ margin: "10px 0 4px" }} />
              <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "8px 0" }}>
                <div style={{ flex: 1, height: 6, background: "var(--bg2)", borderRadius: 3 }}>
                  <div style={{ width: `${(f.progress || 0) * 100}%`, height: 6, background: "var(--brand)", borderRadius: 3 }} />
                </div>
                <span style={{ fontSize: 12, color: "var(--muted)" }}>{f.done_steps}/{f.total_steps}</span>
              </div>
              <div className="ft">
                <span style={{ fontSize: 12, color: "var(--dim)" }}>{f.total_steps} 个步骤 · 事件驱动 · 条件分支路由</span>
                <span>
                  <button className="btn green sm" onClick={() => setViewing(f)}>运行 / 查看</button>
                  <button className="btn ghost sm" onClick={() => setEditing({ ...f, steps: (f.steps || []).map((s) => ({ ...s, branches: s.branches || [] })) })}>编辑</button>
                  <button className="btn ghost sm" style={{ color: "var(--danger)" }} onClick={() => { if (confirm(`删除流程「${f.name}」？`)) del(`/api/flows/${f.id}`).then(load); }}>删除</button>
                </span>
              </div>
            </div>
          ))}
        </div>
      ) : <div className="card"><div className="empty">暂无流程。<br />创建事件驱动工作流（审批链 / 周报自动化等）。支持多路分支路由（if/else / 跳转 / 循环），每次运行推进一个步骤。</div></div>}

      {editing && (
        <div className="modal-mask" onClick={() => setEditing(null)}>
          <form className="modal wide" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
            <h2>{editing.id ? `编辑流程 · ${editing.name}` : "新建流程"}</h2>
            <div className="field">
              <label>流程名称</label>
              <input className="input" name="name" required defaultValue={editing.name} placeholder="如：跨部门审批链" />
            </div>
            <div className="field">
              <label>描述</label>
              <input className="input" name="description" defaultValue={editing.description} placeholder="如：法务 → 财务 → 负责人 三个环节，含分支路由" />
            </div>

            <div className="field">
              <label>步骤（可配置进入条件 if_contains 与执行后的分支路由 branches）</label>
              {(editing.steps || []).map((s, i) => (
                <div key={s.id || i} style={{ background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 12, padding: 12, marginBottom: 10 }}>
                  <div className="row">
                    <div className="field" style={{ marginBottom: 8 }}>
                      <label>步骤{i + 1} 名称</label>
                      <input className="input" value={s.name} onChange={(e) => updateStep(i, { name: e.target.value })} placeholder="步骤名（供分支引用）" />
                    </div>
                    <div className="field" style={{ marginBottom: 8 }}>
                      <label>执行智能体</label>
                      <select className="input" value={s.agent_name} onChange={(e) => updateStep(i, { agent_name: e.target.value })}>
                        <option value="">选择智能体…</option>
                        {agents.map((a) => <option key={a.id} value={a.name}>{a.name}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="field" style={{ marginBottom: 8 }}>
                    <label>执行动作（发给智能体的任务描述）</label>
                    <input className="input" value={s.action} onChange={(e) => updateStep(i, { action: e.target.value })} />
                  </div>
                  <div className="field" style={{ marginBottom: 8 }}>
                    <label>进入条件 if_contains：上一步输出包含该关键词才执行本步，留空则总是执行</label>
                    <input className="input" value={s.if_contains} onChange={(e) => updateStep(i, { if_contains: e.target.value })} placeholder="如：通过 / 需要修改" />
                  </div>

                  <div style={{ marginBottom: 4 }}>
                    <label style={{ fontSize: 12, display: "block", marginBottom: 6 }}>
                      分支路由（执行后按输出匹配，从上到下取首个命中；条件留空 = else 兜底；否则走线性下一步）
                    </label>
                    {(s.branches || []).map((b, bi) => (
                      <div key={bi} style={{ display: "flex", gap: 8, marginBottom: 6, alignItems: "center" }}>
                        <input className="input" style={{ flex: 1 }} value={b.condition} onChange={(e) => updateBranch(i, bi, { condition: e.target.value })}
                          placeholder="条件关键词（匹配输出则跳转；留空=else）" />
                        <select className="input" style={{ flex: 1 }} value={b.to} onChange={(e) => updateBranch(i, bi, { to: e.target.value })}>
                          <option value="">→ 跳转到（选目标）</option>
                          {editing.steps.map((t, ti) => (ti === i ? null : <option key={ti} value={t.name}>{t.name || `步骤${ti + 1}`}</option>))}
                          <option value="end">（流程结束）</option>
                        </select>
                        <button type="button" className="btn ghost sm" style={{ flex: "none", color: "var(--danger)" }} onClick={() => removeBranch(i, bi)}>✕</button>
                      </div>
                    ))}
                    <button type="button" className="btn sm" onClick={() => addBranch(i)}>＋ 分支</button>
                  </div>

                  <div style={{ textAlign: "right", marginTop: 8 }}>
                    <button type="button" className="btn ghost sm" style={{ color: "var(--danger)" }} onClick={() => { const ns = [...editing.steps]; ns.splice(i, 1); setEditing({ ...editing, steps: ns }); }}>移除步骤</button>
                  </div>
                </div>
              ))}
              <button type="button" className="btn sm" onClick={() => setEditing({ ...editing, steps: [...editing.steps, newStep()] })}>＋ 添加步骤</button>
            </div>
            <div className="ft">
              <button type="button" className="btn" onClick={() => setEditing(null)}>取消</button>
              <button type="submit" className="btn pri">保存</button>
            </div>
          </form>
        </div>
      )}

      {viewing && <FlowRun flow={viewing} agents={agents} onClose={() => { setViewing(null); load(); }} />}
    </div>
  );
}

function FlowRun({ flow, agents, onClose }) {
  const [detail, setDetail] = useState(flow);
  const [input, setInput] = useState("");
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState([]);
  const refresh = () => get(`/api/flows/${flow.id}`).then(setDetail).catch(() => {});
  const canRun = (detail.steps || []).some((s) => s.status === "running");

  function run() {
    if (running) return;
    setRunning(true);
    setLog((l) => [...l, `▶ 推进一个步骤：${input || "流程环节"}`]);
    streamSSE(`/api/flows/${flow.id}/run`, {
      body: { input: input || "流程环节" },
      onEvent: (ev) => {
        if (ev.type === "flow_step_start") setLog((l) => [...l, `· ${ev.step}（${ev.agent}）执行：${(ev.task || "").slice(0, 60)}`]);
        else if (ev.type === "flow_step_done") setLog((l) => [...l, `✓ ${ev.step} 完成：${(ev.output || "").slice(0, 120)}`]);
        else if (ev.type === "flow_route") setLog((l) => [...l, `↪ ${ev.from} 命中「${ev.match || "else"}」→ 第${(ev.to_index ?? -1) + 1}步`]);
        else if (ev.type === "flow_step" && ev.status === "skipped") setLog((l) => [...l, `⏭ ${ev.step} 跳过：上一步未含「${ev.condition}」`]);
        else if (ev.type === "flow_step" && ev.status === "error") setLog((l) => [...l, `✗ ${ev.message}`]);
        else if (ev.type === "error") setLog((l) => [...l, `✗ ${ev.message}`]);
      },
      onDone: () => { setRunning(false); refresh(); },
    });
  }

  const steps = detail.steps || [];
  const stepName = (idx) => {
    if (idx === null || idx === undefined || idx === -1 || idx >= steps.length) return "流程结束";
    return steps[idx].name || `步骤${idx + 1}`;
  };
  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="modal wide" onClick={(e) => e.stopPropagation()}>
        <h2>流程 · {flow.name} <span className={"tag " + (detail.status === "已完成" ? "ok" : detail.status === "运行中" ? "warn" : "neutral")}>{detail.status}</span></h2>
        <div className="hint" style={{ marginBottom: 10 }}>{flow.description} · 每次点击「运行」推进一个步骤（含分支路由：按输出匹配跳转）</div>
        <FlowCanvas steps={steps} style={{ marginBottom: 12 }} />
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
          {steps.map((s, i) => (
            <div key={s.id || i} style={{ display: "flex", alignItems: "flex-start", gap: 10, background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 10, padding: 10 }}>
              <span style={{ fontWeight: 700, color: "var(--brand)", width: 26, textAlign: "center" }}>{i + 1}</span>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                  <b>{s.name}</b>
                  <span style={{ color: "var(--muted)" }}>↳ {s.agent_name || "未指定"}</span>
                  <span className={"tag " + (s.status === "done" ? "ok" : s.status === "running" ? "warn" : s.status === "skipped" ? "neutral" : "info")}>{STEP_STATUS[s.status] || STEP_STATUS.pending}</span>
                </div>
                <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>{s.action || ""}{s.if_contains ? `（进入条件：含「${s.if_contains}」才执行）` : ""}</div>
                {(s.branches || []).length > 0 && (
                  <div style={{ marginTop: 4 }}>
                    <div style={{ fontSize: 11.5, color: "var(--brand)", fontWeight: 600 }}>分支路由：</div>
                    {(s.branches || []).map((b, bi) => (
                      <div key={bi} style={{ fontSize: 11.5, color: "var(--muted)" }}>
                        {b.condition ? `☑ 若含「${b.condition}」→ ${stepName(steps.findIndex((x) => (x.name || "") === b.to))}` : b.to === "end" ? `☐ 否则 → 流程结束` : `☐ 否则 → ${b.to ? b.to : "线性下一步"}`}
                      </div>
                    ))}
                  </div>
                )}
                {s.routed_to !== undefined && s.status === "done" && (
                  <div style={{ fontSize: 11.5, color: "var(--accent)", fontWeight: 600, marginTop: 4 }}>↪ 实际跳转 → {stepName(s.routed_to)}</div>
                )}
                {s.output && <div style={{ fontSize: 12, color: "var(--text)", whiteSpace: "pre-wrap", wordBreak: "break-all", marginTop: 6, fontFamily: "monospace" }}>{String(s.output).slice(0, 500)}</div>}
              </div>
            </div>
          ))}
        </div>
        {log.length > 0 && (
          <div className="run-log" style={{ maxHeight: 140, overflow: "auto" }}>
            {log.map((l, i) => <span key={i} className={l.startsWith("✓") || l.startsWith("↪") ? "ok" : ""}>{l}</span>)}
          </div>
        )}
        <div className="row" style={{ marginBottom: 4 }}>
          <input className="input" style={{ flex: 1 }} value={input} onChange={(e) => setInput(e.target.value)} placeholder="本步骤的输入内容（可选）" />
          <button className="btn pri" disabled={running || detail.status === "已完成"} onClick={run}>{running ? "推进中…" : "▶ 运行（推进）"}</button>
          <button className="btn ghost" onClick={() => { if (confirm("重置流程状态？")) post(`/api/flows/${flow.id}/reset`).then(() => refresh()); }}>重置</button>
        </div>
        <div className="ft">
          <button className="btn" onClick={onClose}>关闭</button>
        </div>
      </div>
    </div>
  );
}