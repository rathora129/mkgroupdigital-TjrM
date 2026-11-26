ALTER TYPE "public"."member_role" ADD VALUE 'admin' BEFORE 'member';--> statement-breakpoint
ALTER TYPE "public"."member_role" ADD VALUE 'manager' BEFORE 'member';--> statement-breakpoint
ALTER TYPE "public"."member_role" ADD VALUE 'specialist';--> statement-breakpoint
ALTER TYPE "public"."member_role" ADD VALUE 'viewer';--> statement-breakpoint
ALTER TABLE "audit_logs" ADD COLUMN "success" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "timezone" text DEFAULT 'UTC' NOT NULL;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "business_email" text;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "business_phone" text;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "business_address" text;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "website_url" text;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "brand_color" text;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "logo_url" text;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "preferences" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
CREATE INDEX "audit_logs_workspace_resource_idx" ON "audit_logs" USING btree ("workspace_id","resource_type","resource_id");