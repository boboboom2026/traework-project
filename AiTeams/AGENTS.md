# 企业AI协作平台 (AiTeams)

## 项目概述

企业协作平台是一款面向企业内部的沟通与协作工具，基于 Next.js 16 + React 19 + TypeScript 构建，采用 shadcn/ui 组件库和 Tailwind CSS 样式方案。

## 核心概念定义

### Skill（技能）vs Tool（工具）

| 概念 | 含义 | 数据库表 | 作用 |
|------|------|---------|------|
| **Skill（技能）** | 知道怎么做 — SOP 文档/程序性知识 | `skills` | 注入 LLM 上下文，指导执行流程 |
| **Tool（工具）** | 能够执行动作 — 可执行函数 | `tools` | 通过 Function Calling 执行具体操作 |

**绑定关系：**
- `agent_skill_bindings` — Agent ↔ Skill 绑定（智能体拥有哪些技能）
- `agent_tool_bindings` — Agent ↔ Tool 绑定（智能体能调用哪些工具）

> **注意：** `agent_skills` 表已废弃（旧版 Tool 表），代码中不再使用，统一使用 `tools` 表。

## 技术栈

- **Framework**: Next.js 16 (App Router)
- **Core**: React 19
- **Language**: TypeScript 5
- **UI 组件**: shadcn/ui (基于 Radix UI)
- **Styling**: Tailwind CSS 4

## 目录结构

```
├── src/
│   ├── app/                      # 页面路由
│   │   ├── (app)/               # 受保护的App路由组
│   │   │   ├── layout.tsx       # App布局（包含侧边栏）
│   │   │   ├── channels/        # 频道模块
│   │   │   ├── inbox/          # 消息通知中心
│   │   │   ├── dms/             # 私信功能
│   │   │   ├── contacts/        # 通讯录
│   │   │   ├── apps/            # 智能化协作（Agent/Skill/Tool/RAG）
│   │   │   │   ├── agents/       # 智能体管理
│   │   │   │   ├── skills/       # 技能管理（Skill/SOP）
│   │   │   │   ├── rag/           # 知识库管理
│   │   │   │   └── tools/       # 工具管理
│   │   │   ├── search/           # 全局搜索
│   │   │   └── settings/        # 设置页面
│   │   ├── (auth)/              # 认证路由组
│   │   │   ├── login/           # 登录页
│   │   │   ├── register/        # 注册页
│   │   │   │   ├── create-team/ # 创建团队流程
│   │   │   │   └── join-team/  # 加入团队页
│   │   │   └── onboarding/      # 首次登录引导/团队选择
│   │   ├── api/                # API接口
│   │   │   ├── auth/           # 认证相关接口
│   │   │   ├── dms/            # 私聊相关接口
│   │   │   │   ├── conversations/  # 会话管理
│   │   │   │   ├── messages/       # 消息收发
│   │   │   │   └── read/           # 标记已读
│   │   │   ├── channels/       # 频道相关接口
│   │   │   │   └── sections/       # 分区管理
│   │   │   ├── agents/         # 智能体接口
│   │   │   ├── agent-chat/     # 智能体私聊接口
│   │   │   │   ├── sessions/       # 会话管理
│   │   │   │   └── messages/       # 消息收发+SSE流式
│   │   │   ├── skills/         # 职能/Skill接口
│   │   │   │   ├── generate/    # AI生成Skill
│   │   │   │   ├── import/      # 导入Skill
│   │   │   │   └── export/      # 导出Skill
│   │   │   ├── rag/            # 知识库接口
│   │   │   ├── tools/          # 工具接口
│   │   │   └── teams/          # 团队相关接口
│   │   ├── invite/[code]/      # 邀请链接页面
│   │   ├── search/team/        # 搜索团队页面
│   │   ├── layout.tsx           # 根布局
│   │   └── page.tsx             # 首页
│   ├── components/
│   │   ├── apps/                # 应用组件
│   │   │   ├── job-work-list.tsx  # 岗位工作列表+编辑
│   │   │   ├── agent-chat-dialog.tsx # 智能体对话弹窗
│   │   │   └── submit-approval-button.tsx # 审批提交按钮组件
│   │   ├── auth/               # 认证相关组件
│   │   │   └── protected-route.tsx
│   │   ├── layout/             # 布局组件
│   │   │   ├── sidebar.tsx     # 左侧导航栏
│   │   │   ├── topbar.tsx      # 顶部栏
│   │   │   └── app-layout.tsx  # 应用主布局
│   │   ├── teams/              # 团队相关组件
│   │   │   └── invite-modal.tsx # 邀请弹窗
│   │   └── ui/                 # shadcn/ui 组件库
│   ├── hooks/
│   │   └── use-auth.tsx        # 认证Hook
│   └── storage/
│       └── database/           # Supabase数据库
│           ├── shared/schema.ts # 数据模型
│           └── supabase-client.ts # 数据库客户端
```

## 页面清单

| 页面 | 路径 | 说明 |
|------|------|------|
| 首页/频道 | `/` | 登录后首页，显示频道消息流 |
| 频道 | `/channels` | 频道列表、消息流、回复功能 |
| 消息 | `/inbox` | 统一消息通知中心 |
| 私信 | `/dms` | 一对一私密对话（私聊） |
| 通讯录 | `/contacts` | 企业组织架构、员工信息、智能体成员 |
| 应用 | `/apps` | 智能化协作（Agent→Skill→Tool→RAG） |
| 自动化任务 | `/apps/schedules` | 自动化任务调度与编排 |
| 任务 | `/tasks` | 任务中心（列表/编排/执行/审批/运行记录） |
| 搜索 | `/search` | 全局搜索（消息/用户/文件） |
| 登录 | `/login` | 支持微信、验证码、密码三种登录方式 |
| 注册 | `/register` | 创建账户，设置密码 |
| 创建团队 | `/register/create-team` | 创建新团队流程 |
| 加入团队 | `/register/join-team` | 加入已有团队 |
| 首次引导/团队选择 | `/onboarding` | 新用户选择/创建团队 |
| 邀请页面 | `/invite/[code]` | 邀请链接页面 |
| 搜索团队 | `/search/team` | 搜索并申请加入团队 |
| 个人设置 | `/settings` | 多标签页设置（个人账户、更改团队信息、成员管理、群组管理、用户管理、统计与分析） |

## 前端请求与鉴权约定（重要）

- **统一使用 `src/lib/api-client.ts`**，不要直接写裸 `fetch`：
  - `apiFetch(url, init)`：自动附带 `Authorization: Bearer <localStorage.auth_token>`，401 时清理本地 token 并跳登录页。
  - `apiJson<T>(url, init)`：自动解析 JSON，非 2xx 直接抛出带后端 `error` 文案的 `ApiError`（前端 `toast.error(e.message)` 即可）。
  - `withTeamId(url, teamId)`：拼接 `teamId` 查询参数，团队级接口必须带。
