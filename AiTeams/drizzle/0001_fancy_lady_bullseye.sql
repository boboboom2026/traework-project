CREATE TABLE "approval_tasks" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" varchar(36) NOT NULL,
	"agent_id" varchar(36),
	"session_id" varchar(36),
	"creator_id" varchar(36) NOT NULL,
	"assignee_id" varchar(36),
	"title" varchar(255) NOT NULL,
	"task_type" varchar(50),
	"description" text,
	"draft" jsonb,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"flow" jsonb,
	"source_id" varchar(100),
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "channel_files" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel_id" varchar(36) NOT NULL,
	"team_id" varchar(36) NOT NULL,
	"uploader_id" varchar(36) NOT NULL,
	"uploader_type" varchar(20) DEFAULT 'user' NOT NULL,
	"message_id" varchar(36),
	"name" varchar(255) NOT NULL,
	"file_key" varchar(500) NOT NULL,
	"file_size" integer DEFAULT 0 NOT NULL,
	"mime_type" varchar(150),
	"file_type" varchar(20) DEFAULT 'file' NOT NULL,
	"source" varchar(20) DEFAULT 'upload' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "task_runs" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" varchar(36) NOT NULL,
	"team_id" varchar(36),
	"session_id" varchar(36),
	"triggered_by" varchar(36),
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"current_node_id" varchar(64),
	"snapshot" jsonb,
	"result" text,
	"error" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" varchar(36) NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"trigger_condition" text,
	"agent_id" varchar(36),
	"definition" jsonb DEFAULT '{}' NOT NULL,
	"status" varchar(20) DEFAULT 'draft' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "workflow_approval_tasks" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workflow_id" varchar(36) NOT NULL,
	"session_id" varchar(36) NOT NULL,
	"step_index" integer DEFAULT 0 NOT NULL,
	"step_id" varchar(64) NOT NULL,
	"step_name" varchar(255),
	"team_id" varchar(36),
	"approver_id" varchar(36) NOT NULL,
	"applicant_id" varchar(36),
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"message" text,
	"detail" text,
	"detail_type" varchar(20) DEFAULT 'markdown',
	"payload" jsonb DEFAULT '{}',
	"decided_by" varchar(36),
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "workflow_instances" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workflow_id" varchar(36) NOT NULL,
	"team_id" varchar(36),
	"session_id" varchar(36),
	"agent_id" varchar(36),
	"status" varchar(20) DEFAULT 'running' NOT NULL,
	"current_node_id" varchar(64),
	"snapshot" jsonb DEFAULT '{}',
	"result" text,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "agents" ALTER COLUMN "model_config" SET DEFAULT '{"model":"gpt-4o-mini","temperature":0.7,"max_tokens":2000}';--> statement-breakpoint
ALTER TABLE "channel_ai_assistant_config" ALTER COLUMN "model_config" SET DEFAULT '{"model":"gpt-4o-mini","temperature":0.7,"maxTokens":2000}'::jsonb;--> statement-breakpoint
ALTER TABLE "role_agent_configs" ALTER COLUMN "model_config" SET DEFAULT '{"model":"gpt-4o-mini","temperature":0.7,"max_tokens":2000}';--> statement-breakpoint
ALTER TABLE "approval_tasks" ADD CONSTRAINT "approval_tasks_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_tasks" ADD CONSTRAINT "approval_tasks_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_tasks" ADD CONSTRAINT "approval_tasks_creator_id_users_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_files" ADD CONSTRAINT "channel_files_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_files" ADD CONSTRAINT "channel_files_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_runs" ADD CONSTRAINT "task_runs_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_runs" ADD CONSTRAINT "task_runs_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_approval_tasks" ADD CONSTRAINT "workflow_approval_tasks_workflow_id_agent_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."agent_workflows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_approval_tasks" ADD CONSTRAINT "workflow_approval_tasks_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_approval_tasks" ADD CONSTRAINT "workflow_approval_tasks_approver_id_users_id_fk" FOREIGN KEY ("approver_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_approval_tasks" ADD CONSTRAINT "workflow_approval_tasks_applicant_id_users_id_fk" FOREIGN KEY ("applicant_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_approval_tasks" ADD CONSTRAINT "workflow_approval_tasks_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_instances" ADD CONSTRAINT "workflow_instances_workflow_id_agent_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."agent_workflows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_instances" ADD CONSTRAINT "workflow_instances_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "approval_tasks_team_id_idx" ON "approval_tasks" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "approval_tasks_agent_id_idx" ON "approval_tasks" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "approval_tasks_creator_id_idx" ON "approval_tasks" USING btree ("creator_id");--> statement-breakpoint
CREATE INDEX "approval_tasks_assignee_id_idx" ON "approval_tasks" USING btree ("assignee_id");--> statement-breakpoint
CREATE INDEX "approval_tasks_status_idx" ON "approval_tasks" USING btree ("status");--> statement-breakpoint
CREATE INDEX "approval_tasks_created_at_idx" ON "approval_tasks" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "channel_files_channel_id_idx" ON "channel_files" USING btree ("channel_id");--> statement-breakpoint
CREATE INDEX "channel_files_team_id_idx" ON "channel_files" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "channel_files_uploader_id_idx" ON "channel_files" USING btree ("uploader_id");--> statement-breakpoint
CREATE INDEX "channel_files_created_at_idx" ON "channel_files" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "task_runs_task_idx" ON "task_runs" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "task_runs_team_idx" ON "task_runs" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "task_runs_status_idx" ON "task_runs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "tasks_team_idx" ON "tasks" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "tasks_agent_idx" ON "tasks" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "workflow_approval_approver_idx" ON "workflow_approval_tasks" USING btree ("approver_id","status");--> statement-breakpoint
CREATE INDEX "workflow_approval_session_idx" ON "workflow_approval_tasks" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "workflow_approval_team_idx" ON "workflow_approval_tasks" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "workflow_approval_workflow_idx" ON "workflow_approval_tasks" USING btree ("workflow_id");--> statement-breakpoint
CREATE INDEX "workflow_instances_workflow_idx" ON "workflow_instances" USING btree ("workflow_id");--> statement-breakpoint
CREATE INDEX "workflow_instances_session_idx" ON "workflow_instances" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "workflow_instances_team_idx" ON "workflow_instances" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "workflow_instances_status_idx" ON "workflow_instances" USING btree ("status");