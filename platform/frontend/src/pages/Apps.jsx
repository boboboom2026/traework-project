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
          {apps.map((a) => (
            <div className="ag-card" key={a.app_id}>
              <div className="hd">
                <div className="nm"><span className="em">▦</span>{a.name}
                  <span className="tag neutral">{a.app_id}</span>
                  <span className={"tag " + (a.enabled ? "ok" : "warn")}>{a.enabled ? "已启用" : "已停用"}</span>
                  {!a.flow_bound && a.flow_ref && <span className="tag warn">流程未绑定</span>}
                </div>
              </div>
              <div className="role">{a.description} · v{a.version}</div>
              <div style={{ fontSize: 12, color: "var(--muted)", margin: "6px 0" }}>
                端：
                {(a.endpoints || []).map((e) => <span key={e.id} className="tl">{e.id} · {e.title}</span>)}
                {!(a.endpoints || []).length && <span className="tl neutral">无端</span>}
              </div>
              <div style={{ fontSize: 12, color: "var(--muted)", margin: "4px 0" }}>
                数据域：{(a.data_models || []).join("、") || "未声明"}
                 · 绑定：{a.crew_ref ? `编排 ${a.crew_ref}` : ""}{a.flow_ref ? `流程 ${a.flow_ref}` : ""}
              </div>
              <div className="tools-line">
                {(a.capabilities || []).map((c) => (
                  <span key={c.name} className="tl" title={c.real ? "真实能力" : "应用自管/演示"}>
                    {c.name}{c.platform ? (c.real ? "" : "（演示）") : ""}
                  </span>
                ))}
              </div>
              <div className="ft">
                <span style={{ fontSize: 12, color: "var(--danger)" }}>
                  强制审批：{(a.approval_required || []).join("、") || "无"}
                </span>
                <a className="btn green sm" href={`${a.entry?.url || "#"}/demo-store`} target="_blank" rel="noreferrer">打开应用 →</a>
              </div>
            </div>
          ))}
        </div>
      ) : <div className="card"><div className="empty">暂无已注册应用。<br />将应用 manifest 放入后端 <code>apps/manifests/</code> 目录后刷新即可（manifest 即注册）。</div></div>}
      <div style={{ fontSize: 12, color: "var(--dim)", marginTop: 14 }}>
        统一入口：<code>/app/&lt;app_id&gt;/&lt;tenant_id&gt;</code> · 每个租户独立数据域 · 接入三步：manifest → H5 → SDK
      </div>
    </div>
  );
}