- **后端鉴权**：需要登录态的接口首行调用 `requireAuth(request)`（见 `src/lib/api-auth.ts`）；团队级数据用 `resolveUserTeamId(client, auth.id, requestedTeamId)` 解析团队并校验成员关系，**不要**用「取 team_members 第一条」的方式拿 teamId（会造成跨团队越权）。
- **`/api/tasks` 系列已强制鉴权**：`GET/POST/PUT/DELETE /api/tasks`、`/api/tasks/[id]/run|resume|runs` 均需要 Bearer token，并且只返回/操作当前用户所属团队的数据；前端调用必须走 `apiFetch/apiJson` 并带 `teamId`。

## API 接口清单

| 接口 | 方法 | 路径 | 说明 |
|------|------|------|------|
| 发送验证码 | POST | `/api/auth/send-code` | 发送登录/注册验证码 |
| 验证码登录 | POST | `/api/auth/login` | 手机号+验证码登录 |
| 密码登录 | POST | `/api/auth/login-with-password` | 手机号+密码登录 |
| 注册 | POST | `/api/auth/register` | 创建账户（可选创建/加入团队） |
| 创建团队 | POST | `/api/teams/create` | 创建新团队 |
| 获取团队列表 | GET | `/api/teams/list` | 获取用户的团队列表 |
| 加入团队 | POST | `/api/teams/join` | 申请加入团队 |
| 搜索团队 | GET | `/api/teams/search` | 搜索团队 |
| 生成邀请链接 | POST | `/api/teams/invite/create` | 生成团队邀请链接 |
| 验证邀请链接 | GET | `/api/teams/invite/verify` | 验证邀请链接有效性 |
| 接受邀请 | POST | `/api/teams/invite/accept` | 接受邀请加入团队 |
| 获取群组列表 | GET | `/api/teams/groups` | 获取团队群组列表（分页+搜索） |
| 创建群组 | POST | `/api/teams/groups` | 创建群组（可同时添加成员） |
| 更新群组 | PUT | `/api/teams/groups` | 更新群组名称/描述 |
| 解散群组 | DELETE | `/api/teams/groups` | 软删除（标记不活跃） |
| 获取群组成员 | GET | `/api/teams/groups/members` | 获取群组成员列表 |
| 添加群组成员 | POST | `/api/teams/groups/members` | 批量添加成员到群组 |
| 移除群组成员 | DELETE | `/api/teams/groups/members` | 从群组中移除单个成员 |
| 获取私聊会话列表 | GET | `/api/dms/conversations` | 获取当前用户的私聊会话列表（含未读数） |
| 创建私聊会话 | POST | `/api/dms/conversations` | 创建/获取与指定用户的私聊会话 |
| 获取私聊消息 | GET | `/api/dms/messages` | 获取会话消息列表（分页） |
| 发送私聊消息 | POST | `/api/dms/messages` | 发送私聊消息（自动更新会话） |
| 标记私聊已读 | PUT | `/api/dms/read` | 标记会话中对方消息为已读 |
| 获取频道分区列表 | GET | `/api/channels/sections` | 获取团队分区列表（含频道） |
| 创建分区 | POST | `/api/channels/sections` | 创建新分区（支持快速模板） |
| 更新分区 | PUT | `/api/channels/sections` | 更新分区名称/折叠状态 |
| 删除分区 | DELETE | `/api/channels/sections` | 删除分区（默认分区不可删） |
| 获取频道详情/列表 | GET | `/api/channels` | 获取频道详情或列表 |
| 创建频道 | POST | `/api/channels` | 创建频道（自动加入创建者） |
| 更新频道 | PUT | `/api/channels` | 更新频道信息 |
| 删除频道 | DELETE | `/api/channels` | 软删除频道 |
| 加入频道 | POST | `/api/channels/join` | 加入公开频道（私密频道拒绝） |
| 退出频道 | DELETE | `/api/channels/join` | 退出频道（默认频道/创建者不可退出） |
| 获取频道消息 | GET | `/api/channels/messages` | 获取频道消息列表（分页，含反应、回复计数） |
| 发送频道消息 | POST | `/api/channels/messages` | 发送频道消息（支持回复、附件、话题标签） |
| 添加表情反应 | POST | `/api/channels/messages/reactions` | 对消息添加表情反应 |
| 取消表情反应 | DELETE | `/api/channels/messages/reactions` | 取消表情反应 |
| 获取消息回复 | GET | `/api/channels/messages/replies` | 获取消息回复线程（含原消息+所有回复） |
| 获取@我的消息 | GET | `/api/channels/messages/mentions` | 获取当前用户被提及的消息列表 |
| 收藏消息 | POST | `/api/channels/bookmarks` | 收藏频道消息 |
| 取消收藏 | DELETE | `/api/channels/bookmarks` | 取消收藏（query参数：messageId, userId） |
| 获取收藏列表 | GET | `/api/channels/bookmarks` | 获取当前用户的收藏消息列表 |
| 获取智能体列表 | GET | `/api/agents` | 获取团队智能体列表（含关联Tool/RAG名称） |
| 创建智能体 | POST | `/api/agents` | 创建智能体（选择岗位→自动生成Prompt+Skill，关联Tool/RAG） |
| 更新智能体 | PUT | `/api/agents` | 更新智能体配置 |
| 删除智能体 | DELETE | `/api/agents` | 软删除智能体 |
| 智能体对话 | POST | `/api/agents/chat` | 智能体对话（SSE流式，用于独立对话弹窗） |
| 智能体频道回复 | POST | `/api/channels/messages/agent` | 智能体在频道中回复（SSE流式+自动写入消息） |
| 获取智能体会话列表 | GET | `/api/agent-chat/sessions` | 获取用户的智能体私聊会话列表 |
| 创建智能体会话 | POST | `/api/agent-chat/sessions` | 创建/获取与指定智能体的私聊会话 |
| 获取智能体消息 | GET | `/api/agent-chat/messages` | 获取智能体对话消息历史（分页） |
| 发送智能体消息 | POST | `/api/agent-chat/messages` | 发送消息并获取智能体SSE流式回复（支持attachments附件，支持工作流自动触发） |
| 生成工作流 | POST | `/api/skills/generate-workflow` | 从SOP Markdown文档AI自动生成工作流步骤 |
| 获取工作流列表 | GET | `/api/agents/workflows` | 获取团队工作流列表（支持按agent_id过滤） |
| 创建工作流 | POST | `/api/agents/workflows` | 创建工作流（绑定agent_id、skill_id、steps） |
| 更新工作流 | PUT | `/api/agents/workflows` | 更新工作流配置 |
| 删除工作流 | DELETE | `/api/agents/workflows` | 删除工作流 |
| 智能体通知推送 | POST | `/api/agents/notify` | 外部系统触发智能体向频道/用户推送通知 |
| 获取通知配置 | GET | `/api/agents/notify-config` | 获取智能体通知推送配置 |
| 更新通知配置 | PUT | `/api/agents/notify-config` | 更新智能体通知推送配置 |
| 获取职能列表 | GET | `/api/skills` | 获取团队职能列表（含关联RAG名称） |
| 创建职能 | POST | `/api/skills` | 创建职能（含模型、Prompt、关联RAG） |
| 更新职能 | PUT | `/api/skills` | 更新职能配置 |
| 删除职能 | DELETE | `/api/skills` | 软删除职能 |
| 获取技能列表 | GET | `/api/skills/definitions` | 获取团队技能列表（SOP文档） |
| 创建技能 | POST | `/api/skills/definitions` | 创建技能（含Markdown内容） |
| 更新技能 | PUT | `/api/skills/definitions` | 更新技能内容 |
| 删除技能 | DELETE | `/api/skills/definitions` | 软删除技能 |
| AI生成技能 | POST | `/api/skills/generate` | AI自动生成技能SOP文档 |
| 导入技能 | POST | `/api/skills/import` | 文件导入技能（.md/.json/.txt/.yaml） |
| 导出技能 | GET | `/api/skills/export` | 导出技能为.md文件 |
| 获取工具列表 | GET | `/api/agent-skills` | 获取团队工具列表（含预置动作） |
| 创建工具 | POST | `/api/agent-skills` | 创建工具（选择预置action + 自定义参数） |
| 更新工具 | PUT | `/api/agent-skills` | 更新工具配置 |
| 删除工具 | DELETE | `/api/agent-skills` | 删除工具（内置工具不可删） |
| 获取智能体工具绑定 | GET | `/api/agent-skills/bindings` | 获取智能体关联的工具列表 |
| 绑定智能体工具 | POST | `/api/agent-skills/bindings` | 为智能体绑定工具 |
| 解绑智能体工具 | DELETE | `/api/agent-skills/bindings` | 解除智能体工具绑定 |
| 获取知识库列表 | GET | `/api/rag` | 获取团队知识库列表 |
| 创建知识库 | POST | `/api/rag` | 创建知识库 |
| 更新知识库 | PUT | `/api/rag` | 更新知识库信息 |
| 删除知识库 | DELETE | `/api/rag` | 软删除知识库 |
| 获取服务列表 | GET | `/api/services` | 获取已注册的外部服务列表（含凭证管理） |
| 创建服务 | POST | `/api/services` | 注册外部服务（支持OAuth2/AppID鉴权） |
| 更新服务 | PUT | `/api/services` | 更新服务配置和凭证 |
| 获取岗位详情 | GET | `/api/positions/detail` | 获取岗位详情（含关联智能体、技能列表） |
| 创建岗位 | POST | `/api/positions` | 创建岗位（名称、描述、图标、颜色） |
| 更新岗位 | PUT | `/api/positions` | 更新岗位信息 |
| 删除岗位 | DELETE | `/api/positions` | 软删除岗位 |
| 删除服务 | DELETE | `/api/services` | 软删除服务 |
| 导入OpenAPI | POST | `/api/services/import` | 解析OpenAPI Schema并批量生成HTTP工具 |
| 全局搜索 | GET | `/api/search` | 搜索消息/频道/用户（支持q/type/teamId/page/limit参数） |
| 获取系统消息 | GET | `/api/inbox/systems` | 获取系统通知列表（分页） |
| 标记系统消息已读 | POST | `/api/inbox/systems/read` | 全部标记已读 |
| 生成工作流 | POST | `/api/skills/generate-workflow` | 从SOP文档生成可执行工作流步骤 |
| 获取工作流列表 | GET | `/api/agents/workflows` | 获取智能体关联的工作流列表 |
| 创建工作流 | POST | `/api/agents/workflows` | 创建/保存工作流定义 |
| 更新工作流 | PUT | `/api/agents/workflows` | 更新工作流步骤和配置 |
| 删除工作流 | DELETE | `/api/agents/workflows` | 删除工作流 |
| 生成工作流步骤 | POST | `/api/skills/generate-workflow` | 从SOP文档解析生成工作流步骤 |
| 获取工作流列表 | GET | `/api/agents/workflows` | 获取agent的工作流列表 |
| 创建工作流 | POST | `/api/agents/workflows` | 创建/保存工作流 |
| 更新工作流 | PUT | `/api/agents/workflows` | 更新工作流配置 |
| 删除工作流 | DELETE | `/api/agents/workflows` | 删除工作流 |
| 全局搜索 | GET | `/api/search` | 搜索消息/频道/用户（支持type/page/limit参数） |
| 获取团队统计 | GET | `/api/teams/stats` | 团队统计（成员数/消息数/频道数/活跃度/趋势） |
| 更新团队信息 | PUT | `/api/teams/info` | 更新团队名称/网址/头像 |
| 更新成员角色 | PUT | `/api/teams/members` | 更新成员角色（admin/member） |
| 移除成员 | DELETE | `/api/teams/members` | 从团队移除成员 |
| 获取系统消息 | GET | `/api/inbox/systems` | 获取系统通知列表（分页） |
| 标记系统消息已读 | POST | `/api/inbox/systems/read` | 全部标记已读 |
| 获取调度任务列表 | GET | `/api/agents/schedules` | 获取团队/智能体的自动化调度任务列表 |
| 创建调度任务 | POST | `/api/agents/schedules` | 创建自动化调度任务（cron/interval/once） |
| 更新调度任务 | PUT | `/api/agents/schedules` | 更新调度任务配置 |
| 删除调度任务 | DELETE | `/api/agents/schedules` | 删除调度任务 |
| 手动触发调度任务 | POST | `/api/agents/schedules/trigger` | 立即执行一次调度任务 |
| 获取执行日志 | GET | `/api/agents/schedules/logs` | 获取调度任务执行日志 |
| 获取任务列表 | GET | `/api/tasks` | 获取当前团队的任务定义列表 |
| 创建任务 | POST | `/api/tasks` | 创建任务定义（含 definition JSON） |
| 更新任务 | PUT | `/api/tasks` | 更新任务名称/描述/编排定义 |
| 删除任务 | DELETE | `/api/tasks` | 软删除任务 |
| 启动任务 | POST | `/api/tasks/[id]/run` | 启动任务实例（确定性内核执行，返回运行记录） |
| 恢复任务 | POST | `/api/tasks/[id]/resume` | 恢复挂起中的任务（审批通过/驳回/人工选择） |
| 获取运行记录 | GET | `/api/tasks/[id]/runs` | 获取任务的运行记录列表 |

