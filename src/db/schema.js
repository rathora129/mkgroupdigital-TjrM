import { sql } from 'drizzle-orm';
import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

export const memberRole = pgEnum('member_role', [
  'owner',
  'admin',
  'manager',
  'member',
  'specialist',
  'viewer',
]);

export const invitationStatus = pgEnum('invitation_status', [
  'pending',
  'accepted',
  'revoked',
]);

export const agentType = pgEnum('agent_type', [
  'business_research',
  'lead_research',
  'website_audit',
  'seo_analysis',
  'sales_assistant',
  'proposal_generator',
  'project_assistant',
  'accounting_assistant',
  'compliance_assistant',
  'documentation_assistant',
  'industrial_research',
  'customer_support',
  'custom',
]);

export const agentRunStatus = pgEnum('agent_run_status', [
  'queued',
  'running',
  'completed',
  'failed',
  'cancelled',
  'awaiting_approval',
]);

export const approvalStatus = pgEnum('approval_status', [
  'pending',
  'approved',
  'rejected',
  'cancelled',
]);

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name'),
    email: text('email').notNull(),
    emailVerified: timestamp('email_verified', {
      withTimezone: true,
      mode: 'date',
    }),
    image: text('image'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [uniqueIndex('users_email_unique').on(table.email)],
);

export const verificationTokens = pgTable(
  'verification_tokens',
  {
    identifier: text('identifier').notNull(),
    token: text('token').notNull(),
    expires: timestamp('expires', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.identifier, table.token] }),
  ],
);

export const workspaces = pgTable(
  'workspaces',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    timezone: text('timezone').notNull().default('UTC'),
    businessEmail: text('business_email'),
    businessPhone: text('business_phone'),
    businessAddress: text('business_address'),
    websiteUrl: text('website_url'),
    brandColor: text('brand_color'),
    logoUrl: text('logo_url'),
    preferences: jsonb('preferences').notNull().default({}),
    aiMonthlyTokenLimit: integer('ai_monthly_token_limit'),
    aiMonthlyBudgetCents: integer('ai_monthly_budget_cents'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [uniqueIndex('workspaces_slug_unique').on(table.slug)],
);

export const workspaceMemberships = pgTable(
  'workspace_memberships',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: memberRole('role').notNull().default('member'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex('workspace_memberships_workspace_user_unique').on(
      table.workspaceId,
      table.userId,
    ),
    index('workspace_memberships_user_idx').on(table.userId),
    index('workspace_memberships_workspace_idx').on(table.workspaceId),
  ],
);

export const invitations = pgTable(
  'invitations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    role: memberRole('role').notNull().default('member'),
    status: invitationStatus('status').notNull().default('pending'),
    invitedByUserId: uuid('invited_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    expiresAt: timestamp('expires_at', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
    acceptedAt: timestamp('accepted_at', {
      withTimezone: true,
      mode: 'date',
    }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex('invitations_workspace_email_unique').on(
      table.workspaceId,
      table.email,
    ),
    index('invitations_workspace_status_idx').on(
      table.workspaceId,
      table.status,
    ),
    index('invitations_email_idx').on(table.email),
  ],
);

export const auditLogs = pgTable(
  'audit_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id').references(() => workspaces.id, {
      onDelete: 'set null',
    }),
    actorUserId: uuid('actor_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    actorType: text('actor_type').notNull().default('user'),
    action: text('action').notNull(),
    resourceType: text('resource_type'),
    resourceId: text('resource_id'),
    success: boolean('success').notNull().default(true),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('audit_logs_workspace_created_idx').on(
      table.workspaceId,
      table.createdAt,
    ),
    index('audit_logs_actor_idx').on(table.actorUserId),
    index('audit_logs_action_idx').on(table.action),
    index('audit_logs_workspace_resource_idx').on(
      table.workspaceId,
      table.resourceType,
      table.resourceId,
    ),
  ],
);

export const agents = pgTable(
  'agents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description'),
    type: agentType('type').notNull().default('custom'),
    instructions: text('instructions').notNull(),
    provider: text('provider').notNull().default('openai'),
    model: text('model').notNull(),
    enabled: boolean('enabled').notNull().default(true),
    toolPermissions: jsonb('tool_permissions').notNull().default([]),
    allowedWorkflows: jsonb('allowed_workflows').notNull().default([]),
    monthlyTokenLimit: integer('monthly_token_limit'),
    monthlyBudgetCents: integer('monthly_budget_cents'),
    approvalRequired: boolean('approval_required').notNull().default(false),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    archivedAt: timestamp('archived_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex('agents_workspace_name_unique').on(
      table.workspaceId,
      table.name,
    ),
    index('agents_workspace_status_idx').on(table.workspaceId, table.enabled),
  ],
);

export const agentRuns = pgTable(
  'agent_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    agentId: uuid('agent_id')
      .notNull()
      .references(() => agents.id, { onDelete: 'cascade' }),
    status: agentRunStatus('status').notNull().default('queued'),
    input: jsonb('input').notNull().default({}),
    output: jsonb('output'),
    contextSources: jsonb('context_sources'),
    contextTokens: integer('context_tokens').notNull().default(0),
    errorMessage: text('error_message'),
    promptTokens: integer('prompt_tokens').notNull().default(0),
    completionTokens: integer('completion_tokens').notNull().default(0),
    costEstimateCents: integer('cost_estimate_cents').notNull().default(0),
    durationMs: integer('duration_ms'),
    attempts: integer('attempts').notNull().default(0),
    approvalRequired: boolean('approval_required').notNull().default(false),
    cancelRequested: boolean('cancel_requested').notNull().default(false),
    requestedByUserId: uuid('requested_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    idempotencyKey: text('idempotency_key'),
    jobId: text('job_id'),
    startedAt: timestamp('started_at', { withTimezone: true, mode: 'date' }),
    completedAt: timestamp('completed_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex('agent_runs_idempotency_unique')
      .on(table.workspaceId, table.idempotencyKey)
      .where(sql`${table.idempotencyKey} is not null`),
    index('agent_runs_workspace_created_idx').on(
      table.workspaceId,
      table.createdAt,
    ),
    index('agent_runs_workspace_status_idx').on(
      table.workspaceId,
      table.status,
    ),
    index('agent_runs_agent_created_idx').on(table.agentId, table.createdAt),
  ],
);

export const agentRunLogs = pgTable(
  'agent_run_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    runId: uuid('run_id')
      .notNull()
      .references(() => agentRuns.id, { onDelete: 'cascade' }),
    level: text('level').notNull().default('info'),
    message: text('message').notNull(),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('agent_run_logs_run_created_idx').on(table.runId, table.createdAt),
    index('agent_run_logs_workspace_created_idx').on(
      table.workspaceId,
      table.createdAt,
    ),
  ],
);

export const approvals = pgTable(
  'approvals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    resourceType: text('resource_type').notNull().default('agent_run'),
    resourceId: uuid('resource_id').notNull(),
    status: approvalStatus('status').notNull().default('pending'),
    requestedByUserId: uuid('requested_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    decidedByUserId: uuid('decided_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    decisionNote: text('decision_note'),
    decidedAt: timestamp('decided_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('approvals_pending_resource_unique')
      .on(table.resourceType, table.resourceId)
      .where(sql`${table.status} = 'pending'`),
    index('approvals_workspace_status_idx').on(table.workspaceId, table.status),
    index('approvals_workspace_resource_idx').on(
      table.workspaceId,
      table.resourceType,
      table.resourceId,
    ),
  ],
);

export const aiProviderSettings = pgTable(
  'ai_provider_settings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull(),
    enabled: boolean('enabled').notNull().default(true),
    defaultModel: text('default_model'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex('ai_provider_settings_workspace_provider_unique').on(
      table.workspaceId,
      table.provider,
    ),
  ],
);

// ---------------------------------------------------------------------------
// Phase 2C — leads, research and website audits
// ---------------------------------------------------------------------------

export const leadStatus = pgEnum('lead_status', [
  'new',
  'researching',
  'qualified',
  'contacted',
  'follow_up',
  'meeting',
  'proposal',
  'won',
  'lost',
]);

// Phase 2I — how a lead is qualified before a human ever calls it.
export const leadTemperature = pgEnum('lead_temperature', [
  'hot',
  'warm',
  'cold',
  'unknown',
]);

export const leadPriority = pgEnum('lead_priority', [
  'low',
  'medium',
  'high',
  'urgent',
]);

export const researchStatus = pgEnum('research_status', [
  'queued',
  'running',
  'awaiting_approval',
  'completed',
  'failed',
  'cancelled',
]);

export const researchSubjectType = pgEnum('research_subject_type', [
  'company',
  'website',
  'industry',
  'lead',
]);

export const researchVerification = pgEnum('research_verification', [
  'verified',
  'source_derived',
  'ai_analysis',
  'unverified',
]);

export const websiteAuditStatus = pgEnum('website_audit_status', [
  'queued',
  'running',
  'completed',
  'failed',
  'cancelled',
]);

export const websiteAuditSeverity = pgEnum('website_audit_severity', [
  'critical',
  'high',
  'medium',
  'low',
  'info',
]);

// Phase 2G — how a marketing finding was produced and where it stands.
// A verified finding comes from the local audit engine, manual from a person,
// ai_suggestion from the AI runtime and unverified is an untriaged statement.
export const marketingFindingSource = pgEnum('marketing_finding_source', [
  'verified',
  'manual',
  'ai_suggestion',
  'unverified',
]);

export const marketingFindingStatus = pgEnum('marketing_finding_status', [
  'open',
  'in_progress',
  'resolved',
  'wont_fix',
]);

export const leads = pgTable(
  'leads',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    companyName: text('company_name').notNull(),
    contactName: text('contact_name'),
    email: text('email'),
    phone: text('phone'),
    website: text('website'),
    industry: text('industry'),
    businessType: text('business_type'),
    location: text('location'),
    country: text('country'),
    source: text('source').notNull().default('other'),
    estimatedValueCents: integer('estimated_value_cents'),
    currency: text('currency').notNull().default('INR'),
    assignedUserId: uuid('assigned_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    priority: leadPriority('priority').notNull().default('medium'),
    status: leadStatus('status').notNull().default('new'),
    nextFollowUpAt: timestamp('next_follow_up_at', {
      withTimezone: true,
      mode: 'date',
    }),
    notes: text('notes'),
    // Phase 2I — requirements captured by the owner or discovered by AI.
    requirementsInitial: text('requirements_initial'),
    requirementsDetailed: text('requirements_detailed'),
    // Reported money comes from the owner spreadsheet. It is never treated as
    // a verified payment: finance stays authoritative in invoices/payments and
    // these values stay marked unverified until a human confirms them.
    reportedAmountReceivedCents: integer('reported_amount_received_cents'),
    reportedOutstandingCents: integer('reported_outstanding_cents'),
    reportedProjectCostCents: integer('reported_project_cost_cents'),
    reportedAmountVerified: boolean('reported_amount_verified')
      .notNull()
      .default(false),
    importBatchId: uuid('import_batch_id').references(
      () => leadImportBatches.id,
      { onDelete: 'set null' },
    ),
    discoveryProspectId: uuid('discovery_prospect_id').references(
      () => discoveryProspects.id,
      { onDelete: 'set null' },
    ),
    aiLeadScore: integer('ai_lead_score'),
    aiTemperature: leadTemperature('ai_temperature').notNull().default('unknown'),
    discoveredAt: timestamp('discovered_at', {
      withTimezone: true,
      mode: 'date',
    }),
    nextAction: text('next_action'),
    lastContactedAt: timestamp('last_contacted_at', {
      withTimezone: true,
      mode: 'date',
    }),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    archivedAt: timestamp('archived_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index('leads_workspace_created_idx').on(table.workspaceId, table.createdAt),
    index('leads_workspace_status_idx').on(table.workspaceId, table.status),
    index('leads_workspace_archived_idx').on(table.workspaceId, table.archivedAt),
    index('leads_workspace_assigned_idx').on(
      table.workspaceId,
      table.assignedUserId,
    ),
    index('leads_workspace_email_idx').on(table.workspaceId, table.email),
    index('leads_workspace_website_idx').on(table.workspaceId, table.website),
    index('leads_workspace_import_batch_idx').on(
      table.workspaceId,
      table.importBatchId,
    ),
    index('leads_workspace_source_idx').on(table.workspaceId, table.source),
  ],
);

export const leadActivities = pgTable(
  'lead_activities',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    leadId: uuid('lead_id')
      .notNull()
      .references(() => leads.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    body: text('body'),
    metadata: jsonb('metadata'),
    actorUserId: uuid('actor_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('lead_activities_lead_created_idx').on(
      table.leadId,
      table.createdAt,
    ),
    index('lead_activities_workspace_created_idx').on(
      table.workspaceId,
      table.createdAt,
    ),
  ],
);

export const leadStatusHistory = pgTable(
  'lead_status_history',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    leadId: uuid('lead_id')
      .notNull()
      .references(() => leads.id, { onDelete: 'cascade' }),
    fromStatus: leadStatus('from_status'),
    toStatus: leadStatus('to_status').notNull(),
    note: text('note'),
    changedByUserId: uuid('changed_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('lead_status_history_lead_created_idx').on(
      table.leadId,
      table.createdAt,
    ),
    index('lead_status_history_workspace_created_idx').on(
      table.workspaceId,
      table.createdAt,
    ),
  ],
);

export const researchJobs = pgTable(
  'research_jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    status: researchStatus('status').notNull().default('queued'),
    subjectType: researchSubjectType('subject_type').notNull().default('company'),
    leadId: uuid('lead_id').references(() => leads.id, { onDelete: 'set null' }),
    agentId: uuid('agent_id').references(() => agents.id, {
      onDelete: 'set null',
    }),
    runId: uuid('run_id').references(() => agentRuns.id, {
      onDelete: 'set null',
    }),
    companyName: text('company_name'),
    websiteUrl: text('website_url'),
    industry: text('industry'),
    objective: text('objective').notNull(),
    context: jsonb('context').notNull().default({}),
    output: jsonb('output'),
    errorMessage: text('error_message'),
    sourceCount: integer('source_count').notNull().default(0),
    cancelRequested: boolean('cancel_requested').notNull().default(false),
    jobId: text('job_id'),
    requestedByUserId: uuid('requested_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    startedAt: timestamp('started_at', { withTimezone: true, mode: 'date' }),
    completedAt: timestamp('completed_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index('research_jobs_workspace_created_idx').on(
      table.workspaceId,
      table.createdAt,
    ),
    index('research_jobs_workspace_status_idx').on(
      table.workspaceId,
      table.status,
    ),
    index('research_jobs_run_idx').on(table.runId),
  ],
);

export const researchFindings = pgTable(
  'research_findings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    researchId: uuid('research_id')
      .notNull()
      .references(() => researchJobs.id, { onDelete: 'cascade' }),
    category: text('category').notNull().default('overview'),
    title: text('title').notNull(),
    detail: text('detail').notNull(),
    verification: researchVerification('verification')
      .notNull()
      .default('unverified'),
    sourceUrl: text('source_url'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('research_findings_research_idx').on(
      table.researchId,
      table.category,
    ),
    index('research_findings_workspace_idx').on(table.workspaceId),
  ],
);

export const researchSources = pgTable(
  'research_sources',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    researchId: uuid('research_id')
      .notNull()
      .references(() => researchJobs.id, { onDelete: 'cascade' }),
    url: text('url').notNull(),
    title: text('title'),
    kind: text('kind').notNull().default('website'),
    httpStatus: integer('http_status'),
    retrievedAt: timestamp('retrieved_at', {
      withTimezone: true,
      mode: 'date',
    })
      .notNull()
      .defaultNow(),
    excerpt: text('excerpt'),
  },
  (table) => [
    index('research_sources_research_idx').on(table.researchId),
    index('research_sources_workspace_idx').on(table.workspaceId),
  ],
);

