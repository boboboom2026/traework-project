import { useEffect, useState } from "react";
import { del, get, post, put } from "../api.js";

export default function Crews({ onNav }) {
  const [crews, setCrews] = useState([]);
  const [agents, setAgents] = useState([]);
  const [editing, setEditing] = useState(null);
  const [preview, setPreview] = useState(null);

  const load = () => get("/api/crews").then((r) => setCrews(r.crews || [])).catch(() => {});
  useEffect(() => {
    load();
    get("/api/agents").then((r) => setAgents(r.agents || [])).catch(() => {});
  }, []);

  async function submit(e) {
    e.preventDefault();
    const fd = new FormData(e.target);
    const tasks = [];
    const titles = fd.getAll("task_title");
    const agentsA = fd.getAll("task_agent");
    const descs = fd.getAll("task_desc");
    const exps = fd.getAll("task_exp");
    const ctxs = fd.getAll("task_ctx");
    for (let i = 0; i < titles.length; i++) {
      if (!titles[i].trim()) continue;
      tasks.push({
        id: editing.tasks?.[i]?.id || ("t-" + Date.now() + i),
        title: titles[i], agent_name: agentsA[i],
        description: descs[i], expected_output: exps[i],
        use_upstream: ctxs[i] === "on",
      });
    }
    const rec = {
      name: fd.get("name"), description: fd.get("description"),
      process: fd.get("process"), manager_agent_id: fd.get("manager_agent_id") || null,
      planning: fd.get("planning") === "on", memory: fd.get("memory") === "on",
      tasks,
    };
    try {
      if (editing.id) await put(`/api/crews/${editing.id}`, rec);
      else await post("/api/crews", rec);
      setEditing(null);
      load();
    } catch (err) { alert(`保存失败：${err.message}`); }
  }

  return (
    <div>
      <div className="panel-h">
        <h3>协作编排（Crew）· {crews.length} 个</h3>
        <div>
          <button className="btn ghost" onClick={() => onNav("workbench")}>去工作台运行 →</button>
          <button className="btn pri" onClick={() => setEditing({ tasks: [] })}>＋ 新建编排</button>
        </div>
      </div>
      {crews.length ? (
        <div className="cards">
          {crews.map((c) => (
            <div className="ag-card" key={c.id}>
              <div className="hd">
                <div className="nm"><span className="em">⛓</span>{c.name}
                  <span className="tag info">{c.process === "hierarchical" ? "层级编排" : "顺序编排"}</span>
                </div>
              </div>
              <div className="role">{c.description}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 4 }}>
                {(c.tasks || []).map((t, i) => (
                  <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5 }}>
                    <span style={{ color: "var(--dim)" }}>{i + 1}.</span>
                    <b>{t.title}</b>
                    <span style={{ color: "var(--muted)" }}>→ {t.agent_name}</span>
                    {t.use_upstream && <span className="tag info">⛓ 引用上游</span>}
                  </div>
                ))}
              </div>
              <div className="ft">
                <span style={{ fontSize: 12, color: "var(--dim)" }}>
                  {(c.tasks || []).length} 个任务 · 规划：{c.planning ? "开" : "关"} · 记忆：{c.memory ? "开" : "关"}
                </span>
                <span>
                  <button className="btn ghost sm" onClick={() => setPreview(c)}>流程预览</button>
                  <button className="btn ghost sm" onClick={() => setEditing({ ...c })}>编辑</button>
                  <button className="btn ghost sm" style={{ color: "var(--danger)" }} onClick={() => { if (confirm(`删除编排「${c.name}」？`)) del(`/api/crews/${c.id}`).then(load); }}>删除</button>
                </span>
              </div>
            </div>
          ))}
        </div>
      ) : <div className="card"><div className="empty">暂无编排配置</div></div>}

      {editing && <CrewEditor agents={agents} editing={editing} onClose={() => setEditing(null)} onSubmit={submit} />}
      {preview && <PreviewModal crew={preview} onClose={() => setPreview(null)} />}
    </div>
  );
}