## 开发命令

```bash
# 安装依赖
pnpm install

# 开发环境
pnpm dev

# 生产构建
pnpm build

# 类型检查
pnpm ts-check

# ESLint 检查
pnpm lint
```

## 功能模块

### 1. 用户认证与管理
- [x] 登录页面（微信登录、验证码登录、密码登录）
- [x] 注册页面
- [x] 首次登录引导（创建/选择团队）
- [x] 个人设置页面
  - [x] 手机号绑定
  - [x] 邮箱绑定
  - [x] 微信绑定
  - [x] 密码修改
  - [x] 个人资料编辑
  - [x] 邀请成员功能

### 2. 团队管理
- [x] 创建团队流程
  - [x] 验证手机号
  - [x] 完善团队信息
- [x] 加入团队
  - [x] 搜索团队
  - [x] 申请加入
- [x] 团队选择/切换
- [x] 邀请成员
  - [x] 生成邀请链接
  - [x] 复制邀请链接
  - [x] 邀请页面（支持微信/手机号登录）

### 3. 应用框架
- [x] 左侧导航栏（团队切换、主导航）
- [x] 顶部栏（搜索、通知、用户菜单）
- [x] 主内容区

### 4. 数据库模型
- [x] users - 用户表
- [x] teams - 团队表
- [x] team_members - 团队成员关系表
- [x] team_invites - 团队邀请表
- [x] verification_codes - 验证码表
- [x] departments - 部门表（组织架构）
- [x] groups - 群组表（用户组）
- [x] group_members - 群组成员关系表
- [x] dm_conversations - 私聊会话表
- [x] dm_messages - 私聊消息表
- [x] channel_sections - 频道分区表
- [x] channels - 频道表
- [x] channel_members - 频道成员表
- [x] channel_messages - 频道消息表
- [x] channel_message_reactions - 频道消息反应表
- [x] channel_bookmarks - 频道消息收藏表
- [x] channel_files - 频道文件表（频道成员上传 + 智能体生成的文件统一归档，含source/uploader_type区分来源）
- [x] tools - Tool能力配置层表（支持预置工具 + HTTP 自定义工具）
- [x] rag_datasets - RAG知识管理层表
- [x] skills - Tool能力配置层表
- [x] skills - 技能表（Skill，SOP文档，含position_id关联岗位）
- [x] agents - Agent决策调度层表
- [x] positions - 岗位定义表（名称、描述、图标、颜色）
- [x] system_notifications - 系统通知表（团队级通知，含类型/标题/内容/已读标记）
- [x] agent_workflows - 工作流定义表（关联agent/skill，含步骤JSON、触发条件）
- [x] workflow_checkpoints - 工作流检查点表（保存执行状态，支持中断恢复）
- [x] agent_workflows - 工作流定义表（关联agent_id/skill_id/team_id，含steps JSONB步骤定义、trigger_condition触发条件）
- [x] workflow_checkpoints - 工作流断点表（session_id/workflow_id/step_index/context，支持中断恢复）
- [x] workflow_instances - 工作流任务实例表（workflow_id/team_id/session_id/agent_id/status/current_node_id/snapshot/result；确定性内核执行载体，支持快照持久化与幂等恢复）
- [x] agent_schedules - 自动化调度任务表（关联agent/team，含cron/interval/once调度、触发消息、投递目标）
- [x] schedule_execution_logs - 调度执行日志表（记录每次执行的触发消息、结果摘要、错误信息、耗时）
- [x] approval_tasks - 对话审批任务表（标题/类型/draft数据/状态/流转记录flow/发起人/指定审批人）
- [x] tasks - 任务定义表（name/description/trigger_condition/agent_id/definition(jsonb=WorkflowDefinitionV2)/status）
- [x] task_runs - 任务运行实例表（task_id/status/current_node_id/snapshot/result/error/started_at/completed_at，支持快照持久化与幂等恢复）