export const websiteAudits = pgTable(
  'website_audits',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    status: websiteAuditStatus('status').notNull().default('queued'),
    requestedUrl: text('requested_url').notNull(),
    normalizedUrl: text('normalized_url').notNull(),
    domain: text('domain').notNull(),
    maxPages: integer('max_pages').notNull().default(5),
    pagesScanned: integer('pages_scanned').notNull().default(0),
    overallScore: integer('overall_score'),
    categoryScores: jsonb('category_scores'),
    scoringMethod: text('scoring_method'),
    errorMessage: text('error_message'),
    clientId: uuid('client_id').references(() => clients.id, {
      onDelete: 'set null',
    }),
    projectId: uuid('project_id').references(() => projects.id, {
      onDelete: 'set null',
    }),
    auditDate: timestamp('audit_date', { withTimezone: true, mode: 'date' }),
    assignedToUserId: uuid('assigned_to_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    // Structured manual checklist answers for the categories the engine does
    // not verify on its own (local SEO, content quality, competitor notes).
    checklist: jsonb('checklist'),
    notes: text('notes'),
    captureMode: text('capture_mode').notNull().default('engine'),
    cancelRequested: boolean('cancel_requested').notNull().default(false),
    jobId: text('job_id'),
    requestedByUserId: uuid('requested_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    startedAt: timestamp('started_at', { withTimezone: true, mode: 'date' }),
    completedAt: timestamp('completed_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index('website_audits_workspace_created_idx').on(
      table.workspaceId,
      table.createdAt,
    ),
    index('website_audits_workspace_status_idx').on(
      table.workspaceId,
      table.status,
    ),
    index('website_audits_workspace_url_idx').on(
      table.workspaceId,
      table.normalizedUrl,
    ),
    index('website_audits_workspace_client_idx').on(
      table.workspaceId,
      table.clientId,
    ),
    index('website_audits_workspace_project_idx').on(
      table.workspaceId,
      table.projectId,
    ),
  ],
);

export const websiteAuditPages = pgTable(
  'website_audit_pages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    auditId: uuid('audit_id')
      .notNull()
      .references(() => websiteAudits.id, { onDelete: 'cascade' }),
    url: text('url').notNull(),
    finalUrl: text('final_url'),
    statusCode: integer('status_code'),
    contentType: text('content_type'),
    responseTimeMs: integer('response_time_ms'),
    htmlBytes: integer('html_bytes'),
    redirectCount: integer('redirect_count').notNull().default(0),
    indexable: boolean('indexable'),
    title: text('title'),
    metaDescription: text('meta_description'),
    h1Count: integer('h1_count'),
    imagesMissingAlt: integer('images_missing_alt'),
    internalLinks: integer('internal_links'),
    externalLinks: integer('external_links'),
    jsonLdBlocks: integer('json_ld_blocks'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('website_audit_pages_audit_idx').on(table.auditId),
    index('website_audit_pages_workspace_idx').on(table.workspaceId),
  ],
);

export const websiteAuditFindings = pgTable(
  'website_audit_findings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    auditId: uuid('audit_id')
      .notNull()
      .references(() => websiteAudits.id, { onDelete: 'cascade' }),
    category: text('category').notNull(),
    severity: websiteAuditSeverity('severity').notNull().default('info'),
    code: text('code').notNull(),
    title: text('title').notNull(),
    description: text('description').notNull(),
    evidence: text('evidence'),
    recommendation: text('recommendation').notNull(),
    sourcePage: text('source_page'),
    sourceType: marketingFindingSource('source_type').notNull().default('verified'),
    status: marketingFindingStatus('status').notNull().default('open'),
    assignedToUserId: uuid('assigned_to_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    linkedTaskId: uuid('linked_task_id').references(() => projectTasks.id, {
      onDelete: 'set null',
    }),
    completionNotes: text('completion_notes'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index('website_audit_findings_audit_idx').on(
      table.auditId,
      table.category,
    ),
    index('website_audit_findings_workspace_idx').on(table.workspaceId),
    index('website_audit_findings_workspace_status_idx').on(
      table.workspaceId,
      table.status,
    ),
    index('website_audit_findings_linked_task_idx').on(table.linkedTaskId),
  ],
);

export const websiteAuditLogs = pgTable(
  'website_audit_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    auditId: uuid('audit_id')
      .notNull()
      .references(() => websiteAudits.id, { onDelete: 'cascade' }),
    level: text('level').notNull().default('info'),
    message: text('message').notNull(),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('website_audit_logs_audit_created_idx').on(
      table.auditId,
      table.createdAt,
    ),
    index('website_audit_logs_workspace_idx').on(table.workspaceId),
  ],
);

// ---------------------------------------------------------------------------
// Phase 2D — sales pipeline, discovery, requirements and service catalogue
// ---------------------------------------------------------------------------

export const opportunityStage = pgEnum('opportunity_stage', [
  'discovery',
  'requirements',
  'proposal',
  'negotiation',
  'won',
  'lost',
]);

export const discoveryStatus = pgEnum('discovery_status', [
  'draft',
  'in_review',
  'approved',
  'archived',
]);

export const requirementItemStatus = pgEnum('requirement_item_status', [
  'requested',
  'in_review',
  'confirmed',
  'deferred',
]);

export const serviceStatus = pgEnum('service_status', ['active', 'archived']);

export const proposalStatus = pgEnum('proposal_status', [
  'draft',
  'internal_review',
  'approved',
  'sent',
  'accepted',
  'rejected',
]);

export const proposalItemKind = pgEnum('proposal_item_kind', [
  'included',
  'optional',
  'excluded',
]);

export const proposalDiscountType = pgEnum('proposal_discount_type', [
  'none',
  'fixed',
  'percent',
]);

export const proposalTaxScheme = pgEnum('proposal_tax_scheme', [
  'none',
  'cgst_sgst',
  'igst',
]);

export const proposalBillingType = pgEnum('proposal_billing_type', [
  'one_time',
  'monthly',
  'quarterly',
  'annual',
  'milestone',
  'custom',
]);

export const serviceCategories = pgTable(
  'service_categories',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    description: text('description'),
    sortOrder: integer('sort_order').notNull().default(0),
    status: serviceStatus('status').notNull().default('active'),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex('service_categories_workspace_slug_unique').on(
      table.workspaceId,
      table.slug,
    ),
    index('service_categories_workspace_status_idx').on(
      table.workspaceId,
      table.status,
    ),
  ],
);

export const services = pgTable(
  'services',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    categoryId: uuid('category_id')
      .notNull()
      .references(() => serviceCategories.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    description: text('description'),
    billingType: text('billing_type').notNull().default('custom'),
    regulated: boolean('regulated').notNull().default(false),
    reviewProfession: text('review_profession'),
    reviewNotes: text('review_notes'),
    status: serviceStatus('status').notNull().default('active'),
    sortOrder: integer('sort_order').notNull().default(0),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex('services_workspace_slug_unique').on(
      table.workspaceId,
      table.slug,
    ),
    index('services_workspace_category_idx').on(
      table.workspaceId,
      table.categoryId,
    ),
    index('services_workspace_status_idx').on(table.workspaceId, table.status),
  ],
);

