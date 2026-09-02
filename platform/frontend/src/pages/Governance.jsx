import { useState } from "react";

const ROLES = ["平台管理员", "空间管理员", "开发者", "普通成员", "只读访客"];
const PERMS = [
  ["view_runs", "查看运行"],
  ["join_session", "参与会话"],
  ["config_agents", "配置智能体/编排"],
  ["publish", "发布配置"],
  ["approve", "审批"],
  ["admin", "平台管理"],
];
const MATRIX = {
  平台管理员: [1, 1, 1, 1, 1, 1],
  空间管理员: [1, 1, 1, 1, 1, 0],
  开发者: [1, 1, 1, 2, 0, 0],
  普通成员: [1, 1, 0, 0, 0, 0],
  只读访客: [1, 0, 0, 0, 0, 0],
};

export default function Governance() {
  const [matrix, setMatrix] = useState({ ...MATRIX });

  const toggle = (role, idx) => {
    const next = { ...matrix, [role]: [...matrix[role]] };
    next[role][idx] = next[role][idx] === 2 ? 0 : next[role][idx] === 1 ? 2 : 1;
    setMatrix(next);
  };

  const cell = (v) =>
    v === 2 ? <span className="tag warn">需审批</span> : v === 1 ? <span className="tag ok">✓</span> : <span style={{ color: "var(--dim)" }}>—</span>;

  return (
    <div>
      <div className="panel-h"><h3>企业治理 · 权限矩阵（RBAC）</h3></div>
      <div className="card" style={{ padding: 8 }}>
        <table className="tbl">
          <thead>
            <tr>
              <th>角色</th>
              {PERMS.map((p) => <th key={p[0]}>{p[1]}</th>)}
            </tr>
          </thead>
          <tbody>
            {ROLES.map((r) => (
              <tr key={r}>
                <td><b>{r}</b></td>
                {matrix[r].map((v, i) => (
                  <td key={i} onClick={() => toggle(r, i)} style={{ cursor: "pointer", minWidth: 72 }}>{cell(v)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="grid2" style={{ marginTop: 16 }}>
        <div className="card">
          <h3 style={{ fontSize: 14, marginBottom: 10 }}>组织与空间</h3>
          <div className="list-item">
            <div><div className="t">默认企业空间</div><div className="s">团队成员 5 人 · 智能体团队 3 个 · 项目空间隔离已开启</div></div>
            <button className="btn sm">成员管理</button>
          </div>
          <div className="list-item">
            <div><div className="t">审批流策略</div><div className="s">高风险工具（发送邮件 / 发布文档）默认触发人工审批；可配置免审白名单</div></div>
            <button className="btn sm">配置</button>
          </div>
        </div>
        <div className="card">
          <h3 style={{ fontSize: 14, marginBottom: 10 }}>配额与审计</h3>
          <div className="list-item">
            <div><div className="t">用量与成本</div><div className="s">本月运行 0 次 · 预估成本 ¥0 · 模型调用额度：未配置</div></div>
            <button className="btn sm">查看</button>
          </div>
          <div className="list-item">
            <div><div className="t">审计日志</div><div className="s">记录配置发布、审批决策、运行发起等关键操作（平台自建层）</div></div>
            <button className="btn sm">导出</button>
          </div>
        </div>
      </div>
    </div>
  );
}