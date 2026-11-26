CREATE TYPE "public"."knowledge_category" AS ENUM('company_profile', 'services', 'processes', 'brand_voice', 'pricing', 'policies', 'sales', 'marketing', 'client_specific', 'project_specific', 'reference', 'other');--> statement-breakpoint
CREATE TYPE "public"."knowledge_document_status" AS ENUM('processing', 'processed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."knowledge_provenance" AS ENUM('verified', 'source_derived', 'ai_generated', 'unverified');--> statement-breakpoint
CREATE TYPE "public"."knowledge_source_type" AS ENUM('manual', 'document', 'import', 'agent_summary');--> statement-breakpoint
CREATE TYPE "public"."knowledge_status" AS ENUM('draft', 'published', 'archived');--> statement-breakpoint
CREATE TYPE "public"."memory_confidence" AS ENUM('low', 'medium', 'high');--> statement-breakpoint
CREATE TYPE "public"."memory_status" AS ENUM('active', 'archived', 'superseded');--> statement-breakpoint
CREATE TYPE "public"."memory_type" AS ENUM('workspace', 'company', 'client', 'project', 'decision', 'preference', 'workflow', 'agent');--> statement-breakpoint
CREATE TABLE "ai_memories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"memory_type" "memory_type" NOT NULL,
	"key" text NOT NULL,
	"content" text NOT NULL,
	"source_type" "knowledge_source_type" DEFAULT 'manual' NOT NULL,
	"source_reference" text,
	"source_entry_id" uuid,
	"client_id" uuid,
	"project_id" uuid,
	"agent_id" uuid,
	"status" "memory_status" DEFAULT 'active' NOT NULL,
	"confidence" "memory_confidence" DEFAULT 'medium' NOT NULL,
	"verified" boolean DEFAULT false NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"supersedes_id" uuid,
	"created_by_user_id" uuid,
	"updated_by_user_id" uuid,
	"expires_at" timestamp with time zone,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_memory_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"memory_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"key" text NOT NULL,
	"content" text NOT NULL,
	"confidence" "memory_confidence" NOT NULL,
	"verified" boolean DEFAULT false NOT NULL,
	"status" "memory_status" NOT NULL,
	"changed_by_user_id" uuid,
	"change_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_chunks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"entry_id" uuid NOT NULL,
	"document_id" uuid,
	"chunk_index" integer NOT NULL,
	"heading" text,
	"content" text NOT NULL,
	"char_count" integer NOT NULL,
	"token_estimate" integer DEFAULT 0 NOT NULL,
	"content_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"entry_id" uuid,
	"filename" text NOT NULL,
	"mime_type" text NOT NULL,
	"format" text NOT NULL,
	"byte_size" integer NOT NULL,
	"checksum" text NOT NULL,
	"status" "knowledge_document_status" DEFAULT 'processing' NOT NULL,
	"error_message" text,
	"raw_text" text,
	"chunk_count" integer DEFAULT 0 NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"uploaded_by_user_id" uuid,
	"processed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"category" "knowledge_category" DEFAULT 'other' NOT NULL,
	"title" text NOT NULL,
	"summary" text,
	"content" text NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"source_type" "knowledge_source_type" DEFAULT 'manual' NOT NULL,
	"source_reference" text,
	"provenance" "knowledge_provenance" DEFAULT 'unverified' NOT NULL,
	"status" "knowledge_status" DEFAULT 'draft' NOT NULL,
	"client_id" uuid,
	"project_id" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"content_hash" text NOT NULL,
	"created_by_user_id" uuid,
	"updated_by_user_id" uuid,
	"published_at" timestamp with time zone,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"entry_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"category" "knowledge_category" NOT NULL,
	"title" text NOT NULL,
	"summary" text,
	"content" text NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"provenance" "knowledge_provenance" NOT NULL,
	"status" "knowledge_status" NOT NULL,
	"changed_by_user_id" uuid,
	"change_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN "context_sources" jsonb;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN "context_tokens" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_memories" ADD CONSTRAINT "ai_memories_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_memories" ADD CONSTRAINT "ai_memories_source_entry_id_knowledge_entries_id_fk" FOREIGN KEY ("source_entry_id") REFERENCES "public"."knowledge_entries"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_memories" ADD CONSTRAINT "ai_memories_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_memories" ADD CONSTRAINT "ai_memories_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_memories" ADD CONSTRAINT "ai_memories_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_memories" ADD CONSTRAINT "ai_memories_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_memories" ADD CONSTRAINT "ai_memories_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_memory_versions" ADD CONSTRAINT "ai_memory_versions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_memory_versions" ADD CONSTRAINT "ai_memory_versions_memory_id_ai_memories_id_fk" FOREIGN KEY ("memory_id") REFERENCES "public"."ai_memories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_memory_versions" ADD CONSTRAINT "ai_memory_versions_changed_by_user_id_users_id_fk" FOREIGN KEY ("changed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_chunks" ADD CONSTRAINT "knowledge_chunks_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_chunks" ADD CONSTRAINT "knowledge_chunks_entry_id_knowledge_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."knowledge_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_chunks" ADD CONSTRAINT "knowledge_chunks_document_id_knowledge_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."knowledge_documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_documents" ADD CONSTRAINT "knowledge_documents_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_documents" ADD CONSTRAINT "knowledge_documents_entry_id_knowledge_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."knowledge_entries"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_documents" ADD CONSTRAINT "knowledge_documents_uploaded_by_user_id_users_id_fk" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_entries" ADD CONSTRAINT "knowledge_entries_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_entries" ADD CONSTRAINT "knowledge_entries_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_entries" ADD CONSTRAINT "knowledge_entries_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_entries" ADD CONSTRAINT "knowledge_entries_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_entries" ADD CONSTRAINT "knowledge_entries_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_versions" ADD CONSTRAINT "knowledge_versions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_versions" ADD CONSTRAINT "knowledge_versions_entry_id_knowledge_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."knowledge_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_versions" ADD CONSTRAINT "knowledge_versions_changed_by_user_id_users_id_fk" FOREIGN KEY ("changed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ai_memories_workspace_key_unique" ON "ai_memories" USING btree ("workspace_id","memory_type","key") WHERE "ai_memories"."status" = 'active';--> statement-breakpoint
CREATE INDEX "ai_memories_workspace_type_status_idx" ON "ai_memories" USING btree ("workspace_id","memory_type","status");--> statement-breakpoint
CREATE INDEX "ai_memories_workspace_client_idx" ON "ai_memories" USING btree ("workspace_id","client_id");--> statement-breakpoint
CREATE INDEX "ai_memories_workspace_project_idx" ON "ai_memories" USING btree ("workspace_id","project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_memory_versions_memory_version_unique" ON "ai_memory_versions" USING btree ("memory_id","version");--> statement-breakpoint
CREATE INDEX "ai_memory_versions_workspace_created_idx" ON "ai_memory_versions" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_chunks_entry_chunk_unique" ON "knowledge_chunks" USING btree ("entry_id","chunk_index");--> statement-breakpoint
CREATE INDEX "knowledge_chunks_workspace_entry_idx" ON "knowledge_chunks" USING btree ("workspace_id","entry_id");--> statement-breakpoint
CREATE INDEX "knowledge_chunks_workspace_document_idx" ON "knowledge_chunks" USING btree ("workspace_id","document_id");--> statement-breakpoint
CREATE INDEX "knowledge_chunks_search_idx" ON "knowledge_chunks" USING gin (to_tsvector('english', "content"));--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_documents_workspace_checksum_unique" ON "knowledge_documents" USING btree ("workspace_id","checksum");--> statement-breakpoint
CREATE INDEX "knowledge_documents_workspace_status_idx" ON "knowledge_documents" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE INDEX "knowledge_documents_workspace_created_idx" ON "knowledge_documents" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_entries_workspace_hash_unique" ON "knowledge_entries" USING btree ("workspace_id","content_hash") WHERE "knowledge_entries"."archived_at" is null;--> statement-breakpoint
CREATE INDEX "knowledge_entries_workspace_category_idx" ON "knowledge_entries" USING btree ("workspace_id","category");--> statement-breakpoint
CREATE INDEX "knowledge_entries_workspace_status_idx" ON "knowledge_entries" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE INDEX "knowledge_entries_workspace_client_idx" ON "knowledge_entries" USING btree ("workspace_id","client_id");--> statement-breakpoint
CREATE INDEX "knowledge_entries_workspace_project_idx" ON "knowledge_entries" USING btree ("workspace_id","project_id");--> statement-breakpoint
CREATE INDEX "knowledge_entries_search_idx" ON "knowledge_entries" USING gin (to_tsvector('english', coalesce("title", '') || ' ' || coalesce("summary", '') || ' ' || "content"));--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_versions_entry_version_unique" ON "knowledge_versions" USING btree ("entry_id","version");--> statement-breakpoint
CREATE INDEX "knowledge_versions_workspace_created_idx" ON "knowledge_versions" USING btree ("workspace_id","created_at");