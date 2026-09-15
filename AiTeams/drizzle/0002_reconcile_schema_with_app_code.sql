ALTER TABLE "channels" ALTER COLUMN "creator_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "dm_conversations" ALTER COLUMN "team_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "dm_conversations" ALTER COLUMN "participant1_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "dm_conversations" ALTER COLUMN "participant2_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "groups" ALTER COLUMN "creator_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_feedbacks" ADD COLUMN "category" varchar(50);--> statement-breakpoint
ALTER TABLE "agent_feedbacks" ADD COLUMN "content" text;--> statement-breakpoint
ALTER TABLE "agent_tool_bindings" ADD COLUMN "skill_id" varchar(36);--> statement-breakpoint
ALTER TABLE "agent_tool_bindings" ADD COLUMN "config" jsonb DEFAULT '{}';--> statement-breakpoint
ALTER TABLE "agent_training_records" ADD COLUMN "updated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "is_active" boolean DEFAULT true;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "agent_md" text;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "few_shot_examples" text;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "output_format" varchar(20) DEFAULT 'auto';--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "json_schema" text;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "max_tokens" integer DEFAULT 2000;--> statement-breakpoint
ALTER TABLE "channel_members" ADD COLUMN "role" varchar(20) DEFAULT 'member';--> statement-breakpoint
ALTER TABLE "channels" ADD COLUMN "created_by" varchar(36);--> statement-breakpoint
ALTER TABLE "channels" ADD COLUMN "is_private" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "dm_conversations" ADD COLUMN "user1_id" varchar(36);--> statement-breakpoint
ALTER TABLE "dm_conversations" ADD COLUMN "user2_id" varchar(36);--> statement-breakpoint
ALTER TABLE "dm_messages" ADD COLUMN "sender_type" varchar(20) DEFAULT 'user';--> statement-breakpoint
ALTER TABLE "groups" ADD COLUMN "created_by" varchar(36);--> statement-breakpoint
ALTER TABLE "groups" ADD COLUMN "member_count" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "positions" ADD COLUMN "status" varchar(20) DEFAULT 'active';--> statement-breakpoint
ALTER TABLE "rag_datasets" ADD COLUMN "enabled" boolean DEFAULT true;--> statement-breakpoint
ALTER TABLE "skills" ADD COLUMN "input_schema" jsonb;--> statement-breakpoint
ALTER TABLE "skills" ADD COLUMN "output_schema" jsonb;--> statement-breakpoint
ALTER TABLE "skills" ADD COLUMN "tags" jsonb DEFAULT '[]';--> statement-breakpoint
ALTER TABLE "skills" ADD COLUMN "status" varchar(20) DEFAULT 'active';--> statement-breakpoint
ALTER TABLE "team_members" ADD COLUMN "name" varchar(100);--> statement-breakpoint
ALTER TABLE "team_members" ADD COLUMN "avatar" varchar(500);--> statement-breakpoint
ALTER TABLE "teams" ADD COLUMN "avatar_url" varchar(500);--> statement-breakpoint
ALTER TABLE "teams" ADD COLUMN "website" varchar(500);--> statement-breakpoint
ALTER TABLE "tools" ADD COLUMN "service_id" varchar(36);--> statement-breakpoint
ALTER TABLE "tools" ADD COLUMN "is_active" boolean DEFAULT true;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "avatar_url" varchar(500);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "title" varchar(100);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "full_name" varchar(100);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "real_name" varchar(100);