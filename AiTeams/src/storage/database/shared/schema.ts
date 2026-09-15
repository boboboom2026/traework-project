import { pgTable, serial, timestamp, varchar, boolean, text, index, uniqueIndex, jsonb, integer, unique } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// 用户表
export const users = pgTable(
  "users",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    phone: varchar("phone", { length: 20 }).notNull().unique(),
    name: varchar("name", { length: 100 }).notNull(),
    nickname: varchar("nickname", { length: 100 }),
    password: varchar("password", { length: 255 }),
    avatar: varchar("avatar", { length: 500 }),
    avatar_url: varchar("avatar_url", { length: 500 }), // 兼容旧字段名（等价于 avatar）
    email: varchar("email", { length: 255 }),
    department: varchar("department", { length: 100 }),
    position: varchar("position", { length: 100 }),
    title: varchar("title", { length: 100 }), // 兼容旧字段名（等价于 position）
    full_name: varchar("full_name", { length: 100 }), // 兼容旧字段名
    real_name: varchar("real_name", { length: 100 }), // 兼容旧字段名
    bio: text("bio"),
    platform_role: varchar("platform_role", { length: 20 }).default("user").notNull(),
    is_active: boolean("is_active").default(true).notNull(),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }),
  },
  (table) => [
    index("users_phone_idx").on(table.phone),
    index("users_email_idx").on(table.email),
  ]
);

// 会话表（API 认证）
export const sessions = pgTable(
  "sessions",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    userId: varchar("user_id", { length: 36 }).notNull().references(() => users.id, { onDelete: "cascade" }),
    token: varchar("token", { length: 64 }).notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("sessions_token_idx").on(table.token),
    index("sessions_user_id_idx").on(table.userId),
  ]
);

// 数字员工任务档案表 - 记录每个智能体执行过的完整任务单元
export const agentTaskRecords = pgTable(
  "agent_task_records",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    agent_id: varchar("agent_id", { length: 36 }).notNull().references(() => agents.id, { onDelete: "cascade" }),
    team_id: varchar("team_id", { length: 36 }).notNull().references(() => teams.id, { onDelete: "cascade" }),
    user_id: varchar("user_id", { length: 36 }).notNull().references(() => users.id, { onDelete: "cascade" }),
    session_id: varchar("session_id", { length: 36 }),
    task_type: varchar("task_type", { length: 30 }).notNull().default("chat"),
    skill_id: varchar("skill_id", { length: 36 }).references(() => skills.id, { onDelete: "set null" }),
    workflow_id: varchar("workflow_id", { length: 36 }).references(() => agentWorkflows.id, { onDelete: "set null" }),
    source: varchar("source", { length: 20 }).notNull().default("chat"),
    channel_id: varchar("channel_id", { length: 36 }),
    input_summary: text("input_summary").notNull(),
    output_summary: text("output_summary"),
    execution_time_ms: integer("execution_time_ms"),
    status: varchar("status", { length: 20 }).notNull().default("success"),
    rating: integer("rating"),
    feedback_text: text("feedback_text"),
    correction: text("correction"),
    tags: text("tags"),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }),
  },
  (table) => [
    index("task_records_agent_id_idx").on(table.agent_id),
    index("task_records_team_id_idx").on(table.team_id),
    index("task_records_user_id_idx").on(table.user_id),
    index("task_records_task_type_idx").on(table.task_type),
    index("task_records_created_at_idx").on(table.created_at),
    index("task_records_status_idx").on(table.status),
  ]
);

// 工作流定义表（关联 Agent 的可执行步骤）
export const agentWorkflows = pgTable(
  "agent_workflows",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    agent_id: varchar("agent_id", { length: 36 }), // FK to agents.id - constraint exists at DB level
    skill_id: varchar("skill_id", { length: 36 }).references(() => skills.id, { onDelete: "set null" }),
    team_id: varchar("team_id", { length: 36 }).notNull().references(() => teams.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),
    trigger_condition: text("trigger_condition"), // LLM 判断触发条件，如："生成日报、日报、daily report"
    steps: jsonb("steps").notNull().default(sql`'[]'`), // 步骤数组
    is_active: boolean("is_active").default(true).notNull(),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }),
  },
  (table) => [
    index("agent_workflows_agent_id_idx").on(table.agent_id),
    index("agent_workflows_team_id_idx").on(table.team_id),
    index("agent_workflows_skill_id_idx").on(table.skill_id),
  ]
);

// 工作流执行 checkpoint 表（支持中断恢复）
export const workflowCheckpoints = pgTable(
  "workflow_checkpoints",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    session_id: varchar("session_id", { length: 36 }).notNull(),
    workflow_id: varchar("workflow_id", { length: 36 }).notNull().references(() => agentWorkflows.id, { onDelete: "cascade" }),
    step_index: integer("step_index").notNull().default(0),
    context: jsonb("context").notNull().default(sql`'{}'`),
    status: varchar("status", { length: 20 }).notNull().default("paused"), // paused, completed, failed
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }),
  },
  (table) => [
    index("workflow_checkpoints_session_id_idx").on(table.session_id),
    index("workflow_checkpoints_workflow_id_idx").on(table.workflow_id),
  ]
);

// 工作流执行实例表（将工作流"包装为任务"：一次执行=一行，可挂起/恢复/追踪）
export const workflowInstances = pgTable(
  "workflow_instances",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    workflow_id: varchar("workflow_id", { length: 36 }).notNull().references(() => agentWorkflows.id, { onDelete: "cascade" }),
    team_id: varchar("team_id", { length: 36 }).references(() => teams.id, { onDelete: "cascade" }),
    session_id: varchar("session_id", { length: 36 }), // 关联对话会话（可空：允许独立任务）
    agent_id: varchar("agent_id", { length: 36 }),
    status: varchar("status", { length: 20 }).notNull().default("running"), // running, awaiting_human, completed, failed, canceled
    current_node_id: varchar("current_node_id", { length: 64 }), // 当前游标（挂起位置）
    snapshot: jsonb("snapshot").default(sql`'{}'`), // 完整可恢复的工作流状态快照
    result: text("result"), // 最终产物文本
    error: text("error"),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }),
  },
  (table) => [
    index("workflow_instances_workflow_idx").on(table.workflow_id),
    index("workflow_instances_session_idx").on(table.session_id),
    index("workflow_instances_team_idx").on(table.team_id),
    index("workflow_instances_status_idx").on(table.status),
  ]
);

// 任务定义表（「任务」一级模块：编排产物 = WorkflowDefinitionV2）
export const tasks = pgTable(
  "tasks",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    team_id: varchar("team_id", { length: 36 }).notNull().references(() => teams.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),
    trigger_condition: text("trigger_condition"), // 触发条件（如"生成日报"）
    agent_id: varchar("agent_id", { length: 36 }), // 默认绑定的智能体
    definition: jsonb("definition").notNull().default(sql`'{}'`), // WorkflowDefinitionV2（nodes + entry_node）
    status: varchar("status", { length: 20 }).notNull().default("draft"), // draft, active, archived
    is_active: boolean("is_active").default(true).notNull(),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }),
  },
  (table) => [
    index("tasks_team_idx").on(table.team_id),
    index("tasks_agent_idx").on(table.agent_id),
  ]
);

