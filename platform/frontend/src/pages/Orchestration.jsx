import { useState } from "react";
import Crews from "./Crews.jsx";
import Flows from "./Flows.jsx";

// 协作编排：同一编排引擎的两种形态（任务型 Crew 协作 / 流程型 Flows 状态机）
export default function Orchestration({ onNav }) {
  const [tab, setTab] = useState("tasks");
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
        <button className={"btn sm" + (tab === "tasks" ? " pri" : " ghost")} onClick={() => setTab("tasks")}>任务型 · Crew 协作</button>
        <button className={"btn sm" + (tab === "flows" ? " pri" : " ghost")} onClick={() => setTab("flows")}>流程型 · Flows 状态机</button>
        <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--dim)" }}>
          同一编排引擎 · 两种形态：任务动态协作 ↔ 事件驱动确定性流程
        </span>
      </div>
      {tab === "tasks" ? <Crews onNav={onNav} /> : <Flows />}
    </div>
  );
}