### 5. 已实现功能
- [x] 团队管理设置页（多标签页）
  - [x] 更改团队信息（名称、网址、头像）
  - [x] 成员管理（成员列表、邀请成员）
  - [x] 群组管理（群组列表、创建、编辑、解散、成员管理）
  - [x] 用户管理（成员表格、角色管理、移除成员）
  - [x] 统计与分析（实现）
- [x] 岗位管理（Position Center：创建/编辑岗位、管理技能、查看关联智能体）
  - [x] 岗位列表展示（名称、描述、图标、颜色、技能数、智能体数）
  - [x] 岗位创建/编辑弹窗
  - [x] 岗位详情面板（关联智能体列表、技能列表管理）
  - [x] 技能CRUD（创建/编辑/删除技能，Markdown内容编辑）
  - [x] 智能体关联查看（在岗AI助手列表+对话入口）

### 6. 待开发功能
- [x] 频道功能（分区管理、频道CRUD、频道列表导航、创建分区弹窗、重命名/删除分区）
- [x] 频道加入/退出机制（公开频道可预览+主动加入、私密频道仅受邀可见、默认频道自动加入不可退出）
- [x] 浏览频道功能（弹窗展示所有频道、支持加入公开频道、浏览开关控制侧边栏可见性）
- [x] 频道消息功能
  - [x] 消息收发（支持文本、话题标签、图片/视频附件）
  - [x] 表情反应（添加/取消反应、反应聚合展示）
  - [x] 回复线程（右侧面板、线程消息列表、在线程中回复）
  - [x] 消息 Hover 快捷操作栏（点赞、回复、表情、转发、更多）
  - [x] 长文折叠/展开
  - [x] 图片展示（单图限尺寸、多图网格布局、+N计数）
  - [x] 视频预览（播放按钮和时长显示）
  - [x] @提及功能（输入@选择成员、mentions字段存储、@我的消息查询）
- [x] 频道文件功能
  - [x] 频道文件面板（右侧Sheet，按类型Tab筛选：全部/图片/视频/文档）
  - [x] 频道成员上传文件到频道文件（GET/POST/DELETE /api/channels/files）
  - [x] 消息附件自动归档到频道文件（用户发送的图片/视频/文档自动入库存档）
  - [x] 智能体生成的文件自动归档到频道文件（source=agent 标识）
- [x] 消息模块（左侧标签栏+右侧内容区、@我的标签页、收藏夹三栏布局、回复我的、系统消息通知）
- [ ] 社区功能
- [x] 私聊功能（会话列表、消息收发、用户信息卡片、新建会话）
- [x] 通讯录功能（成员列表API驱动、群组功能、智能体作为虚拟成员展示、智能体详情面板+对话功能）
- [x] 搜索功能（跨消息/频道/用户搜索，搜索页API驱动，Tab分类筛选，点击跳转）
- [x] 频道消息收藏功能（收藏/取消收藏、收藏状态显示、收藏夹页面三栏布局、回复线程面板）
- [x] 系统消息（回复我的）
- [x] 团队管理后端对接（成员角色/权限设置、团队信息保存API）
- [x] 用户管理功能实现（成员表格+角色管理+移除成员）
- [x] 统计与分析功能实现
- [x] 工作流执行模式（Workflow）
  - [x] agent_workflows 数据库表（步骤定义、触发条件、关联Agent/Skill）
  - [x] workflow_checkpoints 断点表（中断恢复）
  - [x] Skill → AI自动生成工作流（POST /api/skills/generate-workflow）
  - [x] 工作流 CRUD API（GET/POST/PUT/DELETE /api/agents/workflows）
  - [x] WorkflowExecutor 执行引擎（步骤编排、LLM调用、工具调用、人工审批、checkpoint）
  - [x] SSE 工作流事件协议（step_start/step_complete/step_error/waiting_human/workflow_complete）
  - [x] Skill 编辑页"生成工作流"按钮 + 预览
  - [x] 智能体编辑页高级配置中工作流绑定
  - [x] Hybrid 模式：LLM 自动判断是否触发工作流（system prompt 注入 + trigger_condition 匹配）
  - [x] execute_workflow 工具拦截（Function Calling 中自动触发工作流引擎）