// 任务运行实例表（一次执行=一行，快照持久化，可挂起/恢复/追踪）
export const taskRuns = pgTable(
  "task_runs",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    task_id: varchar("task_id", { length: 36 }).notNull().references(() => tasks.id, { onDelete: "cascade" }),
    team_id: varchar("team_id", { length: 36 }).references(() => teams.id, { onDelete: "set null" }),
    session_id: varchar("session_id", { length: 36 }), // 关联对话会话（可空）
    triggered_by: varchar("triggered_by", { length: 36 }), // 触发者（user id 或 agent id）
    status: varchar("status", { length: 20 }).notNull().default("pending"), // pending, running, awaiting_human, completed, failed, canceled
    current_node_id: varchar("current_node_id", { length: 64 }), // 当前游标（挂起位置）
    snapshot: jsonb("snapshot"), // 完整可恢复的工作流状态快照
    result: text("result"), // 最终产物文本
    error: text("error"),
    started_at: timestamp("started_at", { withTimezone: true }),
    completed_at: timestamp("completed_at", { withTimezone: true }),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }),
  },
  (table) => [
    index("task_runs_task_idx").on(table.task_id),
    index("task_runs_team_idx").on(table.team_id),
    index("task_runs_status_idx").on(table.status),
  ]
);

// 工作流人工审批任务表（指定审批人 + 带内容的审批工单）
export const workflowApprovalTasks = pgTable(
  "workflow_approval_tasks",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    workflow_id: varchar("workflow_id", { length: 36 }).notNull().references(() => agentWorkflows.id, { onDelete: "cascade" }),
    session_id: varchar("session_id", { length: 36 }).notNull(),
    step_index: integer("step_index").notNull().default(0),
    step_id: varchar("step_id", { length: 64 }).notNull(),
    step_name: varchar("step_name", { length: 255 }),
    team_id: varchar("team_id", { length: 36 }).references(() => teams.id, { onDelete: "cascade" }),
    approver_id: varchar("approver_id", { length: 36 }).notNull().references(() => users.id),
    applicant_id: varchar("applicant_id", { length: 36 }).references(() => users.id),
    status: varchar("status", { length: 20 }).notNull().default("pending"), // pending, approved, rejected, canceled
    message: text("message"),
    detail: text("detail"), // 审批工单正文（如文章初稿全文）
    detail_type: varchar("detail_type", { length: 20 }).default("markdown"),
    payload: jsonb("payload").default(sql`'{}'`), // 上下文/产物快照
    decided_by: varchar("decided_by", { length: 36 }).references(() => users.id),
    decided_at: timestamp("decided_at", { withTimezone: true }),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }),
  },
  (table) => [
    index("workflow_approval_approver_idx").on(table.approver_id, table.status),
    index("workflow_approval_session_idx").on(table.session_id),
    index("workflow_approval_team_idx").on(table.team_id),
    index("workflow_approval_workflow_idx").on(table.workflow_id),
  ]
);

// 角色/岗位定义表
export const roles = pgTable(
  "roles",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    team_id: varchar("team_id", { length: 36 }).notNull().references(() => teams.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),
    responsibilities: text("responsibilities"), // 岗位职责（Markdown）
    sort_order: integer("sort_order").default(0),
    status: varchar("status", { length: 20 }).notNull().default("active"),
    created_by: varchar("created_by", { length: 36 }).references(() => users.id),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }),
  },
  (table) => [
    index("roles_team_id_idx").on(table.team_id),
    index("roles_status_idx").on(table.status),
  ]
);

// 角色Agent配置模板表（Hermes 6层配置）
export const roleAgentConfigs = pgTable(
  "role_agent_configs",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    role_id: varchar("role_id", { length: 36 }).notNull().references(() => roles.id, { onDelete: "cascade" }).unique(),
    // 第一层：基础配置
    system_prompt: text("system_prompt"),
    greeting: text("greeting"),
    user_guidance: text("user_guidance"),
    // 第二层：关联资源
    tool_ids: jsonb("tool_ids").default(sql`'[]'`),
    skill_ids: jsonb("skill_ids").default(sql`'[]'`),
    rag_dataset_ids: jsonb("rag_dataset_ids").default(sql`'[]'`),
    mcp_service_ids: jsonb("mcp_service_ids").default(sql`'[]'`),
    // 第三层：安全
    prompt_guard_enabled: boolean("prompt_guard_enabled").default(false),
    tool_approval_mode: varchar("tool_approval_mode", { length: 20 }).default("auto"),
    // 第四层：记忆
    memory_enabled: boolean("memory_enabled").default(false),
    memory_config: jsonb("memory_config").default(sql`'{"recall_count":5,"strategy":"semantic"}'`),
    // 第五层：对话优化
    channel_context_enabled: boolean("channel_context_enabled").default(false).notNull(),
    channel_context_limit: integer("channel_context_limit").default(20),
    context_compress_enabled: boolean("context_compress_enabled").default(false),
    model_config: jsonb("model_config").default(sql`'{"model":"gpt-4o-mini","temperature":0.7,"max_tokens":2000}'`),
    max_iterations: integer("max_iterations").default(10),
    // 第六层：主动能力
    notify_enabled: boolean("notify_enabled").default(false).notNull(),
    notify_config: jsonb("notify_config").default(sql`'{}'`),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }),
  },
  (table) => [
    index("role_agent_configs_role_id_idx").on(table.role_id),
  ]
);

// ==================== 新架构：清晰分离 ====================

// 工具表 (Tools) - 可执行函数定义
export const tools = pgTable(
  "tools", // 统一使用 tools 表名
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    team_id: varchar("team_id", { length: 36 }).notNull().references(() => teams.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 100 }).notNull(),
    description: text("description"),
    icon: varchar("icon", { length: 50 }).default("wrench"),
    category: varchar("category", { length: 50 }).notNull().default("operation"),
    parameters: jsonb("parameters").default(sql`'[]'`),
    action: varchar("action", { length: 100 }).notNull(),
    enabled: boolean("enabled").default(true).notNull(),
    is_builtin: boolean("is_builtin").default(false).notNull(),
    mcp_service_id: varchar("mcp_service_id", { length: 36 }).references(() => mcpServices.id, { onDelete: "set null" }), // 关联 MCP 服务（可选）
    tool_type: varchar("tool_type", { length: 20 }).default("builtin").notNull(), // 工具类型: builtin=内置, http=自定义HTTP, mcp=MCP服务
    config: jsonb("config").default(sql`'{}'`),
    service_id: varchar("service_id", { length: 36 }), // 兼容旧字段名（等价于 mcp_service_id）
    is_active: boolean("is_active").default(true), // 兼容旧字段名（等价于 enabled）
    created_by: varchar("created_by", { length: 36 }),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }),
  },
  (table) => [
    index("tools_team_id_idx").on(table.team_id),
    index("tools_category_idx").on(table.category),
    index("tools_mcp_service_id_idx").on(table.mcp_service_id),
  ]
);

// 智能体-技能关联表 (已废弃，由 agents.skill_ids JSONB 字段替代)
// 保留空注释占位，迁移后删除

