import { useEffect, useState } from "react";
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

const NAV = [
  { id: "dashboard", label: "平台概览", icon: "◫", group: "总览" },
  { id: "workbench", label: "协作工作台", icon: "☰", group: "协作核心" },
  { id: "agents", label: "智能体配置", icon: "✧", group: "协作核心" },
  { id: "crews", label: "协作编排配置", icon: "⛓", group: "协作核心" },
  { id: "flows", label: "流程编排 Flows", icon: "◈", group: "协作核心" },
  { id: "tools", label: "工具库", icon: "🛠", group: "资产与能力" },
  { id: "knowledge", label: "知识库", icon: "▤", group: "资产与能力" },
  { id: "memory", label: "记忆管理", icon: "◔", group: "资产与能力" },
  { id: "providers", label: "LLM 提供商", icon: "◉", group: "平台支撑" },
  { id: "traces", label: "运行观测", icon: "▦", group: "平台支撑" },
  { id: "governance", label: "企业治理", icon: "♢", group: "平台支撑" },
];

const PAGES = {
  dashboard: Dashboard, workbench: Workbench, agents: Agents, crews: Crews,
  flows: Flows,
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
      <aside className="sidebar">
        <div className="brand">
          <div className="lg">🤖</div>
          <div>
            <h1>企业 AI 协作办公平台</h1>
            <small>CrewAI 多智能体底座</small>
          </div>
        </div>
        <nav className="nav">
          {[...new Set(NAV.map((n) => n.group))].map((g) => (
            <div key={g}>
              <div className="grp">{g}</div>
              {NAV.filter((n) => n.group === g).map((n) => (
                <a
                  key={n.id}
                  className={page === n.id ? "active" : ""}
                  onClick={() => setPage(n.id)}
                >
                  <span className="ic">{n.icon}</span>
                  {n.label}
                </a>
              ))}
            </div>
          ))}
        </nav>
        <div className="side-foot">
          <div className="st">
            <span style={{ color: health ? "var(--ok)" : "var(--danger)" }}>●</span>
            {health ? "后端网关运行中" : "后端网关不可达"}
          </div>
          <div className="st" style={{ marginTop: 4 }}>agent_framework · v2.1</div>
        </div>
      </aside>
      <div className="main">
        <header className="topbar">
          <div className="pg">
            {cur.label}
            <small>{PAGE_SUB[cur.id]}</small>
          </div>
          <div className="top-user">
            <span>演示工作区</span>
            <div className="av">🧑‍💼</div>
          </div>
        </header>
        <div className="content" style={{ padding: page === "workbench" ? 0 : 22 }}>
          <Page onNav={setPage} />
        </div>
      </div>
    </div>
  );
}

const PAGE_SUB = {
  dashboard: "平台运行总览与统计",
  workbench: "群聊式多智能体对话协作（群 / 任务）",
  agents: "定义身份、目标、模型与可用工具",
  crews: "组装智能体与任务，定义协作流程与运行输入",
  flows: "事件驱动工作流：顺序步骤 + 条件分支，逐步推进",
  tools: "浏览与启用 CrewAI 工具能力",
  knowledge: "企业文档与知识资产（RAG）",
  memory: "作用域记忆的浏览与重置",
  providers: "集中管理模型接入与凭据",
  traces: "运行记录、事件时间线与用量",
  governance: "组织 / 角色 / 权限矩阵",
};