export const opportunities = pgTable(
  'opportunities',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    leadId: uuid('lead_id')
      .notNull()
      .references(() => leads.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    stage: opportunityStage('stage').notNull().default('discovery'),
    priority: leadPriority('priority').notNull().default('medium'),
    expectedValueCents: integer('expected_value_cents'),
    currency: text('currency').notNull().default('INR'),
    expectedCloseDate: timestamp('expected_close_date', {
      withTimezone: true,
      mode: 'date',
    }),
    nextFollowUpAt: timestamp('next_follow_up_at', {
      withTimezone: true,
      mode: 'date',
    }),
    ownerUserId: uuid('owner_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    source: text('source').notNull().default('other'),
    summary: text('summary'),
    lostReason: text('lost_reason'),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index('opportunities_workspace_created_idx').on(
      table.workspaceId,
      table.createdAt,
    ),
    index('opportunities_workspace_stage_idx').on(
      table.workspaceId,
      table.stage,
    ),
    index('opportunities_workspace_lead_idx').on(
      table.workspaceId,
      table.leadId,
    ),
    index('opportunities_workspace_owner_idx').on(
      table.workspaceId,
      table.ownerUserId,
    ),
    index('opportunities_workspace_followup_idx').on(
      table.workspaceId,
      table.nextFollowUpAt,
    ),
  ],
);

export const opportunityDiscoveries = pgTable(
  'opportunity_discoveries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    opportunityId: uuid('opportunity_id')
      .notNull()
      .references(() => opportunities.id, { onDelete: 'cascade' }),
    status: discoveryStatus('status').notNull().default('draft'),
    companyOverview: text('company_overview'),
    industry: text('industry'),
    businessModel: text('business_model'),
    challenges: text('challenges'),
    websitePresence: text('website_presence'),
    technologyRequirements: text('technology_requirements'),
    marketingRequirements: text('marketing_requirements'),
    financeRequirements: text('finance_requirements'),
    complianceRequirements: text('compliance_requirements'),
    expectedOutcomes: text('expected_outcomes'),
    budgetRange: text('budget_range'),
    timeline: text('timeline'),
    specialRequirements: text('special_requirements'),
    internalNotes: text('internal_notes'),
    completedAt: timestamp('completed_at', { withTimezone: true, mode: 'date' }),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    updatedByUserId: uuid('updated_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex('opportunity_discoveries_opportunity_unique').on(
      table.opportunityId,
    ),
    index('opportunity_discoveries_workspace_status_idx').on(
      table.workspaceId,
      table.status,
    ),
  ],
);

export const opportunityRequirementItems = pgTable(
  'opportunity_requirement_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    opportunityId: uuid('opportunity_id')
      .notNull()
      .references(() => opportunities.id, { onDelete: 'cascade' }),
    serviceId: uuid('service_id').references(() => services.id, {
      onDelete: 'set null',
    }),
    name: text('name').notNull(),
    description: text('description'),
    priority: leadPriority('priority').notNull().default('medium'),
    status: requirementItemStatus('status').notNull().default('requested'),
    sortOrder: integer('sort_order').notNull().default(0),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index('opportunity_requirement_items_opportunity_idx').on(
      table.opportunityId,
      table.status,
    ),
    index('opportunity_requirement_items_workspace_idx').on(table.workspaceId),
  ],
);

export const opportunityActivities = pgTable(
  'opportunity_activities',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    opportunityId: uuid('opportunity_id')
      .notNull()
      .references(() => opportunities.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    body: text('body'),
    metadata: jsonb('metadata'),
    actorUserId: uuid('actor_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('opportunity_activities_opportunity_created_idx').on(
      table.opportunityId,
      table.createdAt,
    ),
    index('opportunity_activities_workspace_created_idx').on(
      table.workspaceId,
      table.createdAt,
    ),
  ],
);

export const opportunityStageHistory = pgTable(
  'opportunity_stage_history',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    opportunityId: uuid('opportunity_id')
      .notNull()
      .references(() => opportunities.id, { onDelete: 'cascade' }),
    fromStage: opportunityStage('from_stage'),
    toStage: opportunityStage('to_stage').notNull(),
    note: text('note'),
    changedByUserId: uuid('changed_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('opportunity_stage_history_opportunity_created_idx').on(
      table.opportunityId,
      table.createdAt,
    ),
    index('opportunity_stage_history_workspace_created_idx').on(
      table.workspaceId,
      table.createdAt,
    ),
  ],
);

// Phase 2D-B: proposals. Every row carries workspaceId so queries can be
// scoped without joining through the opportunity, and the reference is unique
// per workspace. currentVersionId is an index-backed pointer resolved by the
// service layer (a hard FK would make proposals <-> versions circular).
export const proposals = pgTable(
  'proposals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    leadId: uuid('lead_id')
      .notNull()
      .references(() => leads.id, { onDelete: 'cascade' }),
    opportunityId: uuid('opportunity_id')
      .notNull()
      .references(() => opportunities.id, { onDelete: 'cascade' }),
    reference: text('reference').notNull(),
    title: text('title').notNull(),
    status: proposalStatus('status').notNull().default('draft'),
    currentVersionId: uuid('current_version_id'),
    salesOwnerUserId: uuid('sales_owner_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    updatedByUserId: uuid('updated_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex('proposals_workspace_reference_unique').on(
      table.workspaceId,
      table.reference,
    ),
    index('proposals_workspace_created_idx').on(
      table.workspaceId,
      table.createdAt,
    ),
    index('proposals_workspace_status_idx').on(table.workspaceId, table.status),
    index('proposals_workspace_opportunity_idx').on(
      table.workspaceId,
      table.opportunityId,
    ),
    index('proposals_workspace_owner_idx').on(
      table.workspaceId,
      table.salesOwnerUserId,
    ),
  ],
);

export const proposalVersions = pgTable(
  'proposal_versions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    proposalId: uuid('proposal_id')
      .notNull()
      .references(() => proposals.id, { onDelete: 'cascade' }),
    versionNumber: integer('version_number').notNull(),
    status: proposalStatus('status').notNull().default('draft'),
    changeSummary: text('change_summary'),
    previousVersionId: uuid('previous_version_id').references(
      () => proposalVersions.id,
      { onDelete: 'set null' },
    ),
    currency: text('currency').notNull().default('INR'),
    validityDate: timestamp('validity_date', {
      withTimezone: true,
      mode: 'date',
    }),
    // Snapshot of the deterministic calculation at save/approval time.
    subtotalCents: integer('subtotal_cents').notNull().default(0),
    itemDiscountCents: integer('item_discount_cents').notNull().default(0),
    proposalDiscountCents: integer('proposal_discount_cents')
      .notNull()
      .default(0),
    discountTotalCents: integer('discount_total_cents').notNull().default(0),
    taxableCents: integer('taxable_cents').notNull().default(0),
    taxCents: integer('tax_cents').notNull().default(0),
    grandTotalCents: integer('grand_total_cents').notNull().default(0),
    oneTimeTotalCents: integer('one_time_total_cents').notNull().default(0),
    recurringMonthlyCents: integer('recurring_monthly_cents')
      .notNull()
      .default(0),
    recurringQuarterlyCents: integer('recurring_quarterly_cents')
      .notNull()
      .default(0),
    recurringAnnualCents: integer('recurring_annual_cents').notNull().default(0),
    optionalTotalCents: integer('optional_total_cents').notNull().default(0),
    cgstCents: integer('cgst_cents').notNull().default(0),
    sgstCents: integer('sgst_cents').notNull().default(0),
    igstCents: integer('igst_cents').notNull().default(0),
    proposalDiscountType: proposalDiscountType('proposal_discount_type')
      .notNull()
      .default('none'),
    proposalDiscountValue: integer('proposal_discount_value')
      .notNull()
      .default(0),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    updatedByUserId: uuid('updated_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    approvedByUserId: uuid('approved_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    approvedAt: timestamp('approved_at', { withTimezone: true, mode: 'date' }),
    sentAt: timestamp('sent_at', { withTimezone: true, mode: 'date' }),
    respondedAt: timestamp('responded_at', {
      withTimezone: true,
      mode: 'date',
    }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex('proposal_versions_proposal_number_unique').on(
      table.proposalId,
      table.versionNumber,
    ),
    index('proposal_versions_workspace_status_idx').on(
      table.workspaceId,
      table.status,
    ),
    index('proposal_versions_workspace_validity_idx').on(
      table.workspaceId,
      table.validityDate,
    ),
  ],
);

export const proposalLineItems = pgTable(
  'proposal_line_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    versionId: uuid('version_id')
      .notNull()
      .references(() => proposalVersions.id, { onDelete: 'cascade' }),
    serviceId: uuid('service_id').references(() => services.id, {
      onDelete: 'set null',
    }),
    // Snapshot of the catalogue service so later catalogue edits never
    // rewrite an existing quotation.
    serviceName: text('service_name'),
    serviceCategoryName: text('service_category_name'),
    regulated: boolean('regulated').notNull().default(false),
    reviewProfession: text('review_profession'),
    reviewNotes: text('review_notes'),
    name: text('name').notNull(),
    description: text('description'),
    scope: text('scope'),
    quantity: integer('quantity').notNull().default(1),
    unit: text('unit').notNull().default('unit'),
    unitPriceCents: integer('unit_price_cents').notNull().default(0),
    discountType: proposalDiscountType('discount_type').notNull().default('none'),
    discountValue: integer('discount_value').notNull().default(0),
    taxScheme: proposalTaxScheme('tax_scheme').notNull().default('none'),
    taxRateBps: integer('tax_rate_bps').notNull().default(0),
    billingType: proposalBillingType('billing_type')
      .notNull()
      .default('one_time'),
    startCondition: text('start_condition'),
    billingNotes: text('billing_notes'),
    minimumCommitmentMonths: integer('minimum_commitment_months'),
    kind: proposalItemKind('kind').notNull().default('included'),
    lineSubtotalCents: integer('line_subtotal_cents').notNull().default(0),
    lineDiscountCents: integer('line_discount_cents').notNull().default(0),
    lineNetCents: integer('line_net_cents').notNull().default(0),
    lineTaxCents: integer('line_tax_cents').notNull().default(0),
    lineTotalCents: integer('line_total_cents').notNull().default(0),
    displayOrder: integer('display_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('proposal_line_items_version_order_idx').on(
      table.versionId,
      table.displayOrder,
    ),
    index('proposal_line_items_workspace_idx').on(table.workspaceId),
  ],
);

export const proposalSections = pgTable(
  'proposal_sections',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    versionId: uuid('version_id')
      .notNull()
      .references(() => proposalVersions.id, { onDelete: 'cascade' }),
    sectionKey: text('section_key').notNull(),
    content: text('content'),
    displayOrder: integer('display_order').notNull().default(0),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex('proposal_sections_version_key_unique').on(
      table.versionId,
      table.sectionKey,
    ),
  ],
);

export const proposalDeliverables = pgTable(
  'proposal_deliverables',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    versionId: uuid('version_id')
      .notNull()
      .references(() => proposalVersions.id, { onDelete: 'cascade' }),
    serviceId: uuid('service_id').references(() => services.id, {
      onDelete: 'set null',
    }),
    title: text('title').notNull(),
    description: text('description'),
    expectedCompletion: text('expected_completion'),
    displayOrder: integer('display_order').notNull().default(0),
  },
  (table) => [
    index('proposal_deliverables_version_order_idx').on(
      table.versionId,
      table.displayOrder,
    ),
  ],
);

export const proposalMilestones = pgTable(
  'proposal_milestones',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    versionId: uuid('version_id')
      .notNull()
      .references(() => proposalVersions.id, { onDelete: 'cascade' }),
    serviceId: uuid('service_id').references(() => services.id, {
      onDelete: 'set null',
    }),
    title: text('title').notNull(),
    description: text('description'),
    expectedCompletion: text('expected_completion'),
    displayOrder: integer('display_order').notNull().default(0),
  },
  (table) => [
    index('proposal_milestones_version_order_idx').on(
      table.versionId,
      table.displayOrder,
    ),
  ],
);

export const proposalApprovals = pgTable(
  'proposal_approvals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    proposalId: uuid('proposal_id')
      .notNull()
      .references(() => proposals.id, { onDelete: 'cascade' }),
    versionId: uuid('version_id')
      .notNull()
      .references(() => proposalVersions.id, { onDelete: 'cascade' }),
    decision: text('decision').notNull(),
    notes: text('notes'),
    actorUserId: uuid('actor_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('proposal_approvals_version_created_idx').on(
      table.versionId,
      table.createdAt,
    ),
  ],
);