// 智能体-MCP关联表 (Agent ↔ MCP Services)
export const agentMcpBindings = pgTable(
  "agent_mcp_bindings",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    agent_id: varchar("agent_id", { length: 36 }).notNull().references(() => agents.id, { onDelete: "cascade" }),
    mcp_id: varchar("mcp_id", { length: 36 }).notNull().references(() => mcpServices.id, { onDelete: "cascade" }),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("agent_mcp_bindings_unique").on(table.agent_id, table.mcp_id),
    index("agent_mcp_bindings_agent_id_idx").on(table.agent_id),
    index("agent_mcp_bindings_mcp_id_idx").on(table.mcp_id),
  ]
);

// 团队表
export const teams = pgTable(
  "teams",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    name: varchar("name", { length: 100 }).notNull(),
    type: varchar("type", { length: 20 }).notNull().default("company"), // company: 团队, community: 社区
    logo: varchar("logo", { length: 500 }),
    avatar_url: varchar("avatar_url", { length: 500 }), // 兼容旧字段名（等价于 logo）
    website: varchar("website", { length: 500 }),
    color: varchar("color", { length: 20 }).default("#3B82F6"),
    industry: varchar("industry", { length: 100 }),
    owner_id: varchar("owner_id", { length: 36 }).notNull().references(() => users.id),
    is_active: boolean("is_active").default(true).notNull(),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }),
  },
  (table) => [
    index("teams_owner_id_idx").on(table.owner_id),
    index("teams_name_idx").on(table.name),
  ]
);

// 团队成员关系表
export const teamMembers = pgTable(
  "team_members",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    team_id: varchar("team_id", { length: 36 }).notNull().references(() => teams.id, { onDelete: "cascade" }),
    user_id: varchar("user_id", { length: 36 }).notNull().references(() => users.id, { onDelete: "cascade" }),
    role: varchar("role", { length: 20 }).notNull().default("member"), // owner: 所有者, admin: 管理员, member: 成员
    name: varchar("name", { length: 100 }), // 冗余字段：部分代码直接从 team_members 读取成员姓名
    avatar: varchar("avatar", { length: 500 }), // 冗余字段：同上
    joined_at: timestamp("joined_at", { withTimezone: true }).defaultNow().notNull(),
    last_read_mentions_at: timestamp("last_read_mentions_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("team_members_team_id_idx").on(table.team_id),
    index("team_members_user_id_idx").on(table.user_id),
  ]
);

// 团队邀请表
export const teamInvites = pgTable(
  "team_invites",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    team_id: varchar("team_id", { length: 36 }).notNull().references(() => teams.id, { onDelete: "cascade" }),
    inviter_id: varchar("inviter_id", { length: 36 }).notNull().references(() => users.id),
    invite_code: varchar("invite_code", { length: 32 }).notNull().unique(),
    status: varchar("status", { length: 20 }).notNull().default("pending"), // pending: 待接受, accepted: 已接受, expired: 已过期, cancelled: 已取消
    max_uses: integer("max_uses").default(1),
    used_count: integer("used_count").default(0),
    expires_at: timestamp("expires_at", { withTimezone: true }),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("team_invites_team_id_idx").on(table.team_id),
    index("team_invites_invite_code_idx").on(table.invite_code),
    index("team_invites_status_idx").on(table.status),
  ]
);

// 验证码表（用于登录注册等场景）
export const verificationCodes = pgTable(
  "verification_codes",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    phone: varchar("phone", { length: 20 }).notNull(),
    code: varchar("code", { length: 6 }).notNull(),
    type: varchar("type", { length: 20 }).notNull().default("login"), // login: 登录, register: 注册, bind: 绑定
    used: boolean("used").default(false).notNull(),
    expires_at: timestamp("expires_at", { withTimezone: true }).notNull(),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("verification_codes_phone_idx").on(table.phone),
    index("verification_codes_code_idx").on(table.code),
  ]
);

export const healthCheck = pgTable("health_check", {
	id: serial().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
});

// Skills 技能表（SOP 格式，存储技能文档）
// 每个技能可关联到一个岗位（position_id），也可独立存在供全局使用
export const skills = pgTable(
  "skills",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    team_id: varchar("team_id", { length: 36 }).notNull().references(() => teams.id, { onDelete: "cascade" }),
    user_id: varchar("user_id", { length: 36 }),
    name: varchar("name", { length: 200 }).notNull(),
    description: text("description"),
    content: text("content").default(sql`''`), // 技能主体内容，Markdown 格式
    source_type: varchar("source_type", { length: 20 }).default("manual"), // manual, ai_generated, file_upload
    source_file: varchar("source_file", { length: 255 }), // 原始文件名
    version: integer("version").default(1),
    is_published: boolean("is_published").default(false),
    position_id: varchar("position_id", { length: 36 }).references(() => positions.id, { onDelete: "cascade" }), // 关联岗位（可选）
    // Skill 执行相关字段
    trigger_condition: text("trigger_condition"), // 触发条件（选填，填写后可加速匹配）
    is_executable: boolean("is_executable").default(false), // 是否可作为可执行能力模块被调用
    expected_output: text("expected_output"), // 预期输出格式描述（如"JSON格式：{company, product, analysis}"），用于结构化输出
    input_schema: jsonb("input_schema"), // 输入参数 schema
    output_schema: jsonb("output_schema"), // 输出结果 schema
    tags: jsonb("tags").default(sql`'[]'`),
    status: varchar("status", { length: 20 }).default("active"), // 兼容旧字段名（等价于 is_published）
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }),
  },
  (table) => [
    index("skills_team_id_idx").on(table.team_id),
    index("skills_name_idx").on(table.name),
    index("skills_position_id_idx").on(table.position_id),
  ]
);

// 部门表（组织架构）
export const departments = pgTable(
  "departments",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    team_id: varchar("team_id", { length: 36 }).notNull().references(() => teams.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 100 }).notNull(),
    parent_id: varchar("parent_id", { length: 36 }),
    sort_order: integer("sort_order").default(0).notNull(),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }),
  },
  (table) => [
    index("departments_team_id_idx").on(table.team_id),
    index("departments_parent_id_idx").on(table.parent_id),
  ]
);

// 群组表（用户组）
export const groups = pgTable(
  "groups",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    team_id: varchar("team_id", { length: 36 }).notNull().references(() => teams.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 100 }).notNull(),
    description: text("description"),
    creator_id: varchar("creator_id", { length: 36 }).references(() => users.id),
    created_by: varchar("created_by", { length: 36 }), // 兼容旧字段名（等价于 creator_id）
    member_count: integer("member_count").default(0),
    is_active: boolean("is_active").default(true).notNull(),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }),
  },
  (table) => [
    index("groups_team_id_idx").on(table.team_id),
    index("groups_creator_id_idx").on(table.creator_id),
  ]
);

// 群组成员关系表
export const groupMembers = pgTable(
  "group_members",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    group_id: varchar("group_id", { length: 36 }).notNull().references(() => groups.id, { onDelete: "cascade" }),
    user_id: varchar("user_id", { length: 36 }).notNull().references(() => users.id, { onDelete: "cascade" }),
    added_at: timestamp("added_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("group_members_group_id_idx").on(table.group_id),
    index("group_members_user_id_idx").on(table.user_id),
  ]
);

