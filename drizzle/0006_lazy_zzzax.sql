CREATE TYPE "public"."client_approval_status" AS ENUM('not_requested', 'pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."client_status" AS ENUM('active', 'inactive', 'archived');--> statement-breakpoint
CREATE TYPE "public"."client_timeline_type" AS ENUM('note', 'meeting', 'call', 'email_manual');--> statement-breakpoint
CREATE TYPE "public"."engagement_frequency" AS ENUM('one_time', 'weekly', 'monthly', 'quarterly', 'annual', 'custom');--> statement-breakpoint
CREATE TYPE "public"."engagement_status" AS ENUM('planned', 'active', 'paused', 'ending', 'ended', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."expense_status" AS ENUM('pending_approval', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."invoice_source" AS ENUM('proposal', 'engagement', 'manual');--> statement-breakpoint
CREATE TYPE "public"."invoice_status" AS ENUM('draft', 'pending_approval', 'approved', 'issued', 'partially_paid', 'paid', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."milestone_review_status" AS ENUM('pending', 'in_review', 'approved', 'changes_requested');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('bank_transfer', 'upi', 'card', 'cash', 'cheque', 'other');--> statement-breakpoint
CREATE TYPE "public"."project_status" AS ENUM('not_started', 'planning', 'in_progress', 'client_review', 'on_hold', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."scope_change_status" AS ENUM('requested', 'approved', 'rejected', 'withdrawn');--> statement-breakpoint
CREATE TYPE "public"."task_priority" AS ENUM('low', 'medium', 'high', 'urgent');--> statement-breakpoint
CREATE TYPE "public"."task_status" AS ENUM('todo', 'in_progress', 'blocked', 'in_review', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."ticket_message_visibility" AS ENUM('internal', 'client');--> statement-breakpoint
CREATE TYPE "public"."ticket_status" AS ENUM('open', 'assigned', 'in_progress', 'waiting_client', 'resolved', 'closed');--> statement-breakpoint
CREATE TABLE "client_contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"name" text NOT NULL,
	"title" text,
	"email" text,
	"phone" text,
	"is_primary" boolean DEFAULT false NOT NULL,
	"notes" text,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "client_timeline_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"type" "client_timeline_type" DEFAULT 'note' NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_user_id" uuid,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"reference" text NOT NULL,
	"lead_id" uuid,
	"company_name" text NOT NULL,
	"primary_contact_name" text,
	"email" text,
	"phone" text,
	"website" text,
	"industry" text,
	"address" text,
	"owner_user_id" uuid,
	"status" "client_status" DEFAULT 'active' NOT NULL,
	"internal_notes" text,
	"created_by_user_id" uuid,
	"updated_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "expenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"reference" text NOT NULL,
	"category" text NOT NULL,
	"description" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"currency" text DEFAULT 'INR' NOT NULL,
	"expense_date" timestamp with time zone NOT NULL,
	"project_id" uuid,
	"vendor" text,
	"receipt_reference" text,
	"status" "expense_status" DEFAULT 'pending_approval' NOT NULL,
	"recorded_by_user_id" uuid,
	"reviewed_by_user_id" uuid,
	"reviewed_at" timestamp with time zone,
	"decision_notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoice_line_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"description" text NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"unit_price_cents" integer DEFAULT 0 NOT NULL,
	"discount_type" "proposal_discount_type" DEFAULT 'none' NOT NULL,
	"discount_value" integer DEFAULT 0 NOT NULL,
	"tax_scheme" "proposal_tax_scheme" DEFAULT 'none' NOT NULL,
	"tax_rate_bps" integer DEFAULT 0 NOT NULL,
	"line_subtotal_cents" integer DEFAULT 0 NOT NULL,
	"line_discount_cents" integer DEFAULT 0 NOT NULL,
	"line_net_cents" integer DEFAULT 0 NOT NULL,
	"line_tax_cents" integer DEFAULT 0 NOT NULL,
	"line_total_cents" integer DEFAULT 0 NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"reference" text NOT NULL,
	"client_id" uuid NOT NULL,
	"proposal_id" uuid,
	"proposal_version_id" uuid,
	"project_id" uuid,
	"engagement_id" uuid,
	"source" "invoice_source" DEFAULT 'manual' NOT NULL,
	"source_id" uuid,
	"currency" text DEFAULT 'INR' NOT NULL,
	"invoice_date" timestamp with time zone NOT NULL,
	"due_date" timestamp with time zone,
	"status" "invoice_status" DEFAULT 'draft' NOT NULL,
	"subtotal_cents" integer DEFAULT 0 NOT NULL,
	"discount_cents" integer DEFAULT 0 NOT NULL,
	"tax_cents" integer DEFAULT 0 NOT NULL,
	"total_cents" integer DEFAULT 0 NOT NULL,
	"cgst_cents" integer DEFAULT 0 NOT NULL,
	"sgst_cents" integer DEFAULT 0 NOT NULL,
	"igst_cents" integer DEFAULT 0 NOT NULL,
	"amount_paid_cents" integer DEFAULT 0 NOT NULL,
	"balance_due_cents" integer DEFAULT 0 NOT NULL,
	"notes" text,
	"terms" text,
	"approved_by_user_id" uuid,
	"approved_at" timestamp with time zone,
	"issued_by_user_id" uuid,
	"issued_at" timestamp with time zone,
	"cancelled_by_user_id" uuid,
	"cancelled_at" timestamp with time zone,
	"cancellation_reason" text,
	"created_by_user_id" uuid,
	"updated_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"reference" text NOT NULL,
	"invoice_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"payment_date" timestamp with time zone NOT NULL,
	"amount_cents" integer NOT NULL,
	"method" "payment_method" DEFAULT 'bank_transfer' NOT NULL,
	"transaction_reference" text,
	"notes" text,
	"recorded_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_activity" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"task_id" uuid,
	"type" text NOT NULL,
	"body" text,
	"metadata" jsonb,
	"actor_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_deliverables" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"proposal_deliverable_id" uuid,
	"title" text NOT NULL,
	"description" text,
	"target_date" timestamp with time zone,
	"completion_date" timestamp with time zone,
	"owner_user_id" uuid,
	"review_status" "milestone_review_status" DEFAULT 'pending' NOT NULL,
	"client_approval_status" "client_approval_status" DEFAULT 'not_requested' NOT NULL,
	"evidence_notes" text,
	"display_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_milestones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"proposal_milestone_id" uuid,
	"title" text NOT NULL,
	"description" text,
	"target_date" timestamp with time zone,
	"completion_date" timestamp with time zone,
	"owner_user_id" uuid,
	"review_status" "milestone_review_status" DEFAULT 'pending' NOT NULL,
	"client_approval_status" "client_approval_status" DEFAULT 'not_requested' NOT NULL,
	"evidence_notes" text,
	"display_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_scope_changes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"impact_notes" text,
	"status" "scope_change_status" DEFAULT 'requested' NOT NULL,
	"requested_by_user_id" uuid,
	"decided_by_user_id" uuid,
	"decided_at" timestamp with time zone,
	"decision_notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_status_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"from_status" "project_status",
	"to_status" "project_status" NOT NULL,
	"note" text,
	"actor_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"status" "task_status" DEFAULT 'todo' NOT NULL,
	"priority" "task_priority" DEFAULT 'medium' NOT NULL,
	"owner_user_id" uuid,
	"start_date" timestamp with time zone,
	"due_date" timestamp with time zone,
	"estimated_minutes" integer DEFAULT 0 NOT NULL,
	"actual_minutes" integer DEFAULT 0 NOT NULL,
	"completed_at" timestamp with time zone,
	"created_by_user_id" uuid,
	"updated_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"reference" text NOT NULL,
	"client_id" uuid,
	"lead_id" uuid,
	"opportunity_id" uuid,
	"proposal_id" uuid,
	"proposal_version_id" uuid,
	"name" text NOT NULL,
	"status" "project_status" DEFAULT 'not_started' NOT NULL,
	"priority" "task_priority" DEFAULT 'medium' NOT NULL,
	"owner_user_id" uuid,
	"start_date" timestamp with time zone,
	"expected_completion_date" timestamp with time zone,
	"actual_completion_date" timestamp with time zone,
	"description" text,
	"internal_notes" text,
	"currency" text DEFAULT 'INR' NOT NULL,
	"accepted_value_cents" integer DEFAULT 0 NOT NULL,
	"recurring_monthly_cents" integer DEFAULT 0 NOT NULL,
	"recurring_quarterly_cents" integer DEFAULT 0 NOT NULL,
	"recurring_annual_cents" integer DEFAULT 0 NOT NULL,
	"commercial_snapshot" jsonb,
	"created_by_user_id" uuid,
	"updated_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "service_engagements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"service_id" uuid,
	"proposal_id" uuid,
	"project_id" uuid,
	"name" text NOT NULL,
	"manager_user_id" uuid,
	"status" "engagement_status" DEFAULT 'planned' NOT NULL,
	"frequency" "engagement_frequency" DEFAULT 'monthly' NOT NULL,
	"start_date" timestamp with time zone,
	"end_date" timestamp with time zone,
	"renewal_date" timestamp with time zone,
	"scope_reference" text,
	"contract_value_cents" integer DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'INR' NOT NULL,
	"internal_notes" text,
	"created_by_user_id" uuid,
	"updated_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "support_tickets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"reference" text NOT NULL,
	"client_id" uuid NOT NULL,
	"project_id" uuid,
	"subject" text NOT NULL,
	"description" text,
	"category" text DEFAULT 'general' NOT NULL,
	"priority" "task_priority" DEFAULT 'medium' NOT NULL,
	"assigned_user_id" uuid,
	"status" "ticket_status" DEFAULT 'open' NOT NULL,
	"due_date" timestamp with time zone,
	"resolved_at" timestamp with time zone,
	"resolution_notes" text,
	"created_by_user_id" uuid,
	"updated_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task_collaborators" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"task_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"task_id" uuid NOT NULL,
	"author_user_id" uuid,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task_dependencies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"task_id" uuid NOT NULL,
	"depends_on_task_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ticket_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"ticket_id" uuid NOT NULL,
	"author_user_id" uuid,
	"body" text NOT NULL,
	"visibility" "ticket_message_visibility" DEFAULT 'internal' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "client_contacts" ADD CONSTRAINT "client_contacts_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_contacts" ADD CONSTRAINT "client_contacts_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_contacts" ADD CONSTRAINT "client_contacts_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_timeline_entries" ADD CONSTRAINT "client_timeline_entries_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_timeline_entries" ADD CONSTRAINT "client_timeline_entries_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_timeline_entries" ADD CONSTRAINT "client_timeline_entries_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_recorded_by_user_id_users_id_fk" FOREIGN KEY ("recorded_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_reviewed_by_user_id_users_id_fk" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_line_items" ADD CONSTRAINT "invoice_line_items_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_line_items" ADD CONSTRAINT "invoice_line_items_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_proposal_id_proposals_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."proposals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_proposal_version_id_proposal_versions_id_fk" FOREIGN KEY ("proposal_version_id") REFERENCES "public"."proposal_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_engagement_id_service_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."service_engagements"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_approved_by_user_id_users_id_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_issued_by_user_id_users_id_fk" FOREIGN KEY ("issued_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_cancelled_by_user_id_users_id_fk" FOREIGN KEY ("cancelled_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_recorded_by_user_id_users_id_fk" FOREIGN KEY ("recorded_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_activity" ADD CONSTRAINT "project_activity_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_activity" ADD CONSTRAINT "project_activity_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_activity" ADD CONSTRAINT "project_activity_task_id_project_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."project_tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_activity" ADD CONSTRAINT "project_activity_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_deliverables" ADD CONSTRAINT "project_deliverables_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_deliverables" ADD CONSTRAINT "project_deliverables_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_deliverables" ADD CONSTRAINT "project_deliverables_proposal_deliverable_id_proposal_deliverables_id_fk" FOREIGN KEY ("proposal_deliverable_id") REFERENCES "public"."proposal_deliverables"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_deliverables" ADD CONSTRAINT "project_deliverables_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_milestones" ADD CONSTRAINT "project_milestones_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_milestones" ADD CONSTRAINT "project_milestones_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_milestones" ADD CONSTRAINT "project_milestones_proposal_milestone_id_proposal_milestones_id_fk" FOREIGN KEY ("proposal_milestone_id") REFERENCES "public"."proposal_milestones"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_milestones" ADD CONSTRAINT "project_milestones_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_scope_changes" ADD CONSTRAINT "project_scope_changes_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_scope_changes" ADD CONSTRAINT "project_scope_changes_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_scope_changes" ADD CONSTRAINT "project_scope_changes_requested_by_user_id_users_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_scope_changes" ADD CONSTRAINT "project_scope_changes_decided_by_user_id_users_id_fk" FOREIGN KEY ("decided_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_status_history" ADD CONSTRAINT "project_status_history_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_status_history" ADD CONSTRAINT "project_status_history_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_status_history" ADD CONSTRAINT "project_status_history_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_tasks" ADD CONSTRAINT "project_tasks_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_tasks" ADD CONSTRAINT "project_tasks_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_tasks" ADD CONSTRAINT "project_tasks_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_tasks" ADD CONSTRAINT "project_tasks_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_tasks" ADD CONSTRAINT "project_tasks_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_proposal_id_proposals_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."proposals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_proposal_version_id_proposal_versions_id_fk" FOREIGN KEY ("proposal_version_id") REFERENCES "public"."proposal_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_engagements" ADD CONSTRAINT "service_engagements_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_engagements" ADD CONSTRAINT "service_engagements_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_engagements" ADD CONSTRAINT "service_engagements_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_engagements" ADD CONSTRAINT "service_engagements_proposal_id_proposals_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."proposals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_engagements" ADD CONSTRAINT "service_engagements_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_engagements" ADD CONSTRAINT "service_engagements_manager_user_id_users_id_fk" FOREIGN KEY ("manager_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_engagements" ADD CONSTRAINT "service_engagements_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_engagements" ADD CONSTRAINT "service_engagements_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_assigned_user_id_users_id_fk" FOREIGN KEY ("assigned_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_collaborators" ADD CONSTRAINT "task_collaborators_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_collaborators" ADD CONSTRAINT "task_collaborators_task_id_project_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."project_tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_collaborators" ADD CONSTRAINT "task_collaborators_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_comments" ADD CONSTRAINT "task_comments_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_comments" ADD CONSTRAINT "task_comments_task_id_project_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."project_tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_comments" ADD CONSTRAINT "task_comments_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_dependencies" ADD CONSTRAINT "task_dependencies_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_dependencies" ADD CONSTRAINT "task_dependencies_task_id_project_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."project_tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_dependencies" ADD CONSTRAINT "task_dependencies_depends_on_task_id_project_tasks_id_fk" FOREIGN KEY ("depends_on_task_id") REFERENCES "public"."project_tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_messages" ADD CONSTRAINT "ticket_messages_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_messages" ADD CONSTRAINT "ticket_messages_ticket_id_support_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."support_tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_messages" ADD CONSTRAINT "ticket_messages_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "client_contacts_client_idx" ON "client_contacts" USING btree ("client_id","created_at");--> statement-breakpoint
CREATE INDEX "client_contacts_workspace_idx" ON "client_contacts" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "client_timeline_entries_client_idx" ON "client_timeline_entries" USING btree ("client_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "clients_workspace_reference_unique" ON "clients" USING btree ("workspace_id","reference");--> statement-breakpoint
CREATE UNIQUE INDEX "clients_workspace_lead_unique" ON "clients" USING btree ("workspace_id","lead_id") WHERE "clients"."lead_id" is not null;--> statement-breakpoint
CREATE INDEX "clients_workspace_status_idx" ON "clients" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE INDEX "clients_workspace_owner_idx" ON "clients" USING btree ("workspace_id","owner_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "expenses_workspace_reference_unique" ON "expenses" USING btree ("workspace_id","reference");--> statement-breakpoint
CREATE INDEX "expenses_workspace_status_idx" ON "expenses" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE INDEX "expenses_workspace_date_idx" ON "expenses" USING btree ("workspace_id","expense_date");--> statement-breakpoint
CREATE INDEX "expenses_workspace_project_idx" ON "expenses" USING btree ("workspace_id","project_id");--> statement-breakpoint
CREATE INDEX "invoice_line_items_invoice_order_idx" ON "invoice_line_items" USING btree ("invoice_id","display_order");--> statement-breakpoint
CREATE INDEX "invoice_line_items_workspace_idx" ON "invoice_line_items" USING btree ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_workspace_reference_unique" ON "invoices" USING btree ("workspace_id","reference");--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_workspace_source_unique" ON "invoices" USING btree ("workspace_id","source","source_id");--> statement-breakpoint
CREATE INDEX "invoices_workspace_status_idx" ON "invoices" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE INDEX "invoices_workspace_due_idx" ON "invoices" USING btree ("workspace_id","due_date");--> statement-breakpoint
CREATE INDEX "invoices_workspace_client_idx" ON "invoices" USING btree ("workspace_id","client_id");--> statement-breakpoint
CREATE INDEX "invoices_workspace_project_idx" ON "invoices" USING btree ("workspace_id","project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_workspace_reference_unique" ON "payments" USING btree ("workspace_id","reference");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_workspace_transaction_unique" ON "payments" USING btree ("workspace_id","transaction_reference");--> statement-breakpoint
CREATE INDEX "payments_workspace_date_idx" ON "payments" USING btree ("workspace_id","payment_date");--> statement-breakpoint
CREATE INDEX "payments_invoice_idx" ON "payments" USING btree ("invoice_id","created_at");--> statement-breakpoint
CREATE INDEX "project_activity_project_created_idx" ON "project_activity" USING btree ("project_id","created_at");--> statement-breakpoint
CREATE INDEX "project_activity_workspace_created_idx" ON "project_activity" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "project_deliverables_project_order_idx" ON "project_deliverables" USING btree ("project_id","display_order");--> statement-breakpoint
CREATE UNIQUE INDEX "project_members_project_user_unique" ON "project_members" USING btree ("project_id","user_id");--> statement-breakpoint
CREATE INDEX "project_members_workspace_user_idx" ON "project_members" USING btree ("workspace_id","user_id");--> statement-breakpoint
CREATE INDEX "project_milestones_project_order_idx" ON "project_milestones" USING btree ("project_id","display_order");--> statement-breakpoint
CREATE INDEX "project_milestones_workspace_target_idx" ON "project_milestones" USING btree ("workspace_id","target_date");--> statement-breakpoint
CREATE INDEX "project_scope_changes_project_idx" ON "project_scope_changes" USING btree ("project_id","created_at");--> statement-breakpoint
CREATE INDEX "project_status_history_project_idx" ON "project_status_history" USING btree ("project_id","created_at");--> statement-breakpoint
CREATE INDEX "project_tasks_project_status_idx" ON "project_tasks" USING btree ("project_id","status");--> statement-breakpoint
CREATE INDEX "project_tasks_workspace_owner_idx" ON "project_tasks" USING btree ("workspace_id","owner_user_id");--> statement-breakpoint
CREATE INDEX "project_tasks_workspace_due_idx" ON "project_tasks" USING btree ("workspace_id","due_date");--> statement-breakpoint
CREATE UNIQUE INDEX "projects_workspace_reference_unique" ON "projects" USING btree ("workspace_id","reference");--> statement-breakpoint
CREATE UNIQUE INDEX "projects_workspace_proposal_unique" ON "projects" USING btree ("workspace_id","proposal_id") WHERE "projects"."proposal_id" is not null;--> statement-breakpoint
CREATE INDEX "projects_workspace_status_idx" ON "projects" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE INDEX "projects_workspace_owner_idx" ON "projects" USING btree ("workspace_id","owner_user_id");--> statement-breakpoint
CREATE INDEX "projects_workspace_client_idx" ON "projects" USING btree ("workspace_id","client_id");--> statement-breakpoint
CREATE INDEX "projects_workspace_completion_idx" ON "projects" USING btree ("workspace_id","expected_completion_date");--> statement-breakpoint
CREATE INDEX "service_engagements_client_status_idx" ON "service_engagements" USING btree ("client_id","status");--> statement-breakpoint
CREATE INDEX "service_engagements_workspace_renewal_idx" ON "service_engagements" USING btree ("workspace_id","renewal_date");--> statement-breakpoint
CREATE UNIQUE INDEX "support_tickets_workspace_reference_unique" ON "support_tickets" USING btree ("workspace_id","reference");--> statement-breakpoint
CREATE INDEX "support_tickets_workspace_status_idx" ON "support_tickets" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE INDEX "support_tickets_workspace_due_idx" ON "support_tickets" USING btree ("workspace_id","due_date");--> statement-breakpoint
CREATE INDEX "support_tickets_client_idx" ON "support_tickets" USING btree ("client_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "task_collaborators_task_user_unique" ON "task_collaborators" USING btree ("task_id","user_id");--> statement-breakpoint
CREATE INDEX "task_comments_task_idx" ON "task_comments" USING btree ("task_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "task_dependencies_task_unique" ON "task_dependencies" USING btree ("task_id","depends_on_task_id");--> statement-breakpoint
CREATE INDEX "task_dependencies_workspace_idx" ON "task_dependencies" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "ticket_messages_ticket_idx" ON "ticket_messages" USING btree ("ticket_id","created_at");