export const proposalResponses = pgTable(
  'proposal_responses',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    proposalId: uuid('proposal_id')
      .notNull()
      .references(() => proposals.id, { onDelete: 'cascade' }),
    versionId: uuid('version_id')
      .notNull()
      .references(() => proposalVersions.id, { onDelete: 'cascade' }),
    response: text('response').notNull(),
    notes: text('notes'),
    actorUserId: uuid('actor_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('proposal_responses_version_unique').on(table.versionId),
  ],
);

export const proposalActivity = pgTable(
  'proposal_activity',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    proposalId: uuid('proposal_id')
      .notNull()
      .references(() => proposals.id, { onDelete: 'cascade' }),
    versionId: uuid('version_id').references(() => proposalVersions.id, {
      onDelete: 'set null',
    }),
    type: text('type').notNull(),
    body: text('body'),
    metadata: jsonb('metadata'),
    actorUserId: uuid('actor_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('proposal_activity_proposal_created_idx').on(
      table.proposalId,
      table.createdAt,
    ),
    index('proposal_activity_workspace_created_idx').on(
      table.workspaceId,
      table.createdAt,
    ),
  ],
);

// ---------------------------------------------------------------------------
// Phase 2D-C/D/E — delivery, client operations and billing
// ---------------------------------------------------------------------------

export const projectStatus = pgEnum('project_status', [
  'not_started',
  'planning',
  'in_progress',
  'client_review',
  'on_hold',
  'completed',
  'cancelled',
]);

export const taskStatus = pgEnum('task_status', [
  'todo',
  'in_progress',
  'blocked',
  'in_review',
  'completed',
  'cancelled',
]);

export const taskPriority = pgEnum('task_priority', [
  'low',
  'medium',
  'high',
  'urgent',
]);

export const milestoneReviewStatus = pgEnum('milestone_review_status', [
  'pending',
  'in_review',
  'approved',
  'changes_requested',
]);

export const clientApprovalStatus = pgEnum('client_approval_status', [
  'not_requested',
  'pending',
  'approved',
  'rejected',
]);

export const scopeChangeStatus = pgEnum('scope_change_status', [
  'requested',
  'approved',
  'rejected',
  'withdrawn',
]);

export const clientStatus = pgEnum('client_status', [
  'active',
  'inactive',
  'archived',
]);

export const engagementStatus = pgEnum('engagement_status', [
  'planned',
  'active',
  'paused',
  'ending',
  'ended',
  'cancelled',
]);

export const engagementFrequency = pgEnum('engagement_frequency', [
  'one_time',
  'weekly',
  'monthly',
  'quarterly',
  'annual',
  'custom',
]);

export const ticketStatus = pgEnum('ticket_status', [
  'open',
  'assigned',
  'in_progress',
  'waiting_client',
  'resolved',
  'closed',
]);

export const ticketMessageVisibility = pgEnum('ticket_message_visibility', [
  'internal',
  'client',
]);

export const invoiceStatus = pgEnum('invoice_status', [
  'draft',
  'pending_approval',
  'approved',
  'issued',
  'partially_paid',
  'paid',
  'cancelled',
]);

export const invoiceSource = pgEnum('invoice_source', [
  'proposal',
  'engagement',
  'manual',
]);

export const paymentMethod = pgEnum('payment_method', [
  'bank_transfer',
  'upi',
  'card',
  'cash',
  'cheque',
  'other',
]);

export const expenseStatus = pgEnum('expense_status', [
  'pending_approval',
  'approved',
  'rejected',
]);

export const clientTimelineType = pgEnum('client_timeline_type', [
  'note',
  'meeting',
  'call',
  'email_manual',
]);

// A client is an explicit, human-created relationship record. It links to the
// original lead so the sales history stays intact; records are never merged
// automatically and one lead can back at most one client per workspace.
export const clients = pgTable(
  'clients',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    reference: text('reference').notNull(),
    leadId: uuid('lead_id').references(() => leads.id, { onDelete: 'set null' }),
    companyName: text('company_name').notNull(),
    primaryContactName: text('primary_contact_name'),
    email: text('email'),
    phone: text('phone'),
    website: text('website'),
    industry: text('industry'),
    address: text('address'),
    ownerUserId: uuid('owner_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    status: clientStatus('status').notNull().default('active'),
    internalNotes: text('internal_notes'),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    updatedByUserId: uuid('updated_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex('clients_workspace_reference_unique').on(
      table.workspaceId,
      table.reference,
    ),
    uniqueIndex('clients_workspace_lead_unique')
      .on(table.workspaceId, table.leadId)
      .where(sql`${table.leadId} is not null`),
    index('clients_workspace_status_idx').on(table.workspaceId, table.status),
    index('clients_workspace_owner_idx').on(
      table.workspaceId,
      table.ownerUserId,
    ),
  ],
);

export const clientContacts = pgTable(
  'client_contacts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    clientId: uuid('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    title: text('title'),
    email: text('email'),
    phone: text('phone'),
    isPrimary: boolean('is_primary').notNull().default(false),
    notes: text('notes'),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index('client_contacts_client_idx').on(table.clientId, table.createdAt),
    index('client_contacts_workspace_idx').on(table.workspaceId),
  ],
);

// A project is created only from an accepted proposal. The commercial snapshot
// is frozen at creation so later proposal or catalogue edits never rewrite the
// agreed scope.
export const projects = pgTable(
  'projects',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    reference: text('reference').notNull(),
    clientId: uuid('client_id').references(() => clients.id, {
      onDelete: 'set null',
    }),
    leadId: uuid('lead_id').references(() => leads.id, { onDelete: 'set null' }),
    opportunityId: uuid('opportunity_id').references(() => opportunities.id, {
      onDelete: 'set null',
    }),
    proposalId: uuid('proposal_id').references(() => proposals.id, {
      onDelete: 'set null',
    }),
    proposalVersionId: uuid('proposal_version_id').references(
      () => proposalVersions.id,
      { onDelete: 'set null' },
    ),
    name: text('name').notNull(),
    status: projectStatus('status').notNull().default('not_started'),
    priority: taskPriority('priority').notNull().default('medium'),
    ownerUserId: uuid('owner_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    startDate: timestamp('start_date', { withTimezone: true, mode: 'date' }),
    expectedCompletionDate: timestamp('expected_completion_date', {
      withTimezone: true,
      mode: 'date',
    }),
    actualCompletionDate: timestamp('actual_completion_date', {
      withTimezone: true,
      mode: 'date',
    }),
    description: text('description'),
    internalNotes: text('internal_notes'),
    currency: text('currency').notNull().default('INR'),
    acceptedValueCents: integer('accepted_value_cents').notNull().default(0),
    recurringMonthlyCents: integer('recurring_monthly_cents')
      .notNull()
      .default(0),
    recurringQuarterlyCents: integer('recurring_quarterly_cents')
      .notNull()
      .default(0),
    recurringAnnualCents: integer('recurring_annual_cents')
      .notNull()
      .default(0),
    commercialSnapshot: jsonb('commercial_snapshot'),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    updatedByUserId: uuid('updated_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex('projects_workspace_reference_unique').on(
      table.workspaceId,
      table.reference,
    ),
    uniqueIndex('projects_workspace_proposal_unique')
      .on(table.workspaceId, table.proposalId)
      .where(sql`${table.proposalId} is not null`),
    index('projects_workspace_status_idx').on(table.workspaceId, table.status),
    index('projects_workspace_owner_idx').on(
      table.workspaceId,
      table.ownerUserId,
    ),
    index('projects_workspace_client_idx').on(
      table.workspaceId,
      table.clientId,
    ),
    index('projects_workspace_completion_idx').on(
      table.workspaceId,
      table.expectedCompletionDate,
    ),
  ],
);

export const projectMembers = pgTable(
  'project_members',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: text('role').notNull().default('member'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('project_members_project_user_unique').on(
      table.projectId,
      table.userId,
    ),
    index('project_members_workspace_user_idx').on(
      table.workspaceId,
      table.userId,
    ),
  ],
);

export const projectStatusHistory = pgTable(
  'project_status_history',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    fromStatus: projectStatus('from_status'),
    toStatus: projectStatus('to_status').notNull(),
    note: text('note'),
    actorUserId: uuid('actor_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('project_status_history_project_idx').on(
      table.projectId,
      table.createdAt,
    ),
  ],
);

