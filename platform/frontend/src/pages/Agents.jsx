import { useEffect, useState } from "react";
import { del, get, post, put } from "../api.js";

const AVATARS = ["🤖", "🔍", "📊", "✍️", "🧑‍💻", "🎨", "📣", "🛡", "💡", "🗂"];
const AVATAR_SET = new Set(AVATARS);
const TOOL_TEMPLATES = {
  "资深市场调研员": { role: "调研员", goal: "快速、准确地搜集并整理目标市场信息，输出结构化调研结论", backstory: "十年行研经验，擅长数据搜集与事实核查。", tools: ["web_search"], avatar: "🔍" },
  "数据分析师": { role: "分析师", goal: "基于调研数据完成商业分析，给出洞察与建议", backstory: "擅长用数据讲故事，从杂乱信息中提炼关键洞见。", tools: ["calc", "db_query"], avatar: "📊" },
  "报告撰稿人": { role: "撰稿人", goal: "把结论整理成结构清晰、可读性强的报告", backstory: "资深内容生产者，擅长把复杂内容讲得通俗且专业。", tools: ["gen_report"], avatar: "✍️" },
};

export default function Agents() {
  const [agents, setAgents] = useState([]);
  const [tools, setTools] = useState([]);
  const [providers, setProviders] = useState([]);
  const [docs, setDocs] = useState([]);
  const [editing, setEditing] = useState(null); // null | {} 新建 | agent 编辑

  const load = () => get("/api/agents").then((r) => setAgents(r.agents || [])).catch(() => {});
  useEffect(() => {
    load();
    get("/api/tools").then((r) => setTools(r.tools || [])).catch(() => {});
    get("/api/llm-providers").then((r) => setProviders(r.providers || [])).catch(() => {});
    get("/api/knowledge").then((r) => setDocs(r.docs || [])).catch(() => {});
  }, []);

  async function submit(e) {
    e.preventDefault();
    const fd = new FormData(e.target);
    const rec = {
      name: fd.get("name"), role: fd.get("role"), goal: fd.get("goal"),
      backstory: fd.get("backstory"), provider_id: fd.get("provider_id"),
      tools: fd.getAll("tools"),
      memory: fd.get("memory") === "on",
      allow_delegation: fd.get("delegation") === "on",
      knowledge_ids: fd.getAll("knowledge_ids"),
      avatar: AVATAR_SET.has(fd.get("avatar")) ? fd.get("avatar") : "🤖",
    };
    try {
      if (editing.id) await put(`/api/agents/${editing.id}`, rec);
      else await post("/api/agents", rec);
      setEditing(null);
      load();
    } catch (err) { alert(`保存失败：${err.message}`); }
  }

  return (
    <div>
      <div className="panel-h">
        <h3>智能体（数字员工）· {agents.length} 个</h3>
        <button className="btn pri" onClick={() => setEditing({})}>＋ 新建智能体</button>
      </div>
      {agents.length ? (
        <div className="cards">
          {agents.map((a) => (
            <div className="ag-card" key={a.id}>
              <div className="hd">
                <div className="nm"><span className="em">{a.avatar || "🤖"}</span>{a.name}
                  <span className={"tag " + (a.status === "busy" ? "warn" : "ok")}>{a.status === "busy" ? "工作中" : "就绪"}</span>
                </div>
              </div>
              <div className="role">{a.role} · {(providers.find((p) => p.id === a.provider_id) || {}).name || a.model || "默认模型"}</div>
              <div className="goal">🎯 {a.goal}</div>
              <div className="tools-line">
                {(a.tools || []).map((t) => <span key={t} className="tl">{t}</span>)}
                {!(a.tools || []).length && <span className="tl neutral">无工具</span>}
              </div>
              <div className="ft">
                <span style={{ fontSize: 12, color: "var(--dim)" }}>
                  记忆：{a.memory ? "开" : "关"} · 委派：{a.allow_delegation ? "允许" : "禁止"}
                  {(a.knowledge_ids || []).length ? ` · 📚 ${docs.filter((d) => a.knowledge_ids.includes(d.id)).map((d) => d.name).join("、")}` : ""}
                </span>
                <span>
                  <button className="btn ghost sm" onClick={() => setEditing({ ...a })}>编辑</button>
                  <button className="btn ghost sm" style={{ color: "var(--danger)" }} onClick={() => { if (confirm(`删除智能体「${a.name}」？`)) del(`/api/agents/${a.id}`).then(load); }}>删除</button>
                </span>
              </div>
            </div>
          ))}
        </div>
      ) : <div className="card"><div className="empty">暂无智能体，点击「＋ 新建智能体」创建</div></div>}

      {editing && (
        <div className="modal-mask" onClick={() => setEditing(null)}>
          <form className="modal wide" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
            <h2>{editing.id ? `编辑智能体 · ${editing.name}` : "新建智能体"}</h2>
            <div className="row">
              <div className="field">
                <label>名称（会话中显示）</label>
                <input className="input" name="name" required defaultValue={editing.name} placeholder="如：资深市场调研员" />
              </div>
              <div className="field">
                <label>角色（role）</label>
                <input className="input" name="role" required defaultValue={editing.role} placeholder="如：调研员" />
              </div>
            </div>
            <div className="row">
              <div className="field">
                <label>头像</label>
                <select className="input" name="avatar" defaultValue={editing.avatar || "🤖"}>
                  {AVATARS.map((a) => <option key={a} value={a}>{a}</option>)}
                </select>
              </div>
              <div className="field">
                <label>绑定模型提供商</label>
                <select className="input" name="provider_id" defaultValue={editing.provider_id || "demo"}>
                  {providers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
            </div>
            <div className="field">
              <label>目标（goal）</label>
              <input className="input" name="goal" required defaultValue={editing.goal} placeholder="智能体要达成的目标" />
            </div>
            <div className="field">
              <label>背景故事（backstory）</label>
              <textarea className="input" name="backstory" defaultValue={editing.backstory} placeholder="人设与经验背景，影响回答风格" />
            </div>
            <div className="field">
              <label>可用工具</label>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {tools.map((t) => (
                  <label key={t.name} style={{ display: "flex", alignItems: "center", gap: 6, background: "#10182b", border: "1px solid var(--border2)", borderRadius: 9, padding: "6px 10px", fontSize: 12.5, cursor: "pointer" }}>
                    <input type="checkbox" name="tools" value={t.name} defaultChecked={(editing.tools || []).includes(t.name)} />
                    {t.name}{t.requires_approval ? " 🛡" : ""}
                  </label>
                ))}
              </div>
              <div className="hint">🛡 表示高风险工具，使用时需触发审批（人工介入）。</div>
            </div>
            <div className="field">
              <label>绑定知识库（Knowledge，执行任务时检索注入上下文）</label>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {docs.map((d) => (
                  <label key={d.id} style={{ display: "flex", alignItems: "center", gap: 6, background: "#10182b", border: "1px solid var(--border2)", borderRadius: 9, padding: "6px 10px", fontSize: 12.5, cursor: "pointer" }}>
                    <input type="checkbox" name="knowledge_ids" value={d.id} defaultChecked={(editing.knowledge_ids || []).includes(d.id)} />
                    📄 {d.name}
                  </label>
                ))}
                {!docs.length && <span style={{ fontSize: 12, color: "var(--dim)" }}>暂无知识文档，可先在「知识库」页添加</span>}
              </div>
              <div className="hint">勾选后该智能体执行的每项任务都会先按任务描述检索知识库，命中片段注入系统提示；任务自身配置的绑定优先。</div>
            </div>
            <div className="row">
              <label className="field" style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                <input type="checkbox" name="memory" defaultChecked={!!editing.memory} /> 启用记忆（memory）
              </label>
              <label className="field" style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                <input type="checkbox" name="delegation" defaultChecked={!!editing.allow_delegation} /> 允许委派（allow_delegation）
              </label>
            </div>
            <div className="ft">
              <button type="button" className="btn" onClick={() => setEditing(null)}>取消</button>
              <button type="submit" className="btn pri">保存</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
export { TOOL_TEMPLATES, AVATARS, AVATAR_SET };