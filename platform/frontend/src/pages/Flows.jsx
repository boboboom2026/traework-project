import { Fragment, useEffect, useState } from "react";
import { del, get, post, put } from "../api.js";
import { streamSSE } from "../api.js";

const STEP_STATUS = { pending: "待执行", running: "执行中", done: "已完成", skipped: "已跳过" };

// 横向节点画布：状态机步骤链（状态色顶边 + 序号 + 执行智能体）
const NODE_COLOR = { done: "var(--ok)", running: "var(--accent)", skipped: "var(--dim)", pending: "var(--border2)" };
function FlowCanvas({ steps = [], style }) {
  if (!steps.length) return null;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", ...style }}>
      {steps.map((s, i) => (
        <Fragment key={s.id || i}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#fff", border: "1px solid var(--border)",
            borderTop: `2px solid ${NODE_COLOR[s.status] || NODE_COLOR.pending}`, borderRadius: 10, padding: "5px 10px", minWidth: 92,
            boxShadow: "var(--shadow)" }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: "var(--brand)" }}>{i + 1}</span>
            <div>
              <div style={{ fontSize: 11.5, fontWeight: 600, lineHeight: 1.25 }}>{s.name || "步骤"}</div>
              <div style={{ fontSize: 10, color: "var(--dim)" }}>{s.agent_name ? `↳ ${s.agent_name}` : "未绑定"}</div>
            </div>
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

  async function submit(e) {
    e.preventDefault();
    const fd = new FormData(e.target);
    const names = fd.getAll("st_name");
    const ags = fd.getAll("st_agent");
    const acts = fd.getAll("st_action");
    const conds = fd.getAll("st_cond");
    const steps = [];
    for (let i = 0; i < names.length; i++) {
      if (!names[i].trim()) continue;
      steps.push({
        id: "s" + Date.now() + i,
        name: names[i], agent_name: ags[i],
        action: acts[i], if_contains: conds[i] || "",
        status: "pending",
      });
    }
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
        <h3>流程编排（Flows）· {flows.length} 个</h3>
        <button className="btn pri" onClick={() => setEditing({ steps: [] })}>＋ 新建流程</button>
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
                <span style={{ fontSize: 12, color: "var(--dim)" }}>{f.total_steps} 个步骤 · 事件驱动 · 条件分支</span>
                <span>
                  <button className="btn green sm" onClick={() => setViewing(f)}>运行 / 查看</button>
                  <button className="btn ghost sm" onClick={() => setEditing({ ...f })}>编辑</button>
                  <button className="btn ghost sm" style={{ color: "var(--danger)" }} onClick={() => { if (confirm(`删除流程「${f.name}」？`)) del(`/api/flows/${f.id}`).then(load); }}>删除</button>
                </span>
              </div>
            </div>
          ))}
        </div>
      ) : <div className="card"><div className="empty">暂无流程。<br />创建事件驱动工作流（审批链 / 周报自动化等），每次运行推进一个步骤。</div></div>}

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
              <input className="input" name="description" defaultValue={editing.description} placeholder="如：法务 → 财务 → 负责人 三个环节顺次执行" />
            </div>
            <div className="field">
              <label>步骤（顺序执行；可配置条件分支：上一步输出包含关键词才执行，否则跳过）</label>
              {(editing.steps || []).map((s, i) => (
                <div key={s.id || i} style={{ background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 12, padding: 12, marginBottom: 10 }}>
                  <div className="row">
                    <div className="field" style={{ marginBottom: 8 }}>
                      <label>步骤{i + 1} 名称</label>
                      <input className="input" name="st_name" defaultValue={s.name} />
                    </div>
                    <div className="field" style={{ marginBottom: 8 }}>
                      <label>执行智能体</label>
                      <select className="input" name="st_agent" defaultValue={s.agent_name}>
                        <option value="">选择智能体…</option>
                        {agents.map((a) => <option key={a.id} value={a.name}>{a.name}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="field" style={{ marginBottom: 8 }}>
                    <label>执行动作（发给智能体的任务描述）</label>
                    <input className="input" name="st_action" defaultValue={s.action} />
                  </div>
                  <div className="field" style={{ marginBottom: 0 }}>
                    <label>条件分支（if_contains）：上一步输出包含该关键词才执行，留空则总是执行</label>
                    <input className="input" name="st_cond" defaultValue={s.if_contains} placeholder="如：通过 / 需要修改" />
                  </div>
                  <div style={{ textAlign: "right", marginTop: 8 }}>
                    <button type="button" className="btn ghost sm" style={{ color: "var(--danger)" }} onClick={() => { const ns = [...editing.steps]; ns.splice(i, 1); setEditing({ ...editing, steps: ns }); }}>移除</button>
                  </div>
                </div>
              ))}
              <button type="button" className="btn sm" onClick={() => setEditing({ ...editing, steps: [...(editing.steps || []), { name: "", agent_name: "", action: "", if_contains: "" }] })}>＋ 添加步骤</button>
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
        else if (ev.type === "flow_step" && ev.status === "skipped") setLog((l) => [...l, `⏭ ${ev.step} 跳过：上一步未含「${ev.condition}」`]);
        else if (ev.type === "flow_step" && ev.status === "error") setLog((l) => [...l, `✗ ${ev.message}`]);
        else if (ev.type === "error") setLog((l) => [...l, `✗ ${ev.message}`]);
      },
      onDone: () => { setRunning(false); refresh(); },
    });
  }

  const steps = detail.steps || [];
  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="modal wide" onClick={(e) => e.stopPropagation()}>
        <h2>流程 · {flow.name} <span className={"tag " + (detail.status === "已完成" ? "ok" : detail.status === "运行中" ? "warn" : "neutral")}>{detail.status}</span></h2>
        <div className="hint" style={{ marginBottom: 10 }}>{flow.description} · 每次点击「运行」推进一个步骤（或跳过条件未命中的步骤）</div>
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
                <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>{s.action || ""}{s.if_contains ? `（条件：含「${s.if_contains}」才执行）` : ""}</div>
                {s.output && <div style={{ fontSize: 12, color: "var(--text)", whiteSpace: "pre-wrap", wordBreak: "break-all", marginTop: 6, fontFamily: "monospace" }}>{String(s.output).slice(0, 500)}</div>}
              </div>
            </div>
          ))}
        </div>
        {log.length > 0 && (
          <div className="run-log" style={{ maxHeight: 140, overflow: "auto" }}>
            {log.map((l, i) => <span key={i} className={l.startsWith("✓") ? "ok" : ""}>{l}</span>)}
          </div>
        )}
        <div className="row" style={{ marginBottom: 4 }}>
          <input className="input" style={{ flex: 1 }} value={input} onChange={(e) => setInput(e.target.value)} placeholder="本步骤的输入内容（可选）" />
          <button className="btn pri" disabled={running || detail.status === "已完成"} onClick={run}>{running ? "推进中…" : "▶ 运行（推进一步）"}</button>
          <button className="btn ghost" onClick={() => { if (confirm("重置流程状态？")) post(`/api/flows/${flow.id}/reset`).then(() => refresh()); }}>重置</button>
        </div>
        <div className="ft">
          <button className="btn" onClick={onClose}>关闭</button>
        </div>
      </div>
    </div>
  );
}