// 私聊会话表
export const dmConversations = pgTable(
  "dm_conversations",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    team_id: varchar("team_id", { length: 36 }).references(() => teams.id, { onDelete: "cascade" }),
    participant1_id: varchar("participant1_id", { length: 36 }).references(() => users.id, { onDelete: "cascade" }),
    participant2_id: varchar("participant2_id", { length: 36 }).references(() => users.id, { onDelete: "cascade" }),
    user1_id: varchar("user1_id", { length: 36 }), // 兼容旧字段名（等价于 participant1_id）
    user2_id: varchar("user2_id", { length: 36 }), // 兼容旧字段名（等价于 participant2_id）
    last_message: text("last_message"),
    last_message_at: timestamp("last_message_at", { withTimezone: true }),
    is_active: boolean("is_active").default(true).notNull(),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }),
  },
  (table) => [
    index("dm_conversations_team_id_idx").on(table.team_id),
    index("dm_conversations_p1_idx").on(table.participant1_id),
    index("dm_conversations_p2_idx").on(table.participant2_id),
  ]
);

// 私聊消息表
export const dmMessages = pgTable(
  "dm_messages",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    conversation_id: varchar("conversation_id", { length: 36 }).notNull().references(() => dmConversations.id, { onDelete: "cascade" }),
    sender_id: varchar("sender_id", { length: 36 }).notNull().references(() => users.id, { onDelete: "cascade" }),
    sender_type: varchar("sender_type", { length: 20 }).default("user"), // user | agent
    content: text("content").notNull(),
    message_type: varchar("message_type", { length: 20 }).notNull().default("text"), // text, image, file
    forwarded_from_type: varchar("forwarded_from_type", { length: 30 }), // channel_message | dm_message | agent_message
    forwarded_from_id: varchar("forwarded_from_id", { length: 36 }),
    is_read: boolean("is_read").default(false).notNull(),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("dm_messages_conversation_id_idx").on(table.conversation_id),
    index("dm_messages_sender_id_idx").on(table.sender_id),
    index("dm_messages_created_at_idx").on(table.created_at),
  ]
);

// 频道分区表
export const channelSections = pgTable(
  "channel_sections",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    team_id: varchar("team_id", { length: 36 }).notNull().references(() => teams.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 100 }).notNull(),
    icon: varchar("icon", { length: 10 }),
    is_default: boolean("is_default").default(false).notNull(),
    sort_order: integer("sort_order").default(0).notNull(),
    is_collapsed: boolean("is_collapsed").default(false).notNull(),
    created_by: varchar("created_by", { length: 36 }).references(() => users.id),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }),
  },
  (table) => [
    index("channel_sections_team_id_idx").on(table.team_id),
    index("channel_sections_sort_order_idx").on(table.team_id, table.sort_order),
  ]
);

// 频道表
export const channels = pgTable(
  "channels",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    section_id: varchar("section_id", { length: 36 }).references(() => channelSections.id, { onDelete: "set null" }),
    team_id: varchar("team_id", { length: 36 }).notNull().references(() => teams.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 100 }).notNull(),
    description: text("description"),
    type: varchar("type", { length: 20 }).notNull().default("public"), // public, private
    icon: varchar("icon", { length: 10 }),
    creator_id: varchar("creator_id", { length: 36 }).references(() => users.id),
    created_by: varchar("created_by", { length: 36 }), // 兼容旧字段名（等价于 creator_id）
    is_private: boolean("is_private").default(false), // 兼容旧字段名（等价于 type === "private"）
    sort_order: integer("sort_order").default(0).notNull(),
    is_active: boolean("is_active").default(true).notNull(),
    is_default: boolean("is_default").default(false).notNull(),
    is_pinned: boolean("is_pinned").default(false).notNull(),
    ai_assistant_enabled: boolean("ai_assistant_enabled").default(false).notNull(),
    ai_assistant_id: varchar("ai_assistant_id", { length: 36 }).references(() => agents.id, { onDelete: "set null" }),
    ai_assistant_config: jsonb("ai_assistant_config").default(sql`'{"frequency":"auto","topics":[],"max_messages":50}'`),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }),
  },
  (table) => [
    index("channels_team_id_idx").on(table.team_id),
    index("channels_section_id_idx").on(table.section_id),
    index("channels_sort_order_idx").on(table.section_id, table.sort_order),
  ]
);

// 频道成员表
export const channelMembers = pgTable(
  "channel_members",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    channel_id: varchar("channel_id", { length: 36 }).notNull().references(() => channels.id, { onDelete: "cascade" }),
    user_id: varchar("user_id", { length: 36 }).notNull().references(() => users.id, { onDelete: "cascade" }),
    role: varchar("role", { length: 20 }).default("member"),
    joined_at: timestamp("joined_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("channel_members_channel_id_idx").on(table.channel_id),
    index("channel_members_user_id_idx").on(table.user_id),
  ]
);

// 频道消息表
export const channelMessages = pgTable(
  "channel_messages",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    channel_id: varchar("channel_id", { length: 36 }).notNull().references(() => channels.id, { onDelete: "cascade" }),
    sender_id: varchar("sender_id", { length: 36 }).notNull(),
    sender_type: varchar("sender_type", { length: 20 }).default("user"), // user, agent
    content: text("content"),
    message_type: varchar("message_type", { length: 20 }).notNull().default("text"), // text, image, video, file, mixed
    attachments: jsonb("attachments").default(sql`'[]'`), // [{type, url, name, size, duration, width, height}]
    attachment_summary: text("attachment_summary"), // 附件摘要文本（视频/文件摘要）
    topic_tags: jsonb("topic_tags").default(sql`'[]'`), // ["用户社区", "产品"]
    reply_to_id: varchar("reply_to_id", { length: 36 }),
    thread_root_id: varchar("thread_root_id", { length: 36 }),
    forwarded_from_id: varchar("forwarded_from_id", { length: 36 }), // 转发的原消息ID
    mentions: jsonb("mentions").default(sql`'[]'`), // ["userId1", "userId2"] 被@提及的用户ID列表
    is_active: boolean("is_active").default(true).notNull(),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }),
  },
  (table) => [
    index("channel_messages_channel_id_idx").on(table.channel_id),
    index("channel_messages_sender_id_idx").on(table.sender_id),
    index("channel_messages_reply_to_id_idx").on(table.reply_to_id),
    index("channel_messages_thread_root_id_idx").on(table.thread_root_id),
    index("channel_messages_created_at_idx").on(table.created_at),
    index("channel_messages_channel_created_idx").on(table.channel_id, table.created_at),
  ]
);

// 频道消息反应表
export const channelMessageReactions = pgTable(
  "channel_message_reactions",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    message_id: varchar("message_id", { length: 36 }).notNull().references(() => channelMessages.id, { onDelete: "cascade" }),
    user_id: varchar("user_id", { length: 36 }).notNull().references(() => users.id, { onDelete: "cascade" }),
    emoji: varchar("emoji", { length: 10 }).notNull(),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("channel_message_reactions_message_id_idx").on(table.message_id),
    index("channel_message_reactions_user_id_idx").on(table.user_id),
  ]
);