- [x] 智能化协作（应用页四层架构：Agent→Skill→Tool→RAG）
  - [x] RAG知识管理层（CRUD、文档计数、同步配置）
  - [x] Tool能力配置层（CRUD、预置工具 + HTTP 自定义工具，支持 URL/Method/Headers/Body 模板）
  - [x] Agent决策调度层（CRUD、关联Tool/RAG）
  - [x] 岗位管理层（Position Center：岗位创建/编辑、技能管理、智能体关联）
  - [x] 技能管理层（Skill/SOP：Markdown内容管理、AI生成、文件导入导出）
  - [x] 智能体自动调用Skill（SOP文档自动注入对话上下文，通过 execute_skill 工具调用）
- [x] 多Agent协作（delegate_agent 工具：主LLM委托子Agent独立执行任务）
  - [x] 详情面板（智能体/职能选中详情展示）
  - [x] 关联关系选择（弹窗内多选关联Tool/RAG）
- [x] 智能体工具执行（Function Calling）
  - [x] tools 表作为独立工具层（action + parameters + config）（已废弃 agent_skills 旧表，统一使用 tools）
  - [x] agent_skill_bindings 表绑定智能体与工具
  - [x] 对话 API 支持 Function Calling 循环（<tool_call> 格式）
  - [x] 智能体编辑弹窗增加"关联工具"多选
  - [x] 前端详情面板展示关联工具列表
  - [x] 预置工具动作（send_message、search_member、create_channel 等）
- [x] 智能体对话功能
  - [x] 独立对话弹窗（AgentChatDialog，SSE流式+多轮对话）
  - [x] 频道内智能体调用（`/智能体名 问题` 斜杠命令 + Bot图标按钮）
  - [x] 智能体频道回复API（流式输出+自动写入channel_messages）
  - [x] 智能体消息标识（Bot头像+智能体徽章+思考动画指示器）
  - [x] channel_messages表新增sender_type字段区分用户/智能体
  - [x] 智能体私聊功能（agent_chat_sessions + agent_chat_messages 持久化存储）
  - [x] 私聊页集成智能体对话（左侧智能体会话分区、SSE流式输出、新建会话弹窗智能体Tab）
  - [x] 通讯录智能体对话跳转私聊页（chatWithAgent URL参数）
- [x] 智能体上下文感知架构
  - [x] 基于 Embedding 的语义检索方案（pgvector + IVFFlat 索引）
  - [x] 频道历史消息作为上下文注入智能体对话
  - [x] 多媒体附件处理（图片传多模态 image_url、视频/文档传摘要文本）
  - [x] agents 表增加频道上下文配置字段（channel_context_enabled/limit/scope）
  - [x] channel_messages 表增加 attachment_summary 和 embedding 字段
  - [x] 数据库 RPC 函数 search_similar_messages（向量相似度搜索）
  - [x] 共享模块 agent-context.ts（上下文构建 + 异步 Embedding 生成）
  - [x] 频道智能体调用注入频道历史上下文
  - [x] 私聊智能体调用注入频道历史上下文（同步到 /dms）
  - [x] 独立对话 API 注入频道历史上下文
  - [x] 消息发送时异步生成 Embedding 向量
  - [x] 前端智能体编辑弹窗增加频道上下文配置开关和条数
- [x] 智能体对话附件上下文（用户上传为主，频道检索为辅）
  - [x] agent_chat_messages 表新增 attachments 字段（jsonb）
  - [x] /api/agent-chat/messages POST 接受 attachments 参数并持久化存储
  - [x] 构建LLM消息时处理附件（图片→image_url多模态，文档/视频→文本标记）
  - [x] 频道历史上下文降级策略：仅当用户未上传附件时启用频道检索
  - [x] 私聊页智能体输入框增加图片/文件上传按钮和附件预览
  - [x] AgentChatDialog独立对话弹窗增加附件上传功能
  - [x] 消息气泡展示附件（图片缩略图、文件名标签）
- [x] 智能体主动通知推送
  - [x] agents 表新增 notify_enabled 和 notify_config 字段
  - [x] /api/agents/notify 通知推送 API（LLM生成内容+频道/私聊推送）
  - [x] /api/agents/notify-config 通知配置 API（GET+PUT）
  - [x] Webhook Secret 验证
  - [x] 免打扰时段检查
  - [x] 前端智能体编辑弹窗增加通知推送配置（频道/用户选择、模板、密钥、免打扰）
  - [x] 通知目标选择器（频道列表+成员列表API驱动）
- [x] Agent 自动获取岗位技能（Skill）
  - [x] skills 表新增 position_id 字段关联岗位
  - [x] 技能自动注入对话上下文
  - [x] Position Center 集成技能管理（CRUD）
  - [x] 创建智能体时选择岗位→自动生成 Prompt + Skill


## 服务注册中心（External Service Registry）

- [x] 服务注册：注册外部服务（飞书/微信/ERP/CRM），配置鉴权凭证
- [x] OpenAPI Schema 导入：粘贴OpenAPI文档URL或上传JSON/YAML，自动解析并展示所有API端点
- [x] 工具批量生成：勾选需要的API端点，一键生成HTTP工具，自动关联服务凭证
- [x] 凭证自动注入：工具执行时自动从服务获取Token/凭证，注入请求头
- [x] Token自动刷新：支持OAuth2/AppID+Secret鉴权，Token过期自动刷新
## 频道AI助手

- [x] 全局共享：所有频道共用一个"频道AI助手"，不再是每个频道绑定独立智能体
- [x] 被动响应：仅当用户在频道消息中 @频道AI助手 时触发回复，绝不主动参与讨论
- [x] 数据库表：`channel_ai_assistant_config`（team_id PK，存 name/system_prompt/model_config/enabled/greeting/user_guidance）
- [x] 配置API：`GET/PUT /api/channels/ai-assistant/config` 团队级配置管理
- [x] 主POST：`POST /api/channels/ai-assistant` 检查@提及后流式回复（SSE）
- [x] 触发机制：`POST /api/channels/messages` 发送消息时检测 @频道AI助手，触发 `triggerAiAssistant`
- [x] 专属对话面板：`ChannelAiPanel` 组件（右侧Sheet），via `/api/channels/ai-assistant/chat`
- [x] 设置页Tab：团队设置 → 管理 → 频道AI助手，可编辑System Prompt/模型配置/开关

