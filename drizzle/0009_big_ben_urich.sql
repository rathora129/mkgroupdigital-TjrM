ALTER TABLE "marketing_content_items" ADD COLUMN "review_feedback" text;--> statement-breakpoint
ALTER TABLE "marketing_content_items" ADD COLUMN "reviewed_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "marketing_content_items" ADD COLUMN "reviewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "marketing_content_items" ADD COLUMN "published_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "marketing_content_items" ADD COLUMN "publish_note" text;--> statement-breakpoint
ALTER TABLE "marketing_content_items" ADD CONSTRAINT "marketing_content_items_reviewed_by_user_id_users_id_fk" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;