// 频道消息收藏表
export const channelBookmarks = pgTable(
  "channel_bookmarks",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    message_id: varchar("message_id", { length: 36 }).notNull().references(() => channelMessages.id, { onDelete: "cascade" }),
    user_id: varchar("user_id", { length: 36 }).notNull().references(() => users.id, { onDelete: "cascade" }),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("channel_bookmarks_message_id_idx").on(table.message_id),
    index("channel_bookmarks_user_id_idx").on(table.user_id),
    index("channel_bookmarks_user_message_idx").on(table.user_id, table.message_id),
  ]
);

// 频道已读状态表
export const channelReadStates = pgTable(
  "channel_read_states",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    channel_id: varchar("channel_id", { length: 36 }).notNull().references(() => channels.id, { onDelete: "cascade" }),
    user_id: varchar("user_id", { length: 36 }).notNull().references(() => users.id, { onDelete: "cascade" }),
    last_read_at: timestamp("last_read_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("channel_read_states_channel_user_idx").on(table.channel_id, table.user_id),
  ]
);

// 频道知识库绑定表
export const channelRagBindings = pgTable(
  "channel_rag_bindings",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    channel_id: varchar("channel_id", { length: 36 }).notNull().references(() => channels.id, { onDelete: "cascade" }),
    rag_dataset_id: varchar("rag_dataset_id", { length: 36 }).notNull().references(() => ragDatasets.id, { onDelete: "cascade" }),
    scope: varchar("scope", { length: 20 }).default("channel"), // channel: 仅当前频道, section: 当前分区, team: 整个团队
    created_by: varchar("created_by", { length: 36 }).references(() => users.id),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("channel_rag_bindings_channel_id_idx").on(table.channel_id),
    index("channel_rag_bindings_dataset_id_idx").on(table.rag_dataset_id),
  ]
);

// MCP 服务连接层
export const mcpServices = pgTable(
  "mcp_services",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    team_id: varchar("team_id", { length: 36 }).notNull().references(() => teams.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 100 }).notNull(),
    description: text("description"),
    endpoint_url: varchar("endpoint_url", { length: 500 }).notNull(),
    allowed_operations: jsonb("allowed_operations").default(sql`'[]'`),
    config: jsonb("config").default(sql`'{}'`),
    status: varchar("status", { length: 20 }).notNull().default("active"),
    created_by: varchar("created_by", { length: 36 }).references(() => users.id),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }),
  },
  (table) => [
    index("mcp_services_team_id_idx").on(table.team_id),
    index("mcp_services_status_idx").on(table.status),
  ]
);

// RAG 知识管理层
export const ragDatasets = pgTable(
  "rag_datasets",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    team_id: varchar("team_id", { length: 36 }).notNull().references(() => teams.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 100 }).notNull(),
    description: text("description"),
    document_count: integer("document_count").default(0),
    sync_config: jsonb("sync_config").default(sql`'{}'`),
    status: varchar("status", { length: 20 }).notNull().default("active"),
    enabled: boolean("enabled").default(true), // 兼容旧字段名（等价于 status === "active"）
    created_by: varchar("created_by", { length: 36 }).references(() => users.id),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }),
  },
  (table) => [
    index("rag_datasets_team_id_idx").on(table.team_id),
    index("rag_datasets_status_idx").on(table.status),
  ]
);

// RAG 文档表
export const ragDocuments = pgTable(
  "rag_documents",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    dataset_id: varchar("dataset_id", { length: 36 }).notNull().references(() => ragDatasets.id, { onDelete: "cascade" }),
    file_name: varchar("file_name", { length: 500 }).notNull(),
    file_type: varchar("file_type", { length: 50 }).notNull(),
    file_size: integer("file_size").default(0),
    file_key: varchar("file_key", { length: 500 }),
    status: varchar("status", { length: 20 }).notNull().default("pending"), // pending/processing/ready/failed
    chunk_count: integer("chunk_count").default(0),
    error_message: text("error_message"),
    created_by: varchar("created_by", { length: 36 }).references(() => users.id),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }),
  },
  (table) => [
    index("rag_documents_dataset_id_idx").on(table.dataset_id),
    index("rag_documents_status_idx").on(table.status),
  ]
);

// 智能体-工具关联表 (Agent ↔ Tools)
export const agentToolBindings = pgTable(
  "agent_tool_bindings",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    agent_id: varchar("agent_id", { length: 36 }).notNull().references(() => agents.id, { onDelete: "cascade" }),
    tool_id: varchar("tool_id", { length: 36 }).notNull().references(() => tools.id, { onDelete: "cascade" }),
    skill_id: varchar("skill_id", { length: 36 }), // 兼容旧字段名：部分代码用它存 tool_id
    config: jsonb("config").default(sql`'{}'`),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("agent_tool_bindings_unique").on(table.agent_id, table.tool_id),
  ]
);

// 智能体-知识库关联表 (Agent ↔ RAG Datasets)
export const agentRagBindings = pgTable(
  "agent_rag_bindings",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    agent_id: varchar("agent_id", { length: 36 }).notNull().references(() => agents.id, { onDelete: "cascade" }),
    rag_id: varchar("rag_id", { length: 36 }).notNull().references(() => ragDatasets.id, { onDelete: "cascade" }),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("agent_rag_bindings_unique").on(table.agent_id, table.rag_id),
  ]
);

// RAG 文档块表
export const ragChunks = pgTable(
  "rag_chunks",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    document_id: varchar("document_id", { length: 36 }).notNull().references(() => ragDocuments.id, { onDelete: "cascade" }),
    dataset_id: varchar("dataset_id", { length: 36 }).notNull().references(() => ragDatasets.id, { onDelete: "cascade" }),
    chunk_index: integer("chunk_index").default(0),
    content: text("content").notNull(),
    token_count: integer("token_count").default(0),
    embedding: jsonb("embedding"),  // 存储为 jsonb 数组，通过 RPC 函数做向量搜索
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("rag_chunks_document_id_idx").on(table.document_id),
    index("rag_chunks_dataset_id_idx").on(table.dataset_id),
  ]
);

