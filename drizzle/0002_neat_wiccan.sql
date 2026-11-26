CREATE TYPE "public"."agent_run_status" AS ENUM('queued', 'running', 'completed', 'failed', 'cancelled', 'awaiting_approval');--> statement-breakpoint
CREATE TYPE "public"."agent_type" AS ENUM('business_research', 'lead_research', 'website_audit', 'seo_analysis', 'sales_assistant', 'proposal_generator', 'project_assistant', 'accounting_assistant', 'compliance_assistant', 'documentation_assistant', 'industrial_research', 'customer_support', 'custom');--> statement-breakpoint
CREATE TYPE "public"."approval_status" AS ENUM('pending', 'approved', 'rejected', 'cancelled');--> statement-breakpoint
CREATE TABLE "agent_run_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"level" text DEFAULT 'info' NOT NULL,
	"message" text NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"status" "agent_run_status" DEFAULT 'queued' NOT NULL,
	"input" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"output" jsonb,
	"error_message" text,
	"prompt_tokens" integer DEFAULT 0 NOT NULL,
	"completion_tokens" integer DEFAULT 0 NOT NULL,
	"cost_estimate_cents" integer DEFAULT 0 NOT NULL,
	"duration_ms" integer,
	"attempts" integer DEFAULT 0 NOT NULL,
	"approval_required" boolean DEFAULT false NOT NULL,
	"cancel_requested" boolean DEFAULT false NOT NULL,
	"requested_by_user_id" uuid,
	"idempotency_key" text,
	"job_id" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"type" "agent_type" DEFAULT 'custom' NOT NULL,
	"instructions" text NOT NULL,
	"provider" text DEFAULT 'openai' NOT NULL,
	"model" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"tool_permissions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"allowed_workflows" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"monthly_token_limit" integer,
	"monthly_budget_cents" integer,
	"approval_required" boolean DEFAULT false NOT NULL,
	"created_by_user_id" uuid,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_provider_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"default_model" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "approvals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"resource_type" text DEFAULT 'agent_run' NOT NULL,
	"resource_id" uuid NOT NULL,
	"status" "approval_status" DEFAULT 'pending' NOT NULL,
	"requested_by_user_id" uuid,
	"decided_by_user_id" uuid,
	"decision_note" text,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "ai_monthly_token_limit" integer;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "ai_monthly_budget_cents" integer;--> statement-breakpoint
ALTER TABLE "agent_run_logs" ADD CONSTRAINT "agent_run_logs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_run_logs" ADD CONSTRAINT "agent_run_logs_run_id_agent_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."agent_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_requested_by_user_id_users_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_provider_settings" ADD CONSTRAINT "ai_provider_settings_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_requested_by_user_id_users_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_decided_by_user_id_users_id_fk" FOREIGN KEY ("decided_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_run_logs_run_created_idx" ON "agent_run_logs" USING btree ("run_id","created_at");--> statement-breakpoint
CREATE INDEX "agent_run_logs_workspace_created_idx" ON "agent_run_logs" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_runs_idempotency_unique" ON "agent_runs" USING btree ("workspace_id","idempotency_key") WHERE "agent_runs"."idempotency_key" is not null;--> statement-breakpoint
CREATE INDEX "agent_runs_workspace_created_idx" ON "agent_runs" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "agent_runs_workspace_status_idx" ON "agent_runs" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE INDEX "agent_runs_agent_created_idx" ON "agent_runs" USING btree ("agent_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "agents_workspace_name_unique" ON "agents" USING btree ("workspace_id","name");--> statement-breakpoint
CREATE INDEX "agents_workspace_status_idx" ON "agents" USING btree ("workspace_id","enabled");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_provider_settings_workspace_provider_unique" ON "ai_provider_settings" USING btree ("workspace_id","provider");--> statement-breakpoint
CREATE UNIQUE INDEX "approvals_pending_resource_unique" ON "approvals" USING btree ("resource_type","resource_id") WHERE "approvals"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "approvals_workspace_status_idx" ON "approvals" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE INDEX "approvals_workspace_resource_idx" ON "approvals" USING btree ("workspace_id","resource_type","resource_id");