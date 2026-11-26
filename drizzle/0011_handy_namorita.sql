CREATE TYPE "public"."discovery_campaign_status" AS ENUM('draft', 'active', 'paused', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."discovery_frequency" AS ENUM('manual', 'daily', 'weekly');--> statement-breakpoint
CREATE TYPE "public"."discovery_prospect_status" AS ENUM('pending_review', 'approved', 'rejected', 'duplicate');--> statement-breakpoint
CREATE TYPE "public"."import_batch_status" AS ENUM('preview', 'committed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."lead_temperature" AS ENUM('hot', 'warm', 'cold', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."meeting_status" AS ENUM('scheduled', 'rescheduled', 'completed', 'cancelled');--> statement-breakpoint
ALTER TYPE "public"."lead_status" ADD VALUE 'follow_up' BEFORE 'meeting';--> statement-breakpoint
CREATE TABLE "discovery_campaign_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"campaign_id" uuid NOT NULL,
	"trigger" text DEFAULT 'manual' NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"discovered_count" integer DEFAULT 0 NOT NULL,
	"duplicate_count" integer DEFAULT 0 NOT NULL,
	"failed_count" integer DEFAULT 0 NOT NULL,
	"provider" text,
	"error_message" text,
	"usage" jsonb,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "discovery_campaigns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"status" "discovery_campaign_status" DEFAULT 'draft' NOT NULL,
	"provider" text DEFAULT 'public_web_search' NOT NULL,
	"criteria" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"services" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"frequency" "discovery_frequency" DEFAULT 'manual' NOT NULL,
	"daily_limit" integer DEFAULT 20 NOT NULL,
	"max_research_ops" integer DEFAULT 20 NOT NULL,
	"budget_cents" integer DEFAULT 0 NOT NULL,
	"start_date" timestamp with time zone,
	"end_date" timestamp with time zone,
	"last_run_at" timestamp with time zone,
	"next_run_at" timestamp with time zone,
	"last_error" text,
	"created_by_user_id" uuid,
	"updated_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "discovery_prospects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"campaign_id" uuid,
	"provider" text,
	"dedupe_key" text NOT NULL,
	"business_name" text NOT NULL,
	"website" text,
	"phone" text,
	"email" text,
	"contact_name" text,
	"address" text,
	"city" text,
	"state" text,
	"country" text,
	"industry" text,
	"business_size" text,
	"source_urls" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"discovery_date" timestamp with time zone DEFAULT now() NOT NULL,
	"last_verified_at" timestamp with time zone,
	"verification_status" "research_verification" DEFAULT 'unverified' NOT NULL,
	"facts" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"observations" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"hypotheses" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"research" jsonb,
	"recommended_service" text,
	"lead_score" integer,
	"temperature" "lead_temperature" DEFAULT 'unknown' NOT NULL,
	"confidence" integer,
	"reason" text,
	"pitch" text,
	"calling_approach" text,
	"qualification_questions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"next_action" text,
	"status" "discovery_prospect_status" DEFAULT 'pending_review' NOT NULL,
	"decided_by_user_id" uuid,
	"decided_at" timestamp with time zone,
	"decision_note" text,
	"lead_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lead_import_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"source" text DEFAULT 'paste' NOT NULL,
	"status" "import_batch_status" DEFAULT 'preview' NOT NULL,
	"file_name" text,
	"headers" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"mapping" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"totals" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"signature" text,
	"imported_by_user_id" uuid,
	"approved_by_user_id" uuid,
	"committed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lead_import_rows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"batch_id" uuid NOT NULL,
	"row_number" integer NOT NULL,
	"raw" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"normalized" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"errors" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"warnings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"duplicate_lead_id" uuid,
	"imported_lead_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meetings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"lead_id" uuid,
	"client_id" uuid,
	"project_id" uuid,
	"title" text NOT NULL,
	"status" "meeting_status" DEFAULT 'scheduled' NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"location" text,
	"meet_link" text,
	"calendar_provider" text,
	"calendar_event_id" text,
	"calendar_html_link" text,
	"attendees" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"agenda" text,
	"notes" text,
	"outcome" text,
	"created_by_user_id" uuid,
	"updated_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"level" text DEFAULT 'info' NOT NULL,
	"resource_type" text,
	"resource_id" uuid,
	"action_url" text,
	"dedupe_key" text,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project_tasks" ALTER COLUMN "project_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "requirements_initial" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "requirements_detailed" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "reported_amount_received_cents" integer;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "reported_outstanding_cents" integer;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "reported_project_cost_cents" integer;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "reported_amount_verified" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "import_batch_id" uuid;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "discovery_prospect_id" uuid;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "ai_lead_score" integer;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "ai_temperature" "lead_temperature" DEFAULT 'unknown' NOT NULL;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "discovered_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "next_action" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "last_contacted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "project_tasks" ADD COLUMN "lead_id" uuid;--> statement-breakpoint
ALTER TABLE "project_tasks" ADD COLUMN "client_id" uuid;--> statement-breakpoint
ALTER TABLE "project_tasks" ADD COLUMN "task_type" text DEFAULT 'task' NOT NULL;--> statement-breakpoint
ALTER TABLE "project_tasks" ADD COLUMN "due_time" text;--> statement-breakpoint
ALTER TABLE "project_tasks" ADD COLUMN "timezone" text;--> statement-breakpoint
ALTER TABLE "project_tasks" ADD COLUMN "reminder_sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "project_tasks" ADD COLUMN "escalated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "discovery_campaign_runs" ADD CONSTRAINT "discovery_campaign_runs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discovery_campaign_runs" ADD CONSTRAINT "discovery_campaign_runs_campaign_id_discovery_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."discovery_campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discovery_campaigns" ADD CONSTRAINT "discovery_campaigns_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discovery_campaigns" ADD CONSTRAINT "discovery_campaigns_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discovery_campaigns" ADD CONSTRAINT "discovery_campaigns_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discovery_prospects" ADD CONSTRAINT "discovery_prospects_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discovery_prospects" ADD CONSTRAINT "discovery_prospects_campaign_id_discovery_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."discovery_campaigns"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discovery_prospects" ADD CONSTRAINT "discovery_prospects_decided_by_user_id_users_id_fk" FOREIGN KEY ("decided_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discovery_prospects" ADD CONSTRAINT "discovery_prospects_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_import_batches" ADD CONSTRAINT "lead_import_batches_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_import_batches" ADD CONSTRAINT "lead_import_batches_imported_by_user_id_users_id_fk" FOREIGN KEY ("imported_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_import_batches" ADD CONSTRAINT "lead_import_batches_approved_by_user_id_users_id_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_import_rows" ADD CONSTRAINT "lead_import_rows_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_import_rows" ADD CONSTRAINT "lead_import_rows_batch_id_lead_import_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."lead_import_batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_import_rows" ADD CONSTRAINT "lead_import_rows_duplicate_lead_id_leads_id_fk" FOREIGN KEY ("duplicate_lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_import_rows" ADD CONSTRAINT "lead_import_rows_imported_lead_id_leads_id_fk" FOREIGN KEY ("imported_lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "discovery_campaign_runs_campaign_created_idx" ON "discovery_campaign_runs" USING btree ("campaign_id","started_at");--> statement-breakpoint
CREATE INDEX "discovery_campaigns_workspace_status_idx" ON "discovery_campaigns" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE INDEX "discovery_campaigns_workspace_next_run_idx" ON "discovery_campaigns" USING btree ("workspace_id","next_run_at");--> statement-breakpoint
CREATE UNIQUE INDEX "discovery_prospects_workspace_dedupe_unique" ON "discovery_prospects" USING btree ("workspace_id","dedupe_key");--> statement-breakpoint
CREATE INDEX "discovery_prospects_workspace_status_idx" ON "discovery_prospects" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE INDEX "discovery_prospects_campaign_created_idx" ON "discovery_prospects" USING btree ("campaign_id","created_at");--> statement-breakpoint
CREATE INDEX "lead_import_batches_workspace_created_idx" ON "lead_import_batches" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "lead_import_batches_workspace_signature_idx" ON "lead_import_batches" USING btree ("workspace_id","signature");--> statement-breakpoint
CREATE UNIQUE INDEX "lead_import_rows_batch_row_unique" ON "lead_import_rows" USING btree ("batch_id","row_number");--> statement-breakpoint
CREATE INDEX "lead_import_rows_batch_status_idx" ON "lead_import_rows" USING btree ("batch_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "meetings_workspace_calendar_event_unique" ON "meetings" USING btree ("workspace_id","calendar_provider","calendar_event_id") WHERE "meetings"."calendar_event_id" is not null;--> statement-breakpoint
CREATE INDEX "meetings_workspace_starts_idx" ON "meetings" USING btree ("workspace_id","starts_at");--> statement-breakpoint
CREATE INDEX "meetings_workspace_lead_idx" ON "meetings" USING btree ("workspace_id","lead_id");--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_workspace_dedupe_unique" ON "notifications" USING btree ("workspace_id","dedupe_key") WHERE "notifications"."dedupe_key" is not null;--> statement-breakpoint
CREATE INDEX "notifications_workspace_user_created_idx" ON "notifications" USING btree ("workspace_id","user_id","created_at");--> statement-breakpoint
CREATE INDEX "notifications_workspace_user_read_idx" ON "notifications" USING btree ("workspace_id","user_id","read_at");--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_import_batch_id_lead_import_batches_id_fk" FOREIGN KEY ("import_batch_id") REFERENCES "public"."lead_import_batches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_discovery_prospect_id_discovery_prospects_id_fk" FOREIGN KEY ("discovery_prospect_id") REFERENCES "public"."discovery_prospects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_tasks" ADD CONSTRAINT "project_tasks_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_tasks" ADD CONSTRAINT "project_tasks_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "leads_workspace_import_batch_idx" ON "leads" USING btree ("workspace_id","import_batch_id");--> statement-breakpoint
CREATE INDEX "leads_workspace_source_idx" ON "leads" USING btree ("workspace_id","source");--> statement-breakpoint
CREATE INDEX "project_tasks_workspace_lead_idx" ON "project_tasks" USING btree ("workspace_id","lead_id");