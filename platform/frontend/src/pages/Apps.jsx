import { useEffect, useState } from "react";
import { get } from "../api.js";

export default function Apps() {
  const [apps, setApps] = useState([]);
  const [errors, setErrors] = useState([]);

  useEffect(() => {
    get("/api/apps").then((r) => {
      setApps(r.apps || []);
      setErrors(r.errors || []);
    }).catch(() => {});
  }, []);

  return (
    <div>
      <div className="panel-h">
        <h3>应用管理（应用运行时）· {apps.length} 个</h3>
        <span className="tag info">manifest 即注册</span>
      </div>
      {errors.length > 0 && (
        <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 10, padding: "8px 12px", fontSize: 12.5, color: "#b91c1c", marginBottom: 12 }}>
          ⚠ 加载异常：{errors.join("；")}
        </div>
      )}
      {apps.length ? (
        <div className="cards">
          {apps.map((a, idx) => {
            const grades = [
              "linear-gradient(120deg,#1E3E7E,#3A6BC4 55%,#62B3E0)",
              "linear-gradient(120deg,#C8532B,#F26B3A 60%,#F5A96B)",
              "linear-gradient(120deg,#1F7A52,#2E9E6B 55%,#6FC79B)",
              "linear-gradient(120deg,#1E546E,#2E7FA0 55%,#62B9C9)",
            ];
            return (
              <div className="ag-card" key={a.app_id} style={{ padding: 0, overflow: "hidden", gap: 0 }}>
                <div className="app-cover" style={{ background: grades[idx % grades.length] }}>
                  <div className="aic">▦</div>
                  <div><b>{a.name}</b><small>{a.app_id} · v{a.version}</small></div>
                  <span className="tag">{a.enabled ? "已上线" : "已停用"}</span>
                </div>
                <div style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
                  <div className="role">{a.description}</div>
                  {a.flow_ref && a.flow_bound === false && <span className="tag warn" style={{ alignSelf: "flex-start" }}>流程未绑定</span>}
                  <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                    {(a.endpoints || []).map((e) => <span key={e.id} className="tl neutral">{e.id} · {e.title}</span>)}
                  </div>
                  <div style={{ fontSize: 11.5, color: "var(--dim)" }}>
                    数据域：{(a.data_models || []).join("、") || "未声明"}{a.flow_ref ? ` · 流程 ${a.flow_ref}` : ""}
                    {a.crew_ref ? ` · 编排 ${a.crew_ref}` : ""}
                  </div>
                  <div className="tools-line">
                    {(a.capabilities || []).map((c) => (
                      <span key={c.name} className="tl" title={c.real ? "真实能力" : "应用自管/演示"}>{c.name}{c.platform ? (c.real ? "" : "（演示）") : ""}</span>
                    ))}
                  </div>
                  <div className="ft">
                    <span style={{ fontSize: 11.5, color: "var(--danger)" }}>
                      强制审批：{(a.approval_required || []).join("、") || "无"}
                    </span>
                    <a className="btn green sm" href={`${a.entry?.url || "#"}/demo-store`} target="_blank" rel="noreferrer">打开应用 →</a>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : <div className="card"><div className="empty">暂无已注册应用。<br />将应用 manifest 放入后端 <code>apps/manifests/</code> 目录后刷新即可（manifest 即注册）。</div></div>}
      <div style={{ fontSize: 12, color: "var(--dim)", marginTop: 14 }}>
        统一入口：<code>/app/&lt;app_id&gt;/&lt;tenant_id&gt;</code> · 每个租户独立数据域 · 接入三步：manifest → H5 → SDK
      </div>
    </div>
  );
}