export const projectTasks = pgTable(
  'project_tasks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    // Phase 2I — a task may belong to a delivery project, a sales lead or a
    // client follow-up. Exactly one of projectId/leadId/clientId is normally
    // set; project delivery keeps its existing required link.
    projectId: uuid('project_id').references(() => projects.id, {
      onDelete: 'cascade',
    }),
    leadId: uuid('lead_id').references(() => leads.id, {
      onDelete: 'cascade',
    }),
    clientId: uuid('client_id').references(() => clients.id, {
      onDelete: 'cascade',
    }),
    taskType: text('task_type').notNull().default('task'),
    title: text('title').notNull(),
    description: text('description'),
    status: taskStatus('status').notNull().default('todo'),
    priority: taskPriority('priority').notNull().default('medium'),
    ownerUserId: uuid('owner_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    startDate: timestamp('start_date', { withTimezone: true, mode: 'date' }),
    dueDate: timestamp('due_date', { withTimezone: true, mode: 'date' }),
    // Optional local due time (HH:MM) and the IANA zone it belongs to, so a
    // reminder fires at the intended moment rather than at UTC midnight.
    dueTime: text('due_time'),
    timezone: text('timezone'),
    reminderSentAt: timestamp('reminder_sent_at', {
      withTimezone: true,
      mode: 'date',
    }),
    escalatedAt: timestamp('escalated_at', {
      withTimezone: true,
      mode: 'date',
    }),
    estimatedMinutes: integer('estimated_minutes').notNull().default(0),
    actualMinutes: integer('actual_minutes').notNull().default(0),
    completedAt: timestamp('completed_at', { withTimezone: true, mode: 'date' }),
    // Phase 2G task automation: a task may be generated from a recommendation.
    // sourceType/sourceId identify the origin so duplicate open tasks can be
    // detected and the acceptance criteria and evidence stay with the work.
    sourceType: text('source_type'),
    sourceId: uuid('source_id'),
    acceptanceCriteria: text('acceptance_criteria'),
    completionEvidence: text('completion_evidence'),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    updatedByUserId: uuid('updated_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex('project_tasks_source_unique')
      .on(table.workspaceId, table.sourceType, table.sourceId)
      .where(sql`${table.sourceId} is not null`),
    index('project_tasks_project_status_idx').on(
      table.projectId,
      table.status,
    ),
    index('project_tasks_workspace_lead_idx').on(
      table.workspaceId,
      table.leadId,
    ),
    index('project_tasks_workspace_owner_idx').on(
      table.workspaceId,
      table.ownerUserId,
    ),
    index('project_tasks_workspace_due_idx').on(
      table.workspaceId,
      table.dueDate,
    ),
  ],
);

export const taskCollaborators = pgTable(
  'task_collaborators',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    taskId: uuid('task_id')
      .notNull()
      .references(() => projectTasks.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('task_collaborators_task_user_unique').on(
      table.taskId,
      table.userId,
    ),
  ],
);

export const taskDependencies = pgTable(
  'task_dependencies',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    taskId: uuid('task_id')
      .notNull()
      .references(() => projectTasks.id, { onDelete: 'cascade' }),
    dependsOnTaskId: uuid('depends_on_task_id')
      .notNull()
      .references(() => projectTasks.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('task_dependencies_task_unique').on(
      table.taskId,
      table.dependsOnTaskId,
    ),
    index('task_dependencies_workspace_idx').on(table.workspaceId),
  ],
);

export const taskComments = pgTable(
  'task_comments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    taskId: uuid('task_id')
      .notNull()
      .references(() => projectTasks.id, { onDelete: 'cascade' }),
    authorUserId: uuid('author_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    body: text('body').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('task_comments_task_idx').on(table.taskId, table.createdAt),
  ],
);

export const projectMilestones = pgTable(
  'project_milestones',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    proposalMilestoneId: uuid('proposal_milestone_id').references(
      () => proposalMilestones.id,
      { onDelete: 'set null' },
    ),
    title: text('title').notNull(),
    description: text('description'),
    targetDate: timestamp('target_date', { withTimezone: true, mode: 'date' }),
    completionDate: timestamp('completion_date', {
      withTimezone: true,
      mode: 'date',
    }),
    ownerUserId: uuid('owner_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    reviewStatus: milestoneReviewStatus('review_status')
      .notNull()
      .default('pending'),
    clientApprovalStatus: clientApprovalStatus('client_approval_status')
      .notNull()
      .default('not_requested'),
    evidenceNotes: text('evidence_notes'),
    displayOrder: integer('display_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index('project_milestones_project_order_idx').on(
      table.projectId,
      table.displayOrder,
    ),
    index('project_milestones_workspace_target_idx').on(
      table.workspaceId,
      table.targetDate,
    ),
  ],
);

export const projectDeliverables = pgTable(
  'project_deliverables',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    proposalDeliverableId: uuid('proposal_deliverable_id').references(
      () => proposalDeliverables.id,
      { onDelete: 'set null' },
    ),
    title: text('title').notNull(),
    description: text('description'),
    targetDate: timestamp('target_date', { withTimezone: true, mode: 'date' }),
    completionDate: timestamp('completion_date', {
      withTimezone: true,
      mode: 'date',
    }),
    ownerUserId: uuid('owner_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    reviewStatus: milestoneReviewStatus('review_status')
      .notNull()
      .default('pending'),
    clientApprovalStatus: clientApprovalStatus('client_approval_status')
      .notNull()
      .default('not_requested'),
    evidenceNotes: text('evidence_notes'),
    displayOrder: integer('display_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index('project_deliverables_project_order_idx').on(
      table.projectId,
      table.displayOrder,
    ),
  ],
);

export const projectScopeChanges = pgTable(
  'project_scope_changes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    description: text('description'),
    impactNotes: text('impact_notes'),
    status: scopeChangeStatus('status').notNull().default('requested'),
    requestedByUserId: uuid('requested_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    decidedByUserId: uuid('decided_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    decidedAt: timestamp('decided_at', { withTimezone: true, mode: 'date' }),
    decisionNotes: text('decision_notes'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index('project_scope_changes_project_idx').on(
      table.projectId,
      table.createdAt,
    ),
  ],
);

export const projectActivity = pgTable(
  'project_activity',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    taskId: uuid('task_id').references(() => projectTasks.id, {
      onDelete: 'set null',
    }),
    type: text('type').notNull(),
    body: text('body'),
    metadata: jsonb('metadata'),
    actorUserId: uuid('actor_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('project_activity_project_created_idx').on(
      table.projectId,
      table.createdAt,
    ),
    index('project_activity_workspace_created_idx').on(
      table.workspaceId,
      table.createdAt,
    ),
  ],
);

export const serviceEngagements = pgTable(
  'service_engagements',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    clientId: uuid('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'cascade' }),
    serviceId: uuid('service_id').references(() => services.id, {
      onDelete: 'set null',
    }),
    proposalId: uuid('proposal_id').references(() => proposals.id, {
      onDelete: 'set null',
    }),
    projectId: uuid('project_id').references(() => projects.id, {
      onDelete: 'set null',
    }),
    name: text('name').notNull(),
    managerUserId: uuid('manager_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    status: engagementStatus('status').notNull().default('planned'),
    frequency: engagementFrequency('frequency').notNull().default('monthly'),
    startDate: timestamp('start_date', { withTimezone: true, mode: 'date' }),
    endDate: timestamp('end_date', { withTimezone: true, mode: 'date' }),
    renewalDate: timestamp('renewal_date', { withTimezone: true, mode: 'date' }),
    scopeReference: text('scope_reference'),
    contractValueCents: integer('contract_value_cents').notNull().default(0),
    currency: text('currency').notNull().default('INR'),
    internalNotes: text('internal_notes'),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    updatedByUserId: uuid('updated_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index('service_engagements_client_status_idx').on(
      table.clientId,
      table.status,
    ),
    index('service_engagements_workspace_renewal_idx').on(
      table.workspaceId,
      table.renewalDate,
    ),
  ],
);

export const supportTickets = pgTable(
  'support_tickets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    reference: text('reference').notNull(),
    clientId: uuid('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id').references(() => projects.id, {
      onDelete: 'set null',
    }),
    subject: text('subject').notNull(),
    description: text('description'),
    category: text('category').notNull().default('general'),
    priority: taskPriority('priority').notNull().default('medium'),
    assignedUserId: uuid('assigned_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    status: ticketStatus('status').notNull().default('open'),
    dueDate: timestamp('due_date', { withTimezone: true, mode: 'date' }),
    resolvedAt: timestamp('resolved_at', { withTimezone: true, mode: 'date' }),
    resolutionNotes: text('resolution_notes'),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    updatedByUserId: uuid('updated_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex('support_tickets_workspace_reference_unique').on(
      table.workspaceId,
      table.reference,
    ),
    index('support_tickets_workspace_status_idx').on(
      table.workspaceId,
      table.status,
    ),
    index('support_tickets_workspace_due_idx').on(
      table.workspaceId,
      table.dueDate,
    ),
    index('support_tickets_client_idx').on(table.clientId, table.createdAt),
  ],
);

export const ticketMessages = pgTable(
  'ticket_messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    ticketId: uuid('ticket_id')
      .notNull()
      .references(() => supportTickets.id, { onDelete: 'cascade' }),
    authorUserId: uuid('author_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    body: text('body').notNull(),
    visibility: ticketMessageVisibility('visibility')
      .notNull()
      .default('internal'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('ticket_messages_ticket_idx').on(table.ticketId, table.createdAt),
  ],
);

export const clientTimelineEntries = pgTable(
  'client_timeline_entries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    clientId: uuid('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'cascade' }),
    type: clientTimelineType('type').notNull().default('note'),
    title: text('title').notNull(),
    body: text('body'),
    occurredAt: timestamp('occurred_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    actorUserId: uuid('actor_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('client_timeline_entries_client_idx').on(
      table.clientId,
      table.occurredAt,
    ),
  ],
);

export const invoices = pgTable(
  'invoices',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    reference: text('reference').notNull(),
    clientId: uuid('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'restrict' }),
    proposalId: uuid('proposal_id').references(() => proposals.id, {
      onDelete: 'set null',
    }),
    proposalVersionId: uuid('proposal_version_id').references(
      () => proposalVersions.id,
      { onDelete: 'set null' },
    ),
    projectId: uuid('project_id').references(() => projects.id, {
      onDelete: 'set null',
    }),
    engagementId: uuid('engagement_id').references(
      () => serviceEngagements.id,
      { onDelete: 'set null' },
    ),
    source: invoiceSource('source').notNull().default('manual'),
    // Identifies the record an invoice was generated from (a proposal version
    // or an engagement). The workspace/source/sourceId index blocks duplicate
    // issuance while NULLs keep manual invoices unconstrained.
    sourceId: uuid('source_id'),
    currency: text('currency').notNull().default('INR'),
    invoiceDate: timestamp('invoice_date', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
    dueDate: timestamp('due_date', { withTimezone: true, mode: 'date' }),
    status: invoiceStatus('status').notNull().default('draft'),
    subtotalCents: integer('subtotal_cents').notNull().default(0),
    discountCents: integer('discount_cents').notNull().default(0),
    taxCents: integer('tax_cents').notNull().default(0),
    totalCents: integer('total_cents').notNull().default(0),
    cgstCents: integer('cgst_cents').notNull().default(0),
    sgstCents: integer('sgst_cents').notNull().default(0),
    igstCents: integer('igst_cents').notNull().default(0),
    amountPaidCents: integer('amount_paid_cents').notNull().default(0),
    balanceDueCents: integer('balance_due_cents').notNull().default(0),
    notes: text('notes'),
    terms: text('terms'),
    approvedByUserId: uuid('approved_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    approvedAt: timestamp('approved_at', { withTimezone: true, mode: 'date' }),
    issuedByUserId: uuid('issued_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    issuedAt: timestamp('issued_at', { withTimezone: true, mode: 'date' }),
    cancelledByUserId: uuid('cancelled_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true, mode: 'date' }),
    cancellationReason: text('cancellation_reason'),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    updatedByUserId: uuid('updated_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex('invoices_workspace_reference_unique').on(
      table.workspaceId,
      table.reference,
    ),
    uniqueIndex('invoices_workspace_source_unique').on(
      table.workspaceId,
      table.source,
      table.sourceId,
    ),
    index('invoices_workspace_status_idx').on(table.workspaceId, table.status),
    index('invoices_workspace_due_idx').on(table.workspaceId, table.dueDate),
    index('invoices_workspace_client_idx').on(table.workspaceId, table.clientId),
    index('invoices_workspace_project_idx').on(
      table.workspaceId,
      table.projectId,
    ),
  ],
);

export const invoiceLineItems = pgTable(
  'invoice_line_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    invoiceId: uuid('invoice_id')
      .notNull()
      .references(() => invoices.id, { onDelete: 'cascade' }),
    description: text('description').notNull(),
    quantity: integer('quantity').notNull().default(1),
    unitPriceCents: integer('unit_price_cents').notNull().default(0),
    discountType: proposalDiscountType('discount_type')
      .notNull()
      .default('none'),
    discountValue: integer('discount_value').notNull().default(0),
    taxScheme: proposalTaxScheme('tax_scheme').notNull().default('none'),
    taxRateBps: integer('tax_rate_bps').notNull().default(0),
    lineSubtotalCents: integer('line_subtotal_cents').notNull().default(0),
    lineDiscountCents: integer('line_discount_cents').notNull().default(0),
    lineNetCents: integer('line_net_cents').notNull().default(0),
    lineTaxCents: integer('line_tax_cents').notNull().default(0),
    lineTotalCents: integer('line_total_cents').notNull().default(0),
    displayOrder: integer('display_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('invoice_line_items_invoice_order_idx').on(
      table.invoiceId,
      table.displayOrder,
    ),
    index('invoice_line_items_workspace_idx').on(table.workspaceId),
  ],
);

export const payments = pgTable(
  'payments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    reference: text('reference').notNull(),
    invoiceId: uuid('invoice_id')
      .notNull()
      .references(() => invoices.id, { onDelete: 'restrict' }),
    clientId: uuid('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'restrict' }),
    paymentDate: timestamp('payment_date', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
    amountCents: integer('amount_cents').notNull(),
    method: paymentMethod('method').notNull().default('bank_transfer'),
    transactionReference: text('transaction_reference'),
    notes: text('notes'),
    recordedByUserId: uuid('recorded_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('payments_workspace_reference_unique').on(
      table.workspaceId,
      table.reference,
    ),
    uniqueIndex('payments_workspace_transaction_unique').on(
      table.workspaceId,
      table.transactionReference,
    ),
    index('payments_workspace_date_idx').on(
      table.workspaceId,
      table.paymentDate,
    ),
    index('payments_invoice_idx').on(table.invoiceId, table.createdAt),
  ],
);

export const expenses = pgTable(
  'expenses',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    reference: text('reference').notNull(),
    category: text('category').notNull(),
    description: text('description').notNull(),
    amountCents: integer('amount_cents').notNull(),
    currency: text('currency').notNull().default('INR'),
    expenseDate: timestamp('expense_date', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
    projectId: uuid('project_id').references(() => projects.id, {
      onDelete: 'set null',
    }),
    vendor: text('vendor'),
    receiptReference: text('receipt_reference'),
    status: expenseStatus('status').notNull().default('pending_approval'),
    recordedByUserId: uuid('recorded_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    reviewedByUserId: uuid('reviewed_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true, mode: 'date' }),
    decisionNotes: text('decision_notes'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex('expenses_workspace_reference_unique').on(
      table.workspaceId,
      table.reference,
    ),
    index('expenses_workspace_status_idx').on(table.workspaceId, table.status),
    index('expenses_workspace_date_idx').on(
      table.workspaceId,
      table.expenseDate,
    ),
    index('expenses_workspace_project_idx').on(
      table.workspaceId,
      table.projectId,
    ),
  ],
);

// ---------------------------------------------------------------------------
// Phase 2E — workspace knowledge, document ingestion and AI memory
// ---------------------------------------------------------------------------

export const knowledgeCategory = pgEnum('knowledge_category', [
  'company_profile',
  'services',
  'processes',
  'brand_voice',
  'pricing',
  'policies',
  'sales',
  'marketing',
  'client_specific',
  'project_specific',
  'reference',
  'other',
]);

export const knowledgeStatus = pgEnum('knowledge_status', [
  'draft',
  'published',
  'archived',
]);

export const knowledgeProvenance = pgEnum('knowledge_provenance', [
  'verified',
  'source_derived',
  'ai_generated',
  'unverified',
]);

export const knowledgeSourceType = pgEnum('knowledge_source_type', [
  'manual',
  'document',
  'import',
  'agent_summary',
]);

export const knowledgeDocumentStatus = pgEnum('knowledge_document_status', [
  'processing',
  'processed',
  'failed',
]);

export const memoryType = pgEnum('memory_type', [
  'workspace',
  'company',
  'client',
  'project',
  'decision',
  'preference',
  'workflow',
  'agent',
]);

export const memoryStatus = pgEnum('memory_status', [
  'active',
  'archived',
  'superseded',
]);

export const memoryConfidence = pgEnum('memory_confidence', [
  'low',
  'medium',
  'high',
]);

export const knowledgeEntries = pgTable(
  'knowledge_entries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    category: knowledgeCategory('category').notNull().default('other'),
    title: text('title').notNull(),
    summary: text('summary'),
    content: text('content').notNull(),
    tags: jsonb('tags').notNull().default([]),
    sourceType: knowledgeSourceType('source_type').notNull().default('manual'),
    sourceReference: text('source_reference'),
    provenance: knowledgeProvenance('provenance').notNull().default('unverified'),
    status: knowledgeStatus('status').notNull().default('draft'),
    clientId: uuid('client_id').references(() => clients.id, {
      onDelete: 'set null',
    }),
    projectId: uuid('project_id').references(() => projects.id, {
      onDelete: 'set null',
    }),
    version: integer('version').notNull().default(1),
    contentHash: text('content_hash').notNull(),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    updatedByUserId: uuid('updated_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    publishedAt: timestamp('published_at', { withTimezone: true, mode: 'date' }),
    archivedAt: timestamp('archived_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex('knowledge_entries_workspace_hash_unique')
      .on(table.workspaceId, table.contentHash)
      .where(sql`${table.archivedAt} is null`),
    index('knowledge_entries_workspace_category_idx').on(
      table.workspaceId,
      table.category,
    ),
    index('knowledge_entries_workspace_status_idx').on(
      table.workspaceId,
      table.status,
    ),
    index('knowledge_entries_workspace_client_idx').on(
      table.workspaceId,
      table.clientId,
    ),
    index('knowledge_entries_workspace_project_idx').on(
      table.workspaceId,
      table.projectId,
    ),
    index('knowledge_entries_search_idx').using(
      'gin',
      sql`to_tsvector('english', coalesce(${table.title}, '') || ' ' || coalesce(${table.summary}, '') || ' ' || ${table.content})`,
    ),
  ],
);

export const knowledgeVersions = pgTable(
  'knowledge_versions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    entryId: uuid('entry_id')
      .notNull()
      .references(() => knowledgeEntries.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    category: knowledgeCategory('category').notNull(),
    title: text('title').notNull(),
    summary: text('summary'),
    content: text('content').notNull(),
    tags: jsonb('tags').notNull().default([]),
    provenance: knowledgeProvenance('provenance').notNull(),
    status: knowledgeStatus('status').notNull(),
    changedByUserId: uuid('changed_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    changeNote: text('change_note'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('knowledge_versions_entry_version_unique').on(
      table.entryId,
      table.version,
    ),
    index('knowledge_versions_workspace_created_idx').on(
      table.workspaceId,
      table.createdAt,
    ),
  ],
);

export const knowledgeDocuments = pgTable(
  'knowledge_documents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    entryId: uuid('entry_id').references(() => knowledgeEntries.id, {
      onDelete: 'set null',
    }),
    filename: text('filename').notNull(),
    mimeType: text('mime_type').notNull(),
    format: text('format').notNull(),
    byteSize: integer('byte_size').notNull(),
    checksum: text('checksum').notNull(),
    status: knowledgeDocumentStatus('status').notNull().default('processing'),
    errorMessage: text('error_message'),
    rawText: text('raw_text'),
    chunkCount: integer('chunk_count').notNull().default(0),
    version: integer('version').notNull().default(1),
    uploadedByUserId: uuid('uploaded_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    processedAt: timestamp('processed_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex('knowledge_documents_workspace_checksum_unique').on(
      table.workspaceId,
      table.checksum,
    ),
    index('knowledge_documents_workspace_status_idx').on(
      table.workspaceId,
      table.status,
    ),
    index('knowledge_documents_workspace_created_idx').on(
      table.workspaceId,
      table.createdAt,
    ),
  ],
);

export const knowledgeChunks = pgTable(
  'knowledge_chunks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    entryId: uuid('entry_id')
      .notNull()
      .references(() => knowledgeEntries.id, { onDelete: 'cascade' }),
    documentId: uuid('document_id').references(() => knowledgeDocuments.id, {
      onDelete: 'set null',
    }),
    chunkIndex: integer('chunk_index').notNull(),
    heading: text('heading'),
    content: text('content').notNull(),
    charCount: integer('char_count').notNull(),
    tokenEstimate: integer('token_estimate').notNull().default(0),
    contentHash: text('content_hash').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('knowledge_chunks_entry_chunk_unique').on(
      table.entryId,
      table.chunkIndex,
    ),
    index('knowledge_chunks_workspace_entry_idx').on(
      table.workspaceId,
      table.entryId,
    ),
    index('knowledge_chunks_workspace_document_idx').on(
      table.workspaceId,
      table.documentId,
    ),
    index('knowledge_chunks_search_idx').using(
      'gin',
      sql`to_tsvector('english', ${table.content})`,
    ),
  ],
);

export const aiMemories = pgTable(
  'ai_memories',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    memoryType: memoryType('memory_type').notNull(),
    key: text('key').notNull(),
    content: text('content').notNull(),
    sourceType: knowledgeSourceType('source_type').notNull().default('manual'),
    sourceReference: text('source_reference'),
    sourceEntryId: uuid('source_entry_id').references(
      () => knowledgeEntries.id,
      { onDelete: 'set null' },
    ),
    clientId: uuid('client_id').references(() => clients.id, {
      onDelete: 'set null',
    }),
    projectId: uuid('project_id').references(() => projects.id, {
      onDelete: 'set null',
    }),
    agentId: uuid('agent_id').references(() => agents.id, {
      onDelete: 'set null',
    }),
    status: memoryStatus('status').notNull().default('active'),
    confidence: memoryConfidence('confidence').notNull().default('medium'),
    verified: boolean('verified').notNull().default(false),
    version: integer('version').notNull().default(1),
    supersedesId: uuid('supersedes_id'),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    updatedByUserId: uuid('updated_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }),
    archivedAt: timestamp('archived_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex('ai_memories_workspace_key_unique')
      .on(table.workspaceId, table.memoryType, table.key)
      .where(sql`${table.status} = 'active'`),
    index('ai_memories_workspace_type_status_idx').on(
      table.workspaceId,
      table.memoryType,
      table.status,
    ),
    index('ai_memories_workspace_client_idx').on(
      table.workspaceId,
      table.clientId,
    ),
    index('ai_memories_workspace_project_idx').on(
      table.workspaceId,
      table.projectId,
    ),
  ],
);

export const aiMemoryVersions = pgTable(
  'ai_memory_versions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    memoryId: uuid('memory_id')
      .notNull()
      .references(() => aiMemories.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    key: text('key').notNull(),
    content: text('content').notNull(),
    confidence: memoryConfidence('confidence').notNull(),
    verified: boolean('verified').notNull().default(false),
    status: memoryStatus('status').notNull(),
    changedByUserId: uuid('changed_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    changeNote: text('change_note'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('ai_memory_versions_memory_version_unique').on(
      table.memoryId,
      table.version,
    ),
    index('ai_memory_versions_workspace_created_idx').on(
      table.workspaceId,
      table.createdAt,
    ),
  ],
);

// ---------------------------------------------------------------------------
// Phase 2G — marketing and website execution engine
// ---------------------------------------------------------------------------

// Campaign, content and proposal lifecycles share the same vocabulary so the
// agency can tell a plan from a draft, an approval from an execution.
export const marketingCampaignStatus = pgEnum('marketing_campaign_status', [
  'planned',
  'draft',
  'awaiting_review',
  'approved',
  'scheduled',
  'executed',
  'failed',
  'cancelled',
]);

export const marketingContentStatus = pgEnum('marketing_content_status', [
  'idea',
  'draft',
  'in_review',
  'changes_requested',
  'approved',
  'scheduled',
  'published',
  'failed',
  'cancelled',
]);

export const marketingProposalStatus = pgEnum('marketing_proposal_status', [
  'draft',
  'awaiting_review',
  'approved',
  'rejected',
  'executing',
  'executed',
  'cancelled',
]);

// Every reported number carries where it came from. An estimate is never shown
// as a verified analytics figure.
export const marketingMetricSource = pgEnum('marketing_metric_source', [
  'manual',
  'imported',
  'calculated',
  'ai_estimate',
]);

// One marketing profile per client. It is configuration only: it never creates
// a second client record and it cascades with the client it belongs to.
export const marketingProfiles = pgTable(
  'marketing_profiles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    clientId: uuid('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'cascade' }),
    businessDescription: text('business_description'),
    industry: text('industry'),
    targetAudience: text('target_audience'),
    targetLocations: jsonb('target_locations').notNull().default([]),
    serviceAreas: jsonb('service_areas').notNull().default([]),
    websiteUrl: text('website_url'),
    businessGoals: text('business_goals'),
    competitors: text('competitors'),
    brandVoice: text('brand_voice'),
    communicationGuidelines: text('communication_guidelines'),
    contentLanguage: text('content_language').notNull().default('en'),
    marketingNotes: text('marketing_notes'),
    availableServices: jsonb('available_services').notNull().default([]),
    selectedServices: jsonb('selected_services').notNull().default([]),
    status: text('status').notNull().default('active'),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    updatedByUserId: uuid('updated_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex('marketing_profiles_workspace_client_unique').on(
      table.workspaceId,
      table.clientId,
    ),
    index('marketing_profiles_workspace_status_idx').on(
      table.workspaceId,
      table.status,
    ),
  ],
);

export const marketingCampaigns = pgTable(
  'marketing_campaigns',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    clientId: uuid('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id').references(() => projects.id, {
      onDelete: 'set null',
    }),
    name: text('name').notNull(),
    objective: text('objective'),
    objectiveDescription: text('objective_description'),
    targetAudience: text('target_audience'),
    targetGeography: text('target_geography'),
    channel: text('channel').notNull(),
    startDate: timestamp('start_date', { withTimezone: true, mode: 'date' }),
    endDate: timestamp('end_date', { withTimezone: true, mode: 'date' }),
    budgetEstimate: integer('budget_estimate').notNull().default(0),
    currency: text('currency').notNull().default('INR'),
    successMetrics: text('success_metrics'),
    status: marketingCampaignStatus('status').notNull().default('planned'),
    ownerUserId: uuid('owner_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    clientApprovalStatus: clientApprovalStatus('client_approval_status')
      .notNull()
      .default('not_requested'),
    notes: text('notes'),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    updatedByUserId: uuid('updated_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index('marketing_campaigns_workspace_status_idx').on(
      table.workspaceId,
      table.status,
    ),
    index('marketing_campaigns_workspace_client_idx').on(
      table.workspaceId,
      table.clientId,
    ),
    index('marketing_campaigns_workspace_owner_idx').on(
      table.workspaceId,
      table.ownerUserId,
    ),
  ],
);

export const marketingContentItems = pgTable(
  'marketing_content_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    clientId: uuid('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'cascade' }),
    campaignId: uuid('campaign_id').references(() => marketingCampaigns.id, {
      onDelete: 'set null',
    }),
    projectId: uuid('project_id').references(() => projects.id, {
      onDelete: 'set null',
    }),
    contentType: text('content_type').notNull(),
    title: text('title').notNull(),
    targetAudience: text('target_audience'),
    targetKeyword: text('target_keyword'),
    targetPlatform: text('target_platform'),
    language: text('language').notNull().default('en'),
    status: marketingContentStatus('status').notNull().default('draft'),
    latestVersion: integer('latest_version').notNull().default(1),
    approvedVersion: integer('approved_version'),
    generationSource: text('generation_source').notNull().default('manual'),
    agentRunId: uuid('agent_run_id').references(() => agentRuns.id, {
      onDelete: 'set null',
    }),
    ownerUserId: uuid('owner_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    scheduledFor: timestamp('scheduled_for', {
      withTimezone: true,
      mode: 'date',
    }),
    dueDate: timestamp('due_date', { withTimezone: true, mode: 'date' }),
    reviewFeedback: text('review_feedback'),
    reviewedByUserId: uuid('reviewed_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true, mode: 'date' }),
    publishedAt: timestamp('published_at', { withTimezone: true, mode: 'date' }),
    publishNote: text('publish_note'),
    archivedAt: timestamp('archived_at', { withTimezone: true, mode: 'date' }),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    updatedByUserId: uuid('updated_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index('marketing_content_workspace_status_idx').on(
      table.workspaceId,
      table.status,
    ),
    index('marketing_content_workspace_client_idx').on(
      table.workspaceId,
      table.clientId,
    ),
    index('marketing_content_workspace_campaign_idx').on(
      table.workspaceId,
      table.campaignId,
    ),
    index('marketing_content_workspace_scheduled_idx').on(
      table.workspaceId,
      table.scheduledFor,
    ),
  ],
);

