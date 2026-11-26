CREATE TYPE "public"."lead_priority" AS ENUM('low', 'medium', 'high', 'urgent');--> statement-breakpoint
CREATE TYPE "public"."lead_status" AS ENUM('new', 'researching', 'qualified', 'contacted', 'meeting', 'proposal', 'won', 'lost');--> statement-breakpoint
CREATE TYPE "public"."research_status" AS ENUM('queued', 'running', 'awaiting_approval', 'completed', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."research_subject_type" AS ENUM('company', 'website', 'industry', 'lead');--> statement-breakpoint
CREATE TYPE "public"."research_verification" AS ENUM('verified', 'source_derived', 'ai_analysis', 'unverified');--> statement-breakpoint
CREATE TYPE "public"."website_audit_severity" AS ENUM('critical', 'high', 'medium', 'low', 'info');--> statement-breakpoint
CREATE TYPE "public"."website_audit_status" AS ENUM('queued', 'running', 'completed', 'failed', 'cancelled');--> statement-breakpoint
CREATE TABLE "lead_activities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"lead_id" uuid NOT NULL,
	"type" text NOT NULL,
	"body" text,
	"metadata" jsonb,
	"actor_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lead_status_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"lead_id" uuid NOT NULL,
	"from_status" "lead_status",
	"to_status" "lead_status" NOT NULL,
	"note" text,
	"changed_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"company_name" text NOT NULL,
	"contact_name" text,
	"email" text,
	"phone" text,
	"website" text,
	"industry" text,
	"business_type" text,
	"location" text,
	"country" text,
	"source" text DEFAULT 'other' NOT NULL,
	"estimated_value_cents" integer,
	"currency" text DEFAULT 'INR' NOT NULL,
	"assigned_user_id" uuid,
	"priority" "lead_priority" DEFAULT 'medium' NOT NULL,
	"status" "lead_status" DEFAULT 'new' NOT NULL,
	"next_follow_up_at" timestamp with time zone,
	"notes" text,
	"created_by_user_id" uuid,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "research_findings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"research_id" uuid NOT NULL,
	"category" text DEFAULT 'overview' NOT NULL,
	"title" text NOT NULL,
	"detail" text NOT NULL,
	"verification" "research_verification" DEFAULT 'unverified' NOT NULL,
	"source_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "research_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"status" "research_status" DEFAULT 'queued' NOT NULL,
	"subject_type" "research_subject_type" DEFAULT 'company' NOT NULL,
	"lead_id" uuid,
	"agent_id" uuid,
	"run_id" uuid,
	"company_name" text,
	"website_url" text,
	"industry" text,
	"objective" text NOT NULL,
	"context" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"output" jsonb,
	"error_message" text,
	"source_count" integer DEFAULT 0 NOT NULL,
	"cancel_requested" boolean DEFAULT false NOT NULL,
	"job_id" text,
	"requested_by_user_id" uuid,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "research_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"research_id" uuid NOT NULL,
	"url" text NOT NULL,
	"title" text,
	"kind" text DEFAULT 'website' NOT NULL,
	"http_status" integer,
	"retrieved_at" timestamp with time zone DEFAULT now() NOT NULL,
	"excerpt" text
);
--> statement-breakpoint
CREATE TABLE "website_audit_findings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"audit_id" uuid NOT NULL,
	"category" text NOT NULL,
	"severity" "website_audit_severity" DEFAULT 'info' NOT NULL,
	"code" text NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"evidence" text,
	"recommendation" text NOT NULL,
	"source_page" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "website_audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"audit_id" uuid NOT NULL,
	"level" text DEFAULT 'info' NOT NULL,
	"message" text NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "website_audit_pages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"audit_id" uuid NOT NULL,
	"url" text NOT NULL,
	"final_url" text,
	"status_code" integer,
	"content_type" text,
	"response_time_ms" integer,
	"html_bytes" integer,
	"redirect_count" integer DEFAULT 0 NOT NULL,
	"indexable" boolean,
	"title" text,
	"meta_description" text,
	"h1_count" integer,
	"images_missing_alt" integer,
	"internal_links" integer,
	"external_links" integer,
	"json_ld_blocks" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "website_audits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"status" "website_audit_status" DEFAULT 'queued' NOT NULL,
	"requested_url" text NOT NULL,
	"normalized_url" text NOT NULL,
	"domain" text NOT NULL,
	"max_pages" integer DEFAULT 5 NOT NULL,
	"pages_scanned" integer DEFAULT 0 NOT NULL,
	"overall_score" integer,
	"category_scores" jsonb,
	"scoring_method" text,
	"error_message" text,
	"cancel_requested" boolean DEFAULT false NOT NULL,
	"job_id" text,
	"requested_by_user_id" uuid,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "lead_activities" ADD CONSTRAINT "lead_activities_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_activities" ADD CONSTRAINT "lead_activities_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_activities" ADD CONSTRAINT "lead_activities_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_status_history" ADD CONSTRAINT "lead_status_history_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_status_history" ADD CONSTRAINT "lead_status_history_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_status_history" ADD CONSTRAINT "lead_status_history_changed_by_user_id_users_id_fk" FOREIGN KEY ("changed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_assigned_user_id_users_id_fk" FOREIGN KEY ("assigned_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_findings" ADD CONSTRAINT "research_findings_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_findings" ADD CONSTRAINT "research_findings_research_id_research_jobs_id_fk" FOREIGN KEY ("research_id") REFERENCES "public"."research_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_jobs" ADD CONSTRAINT "research_jobs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_jobs" ADD CONSTRAINT "research_jobs_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_jobs" ADD CONSTRAINT "research_jobs_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_jobs" ADD CONSTRAINT "research_jobs_run_id_agent_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."agent_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_jobs" ADD CONSTRAINT "research_jobs_requested_by_user_id_users_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_sources" ADD CONSTRAINT "research_sources_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_sources" ADD CONSTRAINT "research_sources_research_id_research_jobs_id_fk" FOREIGN KEY ("research_id") REFERENCES "public"."research_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "website_audit_findings" ADD CONSTRAINT "website_audit_findings_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "website_audit_findings" ADD CONSTRAINT "website_audit_findings_audit_id_website_audits_id_fk" FOREIGN KEY ("audit_id") REFERENCES "public"."website_audits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "website_audit_logs" ADD CONSTRAINT "website_audit_logs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "website_audit_logs" ADD CONSTRAINT "website_audit_logs_audit_id_website_audits_id_fk" FOREIGN KEY ("audit_id") REFERENCES "public"."website_audits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "website_audit_pages" ADD CONSTRAINT "website_audit_pages_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "website_audit_pages" ADD CONSTRAINT "website_audit_pages_audit_id_website_audits_id_fk" FOREIGN KEY ("audit_id") REFERENCES "public"."website_audits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "website_audits" ADD CONSTRAINT "website_audits_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "website_audits" ADD CONSTRAINT "website_audits_requested_by_user_id_users_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lead_activities_lead_created_idx" ON "lead_activities" USING btree ("lead_id","created_at");--> statement-breakpoint
CREATE INDEX "lead_activities_workspace_created_idx" ON "lead_activities" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "lead_status_history_lead_created_idx" ON "lead_status_history" USING btree ("lead_id","created_at");--> statement-breakpoint
CREATE INDEX "lead_status_history_workspace_created_idx" ON "lead_status_history" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "leads_workspace_created_idx" ON "leads" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "leads_workspace_status_idx" ON "leads" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE INDEX "leads_workspace_archived_idx" ON "leads" USING btree ("workspace_id","archived_at");--> statement-breakpoint
CREATE INDEX "leads_workspace_assigned_idx" ON "leads" USING btree ("workspace_id","assigned_user_id");--> statement-breakpoint
CREATE INDEX "leads_workspace_email_idx" ON "leads" USING btree ("workspace_id","email");--> statement-breakpoint
CREATE INDEX "leads_workspace_website_idx" ON "leads" USING btree ("workspace_id","website");--> statement-breakpoint
CREATE INDEX "research_findings_research_idx" ON "research_findings" USING btree ("research_id","category");--> statement-breakpoint
CREATE INDEX "research_findings_workspace_idx" ON "research_findings" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "research_jobs_workspace_created_idx" ON "research_jobs" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "research_jobs_workspace_status_idx" ON "research_jobs" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE INDEX "research_jobs_run_idx" ON "research_jobs" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "research_sources_research_idx" ON "research_sources" USING btree ("research_id");--> statement-breakpoint
CREATE INDEX "research_sources_workspace_idx" ON "research_sources" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "website_audit_findings_audit_idx" ON "website_audit_findings" USING btree ("audit_id","category");--> statement-breakpoint
CREATE INDEX "website_audit_findings_workspace_idx" ON "website_audit_findings" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "website_audit_logs_audit_created_idx" ON "website_audit_logs" USING btree ("audit_id","created_at");--> statement-breakpoint
CREATE INDEX "website_audit_logs_workspace_idx" ON "website_audit_logs" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "website_audit_pages_audit_idx" ON "website_audit_pages" USING btree ("audit_id");--> statement-breakpoint
CREATE INDEX "website_audit_pages_workspace_idx" ON "website_audit_pages" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "website_audits_workspace_created_idx" ON "website_audits" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "website_audits_workspace_status_idx" ON "website_audits" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE INDEX "website_audits_workspace_url_idx" ON "website_audits" USING btree ("workspace_id","normalized_url");