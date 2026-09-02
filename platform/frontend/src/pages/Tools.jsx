import { useEffect, useMemo, useState } from "react";
import { get } from "../api.js";

const STATUS = {
  ready: { label: "就绪 · 可直接调用", cls: "ok" },
  needs_key: { label: "需配置 API Key", cls: "warn" },
  stub: { label: "占位 · 未接入", cls: "neutral" },
};

export default function Tools({ onNav }) {
  const [tools, setTools] = useState([]);
  const [cat, setCat] = useState("全部");
  const [kw, setKw] = useState("");

  useEffect(() => {
    get("/api/tools").then((r) => setTools(r.tools || [])).catch(() => {});
  }, []);

  const cats = useMemo(() => ["全部", ...new Set(tools.map((t) => t.category))], [tools]);
  const filtered = useMemo(() => tools.filter((t) => {
    if (cat !== "全部" && t.category !== cat) return false;
    if (kw && !(t.name + t.description).toLowerCase().includes(kw.toLowerCase())) return false;
    return true;
  }), [tools, cat, kw]);

  const counts = useMemo(() => {
    const c = { ready: 0, needs_key: 0, stub: 0 };
    tools.forEach((t) => { if (c[t.status] != null) c[t.status]++; });
    return c;
  }, [tools]);

  return (
    <div>
      <div className="panel-h" style={{ flexWrap: "wrap", gap: 10 }}>
        <h3>工具目录 · {tools.length} 个（CrewAI 官方工具适配层 + 平台内置）</h3>
        <button className="btn" onClick={() => onNav("agents")}>绑定到智能体 →</button>
      </div>

      <div className="kpis" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(120px,1fr))", marginBottom: 14 }}>
        <div className="kpi"><div className="lb">工具总数</div><div className="vl b">{tools.length}</div></div>
        <div className="kpi"><div className="lb">就绪可用</div><div className="vl g">{counts.ready}</div></div>
        <div className="kpi"><div className="lb">需配密钥</div><div className="vl" style={{ color: "var(--warn)" }}>{counts.needs_key}</div></div>
        <div className="kpi"><div className="lb">占位未接入</div><div className="vl" style={{ color: "var(--dim)" }}>{counts.stub}</div></div>
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
        <input className="input" style={{ maxWidth: 280 }} placeholder="搜索工具名 / 描述…" value={kw} onChange={(e) => setKw(e.target.value)} />
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {cats.map((c) => (
            <button key={c} className={"btn sm" + (cat === c ? " pri" : " ghost")} onClick={() => setCat(c)}>{c}</button>
          ))}
        </div>
      </div>

      <div className="cards">
        {filtered.map((t) => {
          const st = STATUS[t.status] || STATUS.stub;
          return (
            <div className="ag-card" key={t.name} style={{ opacity: t.status === "stub" ? .78 : 1 }}>
              <div className="hd">
                <div className="nm"><span className="em">🛠</span>{t.name}</div>
                <span className={"tag " + st.cls}>{st.label}</span>
              </div>
              <div className="role">{t.description}</div>
              <div className="tools-line">
                {(t.args || []).map((a) => (
                  <span key={a.name} className="tl">{a.name}{a.required ? "*" : ""} : {a.type || "str"}</span>
                ))}
                {!(t.args || []).length && <span className="tl neutral">无参数</span>}
              </div>
              <div className="ft">
                <span className="tl neutral" style={{ background: "var(--ring)", color: "var(--brand)" }}>
                  {t.source === "crewai-tools" ? "CrewAI 官方" : "平台内置"}
                </span>
                <span style={{ fontSize: 11.5, color: t.status === "needs_key" ? "var(--warn)" : "var(--dim)" }}>
                  {t.status === "needs_key" ? "需密钥：如配置后自动升级为就绪" : (t.status === "stub" ? (t.note || "未接入") : "可在智能体配置中勾选绑定")}
                </span>
              </div>
            </div>
          );
        })}
        {!filtered.length && <div className="empty" style={{ gridColumn: "1/-1" }}>无匹配工具</div>}
      </div>
    </div>
  );
}