import { useEffect, useState } from "react";
import { get } from "../api.js";

export default function Tools({ onNav }) {
  const [tools, setTools] = useState([]);

  useEffect(() => {
    get("/api/tools").then((r) => setTools(r.tools || [])).catch(() => {});
  }, []);

  return (
    <div>
      <div className="panel-h">
        <h3>工具目录（对应 CrewAI BaseTool / 100+ 现成工具子集）· {tools.length} 个</h3>
        <button className="btn" onClick={() => onNav("agents")}>绑定到智能体 →</button>
      </div>
      <div className="cards">
        {tools.map((t) => (
          <div className="ag-card" key={t.name}>
            <div className="hd">
              <div className="nm"><span className="em">🛠</span>{t.name}
                {t.requires_approval ? <span className="tag danger">需审批</span> : <span className="tag ok">直接执行</span>}
              </div>
            </div>
            <div className="role">{t.description}</div>
            <div className="tools-line">
              {(t.args || []).map((a) => (
                <span key={a.name} className="tl">{a.name}{a.required ? "*" : ""} : {a.type || "str"}</span>
              ))}
              {!(t.args || []).length && <span className="tl neutral">无参数</span>}
            </div>
            <div className="ft">
              <span style={{ fontSize: 12, color: "var(--dim)" }}>
                {t.requires_approval ? "调用时触发强制审批（人工介入）" : "在智能体配置中勾选后由智能体调用"}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}