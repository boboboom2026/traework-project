# 多智能体 CrewAI 项目 v2.0

以 **CrewAI 兼容的多智能体底座**（`agent_framework`）为核心，业务系统以**托管应用**的形式挂载到底座上运行。

当前内置托管应用：**点餐系统（menu-ordering v2.0）** —— 覆盖「用户点餐 → 智能体下单（强制审批）→ 商家审批 → 核价/验库存/扣库存/生成订单 → 订单状态机流转」的完整业务闭环。

## 架构

```
┌─────────────────────────── 多智能体底座（CrewAI 兼容） ───────────────────────────┐
│  agent_framework：  Tool(工具) · Agent(智能体) · Crew/Task(编排)                    │
│  ┌───────────── 审批拦截器 ApprovalGate ─────────────┐                             │
│  │ 需确认的工具 → 签发审批(pending) → 阻塞等待商家决策 │  → 通过：执行真实工具        │
│  │                 （wait_for_decision 300s 超时）    │  → 拒绝/超时：拦截不执行     │
│  └───────────────────────────────────────────────────┘                             │
│  数据域 DataDomain（JSON 落盘 · 线程安全） · CrewExecutor（确定性执行器）            │
└─────────────────────────────────────────────────────────────────────────────────────┘
                          │ 以「应用」形式挂载
┌─────────────────── 托管应用：点餐系统 menu-ordering ───────────────────┐
│  数据域：menu / orders / approvals                                      │
│  工具：query_menu（只读） · order_process（下单，声明“有权限+需确认”→强制审批）│
│  智能体：能力网关 · 订单处理专员                                         │
│  前端：index.html（用户端） · merchant.html（商家端） · 管理页 /platform/manage.html │
└────────────────────────────────────────────────────────────────────────┘
```

## 目录结构

```
platform/backend/
├── main.py                              # FastAPI 入口：底座 + 应用 + 静态托管
├── agent_framework/                     # 【底座】CrewAI 兼容多智能体框架
│   ├── base.py                          #   Tool / Agent / Task / Crew
│   ├── approval_gate.py                 #   审批拦截器（_ApprovalGate）
│   ├── domain.py                        #   数据域（JSON 落盘）
│   └── executor.py                      #   Crew 执行器（确定性本地规划器）
├── apps/hosted/menu_ordering/           # 【托管应用】点餐系统 v2.0
│   ├── seed.py                          #   菜品种子 / 订单状态机 ORDER_STEPS/NEXT
│   ├── store.py                         #   核价·验库存·扣库存·落单·状态流转
│   ├── tools.py                         #   query_menu / order_process（强制审批）
│   ├── agents.py                        #   能力网关 · 订单处理专员
│   ├── app.py                           #   HostedApp 装配（数据域→工具→智能体→路由）
│   ├── data/                            #   运行时数据（首次启动自动生成）
│   └── public/
│       ├── index.html                   #   用户端（点餐 + 4s 轮询订单）
│       └── merchant.html                #   商家端（审批 / 订单 / 概览，8s 轮询）
└── public/
    └── manage.html                      #   CrewAI 管理页（底座运行状态）
```

## 快速启动

```bash
pip install -r requirements.txt
cd platform/backend
python -m uvicorn main:app --host 0.0.0.0 --port 8000
```

| 入口 | 地址 |
|---|---|
| 用户端（点餐） | http://localhost:8000/ |
| 商家端（审批/订单/概览） | http://localhost:8000/merchant.html |
| CrewAI 管理页 | http://localhost:8000/platform/manage.html |
| API 文档 | http://localhost:8000/docs |

商家端 API 需携带角色头 `X-Role: merchant`（匿名返回 401，属正常权限设计）。

## 业务流（审批后）

**提交下单**：用户端选菜 → `POST /api/orders/place` → 底座后台线程跑 Crew（能力网关）→
调用 `order_process`（强制审批）→ 审批门签发 `pending` 审批并**阻塞等待商家决策**（300s 超时），HTTP 立即返回等待提示；用户端每 4s 轮询订单。

| 阶段 | 审批 status | 订单 | 库存 |
|---|---|---|---|
| 提交下单 | pending | 无 | 不变 |
| 商家通过 | approved | 新增一条（已下单） | 扣减 |
| 商家拒绝 / 超时 | rejected | 无 | 不变 |

- **通过**：审批门执行真实 `OrderProcessTool` → 按 `dish_ids` 读菜单**核价 + 逐道验库存** → **扣库存** + 写 `orders`（`order_no/dish_names/total/seat_count/status=已下单`）→ 返回「订单 #N 已创建：菜名，合计￥，预计等待 X 分钟」→ 用户端轮询到订单自动出现。
- **拒绝/超时**：**不执行真实工具**，不扣库存、不生成订单，返回 `[审批未通过] 工具 order_process 被拒绝执行[:原因]`。

## 商家端（merchant.html）关键行为

- **审批列表**：`order_process · [下单] 番茄牛腩煲、水煮鱼 · 共2道 · 合计￥156 · 3人`
  - `describeOrderArgs` **兼容 Python dict 字符串（单引号）与 JSON**：直接用正则提取 `dish_ids`/`seat_count`，
    不再依赖 `JSON.parse`（避免单引号参数全部解析失败显示成「未选菜品」的旧 bug）。
  - 空参数单（`dish_ids=[]`）→ 显示 `⚠️ 无效订单（未选择任何菜品），建议拒绝`，**「通过」按钮禁用**并提示「参数缺失，请拒绝」。
- **订单状态机**：`已下单 →[接单]→ 制作中 →[出餐]→ 待出餐 →[送达]→ 已出餐 →[完成]→ 已完成`（只前进不可回退，终态无按钮）；推进按钮点击后写后端并刷新。
- **概览**：待处理订单（`status === "已下单"` 计数）、营收合计、订单状态分布等 KPI。
- 每 8 秒自动轮询刷新。

## 接入真实 CrewAI

默认执行器为**确定性本地规划器**（无需 LLM / API Key 即可跑通演示闭环）；智能体/工具/任务结构与 crewai 完全对齐。

```python
# 以真实 crewai 运行（需 Python <= 3.12 且配置 LLM）：
pip install crewai
from crewai import Agent, Crew, Task
crew = Crew(agents=[...], tasks=[...], process="sequential")
crew.kickoff(inputs={...})
```

将 `app.py` 中 `executor.kickoff(crew)` 替换为真实 Crew 即可；审批拦截逻辑位于 `agent_framework/approval_gate.py`，不依赖执行器具体实现。

## API 概览

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | /api/menu | 菜单与库存 |
| POST | /api/orders/place | 提交订单（触发智能体下单 + 审批） |
| GET | /api/orders | 订单列表 |
| GET | /api/approvals | 审批记录（pending / 历史） |
| POST | /api/approvals/{id}/decide | 商家决策（需 X-Role: merchant） |
| POST | /api/orders/{order_no}/status | 推进订单状态（需 X-Role: merchant） |
| GET | /api/stats | 商家统计（需 X-Role: merchant） |
| GET | /api/platform/info | 底座元信息（智能体/工具/计数，管理页用） |
| GET | /api/platform/apps | 托管应用列表 |