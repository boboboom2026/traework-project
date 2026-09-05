import { useEffect, useState } from "react";
import { get } from "../api.js";

export default function Traces() {
  const [traces, setTraces] = useState([]);
  const [detail, setDetail] = useState(null);

  useEffect(() => {
    get("/api/traces").then((r) => setTraces(r.traces || [])).catch(() => {});
  }, []);

  return (
    <div>
      <div className="panel-h">
        <h3>运行观测（Telemetry / Trace · 事件总线）· {traces.length} 次</h3>
      </div>
      <table className="tbl">
        <thead>
          <tr><th>运行 ID</th><th>编排</th><th>输入</th><th>任务数</th><th>状态</th><th>开始时间</th><th></th></tr>
        </thead>
        <tbody>
          {traces.map((t) => (
            <tr key={t.id}>
              <td style={{ fontSize: 12 }}>{t.id}</td>
              <td><b>{t.crew_name}</b></td>
              <td style={{ maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.input}</td>
              <td>{t.task_count}</td>
              <td><span className="tag ok">成功</span></td>
              <td style={{ fontSize: 12, color: "var(--muted)" }}>{t.started_at}</td>
              <td><button className="btn ghost sm" onClick={() => setDetail(t)}>详情</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      {!traces.length && <div className="card"><div className="empty">暂无运行记录。去工作台发起一次协作运行后，这里会展示 Trace。</div></div>}

      {detail && (
        <div className="modal-mask" onClick={() => setDetail(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>运行详情 · {detail.crew_name}</h2>
            <div className="field"><label>运行 ID</label><div style={{ fontSize: 12.5 }}>{detail.id}</div></div>
            <div className="field"><label>输入</label><div style={{ fontSize: 12.5 }}>{detail.input}</div></div>
            <div className="field"><label>开始时间 / 状态</label>
              <div style={{ fontSize: 12.5 }}>{detail.started_at} · <span className="tag ok">成功</span></div></div>
            <div className="field"><label>执行结果</label>
              <div style={{ whiteSpace: "pre-wrap", fontSize: 12.5, lineHeight: 1.7, background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 10, padding: 12, maxHeight: 280, overflow: "auto" }}>{detail.result}</div></div>
            <div className="ft"><button className="btn" onClick={() => setDetail(null)}>关闭</button></div>
          </div>
        </div>
      )}
    </div>
  );
}