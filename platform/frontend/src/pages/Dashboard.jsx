import { useEffect, useState } from "react";
import { get } from "../api.js";

export default function Dashboard({ onNav }) {
  const [s, setS] = useState(null);

  useEffect(() => {
    const load = () => get("/api/summary").then(setS).catch(() => {});
    load();
    const t = setInterval(load, 8000);
    return () => clearInterval(t);
  }, []);

  return (
    <div>
      <div className="kpis">
        <div className="kpi"><div className="lb">智能体</div><div className="vl b">{s ? s.agents : "–"}</div></div>
        <div className="kpi"><div className="lb">协作编排</div><div className="vl">{s ? s.crews : "–"}</div></div>
        <div className="kpi"><div className="lb">工具</div><div className="vl">{s ? s.tools : "–"}</div></div>
        <div className="kpi"><div className="lb">运行次数</div><div className="vl g">{s ? s.runs : "–"}</div></div>
        <div className="kpi"><div className="lb">待审批</div><div className="vl r">{s ? s.pending_approvals : "–"}</div></div>
      </div>

      <div className="grid2">
        <div className="card">
          <div className="panel-h"><h3>最近的运行</h3><button className="btn ghost sm" onClick={() => onNav("traces")}>全部 →</button></div>
          {(s?.recent_runs || []).map((t) => (
            <div className="list-item" key={t.id}>
              <div>
                <div className="t">⛓ {t.crew_name} <span className="tag ok">成功</span></div>
                <div className="s">{t.input} · {t.started_at}</div>
              </div>
              <span style={{ fontSize: 11, color: "var(--dim)" }}>{t.task_count} 个任务</span>
            </div>
          ))}
          {s && !(s.recent_runs || []).length && <div className="empty">暂无运行记录</div>}
        </div>
        <div className="card">
          <div className="panel-h"><h3>可运行的编排</h3><button className="btn ghost sm" onClick={() => onNav("workbench")}>去工作台 →</button></div>
          {(s?.runnable_crews || []).map((c) => (
            <div className="list-item" key={c.id}>
              <div><div className="t">⛓ {c.name}</div><div className="s">{c.description}</div></div>
              <button className="btn sm" onClick={() => onNav("workbench")}>运行</button>
            </div>
          ))}
          {s && !(s.runnable_crews || []).length && <div className="empty">暂无编排</div>}
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="panel-h"><h3>架构速览</h3></div>
        <table className="tbl">
          <tbody>
            <tr><td style={{ width: 170 }}><b>前端</b></td><td>React + Vite 单页应用（本平台）· 经 Vite /api 代理连接后端网关</td></tr>
            <tr><td><b>后端网关</b></td><td>FastAPI：配置 CRUD / SSE 流式运行 / 审批决策 / 运行观测，复用 agent_framework 底座</td></tr>
            <tr><td><b>执行引擎</b></td><td>agent_framework（CrewAI 兼容）：Tool / Agent / Task / Crew · 审批拦截器 ApprovalGate · 数据域 DataDomain（JSON 落盘）</td></tr>
            <tr><td><b>LLM</b></td><td>演示模型（无需 Key，确定性流式）+ 真实提供商（OpenAI/Anthropic/…，走 litellm）</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}