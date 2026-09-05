import { useEffect, useState } from "react";
import { get, post } from "../api.js";

export default function Memory() {
  const [records, setRecords] = useState([]);
  const [filter, setFilter] = useState("all");

  const load = () => get("/api/memory").then((r) => setRecords(r.records || [])).catch(() => {});
  useEffect(() => { load(); }, []);

  const scopes = [...new Set(records.map((r) => r.scope || "global"))];
  const shown = filter === "all" ? records : records.filter((r) => (r.scope || "global") === filter);

  return (
    <div>
      <div className="panel-h">
        <h3>记忆管理（Memory · 作用域）· {records.length} 条</h3>
        <div>
          <select className="input" style={{ width: 140, marginRight: 8 }} value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="all">全部作用域</option>
            {scopes.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <button className="btn danger" onClick={() => { if (confirm("确认重置全部记忆？")) post("/api/memory/reset", {}).then(load); }}>一键重置（reset_memories）</button>
        </div>
      </div>
      {shown.slice(0, 60).map((r, i) => (
        <div className="list-item" key={r.id || i}>
          <div>
            <div className="t"><span className="tag info">{r.scope || "global"}</span> {r.key || r.title || "记忆片段"} <span className="tag ok">{"已读"}</span></div>
            <div className="s">{r.value || r.content || "（内容省略）"}</div>
          </div>
        </div>
      ))}
      {!shown.length && (
        <div className="card">
          <div className="empty">暂无记忆记录。<br />协作运行时智能体会把关键上下文写入记忆（scope 化），可在此浏览与重置（对齐 CLI 的 reset_memories）。</div>
        </div>
      )}
    </div>
  );
}