// Versions are append-only. An approved version is never overwritten; edits and
// regenerations create the next version so the history stays intact.
export const marketingContentVersions = pgTable(
  'marketing_content_versions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    contentItemId: uuid('content_item_id')
      .notNull()
      .references(() => marketingContentItems.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    body: text('body').notNull(),
    generationSource: text('generation_source').notNull().default('manual'),
    aiMetadata: jsonb('ai_metadata'),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    changeNote: text('change_note'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('marketing_content_versions_item_version_unique').on(
      table.contentItemId,
      table.version,
    ),
    index('marketing_content_versions_workspace_created_idx').on(
      table.workspaceId,
      table.createdAt,
    ),
  ],
);

export const marketingWebsitePages = pgTable(
  'marketing_website_pages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    clientId: uuid('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'cascade' }),
    pageTitle: text('page_title').notNull(),
    pageUrl: text('page_url').notNull(),
    pageType: text('page_type'),
    pageObjective: text('page_objective'),
    existingContentNotes: text('existing_content_notes'),
    seoTitle: text('seo_title'),
    metaDescription: text('meta_description'),
    ctaRecommendations: text('cta_recommendations'),
    mediaRequirements: text('media_requirements'),
    internalLinkRecommendations: text('internal_link_recommendations'),
    status: text('status').notNull().default('active'),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    updatedByUserId: uuid('updated_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex('marketing_website_pages_workspace_client_url_unique').on(
      table.workspaceId,
      table.clientId,
      table.pageUrl,
    ),
    index('marketing_website_pages_workspace_client_idx').on(
      table.workspaceId,
      table.clientId,
    ),
  ],
);