// Agent 决策调度层
export const agents = pgTable(
  "agents",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    team_id: varchar("team_id", { length: 36 }).notNull().references(() => teams.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 100 }).notNull(),
    description: text("description"),
    avatar: varchar("avatar", { length: 500 }),
    system_prompt: text("system_prompt"),
    role_identity: text("role_identity"),                   // SO.md层 - 稳定的角色身份（"这个Agent是谁"）
    boundaries: jsonb("boundaries").default(sql`'[]'`),     // Config.yml禁区 - [{action, permission: "allow"|"deny"|"approval"}]
    tool_ids: jsonb("tool_ids").default(sql`'[]'`),         // 工具ID数组（替代 agent_tool_bindings）
    skill_ids: jsonb("skill_ids").default(sql`'[]'`),       // 关联 skills
    rag_dataset_ids: jsonb("rag_dataset_ids").default(sql`'[]'`),  // 关联知识库
    mcp_service_ids: jsonb("mcp_service_ids").default(sql`'[]'`),  // 关联 mcp_services
    prompt_guard_enabled: boolean("prompt_guard_enabled").default(false),
    tool_approval_mode: varchar("tool_approval_mode", { length: 20 }).default("auto"),
    memory_enabled: boolean("memory_enabled").default(false),
    memory_config: jsonb("memory_config").default(sql`'{"recall_count":5,"strategy":"semantic"}'`),
    greeting: text("greeting"),
    user_guidance: text("user_guidance"),
    context_compress_enabled: boolean("context_compress_enabled").default(false),
    model_config: jsonb("model_config").default(sql`'{"model":"gpt-4o-mini","temperature":0.7,"max_tokens":2000}'`),
    max_iterations: integer("max_iterations").default(10),
    channel_context_enabled: boolean("channel_context_enabled").default(false).notNull(),
    channel_context_limit: integer("channel_context_limit").default(20),
    channel_context_scope: varchar("channel_context_scope", { length: 20 }).default("channel"), // channel: 当前频道, thread: 回复线程
    notify_enabled: boolean("notify_enabled").default(false).notNull(),
    notify_config: jsonb("notify_config").default(sql`'{}'`), // { channels: [...], users: [...], webhook_secret: "...", template: "...", quiet_hours: { start, end } }
    position_id: varchar("position_id", { length: 36 }).references(() => positions.id, { onDelete: "set null" }),
    workflow_id: varchar("workflow_id", { length: 36 }), // FK to agent_workflows.id - constraint exists at DB level
    role_id: varchar("role_id", { length: 36 }).references(() => roles.id, { onDelete: "set null" }),
    status: varchar("status", { length: 20 }).notNull().default("active"),
    is_active: boolean("is_active").default(true), // 兼容旧字段名（等价于 status === "active"）
    agent_md: text("agent_md"), // AGENT.md 完整文档
    few_shot_examples: text("few_shot_examples"), // Few-shot 示例
    output_format: varchar("output_format", { length: 20 }).default("auto"), // auto | json | markdown | text
    json_schema: text("json_schema"), // output_format=json 时的 JSON Schema
    max_tokens: integer("max_tokens").default(2000),
    created_by: varchar("created_by", { length: 36 }).references(() => users.id),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }),
  },
  (table) => [
    index("agents_team_id_idx").on(table.team_id),
    index("agents_status_idx").on(table.status),
  ]
);

// 智能体对话会话表
export const agentChatSessions = pgTable(
  "agent_chat_sessions",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    team_id: varchar("team_id", { length: 36 }).notNull().references(() => teams.id, { onDelete: "cascade" }),
    user_id: varchar("user_id", { length: 36 }).notNull().references(() => users.id, { onDelete: "cascade" }),
    agent_id: varchar("agent_id", { length: 36 }).notNull().references(() => agents.id, { onDelete: "cascade" }),
    last_message: text("last_message"),
    last_message_at: timestamp("last_message_at", { withTimezone: true }),
    is_active: boolean("is_active").default(true).notNull(),
    task_status: varchar("task_status", { length: 20 }).default("idle"), // idle, in_progress, completed, failed
    task_summary: text("task_summary"),
    last_artifacts: jsonb("last_artifacts").default(sql`'[]'`), // [{type, url, name}]
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }),
  },
  (table) => [
    index("agent_chat_sessions_team_id_idx").on(table.team_id),
    index("agent_chat_sessions_user_id_idx").on(table.user_id),
    index("agent_chat_sessions_agent_id_idx").on(table.agent_id),
  ]
);

// 智能体对话消息表
export const agentChatMessages = pgTable(
  "agent_chat_messages",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    session_id: varchar("session_id", { length: 36 }).notNull().references(() => agentChatSessions.id, { onDelete: "cascade" }),
    sender_type: varchar("sender_type", { length: 20 }).notNull().default("user"), // user, agent
    sender_id: varchar("sender_id", { length: 36 }).notNull(),
    content: text("content").notNull(),
    attachments: jsonb("attachments").default(sql`'[]'`), // [{type, url, name, size, key, contentType}]
    is_read: boolean("is_read").default(false).notNull(),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("agent_chat_messages_session_id_idx").on(table.session_id),
    index("agent_chat_messages_created_at_idx").on(table.created_at),
  ]
);

// 智能体持久化记忆表
export const agentMemories = pgTable(
  "agent_memories",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    agent_id: varchar("agent_id", { length: 36 }).notNull().references(() => agents.id, { onDelete: "cascade" }),
    user_id: varchar("user_id", { length: 36 }).notNull().references(() => users.id, { onDelete: "cascade" }),
    team_id: varchar("team_id", { length: 36 }).notNull().references(() => teams.id, { onDelete: "cascade" }),
    memory_type: varchar("memory_type", { length: 20 }).default("conversation"),
    content: text("content").notNull(),
    embedding: varchar("embedding", { length: 1000 }), // pgvector 模拟
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("agent_memories_agent_user_idx").on(table.agent_id, table.user_id),
    index("agent_memories_created_at_idx").on(table.created_at),
  ]
);

// 智能体用户偏好表（User.md层 - 记录Agent对每个用户的学习成果）
export const agentUserPreferences = pgTable(
  "agent_user_preferences",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    agent_id: varchar("agent_id", { length: 36 }).notNull().references(() => agents.id, { onDelete: "cascade" }),
    user_id: varchar("user_id", { length: 36 }).notNull().references(() => users.id, { onDelete: "cascade" }),
    team_id: varchar("team_id", { length: 36 }).notNull().references(() => teams.id, { onDelete: "cascade" }),
    preferences: jsonb("preferences").default(sql`'{}'`), // 学习到的偏好 {language, format, style, common_topics, ...}
    interaction_count: integer("interaction_count").default(0),
    last_interaction_at: timestamp("last_interaction_at", { withTimezone: true }),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }),
  },
  (table) => [
    index("agent_pref_agent_user_idx").on(table.agent_id, table.user_id),
    index("agent_pref_team_idx").on(table.team_id),
  ]
);

// ==================== 岗位模块 ====================

// 岗位表（业务视角的角色定义）
export const positions = pgTable(
  "positions",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    team_id: varchar("team_id", { length: 36 }).notNull().references(() => teams.id, { onDelete: "cascade" }),
    department_id: varchar("department_id", { length: 36 }).references(() => departments.id, { onDelete: "set null" }),
    name: varchar("name", { length: 100 }).notNull(),
    description: text("description"),
    icon: varchar("icon", { length: 10 }).default("Briefcase"),
    color: varchar("color", { length: 7 }).default("#3B82F6"),
    job_works: jsonb("job_works").default([]).notNull(),
    is_active: boolean("is_active").default(true).notNull(),
    status: varchar("status", { length: 20 }).default("active"), // 兼容旧字段名（等价于 is_active）
    created_by: varchar("created_by", { length: 36 }).references(() => users.id),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }),
  },
  (table) => [
    index("positions_team_id_idx").on(table.team_id),
    index("positions_department_id_idx").on(table.department_id),
    index("positions_status_idx").on(table.is_active),
  ]
);

// ==================== 数字成员档案模块 ====================