function CrewEditor({ agents, editing, onClose, onSubmit }) {
  const [tasks, setTasks] = useState(editing.tasks || []);
  const model = agents.find((a) => a.id === editing.manager_agent_id);
  return (
    <div className="modal-mask" onClick={onClose}>
      <form className="modal wide" onClick={(e) => e.stopPropagation()} onSubmit={(e) => { e.preventDefault(); onSubmit(e); }}>
        <h2>{editing.id ? `编辑编排 · ${editing.name}` : "新建协作编排"}</h2>
        <div className="row">
          <div className="field">
            <label>编排名称</label>
            <input className="input" name="name" required defaultValue={editing.name} placeholder="如：市场分析工作流" />
          </div>
          <div className="field">
            <label>流程模式（Process）</label>
            <select className="input" name="process" defaultValue={editing.process || "sequential"}>
              <option value="sequential">顺序执行 sequential（任务链依次执行）</option>
              <option value="hierarchical">层级执行 hierarchical（管理者委派）</option>
            </select>
          </div>
        </div>
        <div className="field">
          <label>描述</label>
          <input className="input" name="description" defaultValue={editing.description} placeholder="如：调研 → 分析 → 成稿 三步协作" />
        </div>
        <div className="field">
          <label>任务链（按顺序执行，可多轮调整）</label>
          {tasks.map((t, i) => (
            <div key={i} style={{ background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 12, padding: 12, marginBottom: 10 }}>
              <div className="row">
                <div className="field" style={{ marginBottom: 8 }}>
                  <label>任务{i + 1} 名称</label>
                  <input className="input" name="task_title" defaultValue={t.title} />
                </div>
                <div className="field" style={{ marginBottom: 8 }}>
                  <label>执行智能体</label>
                  <select className="input" name="task_agent" defaultValue={t.agent_name}>
                    <option value="">选择智能体…</option>
                    {agents.map((a) => <option key={a.id} value={a.name}>{a.name}</option>)}
                  </select>
                </div>
              </div>
              <div className="field" style={{ marginBottom: 8 }}>
                <label>任务描述</label>
                <textarea className="input" name="task_desc" defaultValue={t.description} style={{ minHeight: 44 }} />
              </div>
              <div className="field" style={{ marginBottom: 0 }}>
                <label>期望输出（expected_output）</label>
                <input className="input" name="task_exp" defaultValue={t.expected_output} />
              </div>
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, marginTop: 8, color: "var(--muted)", cursor: "pointer" }}>
                <input type="checkbox" name="task_ctx" defaultChecked={!!t.use_upstream} />
                ⛓ 引用所有上游任务输出（context 串联：把前序任务成果作为本任务上下文）
              </label>
              <div style={{ textAlign: "right", marginTop: 8 }}>
                <button type="button" className="btn ghost sm" style={{ color: "var(--danger)" }} onClick={() => setTasks(tasks.filter((_, j) => j !== i))}>移除任务</button>
              </div>
            </div>
          ))}
          <button type="button" className="btn sm" onClick={() => setTasks([...tasks, { title: "", agent_name: "", description: "", expected_output: "" }])}>＋ 添加任务</button>
        </div>
        <div className="row" style={{ alignItems: "center" }}>
          <div className="field">
            <label>层级模式下管理者（manager_agent）</label>
            <select className="input" name="manager_agent_id" defaultValue={editing.manager_agent_id || ""}>
              <option value="">无（由 LLM 智能体充当管理者）</option>
              {agents.map((a) => <option key={a.id} value={a.id}>{a.name}{model ? "" : ""}</option>)}
            </select>
          </div>
          <label className="field" style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, marginTop: 22 }}>
            <input type="checkbox" name="planning" defaultChecked={!!editing.planning} /> 任务规划 planning
          </label>
          <label className="field" style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, marginTop: 22 }}>
            <input type="checkbox" name="memory" defaultChecked={!!editing.memory} /> 团队记忆
          </label>
        </div>
        <div className="ft">
          <button type="button" className="btn" onClick={onClose}>取消</button>
          <button type="submit" className="btn pri">保存</button>
        </div>
      </form>
    </div>
  );
}

function PreviewModal({ crew, onClose }) {
  const steps = (crew.tasks || []).map((t) => t.agent_name);
  const hierarchical = crew.process === "hierarchical";
  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>流程预览 · {crew.name}</h2>
        {hierarchical && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
            <span className="tag info">层级编排</span>
            <span style={{ fontSize: 12.5, color: "var(--muted)" }}>
              由管理者统筹规划 → 逐一委派成员执行 → 管理者汇总最终结论
            </span>
          </div>
        )}
        <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 10, marginBottom: 16 }}>
          {(crew.tasks || []).map((t, i) => (
            <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {i > 0 && <span style={{ color: "var(--brand)" }}>→</span>}
              <div style={{ textAlign: "center", background: "var(--bg2)", border: "1px solid var(--border2)", borderRadius: 12, padding: "10px 14px" }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{t.agent_name}</div>
                <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 2 }}>{t.title}</div>
                {t.use_upstream && <div style={{ fontSize: 10.5, color: "var(--info)", marginTop: 4 }}>⛓ 引用上游上下文</div>}
              </div>
            </div>
          ))}
          {!steps.length && <div className="empty">暂无任务</div>}
        </div>
        <div style={{ fontSize: 12.5, color: "var(--muted)", lineHeight: 1.8 }}>
          <b style={{ color: "var(--text)" }}>执行说明：</b>
          {hierarchical ? "层级委派：管理者先规划分工，任务依次委派执行，最后汇总为管理层结论。" : "顺序执行：按任务链依次执行。"}
          {(crew.tasks || []).map((t, i) => (
            <div key={t.id} style={{ marginTop: 4 }}>
              {i + 1}. {t.description || t.title}{t.expected_output ? `（${t.expected_output}）` : ""}
            </div>
          ))}
        </div>
        <div className="ft"><button className="btn" onClick={onClose}>关闭</button></div>
      </div>
    </div>
  );
}