export const marketingWebsiteProposals = pgTable(
  'marketing_website_proposals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    clientId: uuid('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'cascade' }),
    pageId: uuid('page_id').references(() => marketingWebsitePages.id, {
      onDelete: 'set null',
    }),
    title: text('title').notNull(),
    // currentContent is the observed original. It is written once and never
    // replaced, so the proposal always keeps the before state.
    currentContent: text('current_content'),
    proposedContent: text('proposed_content'),
    status: marketingProposalStatus('status').notNull().default('draft'),
    latestVersion: integer('latest_version').notNull().default(1),
    reviewNotes: text('review_notes'),
    rejectionFeedback: text('rejection_feedback'),
    ownerUserId: uuid('owner_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    approvedByUserId: uuid('approved_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    approvedAt: timestamp('approved_at', { withTimezone: true, mode: 'date' }),
    executedByUserId: uuid('executed_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    executedAt: timestamp('executed_at', { withTimezone: true, mode: 'date' }),
    executionEvidence: text('execution_evidence'),
    executionNotes: text('execution_notes'),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    updatedByUserId: uuid('updated_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index('marketing_website_proposals_workspace_status_idx').on(
      table.workspaceId,
      table.status,
    ),
    index('marketing_website_proposals_workspace_client_idx').on(
      table.workspaceId,
      table.clientId,
    ),
    index('marketing_website_proposals_page_idx').on(table.pageId),
  ],
);

export const marketingWebsiteProposalVersions = pgTable(
  'marketing_website_proposal_versions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    proposalId: uuid('proposal_id')
      .notNull()
      .references(() => marketingWebsiteProposals.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    body: text('body').notNull(),
    generationSource: text('generation_source').notNull().default('manual'),
    aiMetadata: jsonb('ai_metadata'),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    changeNote: text('change_note'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('marketing_proposal_versions_proposal_version_unique').on(
      table.proposalId,
      table.version,
    ),
    index('marketing_proposal_versions_workspace_created_idx').on(
      table.workspaceId,
      table.createdAt,
    ),
  ],
);

export const marketingMetrics = pgTable(
  'marketing_metrics',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    clientId: uuid('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'cascade' }),
    campaignId: uuid('campaign_id').references(() => marketingCampaigns.id, {
      onDelete: 'set null',
    }),
    metricKey: text('metric_key').notNull(),
    value: doublePrecision('value').notNull().default(0),
    source: marketingMetricSource('source').notNull().default('manual'),
    periodStart: timestamp('period_start', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
    periodEnd: timestamp('period_end', { withTimezone: true, mode: 'date' })
      .notNull(),
    notes: text('notes'),
    recordedByUserId: uuid('recorded_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index('marketing_metrics_workspace_client_period_idx').on(
      table.workspaceId,
      table.clientId,
      table.periodStart,
    ),
    index('marketing_metrics_workspace_campaign_idx').on(
      table.workspaceId,
      table.campaignId,
    ),
  ],
);

export const marketingReports = pgTable(
  'marketing_reports',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    clientId: uuid('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id').references(() => projects.id, {
      onDelete: 'set null',
    }),
    title: text('title').notNull(),
    periodStart: timestamp('period_start', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
    periodEnd: timestamp('period_end', { withTimezone: true, mode: 'date' })
      .notNull(),
    summary: text('summary'),
    dataSnapshot: jsonb('data_snapshot'),
    dataSources: jsonb('data_sources'),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index('marketing_reports_workspace_client_created_idx').on(
      table.workspaceId,
      table.clientId,
      table.createdAt,
    ),
  ],
);

// ---------------------------------------------------------------------------
// Phase 2H — integrations, webhooks, approval-gated execution and automation
// ---------------------------------------------------------------------------

export const integrationStatus = pgEnum('integration_status', [
  'not_configured',
  'configured',
  'error',
  'disconnected',
]);

export const executionStatus = pgEnum('execution_status', [
  'proposed',
  'awaiting_approval',
  'approved',
  'rejected',
  'queued',
  'executing',
  'completed',
  'failed',
  'cancelled',
]);

export const webhookEventStatus = pgEnum('webhook_event_status', [
  'received',
  'processing',
  'processed',
  'failed',
  'ignored',
]);

export const workflowRunStatus = pgEnum('workflow_run_status', [
  'queued',
  'running',
  'completed',
  'failed',
  'cancelled',
]);

export const integrations = pgTable(
  'integrations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    provider: text('provider').notNull(),
    name: text('name').notNull(),
    status: integrationStatus('status').notNull().default('not_configured'),
    capabilities: jsonb('capabilities').notNull().default([]),
    // Non-secret metadata only (labels, URLs, selected account names).
    // Credentials live in environment configuration and are never persisted.
    settings: jsonb('settings'),
    connectedByUserId: uuid('connected_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    lastSyncAt: timestamp('last_sync_at', { withTimezone: true, mode: 'date' }),
    lastErrorAt: timestamp('last_error_at', { withTimezone: true, mode: 'date' }),
    lastErrorMessage: text('last_error_message'),
    disconnectedAt: timestamp('disconnected_at', {
      withTimezone: true,
      mode: 'date',
    }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex('integrations_workspace_kind_provider_unique').on(
      table.workspaceId,
      table.kind,
      table.provider,
    ),
    index('integrations_workspace_kind_idx').on(
      table.workspaceId,
      table.kind,
    ),
  ],
);

export const integrationSyncEvents = pgTable(
  'integration_sync_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    integrationId: uuid('integration_id').references(() => integrations.id, {
      onDelete: 'set null',
    }),
    direction: text('direction').notNull(),
    eventType: text('event_type').notNull(),
    source: text('source').notNull(),
    status: text('status').notNull().default('recorded'),
    externalId: text('external_id'),
    idempotencyKey: text('idempotency_key'),
    summary: jsonb('summary'),
    errorMessage: text('error_message'),
    actorUserId: uuid('actor_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('integration_sync_events_workspace_idempotency_unique')
      .on(table.workspaceId, table.idempotencyKey)
      .where(sql`${table.idempotencyKey} is not null`),
    index('integration_sync_events_workspace_created_idx').on(
      table.workspaceId,
      table.createdAt,
    ),
  ],
);

export const webhookEvents = pgTable(
  'webhook_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    integrationId: uuid('integration_id').references(() => integrations.id, {
      onDelete: 'set null',
    }),
    provider: text('provider').notNull(),
    eventType: text('event_type').notNull(),
    externalEventId: text('external_event_id'),
    idempotencyKey: text('idempotency_key').notNull(),
    signatureValid: boolean('signature_valid').notNull().default(false),
    status: webhookEventStatus('status').notNull().default('received'),
    payload: jsonb('payload'),
    attemptCount: integer('attempt_count').notNull().default(0),
    errorMessage: text('error_message'),
    receivedAt: timestamp('received_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    processedAt: timestamp('processed_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('webhook_events_workspace_idempotency_unique').on(
      table.workspaceId,
      table.idempotencyKey,
    ),
    index('webhook_events_workspace_status_created_idx').on(
      table.workspaceId,
      table.status,
      table.createdAt,
    ),
  ],
);

