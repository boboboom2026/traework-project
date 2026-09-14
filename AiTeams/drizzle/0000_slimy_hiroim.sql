CREATE TABLE "agent_chat_messages" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" varchar(36) NOT NULL,
	"sender_type" varchar(20) DEFAULT 'user' NOT NULL,
	"sender_id" varchar(36) NOT NULL,
	"content" text NOT NULL,
	"attachments" jsonb DEFAULT '[]',
	"is_read" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_chat_sessions" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" varchar(36) NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"agent_id" varchar(36) NOT NULL,
	"last_message" text,
	"last_message_at" timestamp with time zone,
	"is_active" boolean DEFAULT true NOT NULL,
	"task_status" varchar(20) DEFAULT 'idle',
	"task_summary" text,
	"last_artifacts" jsonb DEFAULT '[]',
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "agent_feedbacks" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" varchar(36) NOT NULL,
	"team_id" varchar(36) NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"task_log_id" varchar(36),
	"rating" integer NOT NULL,
	"feedback_type" varchar(20) DEFAULT 'manual',
	"tags" jsonb DEFAULT '[]',
	"comment" text,
	"correction" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_mcp_bindings" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" varchar(36) NOT NULL,
	"mcp_id" varchar(36) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_memories" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" varchar(36) NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"team_id" varchar(36) NOT NULL,
	"memory_type" varchar(20) DEFAULT 'conversation',
	"content" text NOT NULL,
	"embedding" varchar(1000),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_optimization_proposals" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" varchar(36) NOT NULL,
	"team_id" varchar(36) NOT NULL,
	"optimize_type" varchar(30) NOT NULL,
	"field_name" varchar(50) NOT NULL,
	"old_value" text,
	"new_value" text,
	"reason" text,
	"confidence" varchar(10) DEFAULT 'medium',
	"source" varchar(30) NOT NULL,
	"evidence" jsonb,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"session_id" varchar(36),
	"review_comment" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewed_at" timestamp with time zone,
	"reviewed_by" varchar(36)
);
--> statement-breakpoint
CREATE TABLE "agent_rag_bindings" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" varchar(36) NOT NULL,
	"rag_id" varchar(36) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_schedules" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" varchar(36) NOT NULL,
	"agent_id" varchar(36) NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"schedule_type" varchar(20) DEFAULT 'cron' NOT NULL,
	"cron_expr" varchar(100),
	"interval_ms" integer,
	"at_time" timestamp with time zone,
	"timezone" varchar(50) DEFAULT 'Asia/Shanghai',
	"trigger_msg" text NOT NULL,
	"target_type" varchar(20) DEFAULT 'channel' NOT NULL,
	"target_id" varchar(36) NOT NULL,
	"model_override" varchar(100),
	"thinking_override" varchar(20),
	"session_target" varchar(20) DEFAULT 'isolated',
	"timeout_ms" integer DEFAULT 120000,
	"delete_after_run" boolean DEFAULT false,
	"last_run_at" timestamp with time zone,
	"next_run_at" timestamp with time zone,
	"run_count" integer DEFAULT 0,
	"enabled" boolean DEFAULT true,
	"created_by" varchar(36),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "agent_task_logs" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" varchar(36) NOT NULL,
	"team_id" varchar(36) NOT NULL,
	"user_id" varchar(36),
	"session_id" varchar(36),
	"task_type" varchar(30) DEFAULT 'chat' NOT NULL,
	"task_input" text,
	"task_output" text,
	"tool_calls" jsonb DEFAULT '[]',
	"duration_ms" integer,
	"status" varchar(20) DEFAULT 'completed' NOT NULL,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_task_records" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" varchar(36) NOT NULL,
	"team_id" varchar(36) NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"session_id" varchar(36),
	"task_type" varchar(30) DEFAULT 'chat' NOT NULL,
	"skill_id" varchar(36),
	"workflow_id" varchar(36),
	"source" varchar(20) DEFAULT 'chat' NOT NULL,
	"channel_id" varchar(36),
	"input_summary" text NOT NULL,
	"output_summary" text,
	"execution_time_ms" integer,
	"status" varchar(20) DEFAULT 'success' NOT NULL,
	"rating" integer,
	"feedback_text" text,
	"correction" text,
	"tags" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "agent_tool_bindings" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" varchar(36) NOT NULL,
	"tool_id" varchar(36) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_training_records" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" varchar(36) NOT NULL,
	"team_id" varchar(36) NOT NULL,
	"train_type" varchar(30) NOT NULL,
	"source_type" varchar(20),
	"source_ref" text,
	"content" text,
	"before_state" jsonb,
	"after_state" jsonb,
	"created_by" varchar(36),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_user_preferences" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" varchar(36) NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"team_id" varchar(36) NOT NULL,
	"preferences" jsonb DEFAULT '{}',
	"interaction_count" integer DEFAULT 0,
	"last_interaction_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "agent_workflows" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" varchar(36),
	"skill_id" varchar(36),
	"team_id" varchar(36) NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"trigger_condition" text,
	"steps" jsonb DEFAULT '[]' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "agents" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" varchar(36) NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" text,
	"avatar" varchar(500),
	"system_prompt" text,
	"role_identity" text,
	"boundaries" jsonb DEFAULT '[]',
	"tool_ids" jsonb DEFAULT '[]',
	"skill_ids" jsonb DEFAULT '[]',
	"rag_dataset_ids" jsonb DEFAULT '[]',
	"mcp_service_ids" jsonb DEFAULT '[]',
	"prompt_guard_enabled" boolean DEFAULT false,
	"tool_approval_mode" varchar(20) DEFAULT 'auto',
	"memory_enabled" boolean DEFAULT false,
	"memory_config" jsonb DEFAULT '{"recall_count":5,"strategy":"semantic"}',
	"greeting" text,
	"user_guidance" text,
	"context_compress_enabled" boolean DEFAULT false,
	"model_config" jsonb DEFAULT '{"model":"doubao-seed-2-0-pro-260215","temperature":0.7,"max_tokens":2000}',
	"max_iterations" integer DEFAULT 10,
	"channel_context_enabled" boolean DEFAULT false NOT NULL,
	"channel_context_limit" integer DEFAULT 20,
	"channel_context_scope" varchar(20) DEFAULT 'channel',
	"notify_enabled" boolean DEFAULT false NOT NULL,
	"notify_config" jsonb DEFAULT '{}',
	"position_id" varchar(36),
	"workflow_id" varchar(36),
	"role_id" varchar(36),
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"created_by" varchar(36),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "channel_ai_assistant_config" (
	"team_id" varchar(36) PRIMARY KEY NOT NULL,
	"name" varchar(100) DEFAULT '频道AI助手' NOT NULL,
	"system_prompt" text,
	"model_config" jsonb DEFAULT '{"model":"doubao-seed-2-0-pro-260215","temperature":0.7,"maxTokens":2000}'::jsonb,
	"enabled" boolean DEFAULT true NOT NULL,
	"greeting" varchar(500) DEFAULT '你好！我是频道AI助手，有什么可以帮助你的？',
	"user_guidance" varchar(500) DEFAULT '请输入你的需求，例如：帮我总结一下今天的讨论...',
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "channel_bookmarks" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"message_id" varchar(36) NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "channel_members" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel_id" varchar(36) NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "channel_message_reactions" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"message_id" varchar(36) NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"emoji" varchar(10) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "channel_messages" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel_id" varchar(36) NOT NULL,
	"sender_id" varchar(36) NOT NULL,
	"sender_type" varchar(20) DEFAULT 'user',
	"content" text,
	"message_type" varchar(20) DEFAULT 'text' NOT NULL,
	"attachments" jsonb DEFAULT '[]',
	"attachment_summary" text,
	"topic_tags" jsonb DEFAULT '[]',
	"reply_to_id" varchar(36),
	"thread_root_id" varchar(36),
	"forwarded_from_id" varchar(36),
	"mentions" jsonb DEFAULT '[]',
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "channel_rag_bindings" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel_id" varchar(36) NOT NULL,
	"rag_dataset_id" varchar(36) NOT NULL,
	"scope" varchar(20) DEFAULT 'channel',
	"created_by" varchar(36),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "channel_read_states" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel_id" varchar(36) NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"last_read_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "channel_sections" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" varchar(36) NOT NULL,
	"name" varchar(100) NOT NULL,
	"icon" varchar(10),
	"is_default" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_collapsed" boolean DEFAULT false NOT NULL,
	"created_by" varchar(36),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "channels" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"section_id" varchar(36),
	"team_id" varchar(36) NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" text,
	"type" varchar(20) DEFAULT 'public' NOT NULL,
	"icon" varchar(10),
	"creator_id" varchar(36) NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"is_pinned" boolean DEFAULT false NOT NULL,
	"ai_assistant_enabled" boolean DEFAULT false NOT NULL,
	"ai_assistant_id" varchar(36),
	"ai_assistant_config" jsonb DEFAULT '{"frequency":"auto","topics":[],"max_messages":50}',
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "departments" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" varchar(36) NOT NULL,
	"name" varchar(100) NOT NULL,
	"parent_id" varchar(36),
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "dm_conversations" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" varchar(36) NOT NULL,
	"participant1_id" varchar(36) NOT NULL,
	"participant2_id" varchar(36) NOT NULL,
	"last_message" text,
	"last_message_at" timestamp with time zone,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "dm_messages" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" varchar(36) NOT NULL,
	"sender_id" varchar(36) NOT NULL,
	"content" text NOT NULL,
	"message_type" varchar(20) DEFAULT 'text' NOT NULL,
	"forwarded_from_type" varchar(30),
	"forwarded_from_id" varchar(36),
	"is_read" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "group_members" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" varchar(36) NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "groups" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" varchar(36) NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" text,
	"creator_id" varchar(36) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "health_check" (
	"id" serial NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "mcp_services" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" varchar(36) NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" text,
	"endpoint_url" varchar(500) NOT NULL,
	"allowed_operations" jsonb DEFAULT '[]',
	"config" jsonb DEFAULT '{}',
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"created_by" varchar(36),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "models" (
	"id" varchar(100) PRIMARY KEY NOT NULL,
	"name" varchar(200) NOT NULL,
	"provider" varchar(100) NOT NULL,
	"description" text,
	"supports_multimodal" boolean DEFAULT false,
	"is_active" boolean DEFAULT true,
	"is_builtin" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "positions" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" varchar(36) NOT NULL,
	"department_id" varchar(36),
	"name" varchar(100) NOT NULL,
	"description" text,
	"icon" varchar(10) DEFAULT 'Briefcase',
	"color" varchar(7) DEFAULT '#3B82F6',
	"job_works" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" varchar(36),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "rag_chunks" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" varchar(36) NOT NULL,
	"dataset_id" varchar(36) NOT NULL,
	"chunk_index" integer DEFAULT 0,
	"content" text NOT NULL,
	"token_count" integer DEFAULT 0,
	"embedding" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rag_datasets" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" varchar(36) NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" text,
	"document_count" integer DEFAULT 0,
	"sync_config" jsonb DEFAULT '{}',
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"created_by" varchar(36),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "rag_documents" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dataset_id" varchar(36) NOT NULL,
	"file_name" varchar(500) NOT NULL,
	"file_type" varchar(50) NOT NULL,
	"file_size" integer DEFAULT 0,
	"file_key" varchar(500),
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"chunk_count" integer DEFAULT 0,
	"error_message" text,
	"created_by" varchar(36),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "role_agent_configs" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"role_id" varchar(36) NOT NULL,
	"system_prompt" text,
	"greeting" text,
	"user_guidance" text,
	"tool_ids" jsonb DEFAULT '[]',
	"skill_ids" jsonb DEFAULT '[]',
	"rag_dataset_ids" jsonb DEFAULT '[]',
	"mcp_service_ids" jsonb DEFAULT '[]',
	"prompt_guard_enabled" boolean DEFAULT false,
	"tool_approval_mode" varchar(20) DEFAULT 'auto',
	"memory_enabled" boolean DEFAULT false,
	"memory_config" jsonb DEFAULT '{"recall_count":5,"strategy":"semantic"}',
	"channel_context_enabled" boolean DEFAULT false NOT NULL,
	"channel_context_limit" integer DEFAULT 20,
	"context_compress_enabled" boolean DEFAULT false,
	"model_config" jsonb DEFAULT '{"model":"doubao-seed-2-0-pro-260215","temperature":0.7,"max_tokens":2000}',
	"max_iterations" integer DEFAULT 10,
	"notify_enabled" boolean DEFAULT false NOT NULL,
	"notify_config" jsonb DEFAULT '{}',
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	CONSTRAINT "role_agent_configs_role_id_unique" UNIQUE("role_id")
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" varchar(36) NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"responsibilities" text,
	"sort_order" integer DEFAULT 0,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"created_by" varchar(36),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "schedule_execution_logs" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"schedule_id" varchar(36) NOT NULL,
	"status" varchar(20) DEFAULT 'running' NOT NULL,
	"trigger_msg" text,
	"result_summary" text,
	"error_message" text,
	"duration_ms" integer,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"token" varchar(64) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "sessions_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "skill_update_proposals" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" varchar(36) NOT NULL,
	"team_id" varchar(36) NOT NULL,
	"position_id" varchar(36),
	"skill_id" varchar(36),
	"action" varchar(20) NOT NULL,
	"title" varchar(200) NOT NULL,
	"reason" text,
	"old_content" text,
	"new_content" text,
	"new_description" text,
	"confidence" varchar(10) DEFAULT 'medium',
	"evidence" jsonb,
	"data_sources" jsonb,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"review_comment" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewed_at" timestamp with time zone,
	"reviewed_by" varchar(36)
);
--> statement-breakpoint
CREATE TABLE "skills" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" varchar(36) NOT NULL,
	"user_id" varchar(36),
	"name" varchar(200) NOT NULL,
	"description" text,
	"content" text DEFAULT '',
	"source_type" varchar(20) DEFAULT 'manual',
	"source_file" varchar(255),
	"version" integer DEFAULT 1,
	"is_published" boolean DEFAULT false,
	"position_id" varchar(36),
	"trigger_condition" text,
	"is_executable" boolean DEFAULT false,
	"expected_output" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "system_notifications" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" varchar(36),
	"user_id" varchar(36),
	"scope" varchar(20) DEFAULT 'team' NOT NULL,
	"type" varchar(50) DEFAULT 'system' NOT NULL,
	"title" varchar(200) NOT NULL,
	"content" text,
	"link" varchar(500),
	"is_read" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "team_invites" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" varchar(36) NOT NULL,
	"inviter_id" varchar(36) NOT NULL,
	"invite_code" varchar(32) NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"max_uses" integer DEFAULT 1,
	"used_count" integer DEFAULT 0,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "team_invites_invite_code_unique" UNIQUE("invite_code")
);
--> statement-breakpoint
CREATE TABLE "team_members" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" varchar(36) NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"role" varchar(20) DEFAULT 'member' NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_read_mentions_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "teams" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) NOT NULL,
	"type" varchar(20) DEFAULT 'company' NOT NULL,
	"logo" varchar(500),
	"color" varchar(20) DEFAULT '#3B82F6',
	"industry" varchar(100),
	"owner_id" varchar(36) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "tools" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" varchar(36) NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" text,
	"icon" varchar(50) DEFAULT 'wrench',
	"category" varchar(50) DEFAULT 'operation' NOT NULL,
	"parameters" jsonb DEFAULT '[]',
	"action" varchar(100) NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"is_builtin" boolean DEFAULT false NOT NULL,
	"mcp_service_id" varchar(36),
	"tool_type" varchar(20) DEFAULT 'builtin' NOT NULL,
	"config" jsonb DEFAULT '{}',
	"created_by" varchar(36),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"phone" varchar(20) NOT NULL,
	"name" varchar(100) NOT NULL,
	"nickname" varchar(100),
	"password" varchar(255),
	"avatar" varchar(500),
	"email" varchar(255),
	"department" varchar(100),
	"position" varchar(100),
	"bio" text,
	"platform_role" varchar(20) DEFAULT 'user' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	CONSTRAINT "users_phone_unique" UNIQUE("phone")
);
--> statement-breakpoint
CREATE TABLE "verification_codes" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"phone" varchar(20) NOT NULL,
	"code" varchar(6) NOT NULL,
	"type" varchar(20) DEFAULT 'login' NOT NULL,
	"used" boolean DEFAULT false NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workflow_checkpoints" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" varchar(36) NOT NULL,
	"workflow_id" varchar(36) NOT NULL,
	"step_index" integer DEFAULT 0 NOT NULL,
	"context" jsonb DEFAULT '{}' NOT NULL,
	"status" varchar(20) DEFAULT 'paused' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "agent_chat_messages" ADD CONSTRAINT "agent_chat_messages_session_id_agent_chat_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."agent_chat_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_chat_sessions" ADD CONSTRAINT "agent_chat_sessions_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_chat_sessions" ADD CONSTRAINT "agent_chat_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_chat_sessions" ADD CONSTRAINT "agent_chat_sessions_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_feedbacks" ADD CONSTRAINT "agent_feedbacks_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_feedbacks" ADD CONSTRAINT "agent_feedbacks_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_feedbacks" ADD CONSTRAINT "agent_feedbacks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_feedbacks" ADD CONSTRAINT "agent_feedbacks_task_log_id_agent_task_logs_id_fk" FOREIGN KEY ("task_log_id") REFERENCES "public"."agent_task_logs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_mcp_bindings" ADD CONSTRAINT "agent_mcp_bindings_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_mcp_bindings" ADD CONSTRAINT "agent_mcp_bindings_mcp_id_mcp_services_id_fk" FOREIGN KEY ("mcp_id") REFERENCES "public"."mcp_services"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_memories" ADD CONSTRAINT "agent_memories_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_memories" ADD CONSTRAINT "agent_memories_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_memories" ADD CONSTRAINT "agent_memories_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_optimization_proposals" ADD CONSTRAINT "agent_optimization_proposals_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_optimization_proposals" ADD CONSTRAINT "agent_optimization_proposals_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_rag_bindings" ADD CONSTRAINT "agent_rag_bindings_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_rag_bindings" ADD CONSTRAINT "agent_rag_bindings_rag_id_rag_datasets_id_fk" FOREIGN KEY ("rag_id") REFERENCES "public"."rag_datasets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_schedules" ADD CONSTRAINT "agent_schedules_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_schedules" ADD CONSTRAINT "agent_schedules_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_schedules" ADD CONSTRAINT "agent_schedules_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_task_logs" ADD CONSTRAINT "agent_task_logs_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_task_logs" ADD CONSTRAINT "agent_task_logs_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_task_logs" ADD CONSTRAINT "agent_task_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_task_logs" ADD CONSTRAINT "agent_task_logs_session_id_agent_chat_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."agent_chat_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_task_records" ADD CONSTRAINT "agent_task_records_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_task_records" ADD CONSTRAINT "agent_task_records_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_task_records" ADD CONSTRAINT "agent_task_records_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_task_records" ADD CONSTRAINT "agent_task_records_skill_id_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skills"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_task_records" ADD CONSTRAINT "agent_task_records_workflow_id_agent_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."agent_workflows"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_tool_bindings" ADD CONSTRAINT "agent_tool_bindings_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_tool_bindings" ADD CONSTRAINT "agent_tool_bindings_tool_id_tools_id_fk" FOREIGN KEY ("tool_id") REFERENCES "public"."tools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_training_records" ADD CONSTRAINT "agent_training_records_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_training_records" ADD CONSTRAINT "agent_training_records_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_training_records" ADD CONSTRAINT "agent_training_records_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_user_preferences" ADD CONSTRAINT "agent_user_preferences_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_user_preferences" ADD CONSTRAINT "agent_user_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_user_preferences" ADD CONSTRAINT "agent_user_preferences_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_workflows" ADD CONSTRAINT "agent_workflows_skill_id_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skills"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_workflows" ADD CONSTRAINT "agent_workflows_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_position_id_positions_id_fk" FOREIGN KEY ("position_id") REFERENCES "public"."positions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_ai_assistant_config" ADD CONSTRAINT "channel_ai_assistant_config_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_bookmarks" ADD CONSTRAINT "channel_bookmarks_message_id_channel_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."channel_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_bookmarks" ADD CONSTRAINT "channel_bookmarks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_members" ADD CONSTRAINT "channel_members_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_members" ADD CONSTRAINT "channel_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_message_reactions" ADD CONSTRAINT "channel_message_reactions_message_id_channel_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."channel_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_message_reactions" ADD CONSTRAINT "channel_message_reactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_messages" ADD CONSTRAINT "channel_messages_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_rag_bindings" ADD CONSTRAINT "channel_rag_bindings_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_rag_bindings" ADD CONSTRAINT "channel_rag_bindings_rag_dataset_id_rag_datasets_id_fk" FOREIGN KEY ("rag_dataset_id") REFERENCES "public"."rag_datasets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_rag_bindings" ADD CONSTRAINT "channel_rag_bindings_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_read_states" ADD CONSTRAINT "channel_read_states_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_read_states" ADD CONSTRAINT "channel_read_states_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_sections" ADD CONSTRAINT "channel_sections_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_sections" ADD CONSTRAINT "channel_sections_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channels" ADD CONSTRAINT "channels_section_id_channel_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."channel_sections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channels" ADD CONSTRAINT "channels_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channels" ADD CONSTRAINT "channels_creator_id_users_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channels" ADD CONSTRAINT "channels_ai_assistant_id_agents_id_fk" FOREIGN KEY ("ai_assistant_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "departments" ADD CONSTRAINT "departments_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dm_conversations" ADD CONSTRAINT "dm_conversations_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dm_conversations" ADD CONSTRAINT "dm_conversations_participant1_id_users_id_fk" FOREIGN KEY ("participant1_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dm_conversations" ADD CONSTRAINT "dm_conversations_participant2_id_users_id_fk" FOREIGN KEY ("participant2_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dm_messages" ADD CONSTRAINT "dm_messages_conversation_id_dm_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."dm_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dm_messages" ADD CONSTRAINT "dm_messages_sender_id_users_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "groups" ADD CONSTRAINT "groups_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "groups" ADD CONSTRAINT "groups_creator_id_users_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcp_services" ADD CONSTRAINT "mcp_services_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcp_services" ADD CONSTRAINT "mcp_services_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "positions" ADD CONSTRAINT "positions_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "positions" ADD CONSTRAINT "positions_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "positions" ADD CONSTRAINT "positions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rag_chunks" ADD CONSTRAINT "rag_chunks_document_id_rag_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."rag_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rag_chunks" ADD CONSTRAINT "rag_chunks_dataset_id_rag_datasets_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."rag_datasets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rag_datasets" ADD CONSTRAINT "rag_datasets_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rag_datasets" ADD CONSTRAINT "rag_datasets_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rag_documents" ADD CONSTRAINT "rag_documents_dataset_id_rag_datasets_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."rag_datasets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rag_documents" ADD CONSTRAINT "rag_documents_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_agent_configs" ADD CONSTRAINT "role_agent_configs_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roles" ADD CONSTRAINT "roles_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roles" ADD CONSTRAINT "roles_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_execution_logs" ADD CONSTRAINT "schedule_execution_logs_schedule_id_agent_schedules_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."agent_schedules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_update_proposals" ADD CONSTRAINT "skill_update_proposals_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_update_proposals" ADD CONSTRAINT "skill_update_proposals_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skills" ADD CONSTRAINT "skills_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skills" ADD CONSTRAINT "skills_position_id_positions_id_fk" FOREIGN KEY ("position_id") REFERENCES "public"."positions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "system_notifications" ADD CONSTRAINT "system_notifications_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_invites" ADD CONSTRAINT "team_invites_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_invites" ADD CONSTRAINT "team_invites_inviter_id_users_id_fk" FOREIGN KEY ("inviter_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tools" ADD CONSTRAINT "tools_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tools" ADD CONSTRAINT "tools_mcp_service_id_mcp_services_id_fk" FOREIGN KEY ("mcp_service_id") REFERENCES "public"."mcp_services"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_checkpoints" ADD CONSTRAINT "workflow_checkpoints_workflow_id_agent_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."agent_workflows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_chat_messages_session_id_idx" ON "agent_chat_messages" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "agent_chat_messages_created_at_idx" ON "agent_chat_messages" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "agent_chat_sessions_team_id_idx" ON "agent_chat_sessions" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "agent_chat_sessions_user_id_idx" ON "agent_chat_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "agent_chat_sessions_agent_id_idx" ON "agent_chat_sessions" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "agent_feedbacks_agent_id_idx" ON "agent_feedbacks" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "agent_feedbacks_team_id_idx" ON "agent_feedbacks" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "agent_feedbacks_agent_created_idx" ON "agent_feedbacks" USING btree ("agent_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_mcp_bindings_unique" ON "agent_mcp_bindings" USING btree ("agent_id","mcp_id");--> statement-breakpoint
CREATE INDEX "agent_mcp_bindings_agent_id_idx" ON "agent_mcp_bindings" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "agent_mcp_bindings_mcp_id_idx" ON "agent_mcp_bindings" USING btree ("mcp_id");--> statement-breakpoint
CREATE INDEX "agent_memories_agent_user_idx" ON "agent_memories" USING btree ("agent_id","user_id");--> statement-breakpoint
CREATE INDEX "agent_memories_created_at_idx" ON "agent_memories" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "agent_opt_proposals_agent_id_idx" ON "agent_optimization_proposals" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "agent_opt_proposals_team_id_idx" ON "agent_optimization_proposals" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "agent_opt_proposals_status_idx" ON "agent_optimization_proposals" USING btree ("status");--> statement-breakpoint
CREATE INDEX "agent_opt_proposals_session_id_idx" ON "agent_optimization_proposals" USING btree ("session_id");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_rag_bindings_unique" ON "agent_rag_bindings" USING btree ("agent_id","rag_id");--> statement-breakpoint
CREATE INDEX "agent_schedules_team_id_idx" ON "agent_schedules" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "agent_schedules_agent_id_idx" ON "agent_schedules" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "agent_schedules_enabled_idx" ON "agent_schedules" USING btree ("enabled");--> statement-breakpoint
CREATE INDEX "agent_schedules_next_run_idx" ON "agent_schedules" USING btree ("next_run_at");--> statement-breakpoint
CREATE INDEX "agent_task_logs_agent_id_idx" ON "agent_task_logs" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "agent_task_logs_team_id_idx" ON "agent_task_logs" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "agent_task_logs_created_at_idx" ON "agent_task_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "agent_task_logs_agent_created_idx" ON "agent_task_logs" USING btree ("agent_id","created_at");--> statement-breakpoint
CREATE INDEX "task_records_agent_id_idx" ON "agent_task_records" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "task_records_team_id_idx" ON "agent_task_records" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "task_records_user_id_idx" ON "agent_task_records" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "task_records_task_type_idx" ON "agent_task_records" USING btree ("task_type");--> statement-breakpoint
CREATE INDEX "task_records_created_at_idx" ON "agent_task_records" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "task_records_status_idx" ON "agent_task_records" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_tool_bindings_unique" ON "agent_tool_bindings" USING btree ("agent_id","tool_id");--> statement-breakpoint
CREATE INDEX "agent_training_records_agent_id_idx" ON "agent_training_records" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "agent_training_records_team_id_idx" ON "agent_training_records" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "agent_training_records_agent_created_idx" ON "agent_training_records" USING btree ("agent_id","created_at");--> statement-breakpoint
CREATE INDEX "agent_pref_agent_user_idx" ON "agent_user_preferences" USING btree ("agent_id","user_id");--> statement-breakpoint
CREATE INDEX "agent_pref_team_idx" ON "agent_user_preferences" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "agent_workflows_agent_id_idx" ON "agent_workflows" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "agent_workflows_team_id_idx" ON "agent_workflows" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "agent_workflows_skill_id_idx" ON "agent_workflows" USING btree ("skill_id");--> statement-breakpoint
CREATE INDEX "agents_team_id_idx" ON "agents" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "agents_status_idx" ON "agents" USING btree ("status");--> statement-breakpoint
CREATE INDEX "channel_ai_assistant_config_team_id_idx" ON "channel_ai_assistant_config" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "channel_bookmarks_message_id_idx" ON "channel_bookmarks" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "channel_bookmarks_user_id_idx" ON "channel_bookmarks" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "channel_bookmarks_user_message_idx" ON "channel_bookmarks" USING btree ("user_id","message_id");--> statement-breakpoint
CREATE INDEX "channel_members_channel_id_idx" ON "channel_members" USING btree ("channel_id");--> statement-breakpoint
CREATE INDEX "channel_members_user_id_idx" ON "channel_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "channel_message_reactions_message_id_idx" ON "channel_message_reactions" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "channel_message_reactions_user_id_idx" ON "channel_message_reactions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "channel_messages_channel_id_idx" ON "channel_messages" USING btree ("channel_id");--> statement-breakpoint
CREATE INDEX "channel_messages_sender_id_idx" ON "channel_messages" USING btree ("sender_id");--> statement-breakpoint
CREATE INDEX "channel_messages_reply_to_id_idx" ON "channel_messages" USING btree ("reply_to_id");--> statement-breakpoint
CREATE INDEX "channel_messages_thread_root_id_idx" ON "channel_messages" USING btree ("thread_root_id");--> statement-breakpoint
CREATE INDEX "channel_messages_created_at_idx" ON "channel_messages" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "channel_messages_channel_created_idx" ON "channel_messages" USING btree ("channel_id","created_at");--> statement-breakpoint
CREATE INDEX "channel_rag_bindings_channel_id_idx" ON "channel_rag_bindings" USING btree ("channel_id");--> statement-breakpoint
CREATE INDEX "channel_rag_bindings_dataset_id_idx" ON "channel_rag_bindings" USING btree ("rag_dataset_id");--> statement-breakpoint
CREATE INDEX "channel_read_states_channel_user_idx" ON "channel_read_states" USING btree ("channel_id","user_id");--> statement-breakpoint
CREATE INDEX "channel_sections_team_id_idx" ON "channel_sections" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "channel_sections_sort_order_idx" ON "channel_sections" USING btree ("team_id","sort_order");--> statement-breakpoint
CREATE INDEX "channels_team_id_idx" ON "channels" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "channels_section_id_idx" ON "channels" USING btree ("section_id");--> statement-breakpoint
CREATE INDEX "channels_sort_order_idx" ON "channels" USING btree ("section_id","sort_order");--> statement-breakpoint
CREATE INDEX "departments_team_id_idx" ON "departments" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "departments_parent_id_idx" ON "departments" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "dm_conversations_team_id_idx" ON "dm_conversations" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "dm_conversations_p1_idx" ON "dm_conversations" USING btree ("participant1_id");--> statement-breakpoint
CREATE INDEX "dm_conversations_p2_idx" ON "dm_conversations" USING btree ("participant2_id");--> statement-breakpoint
CREATE INDEX "dm_messages_conversation_id_idx" ON "dm_messages" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "dm_messages_sender_id_idx" ON "dm_messages" USING btree ("sender_id");--> statement-breakpoint
CREATE INDEX "dm_messages_created_at_idx" ON "dm_messages" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "group_members_group_id_idx" ON "group_members" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "group_members_user_id_idx" ON "group_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "groups_team_id_idx" ON "groups" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "groups_creator_id_idx" ON "groups" USING btree ("creator_id");--> statement-breakpoint
CREATE INDEX "mcp_services_team_id_idx" ON "mcp_services" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "mcp_services_status_idx" ON "mcp_services" USING btree ("status");--> statement-breakpoint
CREATE INDEX "positions_team_id_idx" ON "positions" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "positions_department_id_idx" ON "positions" USING btree ("department_id");--> statement-breakpoint
CREATE INDEX "positions_status_idx" ON "positions" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "rag_chunks_document_id_idx" ON "rag_chunks" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "rag_chunks_dataset_id_idx" ON "rag_chunks" USING btree ("dataset_id");--> statement-breakpoint
CREATE INDEX "rag_datasets_team_id_idx" ON "rag_datasets" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "rag_datasets_status_idx" ON "rag_datasets" USING btree ("status");--> statement-breakpoint
CREATE INDEX "rag_documents_dataset_id_idx" ON "rag_documents" USING btree ("dataset_id");--> statement-breakpoint
CREATE INDEX "rag_documents_status_idx" ON "rag_documents" USING btree ("status");--> statement-breakpoint
CREATE INDEX "role_agent_configs_role_id_idx" ON "role_agent_configs" USING btree ("role_id");--> statement-breakpoint
CREATE INDEX "roles_team_id_idx" ON "roles" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "roles_status_idx" ON "roles" USING btree ("status");--> statement-breakpoint
CREATE INDEX "schedule_logs_schedule_id_idx" ON "schedule_execution_logs" USING btree ("schedule_id");--> statement-breakpoint
CREATE INDEX "schedule_logs_status_idx" ON "schedule_execution_logs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "sessions_token_idx" ON "sessions" USING btree ("token");--> statement-breakpoint
CREATE INDEX "sessions_user_id_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "skill_proposals_agent_id_idx" ON "skill_update_proposals" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "skill_proposals_team_id_idx" ON "skill_update_proposals" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "skill_proposals_status_idx" ON "skill_update_proposals" USING btree ("status");--> statement-breakpoint
CREATE INDEX "skill_proposals_agent_created_idx" ON "skill_update_proposals" USING btree ("agent_id","created_at");--> statement-breakpoint
CREATE INDEX "skills_team_id_idx" ON "skills" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "skills_name_idx" ON "skills" USING btree ("name");--> statement-breakpoint
CREATE INDEX "skills_position_id_idx" ON "skills" USING btree ("position_id");--> statement-breakpoint
CREATE INDEX "system_notifications_team_id_idx" ON "system_notifications" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "system_notifications_user_id_idx" ON "system_notifications" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "system_notifications_scope_idx" ON "system_notifications" USING btree ("scope");--> statement-breakpoint
CREATE INDEX "system_notifications_type_idx" ON "system_notifications" USING btree ("type");--> statement-breakpoint
CREATE INDEX "system_notifications_created_at_idx" ON "system_notifications" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "team_invites_team_id_idx" ON "team_invites" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "team_invites_invite_code_idx" ON "team_invites" USING btree ("invite_code");--> statement-breakpoint
CREATE INDEX "team_invites_status_idx" ON "team_invites" USING btree ("status");--> statement-breakpoint
CREATE INDEX "team_members_team_id_idx" ON "team_members" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "team_members_user_id_idx" ON "team_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "teams_owner_id_idx" ON "teams" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "teams_name_idx" ON "teams" USING btree ("name");--> statement-breakpoint
CREATE INDEX "tools_team_id_idx" ON "tools" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "tools_category_idx" ON "tools" USING btree ("category");--> statement-breakpoint
CREATE INDEX "tools_mcp_service_id_idx" ON "tools" USING btree ("mcp_service_id");--> statement-breakpoint
CREATE INDEX "users_phone_idx" ON "users" USING btree ("phone");--> statement-breakpoint
CREATE INDEX "users_email_idx" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "verification_codes_phone_idx" ON "verification_codes" USING btree ("phone");--> statement-breakpoint
CREATE INDEX "verification_codes_code_idx" ON "verification_codes" USING btree ("code");--> statement-breakpoint
CREATE INDEX "workflow_checkpoints_session_id_idx" ON "workflow_checkpoints" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "workflow_checkpoints_workflow_id_idx" ON "workflow_checkpoints" USING btree ("workflow_id");