## 工作流执行模式

- [x] agent_workflows 表：工作流定义（步骤JSON、触发条件、关联Agent/Skill）
- [x] workflow_checkpoints 表：检查点持久化（支持中断恢复）
- [x] Skill 文档 → AI 自动解析生成工作流步骤（POST /api/skills/generate-workflow）
- [x] 工作流 CRUD API（GET/POST/PUT/DELETE /api/agents/workflows）
- [x] WorkflowExecutor 执行引擎（步骤编排、LLM生成、工具调用、人工审批、checkpoint）
- [x] SSE 事件协议扩展（workflow_step_start/workflow_step_complete/workflow_waiting_human）
- [x] Skill 编辑页"生成工作流"按钮和预览
- [x] 智能体编辑页工作流绑定配置（高级配置Tab）
- [x] Hybrid 模式：LLM 自动判断自由对话 vs 工作流执行
- [x] 对话 API 集成工作流引擎（agent-chat）
- [x] 工具执行器处理 execute_workflow 工具调用

### 确定性工作流内核（状态机引擎）

> 定位：替代"把工作流编排转成 JSON 塞进 prompt 让 LLM 当引擎"的脆弱做法。引擎是纯代码状态机，LLM 仅作节点处理器。

- [x] `src/lib/workflow/types.ts` — 内核类型（`WorkflowNode`/`WorkflowDefinitionV2`/`WorkflowSnapshot`/`ResumeSignal`/`SuspensionPayload` 等）
- [x] `src/lib/workflow/condition.ts` — 确定性条件求值器（替代 LLM 判断分支；支持 `{{path}}`、`==/!=/>/</>=/<=`、`&&/||/!`、`contains()/is_empty()`，无法求值显式抛错）
- [x] `src/lib/workflow/engine.ts` — 状态机引擎（`runWorkflow`/`resumeWorkflow`，含副作用闸门、真实挂起/恢复、代码驱动流转）
- [x] `src/lib/workflow/instance.ts` — 持久化桥接层（`runInstance`/`resumeInstance`，落库 `workflow_instances` 并支持幂等恢复）
- [x] `workflow_instances` 表 — 任务实例 + 快照持久化（`snapshot` 整份保存，恢复为"继续"而非"重跑"）
- [x] 条件分支确定性化：`WorkflowExecutor.evaluateCondition` 已从 LLM 判断改为调用 `condition.ts`；前端 workflow 编辑器条件输入改为结构化语法引导

> 注：旧 `WorkflowExecutor`（`src/lib/workflow-executor.ts`）仍在逐步薄封装迁移中，现有 SSE/审批 API 对外接口保持不变。

## 任务编排（Task）

> 定位：以「确定性工作流内核」为执行载体的独立一级模块「任务」。与「智能体工作流」分离，自成闭环：任务列表 → 编排 → 执行 → 审批介入 → 运行记录。

- [x] 一级导航「任务」（侧边栏）与路由骨架：`/tasks`、`/tasks/[id]/edit`、`/tasks/[id]/run`、`/tasks/[id]/runs`
- [x] `tasks` 表 — 任务定义（name/description/trigger_condition/agent_id/definition jsonb/status）
- [x] `task_runs` 表 — 任务实例/运行记录（task_id/status/current_node_id/snapshot jsonb/result/error/started_at/completed_at）
- [x] `/api/tasks` CRUD（GET/POST/PUT/DELETE）
- [x] `/api/tasks/[id]/run` — 启动任务（同步执行确定性内核，返回运行记录，挂起时 status=awaiting_human）
- [x] `/api/tasks/[id]/resume` — 恢复任务（ResumeSignal：approved/rejected/choice）
- [x] `/api/tasks/[id]/runs` — 运行记录列表
- [x] `src/lib/workflow/node-executor.ts` — 节点执行器（`createNodeExecutor`），处理 `llm_generate`/`tool_call`/`skill_call`/`agent_call`
- [x] `src/lib/task/task-runner.ts` — 任务执行桥接（`runTask`/`resumeTask`，落库 `task_runs` + 快照）
- [x] 多智能体节点 `agent_call`：`WorkflowStepType` 新增该类型，`target` 存 agentId，复用 `delegateTaskToAgent`；编排器支持「智能体节点」
- [x] 审批闭环：挂起节点（`human_review`/`human_choice`）在执行页内嵌审批/选择卡片，通过 `/resume` 继续；恢复为"继续"而非"重跑"
- [x] 7 种节点类型：`llm_generate` / `tool_call` / `skill_call` / `agent_call` / `condition` / `human_review` / `human_choice`
- [x] 引擎恢复逻辑：修复挂起节点恢复时误再次挂起的缺陷，恢复信号（decision）正确应用后继续流转

> 设计边界：任务模块的审批是「执行页内嵌闭环」，不接入全局审批中心（`/approvals`，服务于旧对话审批）；多智能体的 `agent_call` 是编排驱动（代码决定哪个 agent 在哪个节点跑），保留 `delegate_agent` 为对话态自由协作能力，二者互不混用。

## 对话审批流转（Human-in-the-Loop Approval）

- [x] approval_tasks 表：审批任务（标题/类型/描述/draft数据农/状态/流转记录flow/发起人/审批人）
- [x] 内置审批工具（对话中调用 submit_for_approval / get_approval_tasks / approve_approval_task / reject_approval_task / forward_approval_task）
- [x] 审批 REST API（GET/POST /api/approvals、GET /api/approvals/[id]）
- [x] 指定审批人通知（写 system_notifications，link 指向 /approvals）
- [x] 审批中心页面（/approvals）：待我审批/我发起的/全部 Tab、详情弹窗、通过/驳回/转交指定人操作
- [x] 侧边栏"审批中心"入口
- [x] 对话内审批按钮状态条（SubmitApprovalButton）：按 source_id 感知任务状态——无任务显示【确认通过/提修改意见/转审批】，已通过显示✅、已驳回显示❌+意见、待他人审批显示⏳等待，操作区独立于内容卡片为底部状态条
- [x] 审批 API 支持 source_id 过滤（GET /api/approvals?source_id=xxx）供按文档消息精确查询任务状态
- [x] 智能体对话注入团队上下文：agent-chat/agents-chat 系统提示注入当前团队ID、名称、成员简表，search_member/get_team/invite_to_channel 等工具 team_id 改为可选并回退 context.teamId，解决"通过后继续执行需向用户索要 team_id"

### 审批意图触发与按钮按需展示（仅对话页 dms）

