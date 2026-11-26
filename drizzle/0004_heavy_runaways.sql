CREATE TYPE "public"."discovery_status" AS ENUM('draft', 'in_review', 'approved', 'archived');--> statement-breakpoint
CREATE TYPE "public"."opportunity_stage" AS ENUM('discovery', 'requirements', 'proposal', 'negotiation', 'won', 'lost');--> statement-breakpoint
CREATE TYPE "public"."requirement_item_status" AS ENUM('requested', 'in_review', 'confirmed', 'deferred');--> statement-breakpoint
CREATE TYPE "public"."service_status" AS ENUM('active', 'archived');--> statement-breakpoint
CREATE TABLE "opportunities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"lead_id" uuid NOT NULL,
	"title" text NOT NULL,
	"stage" "opportunity_stage" DEFAULT 'discovery' NOT NULL,
	"priority" "lead_priority" DEFAULT 'medium' NOT NULL,
	"expected_value_cents" integer,
	"currency" text DEFAULT 'INR' NOT NULL,
	"expected_close_date" timestamp with time zone,
	"next_follow_up_at" timestamp with time zone,
	"owner_user_id" uuid,
	"source" text DEFAULT 'other' NOT NULL,
	"summary" text,
	"lost_reason" text,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "opportunity_activities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"opportunity_id" uuid NOT NULL,
	"type" text NOT NULL,
	"body" text,
	"metadata" jsonb,
	"actor_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "opportunity_discoveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"opportunity_id" uuid NOT NULL,
	"status" "discovery_status" DEFAULT 'draft' NOT NULL,
	"company_overview" text,
	"industry" text,
	"business_model" text,
	"challenges" text,
	"website_presence" text,
	"technology_requirements" text,
	"marketing_requirements" text,
	"finance_requirements" text,
	"compliance_requirements" text,
	"expected_outcomes" text,
	"budget_range" text,
	"timeline" text,
	"special_requirements" text,
	"internal_notes" text,
	"completed_at" timestamp with time zone,
	"created_by_user_id" uuid,
	"updated_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "opportunity_requirement_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"opportunity_id" uuid NOT NULL,
	"service_id" uuid,
	"name" text NOT NULL,
	"description" text,
	"priority" "lead_priority" DEFAULT 'medium' NOT NULL,
	"status" "requirement_item_status" DEFAULT 'requested' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "opportunity_stage_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"opportunity_id" uuid NOT NULL,
	"from_stage" "opportunity_stage",
	"to_stage" "opportunity_stage" NOT NULL,
	"note" text,
	"changed_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "service_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"status" "service_status" DEFAULT 'active' NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "services" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"billing_type" text DEFAULT 'custom' NOT NULL,
	"regulated" boolean DEFAULT false NOT NULL,
	"review_profession" text,
	"review_notes" text,
	"status" "service_status" DEFAULT 'active' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_activities" ADD CONSTRAINT "opportunity_activities_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_activities" ADD CONSTRAINT "opportunity_activities_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_activities" ADD CONSTRAINT "opportunity_activities_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_discoveries" ADD CONSTRAINT "opportunity_discoveries_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_discoveries" ADD CONSTRAINT "opportunity_discoveries_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_discoveries" ADD CONSTRAINT "opportunity_discoveries_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_discoveries" ADD CONSTRAINT "opportunity_discoveries_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_requirement_items" ADD CONSTRAINT "opportunity_requirement_items_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_requirement_items" ADD CONSTRAINT "opportunity_requirement_items_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_requirement_items" ADD CONSTRAINT "opportunity_requirement_items_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_requirement_items" ADD CONSTRAINT "opportunity_requirement_items_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_stage_history" ADD CONSTRAINT "opportunity_stage_history_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_stage_history" ADD CONSTRAINT "opportunity_stage_history_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_stage_history" ADD CONSTRAINT "opportunity_stage_history_changed_by_user_id_users_id_fk" FOREIGN KEY ("changed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_categories" ADD CONSTRAINT "service_categories_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_categories" ADD CONSTRAINT "service_categories_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "services" ADD CONSTRAINT "services_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "services" ADD CONSTRAINT "services_category_id_service_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."service_categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "services" ADD CONSTRAINT "services_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "opportunities_workspace_created_idx" ON "opportunities" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "opportunities_workspace_stage_idx" ON "opportunities" USING btree ("workspace_id","stage");--> statement-breakpoint
CREATE INDEX "opportunities_workspace_lead_idx" ON "opportunities" USING btree ("workspace_id","lead_id");--> statement-breakpoint
CREATE INDEX "opportunities_workspace_owner_idx" ON "opportunities" USING btree ("workspace_id","owner_user_id");--> statement-breakpoint
CREATE INDEX "opportunities_workspace_followup_idx" ON "opportunities" USING btree ("workspace_id","next_follow_up_at");--> statement-breakpoint
CREATE INDEX "opportunity_activities_opportunity_created_idx" ON "opportunity_activities" USING btree ("opportunity_id","created_at");--> statement-breakpoint
CREATE INDEX "opportunity_activities_workspace_created_idx" ON "opportunity_activities" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "opportunity_discoveries_opportunity_unique" ON "opportunity_discoveries" USING btree ("opportunity_id");--> statement-breakpoint
CREATE INDEX "opportunity_discoveries_workspace_status_idx" ON "opportunity_discoveries" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE INDEX "opportunity_requirement_items_opportunity_idx" ON "opportunity_requirement_items" USING btree ("opportunity_id","status");--> statement-breakpoint
CREATE INDEX "opportunity_requirement_items_workspace_idx" ON "opportunity_requirement_items" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "opportunity_stage_history_opportunity_created_idx" ON "opportunity_stage_history" USING btree ("opportunity_id","created_at");--> statement-breakpoint
CREATE INDEX "opportunity_stage_history_workspace_created_idx" ON "opportunity_stage_history" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "service_categories_workspace_slug_unique" ON "service_categories" USING btree ("workspace_id","slug");--> statement-breakpoint
CREATE INDEX "service_categories_workspace_status_idx" ON "service_categories" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "services_workspace_slug_unique" ON "services" USING btree ("workspace_id","slug");--> statement-breakpoint
CREATE INDEX "services_workspace_category_idx" ON "services" USING btree ("workspace_id","category_id");--> statement-breakpoint
CREATE INDEX "services_workspace_status_idx" ON "services" USING btree ("workspace_id","status");