CREATE TYPE "public"."proposal_billing_type" AS ENUM('one_time', 'monthly', 'quarterly', 'annual', 'milestone', 'custom');--> statement-breakpoint
CREATE TYPE "public"."proposal_discount_type" AS ENUM('none', 'fixed', 'percent');--> statement-breakpoint
CREATE TYPE "public"."proposal_item_kind" AS ENUM('included', 'optional', 'excluded');--> statement-breakpoint
CREATE TYPE "public"."proposal_status" AS ENUM('draft', 'internal_review', 'approved', 'sent', 'accepted', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."proposal_tax_scheme" AS ENUM('none', 'cgst_sgst', 'igst');--> statement-breakpoint
CREATE TABLE "proposal_activity" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"proposal_id" uuid NOT NULL,
	"version_id" uuid,
	"type" text NOT NULL,
	"body" text,
	"metadata" jsonb,
	"actor_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "proposal_approvals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"proposal_id" uuid NOT NULL,
	"version_id" uuid NOT NULL,
	"decision" text NOT NULL,
	"notes" text,
	"actor_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "proposal_deliverables" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"version_id" uuid NOT NULL,
	"service_id" uuid,
	"title" text NOT NULL,
	"description" text,
	"expected_completion" text,
	"display_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "proposal_line_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"version_id" uuid NOT NULL,
	"service_id" uuid,
	"service_name" text,
	"service_category_name" text,
	"regulated" boolean DEFAULT false NOT NULL,
	"review_profession" text,
	"review_notes" text,
	"name" text NOT NULL,
	"description" text,
	"scope" text,
	"quantity" integer DEFAULT 1 NOT NULL,
	"unit" text DEFAULT 'unit' NOT NULL,
	"unit_price_cents" integer DEFAULT 0 NOT NULL,
	"discount_type" "proposal_discount_type" DEFAULT 'none' NOT NULL,
	"discount_value" integer DEFAULT 0 NOT NULL,
	"tax_scheme" "proposal_tax_scheme" DEFAULT 'none' NOT NULL,
	"tax_rate_bps" integer DEFAULT 0 NOT NULL,
	"billing_type" "proposal_billing_type" DEFAULT 'one_time' NOT NULL,
	"start_condition" text,
	"billing_notes" text,
	"minimum_commitment_months" integer,
	"kind" "proposal_item_kind" DEFAULT 'included' NOT NULL,
	"line_subtotal_cents" integer DEFAULT 0 NOT NULL,
	"line_discount_cents" integer DEFAULT 0 NOT NULL,
	"line_net_cents" integer DEFAULT 0 NOT NULL,
	"line_tax_cents" integer DEFAULT 0 NOT NULL,
	"line_total_cents" integer DEFAULT 0 NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "proposal_milestones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"version_id" uuid NOT NULL,
	"service_id" uuid,
	"title" text NOT NULL,
	"description" text,
	"expected_completion" text,
	"display_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "proposal_responses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"proposal_id" uuid NOT NULL,
	"version_id" uuid NOT NULL,
	"response" text NOT NULL,
	"notes" text,
	"actor_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "proposal_sections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"version_id" uuid NOT NULL,
	"section_key" text NOT NULL,
	"content" text,
	"display_order" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "proposal_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"proposal_id" uuid NOT NULL,
	"version_number" integer NOT NULL,
	"status" "proposal_status" DEFAULT 'draft' NOT NULL,
	"change_summary" text,
	"previous_version_id" uuid,
	"currency" text DEFAULT 'INR' NOT NULL,
	"validity_date" timestamp with time zone,
	"subtotal_cents" integer DEFAULT 0 NOT NULL,
	"item_discount_cents" integer DEFAULT 0 NOT NULL,
	"proposal_discount_cents" integer DEFAULT 0 NOT NULL,
	"discount_total_cents" integer DEFAULT 0 NOT NULL,
	"taxable_cents" integer DEFAULT 0 NOT NULL,
	"tax_cents" integer DEFAULT 0 NOT NULL,
	"grand_total_cents" integer DEFAULT 0 NOT NULL,
	"one_time_total_cents" integer DEFAULT 0 NOT NULL,
	"recurring_monthly_cents" integer DEFAULT 0 NOT NULL,
	"recurring_quarterly_cents" integer DEFAULT 0 NOT NULL,
	"recurring_annual_cents" integer DEFAULT 0 NOT NULL,
	"optional_total_cents" integer DEFAULT 0 NOT NULL,
	"cgst_cents" integer DEFAULT 0 NOT NULL,
	"sgst_cents" integer DEFAULT 0 NOT NULL,
	"igst_cents" integer DEFAULT 0 NOT NULL,
	"proposal_discount_type" "proposal_discount_type" DEFAULT 'none' NOT NULL,
	"proposal_discount_value" integer DEFAULT 0 NOT NULL,
	"created_by_user_id" uuid,
	"updated_by_user_id" uuid,
	"approved_by_user_id" uuid,
	"approved_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"responded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "proposals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"lead_id" uuid NOT NULL,
	"opportunity_id" uuid NOT NULL,
	"reference" text NOT NULL,
	"title" text NOT NULL,
	"status" "proposal_status" DEFAULT 'draft' NOT NULL,
	"current_version_id" uuid,
	"sales_owner_user_id" uuid,
	"created_by_user_id" uuid,
	"updated_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "proposal_activity" ADD CONSTRAINT "proposal_activity_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_activity" ADD CONSTRAINT "proposal_activity_proposal_id_proposals_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."proposals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_activity" ADD CONSTRAINT "proposal_activity_version_id_proposal_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."proposal_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_activity" ADD CONSTRAINT "proposal_activity_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_approvals" ADD CONSTRAINT "proposal_approvals_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_approvals" ADD CONSTRAINT "proposal_approvals_proposal_id_proposals_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."proposals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_approvals" ADD CONSTRAINT "proposal_approvals_version_id_proposal_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."proposal_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_approvals" ADD CONSTRAINT "proposal_approvals_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_deliverables" ADD CONSTRAINT "proposal_deliverables_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_deliverables" ADD CONSTRAINT "proposal_deliverables_version_id_proposal_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."proposal_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_deliverables" ADD CONSTRAINT "proposal_deliverables_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_line_items" ADD CONSTRAINT "proposal_line_items_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_line_items" ADD CONSTRAINT "proposal_line_items_version_id_proposal_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."proposal_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_line_items" ADD CONSTRAINT "proposal_line_items_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_milestones" ADD CONSTRAINT "proposal_milestones_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_milestones" ADD CONSTRAINT "proposal_milestones_version_id_proposal_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."proposal_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_milestones" ADD CONSTRAINT "proposal_milestones_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_responses" ADD CONSTRAINT "proposal_responses_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_responses" ADD CONSTRAINT "proposal_responses_proposal_id_proposals_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."proposals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_responses" ADD CONSTRAINT "proposal_responses_version_id_proposal_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."proposal_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_responses" ADD CONSTRAINT "proposal_responses_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_sections" ADD CONSTRAINT "proposal_sections_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_sections" ADD CONSTRAINT "proposal_sections_version_id_proposal_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."proposal_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_versions" ADD CONSTRAINT "proposal_versions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_versions" ADD CONSTRAINT "proposal_versions_proposal_id_proposals_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."proposals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_versions" ADD CONSTRAINT "proposal_versions_previous_version_id_proposal_versions_id_fk" FOREIGN KEY ("previous_version_id") REFERENCES "public"."proposal_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_versions" ADD CONSTRAINT "proposal_versions_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_versions" ADD CONSTRAINT "proposal_versions_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_versions" ADD CONSTRAINT "proposal_versions_approved_by_user_id_users_id_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_sales_owner_user_id_users_id_fk" FOREIGN KEY ("sales_owner_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "proposal_activity_proposal_created_idx" ON "proposal_activity" USING btree ("proposal_id","created_at");--> statement-breakpoint
CREATE INDEX "proposal_activity_workspace_created_idx" ON "proposal_activity" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "proposal_approvals_version_created_idx" ON "proposal_approvals" USING btree ("version_id","created_at");--> statement-breakpoint
CREATE INDEX "proposal_deliverables_version_order_idx" ON "proposal_deliverables" USING btree ("version_id","display_order");--> statement-breakpoint
CREATE INDEX "proposal_line_items_version_order_idx" ON "proposal_line_items" USING btree ("version_id","display_order");--> statement-breakpoint
CREATE INDEX "proposal_line_items_workspace_idx" ON "proposal_line_items" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "proposal_milestones_version_order_idx" ON "proposal_milestones" USING btree ("version_id","display_order");--> statement-breakpoint
CREATE UNIQUE INDEX "proposal_responses_version_unique" ON "proposal_responses" USING btree ("version_id");--> statement-breakpoint
CREATE UNIQUE INDEX "proposal_sections_version_key_unique" ON "proposal_sections" USING btree ("version_id","section_key");--> statement-breakpoint
CREATE UNIQUE INDEX "proposal_versions_proposal_number_unique" ON "proposal_versions" USING btree ("proposal_id","version_number");--> statement-breakpoint
CREATE INDEX "proposal_versions_workspace_status_idx" ON "proposal_versions" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE INDEX "proposal_versions_workspace_validity_idx" ON "proposal_versions" USING btree ("workspace_id","validity_date");--> statement-breakpoint
CREATE UNIQUE INDEX "proposals_workspace_reference_unique" ON "proposals" USING btree ("workspace_id","reference");--> statement-breakpoint
CREATE INDEX "proposals_workspace_created_idx" ON "proposals" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "proposals_workspace_status_idx" ON "proposals" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE INDEX "proposals_workspace_opportunity_idx" ON "proposals" USING btree ("workspace_id","opportunity_id");--> statement-breakpoint
CREATE INDEX "proposals_workspace_owner_idx" ON "proposals" USING btree ("workspace_id","sales_owner_user_id");