- [x] 关键词触发（本指令生效，不跨轮次）：`src/lib/agents/approval-trigger.ts` 的 `detectApprovalIntent`，命中「需我审批/需要审批/走审批/提交审批/等（待）我确认/审批通过后再执行」等表述后，`/api/agent-chat/messages` 向 system prompt 注入 `APPROVAL_MODE_PROMPT`，引导智能体产出后调用 `submit_for_approval`；未命中则不注入（自然任务不进入审批流程）
- [x] 消息打标与回绑：`src/lib/stream-agent-chat.ts` 检测到 `submit_for_approval` 工具调用时，记录其 `task_id`，并在回复消息落库后将任务 `source_id` 回绑为该消息 id（解决"任务 source_id 与消息 id 对不上导致状态查询失效"）
- [x] 按钮按需展示：`dms/page.tsx` 向 `SubmitApprovalButton` 传 `hideWhenNoTask`，**仅当存在与该消息（source_id）关联的审批任务时才渲染**审批按钮/状态条；无关联任务的普通回复不再常驻三按钮
- [x] 已有任务操作：`SubmitApprovalButton.handleSubmit` 在存在任务时改调 `POST /api/approvals/[id]`（approve/reject/forward）操作既有任务，避免重复新建；无任务时保持原 `POST /api/approvals` 兼容频道等旧路径
- [x] 确认通过可携带"下一步指示"：通过弹窗新增多行文本框，填写则作为 comment 提交并向智能体注入后续指令，留空视为任务结束

## 设计风格

