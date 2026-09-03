import { Fragment, useEffect, useState } from "react";
import { get } from "./api.js";
import Dashboard from "./pages/Dashboard.jsx";
import Workbench from "./pages/Workbench.jsx";
import Agents from "./pages/Agents.jsx";
import Crews from "./pages/Crews.jsx";
import Flows from "./pages/Flows.jsx";
import Tools from "./pages/Tools.jsx";
import Knowledge from "./pages/Knowledge.jsx";
import Memory from "./pages/Memory.jsx";
import Providers from "./pages/Providers.jsx";
import Traces from "./pages/Traces.jsx";
import Governance from "./pages/Governance.jsx";
import Apps from "./pages/Apps.jsx";

const I = ({ d, w = 16, h = 16, stroke = 1.7 }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke}
    strokeLinecap="round" strokeLinejoin="round" style={{ width: w, height: h }}>
    {d}
  </svg>
);
const ICONS = {
  dashboard: <I d={<><rect x="3" y="3" width="8" height="8" rx="2" /><rect x="13" y="3" width="8" height="8" rx="2" /><rect x="3" y="13" width="8" height="8" rx="2" /><rect x="13" y="13" width="8" height="8" rx="2" /></>} />,
  workbench: <I d={<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />} />,
  agents: <I d={<><path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" /><path d="M19 21a7 7 0 0 0-14 0" /></>} />,
  crews: <I d={<><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></>} />,
  flows: <I d={<><rect x="3" y="3" width="6" height="6" rx="1.5" /><rect x="15" y="15" width="6" height="6" rx="1.5" /><path d="M9 6h6a3 3 0 0 1 3 3v6" /></>} />,
  apps: <I d={<><rect x="3" y="3" width="7" height="9" rx="2" /><rect x="14" y="3" width="7" height="5" rx="2" /><rect x="14" y="12" width="7" height="9" rx="2" /><rect x="3" y="16" width="7" height="5" rx="2" /></>} />,
  tools: <I d={<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />} />,
  knowledge: <I d={<><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></>} />,
  memory: <I d={<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 3" /></>} />,
  providers: <I d={<><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="4" /></>} />,
  traces: <I d={<><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></>} />,
  governance: <I d={<><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></>} />,
};

const NAV = [
  { id: "dashboard", label: "平台概览", group: "总览" },
  { id: "workbench", label: "协作工作台", group: "协作核心" },
  { id: "agents", label: "智能体配置", group: "协作核心" },
  { id: "crews", label: "协作编排配置", group: "协作核心" },
  { id: "flows", label: "流程编排 Flows", group: "协作核心" },
  { id: "apps", label: "应用管理", group: "协作核心" },
  { id: "tools", label: "工具库", group: "资产与能力" },
  { id: "knowledge", label: "知识库", group: "资产与能力" },
  { id: "memory", label: "记忆管理", group: "资产与能力" },
  { id: "providers", label: "LLM 提供商", group: "平台支撑" },
  { id: "traces", label: "运行观测", group: "平台支撑" },
  { id: "governance", label: "企业治理", group: "平台支撑" },
];

const PAGES = {
  dashboard: Dashboard, workbench: Workbench, agents: Agents, crews: Crews,
  flows: Flows, apps: Apps,
  tools: Tools, knowledge: Knowledge, memory: Memory,
  providers: Providers, traces: Traces, governance: Governance,
};

export default function App() {
  const [page, setPage] = useState("dashboard");
  const [health, setHealth] = useState(null);
  useEffect(() => {
    get("/api/health").then((h) => setHealth(h)).catch(() => setHealth(null));
    const t = setInterval(
      () => get("/api/health").then(setHealth).catch(() => {}),
      15000
    );
    return () => clearInterval(t);
  }, []);

  const Page = PAGES[page];
  const cur = NAV.find((n) => n.id === page);

  return (
    <div className="app">
      {/* 最左侧图标导轨（唯一导航：分组分隔 + 悬浮标签） */}
      <aside className="rail">
        <div className="rmark" title="企业 AI 协作办公平台 · CrewAI 底座">C</div>
        <div className="rail-items">
          {[...new Set(NAV.map((n) => n.group))].map((g, gi) => (
            <Fragment key={g}>
              {gi > 0 && <div className="rail-gap" />}
              {NAV.filter((n) => n.group === g).map((n) => (
                <div key={n.id} className={"rail-item" + (page === n.id ? " active" : "")}
                  data-label={n.label} onClick={() => setPage(n.id)}>
                  {ICONS[n.id]}
                </div>
              ))}
            </Fragment>
          ))}
        </div>
        <div className="rail-foot">
          <div className="rail-av">🧑‍💼</div>
          <span className={"rail-dot" + (health ? " on" : "")} title={health ? "网关在线" : "网关离线"} />
        </div>
      </aside>

      {/* 主区 */}
      <div className="main">
        <header className="topbar">
          <div className="crumb">首页 / <b>{cur.label}</b></div>
          <div className="search"><span>⌕</span><span>搜索智能体、任务、文档…</span><span className="kbd">⌘K</span></div>
          <div className="sp" style={{ flex: 1 }} />
          <div className="top-user">
            <span className="ai-chip"><span className="pulse" />{health ? "AI 协作在线" : "网关离线"}</span>
            <span className="tenant">🏢 明远科技 · demo</span>
            <div className="bell">🔔</div>
            <div className="av">琳</div>
          </div>
        </header>
        <div className="content" style={{ padding: page === "workbench" ? 0 : 24 }}>
          <Page onNav={setPage} />
        </div>
      </div>
    </div>
  );
}