export const executionRequests = pgTable(
  'execution_requests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    clientId: uuid('client_id').references(() => clients.id, {
      onDelete: 'set null',
    }),
    projectId: uuid('project_id').references(() => projects.id, {
      onDelete: 'set null',
    }),
    integrationId: uuid('integration_id').references(() => integrations.id, {
      onDelete: 'set null',
    }),
    category: text('category').notNull(),
    operation: text('operation').notNull(),
    targetSystem: text('target_system').notNull(),
    payload: jsonb('payload'),
    riskLevel: text('risk_level').notNull().default('medium'),
    requiredPermission: text('required_permission').notNull(),
    status: executionStatus('status').notNull().default('proposed'),
    requestedByUserId: uuid('requested_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    approverUserId: uuid('approver_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    decisionNote: text('decision_note'),
    decidedAt: timestamp('decided_at', { withTimezone: true, mode: 'date' }),
    queuedAt: timestamp('queued_at', { withTimezone: true, mode: 'date' }),
    executionStartedAt: timestamp('execution_started_at', {
      withTimezone: true,
      mode: 'date',
    }),
    executedAt: timestamp('executed_at', { withTimezone: true, mode: 'date' }),
    evidence: text('evidence'),
    resultSummary: text('result_summary'),
    failureReason: text('failure_reason'),
    idempotencyKey: text('idempotency_key'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex('execution_requests_workspace_idempotency_unique')
      .on(table.workspaceId, table.idempotencyKey)
      .where(sql`${table.idempotencyKey} is not null`),
    index('execution_requests_workspace_status_created_idx').on(
      table.workspaceId,
      table.status,
      table.createdAt,
    ),
    index('execution_requests_workspace_created_idx').on(
      table.workspaceId,
      table.createdAt,
    ),
  ],
);

export const workflowRuns = pgTable(
  'workflow_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    workflowKey: text('workflow_key').notNull(),
    trigger: text('trigger').notNull().default('manual'),
    status: workflowRunStatus('status').notNull().default('queued'),
    input: jsonb('input'),
    result: jsonb('result'),
    attempts: integer('attempts').notNull().default(0),
    lastError: text('last_error'),
    idempotencyKey: text('idempotency_key'),
    startedByUserId: uuid('started_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    startedAt: timestamp('started_at', { withTimezone: true, mode: 'date' }),
    finishedAt: timestamp('finished_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex('workflow_runs_workspace_idempotency_unique')
      .on(table.workspaceId, table.idempotencyKey)
      .where(sql`${table.idempotencyKey} is not null`),
    index('workflow_runs_workspace_status_created_idx').on(
      table.workspaceId,
      table.status,
      table.createdAt,
    ),
  ],
);

export const workflowRunSteps = pgTable(
  'workflow_run_steps',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    runId: uuid('run_id')
      .notNull()
      .references(() => workflowRuns.id, { onDelete: 'cascade' }),
    stepKey: text('step_key').notNull(),
    label: text('label').notNull(),
    status: text('status').notNull().default('completed'),
    detail: jsonb('detail'),
    startedAt: timestamp('started_at', { withTimezone: true, mode: 'date' }),
    finishedAt: timestamp('finished_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('workflow_run_steps_run_created_idx').on(table.runId, table.createdAt),
  ],
);

// ---------------------------------------------------------------------------
// Phase 2I — owner lead import, AI prospect discovery, notifications, meetings
// ---------------------------------------------------------------------------

export const importBatchStatus = pgEnum('import_batch_status', [
  'preview',
  'committed',
  'cancelled',
]);

export const discoveryCampaignStatus = pgEnum('discovery_campaign_status', [
  'draft',
  'active',
  'paused',
  'completed',
  'cancelled',
]);

export const discoveryFrequency = pgEnum('discovery_frequency', [
  'manual',
  'daily',
  'weekly',
]);

export const discoveryProspectStatus = pgEnum('discovery_prospect_status', [
  'pending_review',
  'approved',
  'rejected',
  'duplicate',
]);

export const meetingStatus = pgEnum('meeting_status', [
  'scheduled',
  'rescheduled',
  'completed',
  'cancelled',
]);

// One batch per paste/upload. The parsed rows live in lead_import_rows so a
// preview can be corrected before the owner commits the batch transactionally.
export const leadImportBatches = pgTable(
  'lead_import_batches',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    source: text('source').notNull().default('paste'),
    status: importBatchStatus('status').notNull().default('preview'),
    fileName: text('file_name'),
    headers: jsonb('headers').notNull().default([]),
    mapping: jsonb('mapping').notNull().default({}),
    totals: jsonb('totals').notNull().default({}),
    // Hash of the normalised parsed rows. A repeated commit of the same
    // content is refused unless the owner explicitly confirms it.
    signature: text('signature'),
    importedByUserId: uuid('imported_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    approvedByUserId: uuid('approved_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    committedAt: timestamp('committed_at', { withTimezone: true, mode: 'date' }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index('lead_import_batches_workspace_created_idx').on(
      table.workspaceId,
      table.createdAt,
    ),
    index('lead_import_batches_workspace_signature_idx').on(
      table.workspaceId,
      table.signature,
    ),
  ],
);

export const leadImportRows = pgTable(
  'lead_import_rows',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    batchId: uuid('batch_id')
      .notNull()
      .references(() => leadImportBatches.id, { onDelete: 'cascade' }),
    rowNumber: integer('row_number').notNull(),
    raw: jsonb('raw').notNull().default({}),
    normalized: jsonb('normalized').notNull().default({}),
    status: text('status').notNull().default('pending'),
    errors: jsonb('errors').notNull().default({}),
    warnings: jsonb('warnings').notNull().default([]),
    duplicateLeadId: uuid('duplicate_lead_id').references(() => leads.id, {
      onDelete: 'set null',
    }),
    importedLeadId: uuid('imported_lead_id').references(() => leads.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('lead_import_rows_batch_row_unique').on(
      table.batchId,
      table.rowNumber,
    ),
    index('lead_import_rows_batch_status_idx').on(table.batchId, table.status),
  ],
);

export const discoveryCampaigns = pgTable(
  'discovery_campaigns',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    status: discoveryCampaignStatus('status').notNull().default('draft'),
    provider: text('provider').notNull().default('public_web_search'),
    criteria: jsonb('criteria').notNull().default({}),
    services: jsonb('services').notNull().default([]),
    frequency: discoveryFrequency('frequency').notNull().default('manual'),
    dailyLimit: integer('daily_limit').notNull().default(20),
    maxResearchOps: integer('max_research_ops').notNull().default(20),
    budgetCents: integer('budget_cents').notNull().default(0),
    startDate: timestamp('start_date', { withTimezone: true, mode: 'date' }),
    endDate: timestamp('end_date', { withTimezone: true, mode: 'date' }),
    lastRunAt: timestamp('last_run_at', { withTimezone: true, mode: 'date' }),
    nextRunAt: timestamp('next_run_at', { withTimezone: true, mode: 'date' }),
    lastError: text('last_error'),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    updatedByUserId: uuid('updated_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index('discovery_campaigns_workspace_status_idx').on(
      table.workspaceId,
      table.status,
    ),
    index('discovery_campaigns_workspace_next_run_idx').on(
      table.workspaceId,
      table.nextRunAt,
    ),
  ],
);

export const discoveryCampaignRuns = pgTable(
  'discovery_campaign_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    campaignId: uuid('campaign_id')
      .notNull()
      .references(() => discoveryCampaigns.id, { onDelete: 'cascade' }),
    trigger: text('trigger').notNull().default('manual'),
    status: text('status').notNull().default('running'),
    discoveredCount: integer('discovered_count').notNull().default(0),
    duplicateCount: integer('duplicate_count').notNull().default(0),
    failedCount: integer('failed_count').notNull().default(0),
    provider: text('provider'),
    errorMessage: text('error_message'),
    usage: jsonb('usage'),
    startedAt: timestamp('started_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    finishedAt: timestamp('finished_at', { withTimezone: true, mode: 'date' }),
  },
  (table) => [
    index('discovery_campaign_runs_campaign_created_idx').on(
      table.campaignId,
      table.startedAt,
    ),
  ],
);

export const discoveryProspects = pgTable(
  'discovery_prospects',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    campaignId: uuid('campaign_id').references(() => discoveryCampaigns.id, {
      onDelete: 'set null',
    }),
    provider: text('provider'),
    dedupeKey: text('dedupe_key').notNull(),
    businessName: text('business_name').notNull(),
    website: text('website'),
    phone: text('phone'),
    email: text('email'),
    contactName: text('contact_name'),
    address: text('address'),
    city: text('city'),
    state: text('state'),
    country: text('country'),
    industry: text('industry'),
    businessSize: text('business_size'),
    sourceUrls: jsonb('source_urls').notNull().default([]),
    discoveryDate: timestamp('discovery_date', {
      withTimezone: true,
      mode: 'date',
    })
      .notNull()
      .defaultNow(),
    lastVerifiedAt: timestamp('last_verified_at', {
      withTimezone: true,
      mode: 'date',
    }),
    verificationStatus: researchVerification('verification_status')
      .notNull()
      .default('unverified'),
    // Facts are recorded evidence; observations are measured signals;
    // hypotheses are AI suggestions that a human must confirm. They are kept
    // apart so a guess can never be presented as a verified fact.
    facts: jsonb('facts').notNull().default({}),
    observations: jsonb('observations').notNull().default({}),
    hypotheses: jsonb('hypotheses').notNull().default([]),
    research: jsonb('research'),
    recommendedService: text('recommended_service'),
    leadScore: integer('lead_score'),
    temperature: leadTemperature('temperature').notNull().default('unknown'),
    confidence: integer('confidence'),
    reason: text('reason'),
    pitch: text('pitch'),
    callingApproach: text('calling_approach'),
    qualificationQuestions: jsonb('qualification_questions')
      .notNull()
      .default([]),
    nextAction: text('next_action'),
    status: discoveryProspectStatus('status').notNull().default('pending_review'),
    decidedByUserId: uuid('decided_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    decidedAt: timestamp('decided_at', { withTimezone: true, mode: 'date' }),
    decisionNote: text('decision_note'),
    leadId: uuid('lead_id').references(() => leads.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex('discovery_prospects_workspace_dedupe_unique').on(
      table.workspaceId,
      table.dedupeKey,
    ),
    index('discovery_prospects_workspace_status_idx').on(
      table.workspaceId,
      table.status,
    ),
    index('discovery_prospects_campaign_created_idx').on(
      table.campaignId,
      table.createdAt,
    ),
  ],
);

export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    title: text('title').notNull(),
    body: text('body'),
    level: text('level').notNull().default('info'),
    resourceType: text('resource_type'),
    resourceId: uuid('resource_id'),
    actionUrl: text('action_url'),
    dedupeKey: text('dedupe_key'),
    readAt: timestamp('read_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('notifications_workspace_dedupe_unique')
      .on(table.workspaceId, table.dedupeKey)
      .where(sql`${table.dedupeKey} is not null`),
    index('notifications_workspace_user_created_idx').on(
      table.workspaceId,
      table.userId,
      table.createdAt,
    ),
    index('notifications_workspace_user_read_idx').on(
      table.workspaceId,
      table.userId,
      table.readAt,
    ),
  ],
);

export const meetings = pgTable(
  'meetings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    leadId: uuid('lead_id').references(() => leads.id, { onDelete: 'set null' }),
    clientId: uuid('client_id').references(() => clients.id, {
      onDelete: 'set null',
    }),
    projectId: uuid('project_id').references(() => projects.id, {
      onDelete: 'set null',
    }),
    title: text('title').notNull(),
    status: meetingStatus('status').notNull().default('scheduled'),
    startsAt: timestamp('starts_at', { withTimezone: true, mode: 'date' })
      .notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true, mode: 'date' })
      .notNull(),
    timezone: text('timezone').notNull().default('UTC'),
    location: text('location'),
    // Only filled after a real provider confirms the event; see
    // src/lib/workforce/calendar.js. Nothing here is ever fabricated.
    meetLink: text('meet_link'),
    calendarProvider: text('calendar_provider'),
    calendarEventId: text('calendar_event_id'),
    calendarHtmlLink: text('calendar_html_link'),
    attendees: jsonb('attendees').notNull().default([]),
    agenda: text('agenda'),
    notes: text('notes'),
    outcome: text('outcome'),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    updatedByUserId: uuid('updated_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex('meetings_workspace_calendar_event_unique')
      .on(table.workspaceId, table.calendarProvider, table.calendarEventId)
      .where(sql`${table.calendarEventId} is not null`),
    index('meetings_workspace_starts_idx').on(table.workspaceId, table.startsAt),
    index('meetings_workspace_lead_idx').on(table.workspaceId, table.leadId),
  ],
);
