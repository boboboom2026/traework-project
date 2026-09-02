import { useEffect, useState } from "react";
import { del, get, post, put } from "../api.js";

const PROV_ICON = { demo: "🧪", openai: "🔷", anthropic: "✳️", gemini: "🔮", azure: "☁️", bedrock: "🏝", snowflake: "❄️", openai_compatible: "🔌", custom: "🔌" };

export default function Providers() {
  const [providers, setProviders] = useState([]);
  const [editing, setEditing] = useState(null);

  const load = () => get("/api/llm-providers").then((r) => setProviders(r.providers || [])).catch(() => {});
  useEffect(() => { load(); }, []);

  async function submit(e) {
    e.preventDefault();
    const fd = new FormData(e.target);
    const rec = {
      name: fd.get("name"), provider: fd.get("provider"), model: fd.get("model"),
      api_key: fd.get("api_key"), base_url: fd.get("base_url"),
      temperature: Number(fd.get("temperature") || 0.2),
    };
    try {
      if (editing.id) await put(`/api/llm-providers/${editing.id}`, rec);
      else await post("/api/llm-providers", rec);
      setEditing(null);
      load();
    } catch (err) { alert(`保存失败：${err.message}`); }
  }

  return (
    <div>
      <div className="panel-h">
        <h3>模型接入与凭据 · {providers.length} 个</h3>
        <button className="btn pri" onClick={() => setEditing({})}>＋ 添加提供商</button>
      </div>
      <div className="cards">
        {providers.map((p) => (
          <div className="ag-card" key={p.id}>
            <div className="hd">
              <div className="nm"><span className="em">{PROV_ICON[p.provider] || "🔌"}</span>{p.name}
                {p.builtin && <span className="tag info">内置</span>}
              </div>
            </div>
            <div className="role">{p.provider}/{p.model} · temperature={p.temperature}</div>
            <div className="role" style={{ color: "var(--dim)" }}>{p.notes || (p.base_url ? `Base URL：${p.base_url}` : "未填写 Base URL")}</div>
            <div className="ft">
              <span style={{ fontSize: 12, color: "var(--muted)" }}>{p.api_key ? "🔑 已填凭据" : "无凭据（演示模式）"}</span>
              <span>
                <button className="btn ghost sm" onClick={() => setEditing({ ...p })}>编辑</button>
                {!p.builtin && <button className="btn ghost sm" style={{ color: "var(--danger)" }} onClick={() => { if (confirm("删除该提供商？")) del(`/api/llm-providers/${p.id}`).then(load); }}>删除</button>}
              </span>
            </div>
          </div>
        ))}
      </div>

      {editing && (
        <div className="modal-mask" onClick={() => setEditing(null)}>
          <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
            <h2>{editing.id ? `编辑提供商 · ${editing.name}` : "添加 LLM 提供商"}</h2>
            <div className="row">
              <div className="field">
                <label>名称</label>
                <input className="input" name="name" required defaultValue={editing.name} placeholder="如：公司 GPT-4o" />
              </div>
              <div className="field">
                <label>提供商类型</label>
                <select className="input" name="provider" defaultValue={editing.provider || "openai_compatible"}>
                  <option value="demo">演示模型（内置，无需 Key）</option>
                  <option value="openai">OpenAI</option>
                  <option value="anthropic">Anthropic</option>
                  <option value="gemini">Gemini</option>
                  <option value="azure">Azure OpenAI</option>
                  <option value="bedrock">AWS Bedrock</option>
                  <option value="snowflake">Snowflake</option>
                  <option value="openai_compatible">OpenAI 兼容接口</option>
                </select>
              </div>
            </div>
            <div className="row">
              <div className="field">
                <label>模型（model）</label>
                <input className="input" name="model" required defaultValue={editing.model} placeholder="如：gpt-4o / demo/chat" />
              </div>
              <div className="field">
                <label>Temperature</label>
                <input className="input" name="temperature" type="number" step="0.1" min={0} max={2} defaultValue={editing.temperature ?? 0.2} />
              </div>
            </div>
            <div className="field">
              <label>Base URL（兼容接口必填）</label>
              <input className="input" name="base_url" defaultValue={editing.base_url} placeholder="https://api.example.com/v1" />
            </div>
            <div className="field">
              <label>API Key（仅引用，不落明文展示）</label>
              <input className="input" name="api_key" type="password" defaultValue={editing.api_key} placeholder="sk-…" />
              <div className="hint">演示模型无需 Key；接入真实模型时在此填写，平台引用凭据、不落明文。</div>
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