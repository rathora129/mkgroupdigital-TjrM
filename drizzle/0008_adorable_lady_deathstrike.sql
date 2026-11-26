CREATE TYPE "public"."marketing_campaign_status" AS ENUM('planned', 'draft', 'awaiting_review', 'approved', 'scheduled', 'executed', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."marketing_content_status" AS ENUM('idea', 'draft', 'in_review', 'changes_requested', 'approved', 'scheduled', 'published', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."marketing_finding_source" AS ENUM('verified', 'manual', 'ai_suggestion', 'unverified');--> statement-breakpoint
CREATE TYPE "public"."marketing_finding_status" AS ENUM('open', 'in_progress', 'resolved', 'wont_fix');--> statement-breakpoint
CREATE TYPE "public"."marketing_metric_source" AS ENUM('manual', 'imported', 'calculated', 'ai_estimate');--> statement-breakpoint
CREATE TYPE "public"."marketing_proposal_status" AS ENUM('draft', 'awaiting_review', 'approved', 'rejected', 'executing', 'executed', 'cancelled');--> statement-breakpoint
CREATE TABLE "marketing_campaigns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"project_id" uuid,
	"name" text NOT NULL,
	"objective" text,
	"objective_description" text,
	"target_audience" text,
	"target_geography" text,
	"channel" text NOT NULL,
	"start_date" timestamp with time zone,
	"end_date" timestamp with time zone,
	"budget_estimate" integer DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'INR' NOT NULL,
	"success_metrics" text,
	"status" "marketing_campaign_status" DEFAULT 'planned' NOT NULL,
	"owner_user_id" uuid,
	"client_approval_status" "client_approval_status" DEFAULT 'not_requested' NOT NULL,
	"notes" text,
	"created_by_user_id" uuid,
	"updated_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "marketing_content_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"campaign_id" uuid,
	"project_id" uuid,
	"content_type" text NOT NULL,
	"title" text NOT NULL,
	"target_audience" text,
	"target_keyword" text,
	"target_platform" text,
	"language" text DEFAULT 'en' NOT NULL,
	"status" "marketing_content_status" DEFAULT 'draft' NOT NULL,
	"latest_version" integer DEFAULT 1 NOT NULL,
	"approved_version" integer,
	"generation_source" text DEFAULT 'manual' NOT NULL,
	"agent_run_id" uuid,
	"owner_user_id" uuid,
	"scheduled_for" timestamp with time zone,
	"due_date" timestamp with time zone,
	"archived_at" timestamp with time zone,
	"created_by_user_id" uuid,
	"updated_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "marketing_content_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"content_item_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"body" text NOT NULL,
	"generation_source" text DEFAULT 'manual' NOT NULL,
	"ai_metadata" jsonb,
	"created_by_user_id" uuid,
	"change_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "marketing_metrics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"campaign_id" uuid,
	"metric_key" text NOT NULL,
	"value" double precision DEFAULT 0 NOT NULL,
	"source" "marketing_metric_source" DEFAULT 'manual' NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"notes" text,
	"recorded_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "marketing_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"business_description" text,
	"industry" text,
	"target_audience" text,
	"target_locations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"service_areas" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"website_url" text,
	"business_goals" text,
	"competitors" text,
	"brand_voice" text,
	"communication_guidelines" text,
	"content_language" text DEFAULT 'en' NOT NULL,
	"marketing_notes" text,
	"available_services" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"selected_services" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_by_user_id" uuid,
	"updated_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "marketing_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"project_id" uuid,
	"title" text NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"summary" text,
	"data_snapshot" jsonb,
	"data_sources" jsonb,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "marketing_website_pages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"page_title" text NOT NULL,
	"page_url" text NOT NULL,
	"page_type" text,
	"page_objective" text,
	"existing_content_notes" text,
	"seo_title" text,
	"meta_description" text,
	"cta_recommendations" text,
	"media_requirements" text,
	"internal_link_recommendations" text,
	"status" text DEFAULT 'active' NOT NULL,
	"created_by_user_id" uuid,
	"updated_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "marketing_website_proposal_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"proposal_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"body" text NOT NULL,
	"generation_source" text DEFAULT 'manual' NOT NULL,
	"ai_metadata" jsonb,
	"created_by_user_id" uuid,
	"change_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "marketing_website_proposals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"page_id" uuid,
	"title" text NOT NULL,
	"current_content" text,
	"proposed_content" text,
	"status" "marketing_proposal_status" DEFAULT 'draft' NOT NULL,
	"latest_version" integer DEFAULT 1 NOT NULL,
	"review_notes" text,
	"rejection_feedback" text,
	"owner_user_id" uuid,
	"approved_by_user_id" uuid,
	"approved_at" timestamp with time zone,
	"executed_by_user_id" uuid,
	"executed_at" timestamp with time zone,
	"execution_evidence" text,
	"execution_notes" text,
	"created_by_user_id" uuid,
	"updated_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project_tasks" ADD COLUMN "source_type" text;--> statement-breakpoint
ALTER TABLE "project_tasks" ADD COLUMN "source_id" uuid;--> statement-breakpoint
ALTER TABLE "project_tasks" ADD COLUMN "acceptance_criteria" text;--> statement-breakpoint
ALTER TABLE "project_tasks" ADD COLUMN "completion_evidence" text;--> statement-breakpoint
ALTER TABLE "website_audit_findings" ADD COLUMN "source_type" "marketing_finding_source" DEFAULT 'verified' NOT NULL;--> statement-breakpoint
ALTER TABLE "website_audit_findings" ADD COLUMN "status" "marketing_finding_status" DEFAULT 'open' NOT NULL;--> statement-breakpoint
ALTER TABLE "website_audit_findings" ADD COLUMN "assigned_to_user_id" uuid;--> statement-breakpoint
ALTER TABLE "website_audit_findings" ADD COLUMN "linked_task_id" uuid;--> statement-breakpoint
ALTER TABLE "website_audit_findings" ADD COLUMN "completion_notes" text;--> statement-breakpoint
ALTER TABLE "website_audit_findings" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "website_audits" ADD COLUMN "client_id" uuid;--> statement-breakpoint
ALTER TABLE "website_audits" ADD COLUMN "project_id" uuid;--> statement-breakpoint
ALTER TABLE "website_audits" ADD COLUMN "audit_date" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "website_audits" ADD COLUMN "assigned_to_user_id" uuid;--> statement-breakpoint
ALTER TABLE "website_audits" ADD COLUMN "checklist" jsonb;--> statement-breakpoint
ALTER TABLE "website_audits" ADD COLUMN "notes" text;--> statement-breakpoint
ALTER TABLE "website_audits" ADD COLUMN "capture_mode" text DEFAULT 'engine' NOT NULL;--> statement-breakpoint
ALTER TABLE "marketing_campaigns" ADD CONSTRAINT "marketing_campaigns_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing_campaigns" ADD CONSTRAINT "marketing_campaigns_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing_campaigns" ADD CONSTRAINT "marketing_campaigns_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing_campaigns" ADD CONSTRAINT "marketing_campaigns_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing_campaigns" ADD CONSTRAINT "marketing_campaigns_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing_campaigns" ADD CONSTRAINT "marketing_campaigns_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing_content_items" ADD CONSTRAINT "marketing_content_items_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing_content_items" ADD CONSTRAINT "marketing_content_items_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing_content_items" ADD CONSTRAINT "marketing_content_items_campaign_id_marketing_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."marketing_campaigns"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing_content_items" ADD CONSTRAINT "marketing_content_items_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing_content_items" ADD CONSTRAINT "marketing_content_items_agent_run_id_agent_runs_id_fk" FOREIGN KEY ("agent_run_id") REFERENCES "public"."agent_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing_content_items" ADD CONSTRAINT "marketing_content_items_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing_content_items" ADD CONSTRAINT "marketing_content_items_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing_content_items" ADD CONSTRAINT "marketing_content_items_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing_content_versions" ADD CONSTRAINT "marketing_content_versions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing_content_versions" ADD CONSTRAINT "marketing_content_versions_content_item_id_marketing_content_items_id_fk" FOREIGN KEY ("content_item_id") REFERENCES "public"."marketing_content_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing_content_versions" ADD CONSTRAINT "marketing_content_versions_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing_metrics" ADD CONSTRAINT "marketing_metrics_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing_metrics" ADD CONSTRAINT "marketing_metrics_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing_metrics" ADD CONSTRAINT "marketing_metrics_campaign_id_marketing_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."marketing_campaigns"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing_metrics" ADD CONSTRAINT "marketing_metrics_recorded_by_user_id_users_id_fk" FOREIGN KEY ("recorded_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing_profiles" ADD CONSTRAINT "marketing_profiles_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing_profiles" ADD CONSTRAINT "marketing_profiles_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing_profiles" ADD CONSTRAINT "marketing_profiles_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing_profiles" ADD CONSTRAINT "marketing_profiles_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing_reports" ADD CONSTRAINT "marketing_reports_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing_reports" ADD CONSTRAINT "marketing_reports_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing_reports" ADD CONSTRAINT "marketing_reports_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing_reports" ADD CONSTRAINT "marketing_reports_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing_website_pages" ADD CONSTRAINT "marketing_website_pages_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing_website_pages" ADD CONSTRAINT "marketing_website_pages_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing_website_pages" ADD CONSTRAINT "marketing_website_pages_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing_website_pages" ADD CONSTRAINT "marketing_website_pages_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing_website_proposal_versions" ADD CONSTRAINT "marketing_website_proposal_versions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing_website_proposal_versions" ADD CONSTRAINT "marketing_website_proposal_versions_proposal_id_marketing_website_proposals_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."marketing_website_proposals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing_website_proposal_versions" ADD CONSTRAINT "marketing_website_proposal_versions_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing_website_proposals" ADD CONSTRAINT "marketing_website_proposals_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing_website_proposals" ADD CONSTRAINT "marketing_website_proposals_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing_website_proposals" ADD CONSTRAINT "marketing_website_proposals_page_id_marketing_website_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."marketing_website_pages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing_website_proposals" ADD CONSTRAINT "marketing_website_proposals_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing_website_proposals" ADD CONSTRAINT "marketing_website_proposals_approved_by_user_id_users_id_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing_website_proposals" ADD CONSTRAINT "marketing_website_proposals_executed_by_user_id_users_id_fk" FOREIGN KEY ("executed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing_website_proposals" ADD CONSTRAINT "marketing_website_proposals_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing_website_proposals" ADD CONSTRAINT "marketing_website_proposals_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "marketing_campaigns_workspace_status_idx" ON "marketing_campaigns" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE INDEX "marketing_campaigns_workspace_client_idx" ON "marketing_campaigns" USING btree ("workspace_id","client_id");--> statement-breakpoint
CREATE INDEX "marketing_campaigns_workspace_owner_idx" ON "marketing_campaigns" USING btree ("workspace_id","owner_user_id");--> statement-breakpoint
CREATE INDEX "marketing_content_workspace_status_idx" ON "marketing_content_items" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE INDEX "marketing_content_workspace_client_idx" ON "marketing_content_items" USING btree ("workspace_id","client_id");--> statement-breakpoint
CREATE INDEX "marketing_content_workspace_campaign_idx" ON "marketing_content_items" USING btree ("workspace_id","campaign_id");--> statement-breakpoint
CREATE INDEX "marketing_content_workspace_scheduled_idx" ON "marketing_content_items" USING btree ("workspace_id","scheduled_for");--> statement-breakpoint
CREATE UNIQUE INDEX "marketing_content_versions_item_version_unique" ON "marketing_content_versions" USING btree ("content_item_id","version");--> statement-breakpoint
CREATE INDEX "marketing_content_versions_workspace_created_idx" ON "marketing_content_versions" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "marketing_metrics_workspace_client_period_idx" ON "marketing_metrics" USING btree ("workspace_id","client_id","period_start");--> statement-breakpoint
CREATE INDEX "marketing_metrics_workspace_campaign_idx" ON "marketing_metrics" USING btree ("workspace_id","campaign_id");--> statement-breakpoint
CREATE UNIQUE INDEX "marketing_profiles_workspace_client_unique" ON "marketing_profiles" USING btree ("workspace_id","client_id");--> statement-breakpoint
CREATE INDEX "marketing_profiles_workspace_status_idx" ON "marketing_profiles" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE INDEX "marketing_reports_workspace_client_created_idx" ON "marketing_reports" USING btree ("workspace_id","client_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "marketing_website_pages_workspace_client_url_unique" ON "marketing_website_pages" USING btree ("workspace_id","client_id","page_url");--> statement-breakpoint
CREATE INDEX "marketing_website_pages_workspace_client_idx" ON "marketing_website_pages" USING btree ("workspace_id","client_id");--> statement-breakpoint
CREATE UNIQUE INDEX "marketing_proposal_versions_proposal_version_unique" ON "marketing_website_proposal_versions" USING btree ("proposal_id","version");--> statement-breakpoint
CREATE INDEX "marketing_proposal_versions_workspace_created_idx" ON "marketing_website_proposal_versions" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "marketing_website_proposals_workspace_status_idx" ON "marketing_website_proposals" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE INDEX "marketing_website_proposals_workspace_client_idx" ON "marketing_website_proposals" USING btree ("workspace_id","client_id");--> statement-breakpoint
CREATE INDEX "marketing_website_proposals_page_idx" ON "marketing_website_proposals" USING btree ("page_id");--> statement-breakpoint
ALTER TABLE "website_audit_findings" ADD CONSTRAINT "website_audit_findings_assigned_to_user_id_users_id_fk" FOREIGN KEY ("assigned_to_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "website_audit_findings" ADD CONSTRAINT "website_audit_findings_linked_task_id_project_tasks_id_fk" FOREIGN KEY ("linked_task_id") REFERENCES "public"."project_tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "website_audits" ADD CONSTRAINT "website_audits_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "website_audits" ADD CONSTRAINT "website_audits_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "website_audits" ADD CONSTRAINT "website_audits_assigned_to_user_id_users_id_fk" FOREIGN KEY ("assigned_to_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "project_tasks_source_unique" ON "project_tasks" USING btree ("workspace_id","source_type","source_id") WHERE "project_tasks"."source_id" is not null;--> statement-breakpoint
CREATE INDEX "website_audit_findings_workspace_status_idx" ON "website_audit_findings" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE INDEX "website_audit_findings_linked_task_idx" ON "website_audit_findings" USING btree ("linked_task_id");--> statement-breakpoint
CREATE INDEX "website_audits_workspace_client_idx" ON "website_audits" USING btree ("workspace_id","client_id");--> statement-breakpoint
CREATE INDEX "website_audits_workspace_project_idx" ON "website_audits" USING btree ("workspace_id","project_id");