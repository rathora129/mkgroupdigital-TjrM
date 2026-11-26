CREATE TYPE "public"."execution_status" AS ENUM('proposed', 'awaiting_approval', 'approved', 'rejected', 'queued', 'executing', 'completed', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."integration_status" AS ENUM('not_configured', 'configured', 'error', 'disconnected');--> statement-breakpoint
CREATE TYPE "public"."webhook_event_status" AS ENUM('received', 'processing', 'processed', 'failed', 'ignored');--> statement-breakpoint
CREATE TYPE "public"."workflow_run_status" AS ENUM('queued', 'running', 'completed', 'failed', 'cancelled');--> statement-breakpoint
CREATE TABLE "execution_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"client_id" uuid,
	"project_id" uuid,
	"integration_id" uuid,
	"category" text NOT NULL,
	"operation" text NOT NULL,
	"target_system" text NOT NULL,
	"payload" jsonb,
	"risk_level" text DEFAULT 'medium' NOT NULL,
	"required_permission" text NOT NULL,
	"status" "execution_status" DEFAULT 'proposed' NOT NULL,
	"requested_by_user_id" uuid,
	"approver_user_id" uuid,
	"decision_note" text,
	"decided_at" timestamp with time zone,
	"queued_at" timestamp with time zone,
	"execution_started_at" timestamp with time zone,
	"executed_at" timestamp with time zone,
	"evidence" text,
	"result_summary" text,
	"failure_reason" text,
	"idempotency_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "integration_sync_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"integration_id" uuid,
	"direction" text NOT NULL,
	"event_type" text NOT NULL,
	"source" text NOT NULL,
	"status" text DEFAULT 'recorded' NOT NULL,
	"external_id" text,
	"idempotency_key" text,
	"summary" jsonb,
	"error_message" text,
	"actor_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "integrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"provider" text NOT NULL,
	"name" text NOT NULL,
	"status" "integration_status" DEFAULT 'not_configured' NOT NULL,
	"capabilities" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"settings" jsonb,
	"connected_by_user_id" uuid,
	"last_sync_at" timestamp with time zone,
	"last_error_at" timestamp with time zone,
	"last_error_message" text,
	"disconnected_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"integration_id" uuid,
	"provider" text NOT NULL,
	"event_type" text NOT NULL,
	"external_event_id" text,
	"idempotency_key" text NOT NULL,
	"signature_valid" boolean DEFAULT false NOT NULL,
	"status" "webhook_event_status" DEFAULT 'received' NOT NULL,
	"payload" jsonb,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"error_message" text,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workflow_run_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"step_key" text NOT NULL,
	"label" text NOT NULL,
	"status" text DEFAULT 'completed' NOT NULL,
	"detail" jsonb,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workflow_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"workflow_key" text NOT NULL,
	"trigger" text DEFAULT 'manual' NOT NULL,
	"status" "workflow_run_status" DEFAULT 'queued' NOT NULL,
	"input" jsonb,
	"result" jsonb,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"idempotency_key" text,
	"started_by_user_id" uuid,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "execution_requests" ADD CONSTRAINT "execution_requests_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "execution_requests" ADD CONSTRAINT "execution_requests_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "execution_requests" ADD CONSTRAINT "execution_requests_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "execution_requests" ADD CONSTRAINT "execution_requests_integration_id_integrations_id_fk" FOREIGN KEY ("integration_id") REFERENCES "public"."integrations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "execution_requests" ADD CONSTRAINT "execution_requests_requested_by_user_id_users_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "execution_requests" ADD CONSTRAINT "execution_requests_approver_user_id_users_id_fk" FOREIGN KEY ("approver_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_sync_events" ADD CONSTRAINT "integration_sync_events_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_sync_events" ADD CONSTRAINT "integration_sync_events_integration_id_integrations_id_fk" FOREIGN KEY ("integration_id") REFERENCES "public"."integrations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_sync_events" ADD CONSTRAINT "integration_sync_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integrations" ADD CONSTRAINT "integrations_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integrations" ADD CONSTRAINT "integrations_connected_by_user_id_users_id_fk" FOREIGN KEY ("connected_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_events" ADD CONSTRAINT "webhook_events_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_events" ADD CONSTRAINT "webhook_events_integration_id_integrations_id_fk" FOREIGN KEY ("integration_id") REFERENCES "public"."integrations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_run_steps" ADD CONSTRAINT "workflow_run_steps_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_run_steps" ADD CONSTRAINT "workflow_run_steps_run_id_workflow_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."workflow_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_runs" ADD CONSTRAINT "workflow_runs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_runs" ADD CONSTRAINT "workflow_runs_started_by_user_id_users_id_fk" FOREIGN KEY ("started_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "execution_requests_workspace_idempotency_unique" ON "execution_requests" USING btree ("workspace_id","idempotency_key") WHERE "execution_requests"."idempotency_key" is not null;--> statement-breakpoint
CREATE INDEX "execution_requests_workspace_status_created_idx" ON "execution_requests" USING btree ("workspace_id","status","created_at");--> statement-breakpoint
CREATE INDEX "execution_requests_workspace_created_idx" ON "execution_requests" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "integration_sync_events_workspace_idempotency_unique" ON "integration_sync_events" USING btree ("workspace_id","idempotency_key") WHERE "integration_sync_events"."idempotency_key" is not null;--> statement-breakpoint
CREATE INDEX "integration_sync_events_workspace_created_idx" ON "integration_sync_events" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "integrations_workspace_kind_provider_unique" ON "integrations" USING btree ("workspace_id","kind","provider");--> statement-breakpoint
CREATE INDEX "integrations_workspace_kind_idx" ON "integrations" USING btree ("workspace_id","kind");--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_events_workspace_idempotency_unique" ON "webhook_events" USING btree ("workspace_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "webhook_events_workspace_status_created_idx" ON "webhook_events" USING btree ("workspace_id","status","created_at");--> statement-breakpoint
CREATE INDEX "workflow_run_steps_run_created_idx" ON "workflow_run_steps" USING btree ("run_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "workflow_runs_workspace_idempotency_unique" ON "workflow_runs" USING btree ("workspace_id","idempotency_key") WHERE "workflow_runs"."idempotency_key" is not null;--> statement-breakpoint
CREATE INDEX "workflow_runs_workspace_status_created_idx" ON "workflow_runs" USING btree ("workspace_id","status","created_at");