// 任务执行日志
export const agentTaskLogs = pgTable(
  "agent_task_logs",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    agent_id: varchar("agent_id", { length: 36 }).notNull().references(() => agents.id, { onDelete: "cascade" }),
    team_id: varchar("team_id", { length: 36 }).notNull().references(() => teams.id, { onDelete: "cascade" }),
    user_id: varchar("user_id", { length: 36 }).references(() => users.id),
    session_id: varchar("session_id", { length: 36 }).references(() => agentChatSessions.id, { onDelete: "set null" }),
    task_type: varchar("task_type", { length: 30 }).notNull().default("chat"), // chat, channel_reply, notify, tool_call
    task_input: text("task_input"),
    task_output: text("task_output"),
    tool_calls: jsonb("tool_calls").default(sql`'[]'`), // [{tool, action, params, result}]
    duration_ms: integer("duration_ms"),
    status: varchar("status", { length: 20 }).notNull().default("completed"), // completed, failed, timeout
    error_message: text("error_message"),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("agent_task_logs_agent_id_idx").on(table.agent_id),
    index("agent_task_logs_team_id_idx").on(table.team_id),
    index("agent_task_logs_created_at_idx").on(table.created_at),
    index("agent_task_logs_agent_created_idx").on(table.agent_id, table.created_at),
  ]
);

// 用户反馈评价
export const agentFeedbacks = pgTable(
  "agent_feedbacks",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    agent_id: varchar("agent_id", { length: 36 }).notNull().references(() => agents.id, { onDelete: "cascade" }),
    team_id: varchar("team_id", { length: 36 }).notNull().references(() => teams.id, { onDelete: "cascade" }),
    user_id: varchar("user_id", { length: 36 }).notNull().references(() => users.id),
    task_log_id: varchar("task_log_id", { length: 36 }).references(() => agentTaskLogs.id, { onDelete: "set null" }),
    rating: integer("rating").notNull(), // 1-5
    feedback_type: varchar("feedback_type", { length: 20 }).default("manual"), // manual, auto, thumbs, correction
    tags: jsonb("tags").default(sql`'[]'`), // ['准确', '快速', '需要改进']
    comment: text("comment"),
    correction: text("correction"), // 用户修正的内容（最强信号）
    category: varchar("category", { length: 50 }), // 反馈分类
    content: text("content"), // 反馈正文（部分代码使用 content 而非 comment）
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("agent_feedbacks_agent_id_idx").on(table.agent_id),
    index("agent_feedbacks_team_id_idx").on(table.team_id),
    index("agent_feedbacks_agent_created_idx").on(table.agent_id, table.created_at),
  ]
);

// 培训/知识投喂记录
export const agentTrainingRecords = pgTable(
  "agent_training_records",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    agent_id: varchar("agent_id", { length: 36 }).notNull().references(() => agents.id, { onDelete: "cascade" }),
    team_id: varchar("team_id", { length: 36 }).notNull().references(() => teams.id, { onDelete: "cascade" }),
    train_type: varchar("train_type", { length: 30 }).notNull(), // skill_update, knowledge_feed, prompt_tune, manual_correct, feedback_memory
    source_type: varchar("source_type", { length: 20}), // manual, file, url, rag, feedback
    source_ref: text("source_ref"), // 来源引用（文件名/URL/RAG ID/消息ID）
    content: text("content"), // 变更内容摘要
    before_state: jsonb("before_state"), // 变更前快照
    after_state: jsonb("after_state"), // 变更后快照
    created_by: varchar("created_by", { length: 36 }).references(() => users.id),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }),
  },
  (table) => [
    index("agent_training_records_agent_id_idx").on(table.agent_id),
    index("agent_training_records_team_id_idx").on(table.team_id),
    index("agent_training_records_agent_created_idx").on(table.agent_id, table.created_at),
  ]
);

// 技能更新建议表（AI生成，用户审核）
export const skillUpdateProposals = pgTable(
  "skill_update_proposals",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    agent_id: varchar("agent_id", { length: 36 }).notNull().references(() => agents.id, { onDelete: "cascade" }),
    team_id: varchar("team_id", { length: 36 }).notNull().references(() => teams.id, { onDelete: "cascade" }),
    position_id: varchar("position_id", { length: 36 }),
    skill_id: varchar("skill_id", { length: 36 }),
    action: varchar("action", { length: 20 }).notNull(),
    title: varchar("title", { length: 200 }).notNull(),
    reason: text("reason"),
    old_content: text("old_content"),
    new_content: text("new_content"),
    new_description: text("new_description"),
    confidence: varchar("confidence", { length: 10 }).default("medium"),
    evidence: jsonb("evidence"),
    data_sources: jsonb("data_sources"),
    status: varchar("status", { length: 20 }).notNull().default("pending"),
    review_comment: text("review_comment"),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    reviewed_at: timestamp("reviewed_at", { withTimezone: true }),
    reviewed_by: varchar("reviewed_by", { length: 36 }),
  },
  (table) => [
    index("skill_proposals_agent_id_idx").on(table.agent_id),
    index("skill_proposals_team_id_idx").on(table.team_id),
    index("skill_proposals_status_idx").on(table.status),
    index("skill_proposals_agent_created_idx").on(table.agent_id, table.created_at),
  ]
);

// 智能体优化建议表（AI多维度分析，用户审核后批量应用）
export const agentOptimizationProposals = pgTable(
  "agent_optimization_proposals",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    agent_id: varchar("agent_id", { length: 36 }).notNull().references(() => agents.id, { onDelete: "cascade" }),
    team_id: varchar("team_id", { length: 36 }).notNull().references(() => teams.id, { onDelete: "cascade" }),
    optimize_type: varchar("optimize_type", { length: 30 }).notNull(), // system_prompt / model_config / greeting / user_guidance / rag_dataset / memory / context_compress / max_iterations
    field_name: varchar("field_name", { length: 50 }).notNull(), // agents表字段名
    old_value: text("old_value"),
    new_value: text("new_value"),
    reason: text("reason"),
    confidence: varchar("confidence", { length: 10 }).default("medium"),
    source: varchar("source", { length: 30 }).notNull(), // feedback / training / knowledge / execution
    evidence: jsonb("evidence"),
    status: varchar("status", { length: 20 }).notNull().default("pending"), // pending / applied / rejected
    session_id: varchar("session_id", { length: 36 }), // 分组批次ID，同一次生成共享
    review_comment: text("review_comment"),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    reviewed_at: timestamp("reviewed_at", { withTimezone: true }),
    reviewed_by: varchar("reviewed_by", { length: 36 }),
  },
  (table) => [
    index("agent_opt_proposals_agent_id_idx").on(table.agent_id),
    index("agent_opt_proposals_team_id_idx").on(table.team_id),
    index("agent_opt_proposals_status_idx").on(table.status),
    index("agent_opt_proposals_session_id_idx").on(table.session_id),
  ]
);

// ==================== 岗位模块（旧：job_works 已删除，改用 skills.position_id） ====================

// ==================== 频道AI助手全局配置 ====================
export const channelAiAssistantConfig = pgTable(
  "channel_ai_assistant_config",
  {
    team_id: varchar("team_id", { length: 36 }).notNull().primaryKey().references(() => teams.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 100 }).notNull().default("频道AI助手"),
    system_prompt: text("system_prompt"),
    model_config: jsonb("model_config").default({ model: "gpt-4o-mini", temperature: 0.7, maxTokens: 2000 }),
    enabled: boolean("enabled").default(true).notNull(),
    greeting: varchar("greeting", { length: 500 }).default("你好！我是频道AI助手，有什么可以帮助你的？"),
    user_guidance: varchar("user_guidance", { length: 500 }).default("请输入你的需求，例如：帮我总结一下今天的讨论..."),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }),
  },
  (table) => [
    index("channel_ai_assistant_config_team_id_idx").on(table.team_id),
  ]
);