遵循简约现代的企业工具 UI 风格：
- 品牌蓝 (#3B82F6) 作为主色调
- 淡蓝-米黄柔和渐变背景
- 白色圆角卡片
- 清晰的层级关系

## 智能体能力矩阵（Hermes 架构）

```
┌────────────────────────────────────────────────────┐
│  Agent 能力分层（6层16配置项）                       │
├────────────────────────────────────────────────────┤
│  第一层：基础配置                                   │
│  ├─ name / description / avatar                     │
│  ├─ system_prompt（单源，无双字段拼接）              │
│  ├─ greeting（开场白）                              │
│  └─ user_guidance（输入框引导提示）                  │
├────────────────────────────────────────────────────┤
│  第二层：关联资源                                   │
│  ├─ tool_ids         → 可执行工具（Function Calling）│
│  ├─ skill_ids        → SOP 文档自动注入             │
│  └─ rag_dataset_ids  → 知识库上下文                 │
├────────────────────────────────────────────────────┤
│  第三层：安全                                       │
│  ├─ prompt_guard_enabled  → 静态正则注入检测        │
│  └─ tool_approval_mode    → 工具审批（三级）         │
├────────────────────────────────────────────────────┤
│  第四层：记忆                                       │
│  ├─ memory_enabled        → 持久化记忆开关          │
│  └─ memory_config         → 召回数量/检索策略        │
├────────────────────────────────────────────────────┤
│  第五层：对话智能优化                               │
│  ├─ channel_context_enabled → 频道历史上下文注入     │
│  ├─ context_compress_enabled → 长上下文自动压缩      │
│  ├─ model_config            → 模型/温度/参数选择     │
│  └─ max_iterations          → 最大 Agent 循环次数   │
├────────────────────────────────────────────────────┤
│  第六层：主动能力                                   │
│  └─ notify_enabled/config → 定时/事件主动推送       │
└────────────────────────────────────────────────────┘
```

### 数据库字段说明

| 字段 | 类型 | 来源 | 说明 |
|------|------|------|------|
| `system_prompt` | `text` | 迁移合并 | 替代旧 `goal`+`rules` 双字段 |
| `tool_ids` | `jsonb` | agents表 | 工具ID数组，从 `agent_tool_bindings` 迁移合并 |
| `skill_ids` | `jsonb` | agents表 | SOP技能ID数组 |
| `rag_dataset_ids` | `jsonb` | agents表 | 知识库ID数组 |
| `prompt_guard_enabled` | `boolean` | 新增 | Prompt注入检测开关 |
| `tool_approval_mode` | `varchar` | 新增 | 工具审批模式 auto/always/conditional |
| `memory_enabled` | `boolean` | 新增 | 持久化记忆开关 |
| `memory_config` | `jsonb` | 新增 | 记忆配置 {recall_count, strategy} |
| `greeting` | `text` | 新增 | 开场白 |
| `user_guidance` | `text` | 新增 | 输入框引导提示 |
| `context_compress_enabled` | `boolean` | 新增 | 长上下文压缩开关 |
| `model_config` | `jsonb` | 新增 | 模型配置 {model, temperature, max_tokens} |
| `max_iterations` | `integer` | 新增 | 最大 Agent 循环次数 |
| `channel_context_enabled` | `boolean` | 已有 | 频道历史上下文注入 |
| `notify_enabled` | `boolean` | 已有 | 主动推送开关 |

### 后端记忆存储表

`agent_memories` 表：存储历史对话摘要，通过 pgvector 语义检索。

### API 兼容

- 旧 `goal`+`rules` 参数仍可接收，自动合并到 `system_prompt`
- 旧 `agent_tool_bindings` 写入时同步到 `tool_ids`
- 字段保留只读兼容，2个版本后移除

## 智能体安全模块（Agent Safety）

`src/lib/agent-safety.ts` 提供 LLM 迭代循环的代码层安全兜底，不改变 LLM 自主决策机制。

### 核心组件

| 组件 | 类/函数 | 职责 |
|------|---------|------|
| 死循环检测 | `DeadLoopDetector` | 检测同一工具同参数连续调用 ≥3 次，或连续 N 轮无进展 |
| Token 预算 | `TokenBudget` | 估算 Token 消耗总量，超限后注入提示让 LLM 停止新工具调用 |
| 自动重试 | `withRetry` | 工具调用失败自动重试（可配重试次数和间隔），支持降级结果 |
| Trace 日志 | `TraceLogger` | 记录每轮迭代的工具调用、耗时、Token 消耗，输出结构化日志 |
| 进度注入 | `buildIterationPrompt` | 构建进度摘要注入 LLM 上下文，让 LLM 感知当前执行状态 |

### 集成位置

- **频道智能体回复**：`src/app/api/channels/messages/agent/route.ts`
- **私聊智能体对话**：`src/lib/stream-agent-chat.ts`

### 安全机制

1. **死循环检测**：每轮迭代检查工具调用历史，同一工具同参数 3 次重复 → 注入"换方案"提示并重置检测器
2. **Token 预算控制**：每轮迭代后累加结果文本 Token 估算值，超限时注入"停止新调用"指令
3. **自动重试**：所有工具调用（execute_skill/delegate_agent/execute_workflow 等）统一用 `withRetry` 包装，1 次自动重试
4. **进度感知**：通过 `TraceLogger.buildProgressSummary()` 让 LLM 知道已执行几轮、调用了哪些工具、消耗了多少 Token
5. **结构化日志**：`TraceLogger.flush()` 输出完整执行链路，包含每轮的工具调用、耗时、结果长度

## 前端推理过程展示

智能体执行工具调用时，前端展示可视化推理过程：

- **AgentThinkingPanel**：频道/私聊/独立对话弹窗通用组件，展示工具调用链
  - 每个工具调用的名称、状态（等待中→执行中→已完成）
  - 执行结果摘要（可展开/折叠）
  - 安全拦截提示（死循环/Token 超限）和错误提示
- **SSE 事件协议扩展**：
  - `type: "function_call_detail"` — 工具调用开始（含名称和参数）
  - `type: "tool_result"` — 工具执行完成（含结果摘要）
  - `type: "safety_intercepted"` — 安全拦截（含原因和详情）
  - `type: "cost"` — 执行成本信息（含 Token 数和预估费用）
- **AgentChatDialog**：独立对话弹窗集成推理过程展示
- **DMs 私聊页**：集成推理过程展示

## 后端安全模块

`src/lib/agent-safety.ts` 提供 LLM 迭代循环的代码层安全兜底。

### 核心组件

| 组件 | 类/函数 | 职责 |
|------|---------|------|
| 死循环检测 | `DeadLoopDetector` | 检测同一工具同参数连续调用 ≥3 次，或连续 N 轮无进展 |
| Token 预算 | `TokenBudget` | 估算 Token 消耗总量，超限后注入提示让 LLM 停止新工具调用 |
| 自动重试 | `withRetry` | 工具调用失败自动重试（可配重试次数和间隔），支持降级结果 |
| Trace 日志 | `TraceLogger` | 记录每轮迭代的工具调用、耗时、Token 消耗，输出结构化日志 |
| 进度注入 | `buildIterationPrompt` | 构建进度摘要注入 LLM 上下文，让 LLM 感知当前执行状态 |

### 集成位置

- **频道智能体回复**：`src/app/api/channels/messages/agent/route.ts`
- **私聊智能体对话**：`src/lib/stream-agent-chat.ts`

### 安全机制

1. **死循环检测**：每轮迭代检查工具调用历史，同一工具同参数 3 次重复 → 注入"换方案"提示并重置检测器
2. **Token 预算控制**：每轮迭代后累加结果文本 Token 估算值，超限时注入"停止新调用"指令
3. **自动重试**：所有工具调用（execute_skill/delegate_agent/execute_workflow 等）统一用 `withRetry` 包装，1 次自动重试
4. **进度感知**：通过 `TraceLogger.buildProgressSummary()` 让 LLM 知道已执行几轮、调用了哪些工具、消耗了多少 Token
5. **结构化日志**：`TraceLogger.flush()` 输出完整执行链路，包含每轮的工具调用、耗时、结果长度

## 平台管理后台（Admin Panel）

- [x] 平台管理后台 `/admin`
  - [x] 数据库：`users` 表新增 `platform_role` 字段（`super_admin`/`admin`/`user`）
  - [x] 数据库：`audit_logs` 审计日志表、`system_config` 系统配置表、`system_announcements` 公告表
  - [x] 认证：`requireAdmin()` 中间件（`src/lib/api-auth.ts`）
  - [x] Admin 布局：独立侧边栏 + 顶部栏 + 权限守卫
  - [x] 总览仪表盘 `GET /api/admin/stats` — 团队/用户/智能体/消息统计
  - [x] 团队管理 `GET /api/admin/teams` — 跨团队列表、搜索、分页
  - [x] 团队详情 `GET/PUT/DELETE /api/admin/teams/[id]` — 禁用/启用/软删除
  - [x] 用户管理 `GET /api/admin/users` — 全局用户列表、搜索、分页
  - [x] 用户详情 `GET/PUT/DELETE /api/admin/users/[id]` — 封禁/解封
  - [x] 智能体管理 `GET /api/admin/agents` — 跨团队智能体列表
  - [x] 智能体详情 `GET/PUT /api/admin/agents/[id]` — 审核/驳回
  - [x] 系统配置 `GET/PUT /api/admin/config` — LLM/存储/邀请/安全配置
  - [x] 审计日志 `GET /api/admin/audit-logs` — 操作日志查询
  - [x] 主侧边栏增加平台管理入口（仅 admin 可见）

### Admin API 清单

| 接口 | 方法 | 路径 | 说明 |
|------|------|------|------|
| 平台统计 | GET | `/api/admin/stats` | 团队/用户/智能体/消息统计 |
| 团队列表 | GET | `/api/admin/teams` | 跨团队列表（搜索/分页/排序） |
| 团队详情 | GET | `/api/admin/teams/[id]` | 团队基本信息+成员数 |
| 更新团队 | PUT | `/api/admin/teams/[id]` | 禁用/启用/配额调整 |
| 删除团队 | DELETE | `/api/admin/teams/[id]` | 软删除 |
| 用户列表 | GET | `/api/admin/users` | 全局用户列表（搜索/分页） |
| 用户详情 | GET | `/api/admin/users/[id]` | 用户信息+所属团队 |
| 更新用户 | PUT | `/api/admin/users/[id]` | 封禁/解封 |
| 删除用户 | DELETE | `/api/admin/users/[id]` | 软删除 |
| 智能体列表 | GET | `/api/admin/agents` | 跨团队智能体列表 |
| 智能体详情 | GET | `/api/admin/agents/[id]` | 智能体配置+对话统计 |
| 更新智能体 | PUT | `/api/admin/agents/[id]` | 审核/修改配置 |
| 系统配置 | GET/PUT | `/api/admin/config` | LLM/存储/邀请/安全配置 |
| 审计日志 | GET | `/api/admin/audit-logs` | 操作日志（分页/过滤） |

### Admin 页面清单

| 页面 | 路径 | 说明 |
|------|------|------|
| 总览仪表盘 | `/admin/dashboard` | 统计卡片 + 趋势数据 |
| 团队管理 | `/admin/teams` | 团队列表 + 搜索/分页 |
| 团队详情 | `/admin/teams/[id]` | 团队信息 + 禁用/启用 |
| 用户管理 | `/admin/users` | 用户列表 + 搜索/分页 |
| 用户详情 | `/admin/users/[id]` | 用户信息 + 封禁/解封 |
| 智能体管理 | `/admin/agents` | 智能体列表 + 搜索/过滤 |
| 智能体详情 | `/admin/agents/[id]` | 配置详情 + 审核 |
| 系统配置 | `/admin/settings` | LLM/存储/邀请/安全 |
| 审计日志 | `/admin/audit-logs` | 操作日志查询 |

## 注意事项

1. 所有动态内容（用户状态）必须在客户端渲染，使用 `use client` 指令
2. 页面访问控制通过 `useAuth` Hook 实现
3. Admin 页面访问控制通过 `requireAdmin()` 中间件实现
4. Mock 数据存储在 localStorage 中，正式环境需对接后端API
