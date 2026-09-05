import { useEffect, useState } from "react";
import { get } from "../api.js";

// 趋势微线（设计稿：KPI 卡右上角 sparkline）
function Spark({ pts, color }) {
  const d = pts.map((p, i) => `${i ? "L" : "M"}${p[0]},${p[1]}`).join(" ");
  return (
    <svg width="60" height="26" viewBox="0 0 60 26" fill="none" stroke={color} strokeWidth="1.8"
      strokeLinecap="round" style={{ position: "absolute", right: 8, bottom: 10, opacity: .8 }}>
      <polyline points={d} />
    </svg>
  );
}

function Kpi({ lb, vl, cls, delta, color, pts }) {
  return (
    <div className="kpi">
      <div className="lb">{lb}</div>
      <div className={"vl " + (cls || "")}>{vl}{delta && <span className="delta">▲ {delta}</span>}</div>
      {pts && <Spark pts={pts} color={color} />}
    </div>
  );
}

export default function Dashboard({ onNav }) {
  const [s, setS] = useState(null);
  const [apps, setApps] = useState([]);

  useEffect(() => {
    const load = () => get("/api/summary").then(setS).catch(() => {});
    load();
    const t = setInterval(load, 8000);
    get("/api/platform/apps").then((r) => setApps(r.apps || [])).catch(() => {});
    return () => clearInterval(t);
  }, []);

  const runs = s?.recent_runs || [];

  return (
    <div>
      {/* KPI：数字 + 涨幅胶囊 + 趋势微线 */}
      <div className="kpis" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))" }}>
        <Kpi lb="智能体总数" vl={s ? s.agents : "–"} cls="b" delta="2"
          color="#3A6BC4" pts={[[0,20],[10,16],[20,18],[30,11],[40,13],[50,7],[60,9]]} />
        <Kpi lb="协作编排" vl={s ? s.crews : "–"} cls="b" delta="1"
          color="#3A6BC4" pts={[[0,18],[10,20],[20,14],[30,15],[40,10],[50,11],[60,6]]} />
        <Kpi lb="工具总数" vl={s ? s.tools : "–"} cls="b"
          color="#3A6BC4" pts={[[0,16],[10,18],[20,17],[30,15],[40,16],[50,14],[60,13]]} />
        <Kpi lb="运行次数" vl={s ? s.runs : "–"} cls="g" delta="12%"
          color="#F26B3A" pts={[[0,22],[10,18],[20,19],[30,13],[40,12],[50,8],[60,5]]} />
        <Kpi lb="待审批" vl={s ? s.pending_approvals : "–"} cls="w"
          color="#C2761B" pts={[[0,8],[10,10],[20,9],[30,14],[40,13],[50,19],[60,18]]} />
      </div>

      <div className="grid2" style={{ gridTemplateColumns: "2fr 1fr" }}>
        {/* 左：运行时间线（四段式：状态点 → 编排 → 输入摘要 → 计量） */}
        <div className="card">
          <div className="panel-h"><h3>运行观测 · {runs.length} 条</h3><button className="btn ghost sm" onClick={() => onNav("traces")}>查看全部 →</button></div>
          {runs.map((t) => {
            const status = (t.status || "").includes("fail") ? "err" : (t.status === "running" ? "run" : "ok");
            return (
              <div className="run-item" key={t.id}>
                <span className={"st " + status} />
                <div className="nm">
                  <b>⛓ {t.crew_name || t.crew_id}</b>
                  <span>{String(t.input || "").slice(0, 40)}{t.started_at ? ` · ${t.started_at}` : ""}</span>
                </div>
                <span className="du">{t.task_count != null ? `${t.task_count} 任务` : ""}</span>
                <span className={"tag " + (status === "err" ? "danger" : status === "run" ? "accent" : "ok")}>
                  {status === "err" ? "失败" : status === "run" ? "运行中" : "完成"}
                </span>
              </div>
            );
          })}
          {s && !runs.length && <div className="empty">暂无运行记录</div>}
        </div>

        {/* 右：资产速览 */}
        <div className="card">
          <div className="panel-h"><h3>资产速览</h3></div>
          <div className="run-item"><span className="st ok" /><div className="nm"><b>智能体</b><span>已就绪，可绑定工具与记忆</span></div><span className="tag brand">{s?.agents ?? "–"}</span></div>
          <div className="run-item"><span className="st ok" /><div className="nm"><b>协作编排</b><span>可运行于工作台</span></div><span className="tag brand">{s?.crews ?? "–"}</span></div>
          <div className="run-item"><span className="st ok" /><div className="nm"><b>工具目录</b><span>CrewAI 官方 + 平台内置</span></div><span className="tag brand">{s?.tools ?? "–"}</span></div>
          <div className="run-item"><span className="st ok" /><div className="nm"><b>托管应用</b><span>应用运行时装载</span></div><span className="tag brand">{apps.length || "–"}</span></div>
          <div className="panel-h" style={{ marginTop: 12 }}><h3>运行健康</h3></div>
          <div className="health-item"><div className="hn">成功运行</div><div className="bar"><i style={{ width: "84%" }} /></div><span className="pct">84%</span></div>
          <div className="health-item"><div className="hn">审批通过率</div><div className="bar"><i style={{ width: "92%" }} /></div><span className="pct">92%</span></div>
          <div className="health-item"><div className="hn">工具调用</div><div className="bar"><i style={{ width: "71%" }} /></div><span className="pct">71%</span></div>
        </div>
      </div>

      {/* 可运行编排 */}
      <div className="panel-h" style={{ marginTop: 16 }}><h3>可运行的编排</h3><button className="btn ghost sm" onClick={() => onNav("workbench")}>去工作台 →</button></div>
      <div className="cards">
        {(s?.runnable_crews || []).map((c) => (
          <div className="crew-card" key={c.id}>
            <div className="t">◈ {c.name}</div>
            <div className="d">{c.description || "运行协作编排"}</div>
            <div className="ft">
              <span className="tag ok">● 就绪</span>
              <button className="btn sm pri" style={{ marginLeft: "auto" }} onClick={() => onNav("workbench")}>运行</button>
            </div>
          </div>
        ))}
        {s && !(s.runnable_crews || []).length && <div className="empty" style={{ gridColumn: "1/-1" }}>暂无编排</div>}
      </div>

      {/* 架构速览 */}
      <div className="card" style={{ marginTop: 16 }}>
        <div className="panel-h"><h3>架构速览</h3></div>
        <table className="tbl">
          <tbody>
            <tr><td style={{ width: 150 }}><b>前端</b></td><td>React + Vite 单页应用（本平台）· 经 Vite /api 代理连接后端网关</td></tr>
            <tr><td><b>后端网关</b></td><td>FastAPI：配置 CRUD / SSE 流式运行 / 审批决策 / 运行观测，复用 agent_framework 底座</td></tr>
            <tr><td><b>执行引擎</b></td><td>agent_framework（CrewAI 兼容）：Tool / Agent / Task / Crew · 审批拦截器 ApprovalGate · 数据域 DataDomain（JSON 落盘）</td></tr>
            <tr><td><b>LLM</b></td><td>演示模型（无需 Key，确定性流式）+ 真实提供商（OpenAI/Anthropic/…，走 litellm）</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}