// 系统消息通知表
export const systemNotifications = pgTable(
  "system_notifications",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    team_id: varchar("team_id", { length: 36 }).references(() => teams.id, { onDelete: "cascade" }),
    user_id: varchar("user_id", { length: 36 }),
    scope: varchar("scope", { length: 20 }).notNull().default("team"),
    type: varchar("type", { length: 50 }).notNull().default("system"),
    title: varchar("title", { length: 200 }).notNull(),
    content: text("content"),
    link: varchar("link", { length: 500 }),
    is_read: boolean("is_read").default(false).notNull(),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("system_notifications_team_id_idx").on(table.team_id),
    index("system_notifications_user_id_idx").on(table.user_id),
    index("system_notifications_scope_idx").on(table.scope),
    index("system_notifications_type_idx").on(table.type),
    index("system_notifications_created_at_idx").on(table.created_at),
  ]
);

// ==================== 自动化任务调度 ====================

// 自动化任务调度表
export const agentSchedules = pgTable(
  "agent_schedules",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    team_id: varchar("team_id", { length: 36 }).notNull().references(() => teams.id, { onDelete: "cascade" }),
    agent_id: varchar("agent_id", { length: 36 }).notNull().references(() => agents.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),
    schedule_type: varchar("schedule_type", { length: 20 }).notNull().default("cron"), // cron, every, at
    cron_expr: varchar("cron_expr", { length: 100 }),
    interval_ms: integer("interval_ms"),
    at_time: timestamp("at_time", { withTimezone: true }),
    timezone: varchar("timezone", { length: 50 }).default("Asia/Shanghai"),
    trigger_msg: text("trigger_msg").notNull(),
    target_type: varchar("target_type", { length: 20 }).notNull().default("channel"), // channel, user
    target_id: varchar("target_id", { length: 36 }).notNull(),
    model_override: varchar("model_override", { length: 100 }),
    thinking_override: varchar("thinking_override", { length: 20 }),
    session_target: varchar("session_target", { length: 20 }).default("isolated"), // main, isolated
    timeout_ms: integer("timeout_ms").default(120000),
    delete_after_run: boolean("delete_after_run").default(false),
    last_run_at: timestamp("last_run_at", { withTimezone: true }),
    next_run_at: timestamp("next_run_at", { withTimezone: true }),
    run_count: integer("run_count").default(0),
    enabled: boolean("enabled").default(true),
    created_by: varchar("created_by", { length: 36 }).references(() => users.id),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }),
  },
  (table) => [
    index("agent_schedules_team_id_idx").on(table.team_id),
    index("agent_schedules_agent_id_idx").on(table.agent_id),
    index("agent_schedules_enabled_idx").on(table.enabled),
    index("agent_schedules_next_run_idx").on(table.next_run_at),
  ]
);

// 调度执行日志表
export const scheduleExecutionLogs = pgTable(
  "schedule_execution_logs",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    schedule_id: varchar("schedule_id", { length: 36 }).notNull().references(() => agentSchedules.id, { onDelete: "cascade" }),
    status: varchar("status", { length: 20 }).notNull().default("running"), // running, success, failed
    trigger_msg: text("trigger_msg"),
    result_summary: text("result_summary"),
    error_message: text("error_message"),
    duration_ms: integer("duration_ms"),
    started_at: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
    completed_at: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    index("schedule_logs_schedule_id_idx").on(table.schedule_id),
    index("schedule_logs_status_idx").on(table.status),
  ]
);

// ==================== 对话审批流转 ====================

// 审批任务表（Human-in-the-Loop 对话审批流：识别生成 → 审批/驳回/转发指定人 → 落地执行）
export const approvalTasks = pgTable(
  "approval_tasks",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    team_id: varchar("team_id", { length: 36 }).notNull().references(() => teams.id, { onDelete: "cascade" }),
    agent_id: varchar("agent_id", { length: 36 }).references(() => agents.id, { onDelete: "set null" }),
    session_id: varchar("session_id", { length: 36 }),
    creator_id: varchar("creator_id", { length: 36 }).notNull().references(() => users.id, { onDelete: "cascade" }),
    assignee_id: varchar("assignee_id", { length: 36 }), // 当前待审批人（NULL = 待创建者处理）
    title: varchar("title", { length: 255 }).notNull(),
    task_type: varchar("task_type", { length: 50 }),
    description: text("description"),
    draft: jsonb("draft"), // 智能体识别/生成的草稿数据
    status: varchar("status", { length: 20 }).notNull().default("pending"), // pending / approved / rejected
    flow: jsonb("flow"), // 流转历史 [{user_id,name,action,comment,time}]
    source_id: varchar("source_id", { length: 100 }), // 关联业务记录（如入库单编号）
    completed_at: timestamp("completed_at", { withTimezone: true }),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }),
  },
  (table) => [
    index("approval_tasks_team_id_idx").on(table.team_id),
    index("approval_tasks_agent_id_idx").on(table.agent_id),
    index("approval_tasks_creator_id_idx").on(table.creator_id),
    index("approval_tasks_assignee_id_idx").on(table.assignee_id),
    index("approval_tasks_status_idx").on(table.status),
    index("approval_tasks_created_at_idx").on(table.created_at),
  ]
);

// 频道文件表（频道成员上传 + 智能体生成的文件统一归档）
export const channelFiles = pgTable(
  "channel_files",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    channel_id: varchar("channel_id", { length: 36 }).notNull().references(() => channels.id, { onDelete: "cascade" }),
    team_id: varchar("team_id", { length: 36 }).notNull().references(() => teams.id, { onDelete: "cascade" }),
    uploader_id: varchar("uploader_id", { length: 36 }).notNull(),
    uploader_type: varchar("uploader_type", { length: 20 }).default("user").notNull(), // user / agent
    message_id: varchar("message_id", { length: 36 }), // 关联的频道消息ID（可选）
    name: varchar("name", { length: 255 }).notNull(),
    file_key: varchar("file_key", { length: 500 }).notNull(),
    file_size: integer("file_size").default(0).notNull(),
    mime_type: varchar("mime_type", { length: 150 }),
    file_type: varchar("file_type", { length: 20 }).default("file").notNull(), // image / video / file
    source: varchar("source", { length: 20 }).default("upload").notNull(), // upload(用户上传) / agent(智能体生成)
    is_active: boolean("is_active").default(true).notNull(),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }),
  },
  (table) => [
    index("channel_files_channel_id_idx").on(table.channel_id),
    index("channel_files_team_id_idx").on(table.team_id),
    index("channel_files_uploader_id_idx").on(table.uploader_id),
    index("channel_files_created_at_idx").on(table.created_at),
  ]
);

export const models = pgTable(
  "models",
  {
    id: varchar("id", { length: 100 }).primaryKey(),
    name: varchar("name", { length: 200 }).notNull(),
    provider: varchar("provider", { length: 100 }).notNull(),
    description: text("description"),
    supportsMultimodal: boolean("supports_multimodal").default(false),
    isActive: boolean("is_active").default(true),
    isBuiltin: boolean("is_builtin").default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  }
);
