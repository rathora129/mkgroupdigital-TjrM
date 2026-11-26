import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  isNull,
  sql,
} from 'drizzle-orm';
import { getDb } from '@/db/client';
import {
  agentRunLogs,
  agentRuns,
  agents,
  aiProviderSettings,
  approvals,
  users,
  workspaces,
} from '@/db/schema';
import { ApiError } from '@/lib/api-error';
import { recordAudit, sanitizeMetadata } from '@/lib/audit';
import {
  buildRunContext,
  combinePromptWithContext,
  summarizeContext,
} from '@/lib/knowledge/context';
import { buildSystemInstructions } from './agent-types';
import { ProviderError, RETRYABLE_CODES } from './errors';
import { enqueueAgentRun } from './queue';
import {
  estimateCostCents,
  getProviderDefinition,
  isProviderConfigured,
  listProviderMetadata,
} from './registry';
import { generateWithRetry } from './providers';

const AI_INPUT_FIELD = 'prompt';

// Drizzle wraps driver errors, so the Postgres code lives on a nested cause.
function isUniqueViolation(error, constraint) {
  for (let current = error, depth = 0; current && depth < 5; current = current.cause, depth += 1) {
    if (current.code === '23505') {
      return constraint ? current.constraint === constraint : true;
    }
  }
  return false;
}

function clip(value, max = 1_000) {
  const text = String(value ?? '').trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function monthStart() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

function monthLabel(date = new Date()) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// Agents
// ---------------------------------------------------------------------------

export async function listAgents(
  workspaceId,
  { includeArchived = false, type, enabled, search } = {},
) {
  const filters = [eq(agents.workspaceId, workspaceId)];
  if (!includeArchived) filters.push(isNull(agents.archivedAt));
  if (type) filters.push(eq(agents.type, type));
  if (typeof enabled === 'boolean') filters.push(eq(agents.enabled, enabled));
  if (search) filters.push(ilike(agents.name, `%${search}%`));

  return getDb()
    .select()
    .from(agents)
    .where(and(...filters))
    .orderBy(asc(agents.name));
}

export async function getAgent(workspaceId, agentId) {
  const rows = await getDb()
    .select()
    .from(agents)
    .where(
      and(
        eq(agents.workspaceId, workspaceId),
        eq(agents.id, agentId),
        isNull(agents.archivedAt),
      ),
    )
    .limit(1);
  return rows[0] || null;
}

function agentValues(data) {
  const values = {};
  const columns = [
    'name',
    'description',
    'type',
    'instructions',
    'provider',
    'model',
    'enabled',
    'toolPermissions',
    'allowedWorkflows',
    'monthlyTokenLimit',
    'monthlyBudgetCents',
    'approvalRequired',
  ];
  for (const column of columns) {
    if (data[column] !== undefined) values[column] = data[column];
  }
  return values;
}

export async function createAgent({ workspaceId, userId, data }) {
  const values = {
    workspaceId,
    createdByUserId: userId,
    description: null,
    toolPermissions: [],
    allowedWorkflows: [],
    ...agentValues(data),
  };

  let agent;
  try {
    const rows = await getDb().insert(agents).values(values).returning();
    agent = rows[0];
  } catch (error) {
    if (isUniqueViolation(error, 'agents_workspace_name_unique')) {
      throw new ApiError(
        409,
        'AGENT_NAME_TAKEN',
        'An agent with that name already exists in this workspace.',
      );
    }
    throw error;
  }

  await recordAudit({
    workspaceId,
    actorUserId: userId,
    action: 'agent.create',
    resourceType: 'agent',
    resourceId: agent.id,
    metadata: {
      type: agent.type,
      provider: agent.provider,
      model: agent.model,
      approvalRequired: agent.approvalRequired,
      enabled: agent.enabled,
    },
  });

  return agent;
}

export async function updateAgent({ workspaceId, agentId, userId, data }) {
  const current = await getAgent(workspaceId, agentId);
  if (!current) {
    throw new ApiError(404, 'NOT_FOUND', 'That agent could not be found.');
  }

  const changes = agentValues(data);
  const fields = Object.keys(changes);
  if (!fields.length) {
    throw new ApiError(422, 'VALIDATION_FAILED', 'There is nothing to update.');
  }

  let updated;
  try {
    const rows = await getDb()
      .update(agents)
      .set(changes)
      .where(
        and(
          eq(agents.workspaceId, workspaceId),
          eq(agents.id, agentId),
          isNull(agents.archivedAt),
        ),
      )
      .returning();
    updated = rows[0];
  } catch (error) {
    if (isUniqueViolation(error, 'agents_workspace_name_unique')) {
      throw new ApiError(
        409,
        'AGENT_NAME_TAKEN',
        'An agent with that name already exists in this workspace.',
      );
    }
    throw error;
  }

  if (!updated) {
    throw new ApiError(404, 'NOT_FOUND', 'That agent could not be found.');
  }

  await recordAudit({
    workspaceId,
    actorUserId: userId,
    action: 'agent.update',
    resourceType: 'agent',
    resourceId: agentId,
    metadata: { fields, provider: updated.provider, model: updated.model },
  });

  return updated;
}

// Archiving is the safe delete: run history and audit records stay intact.
export async function archiveAgent({ workspaceId, agentId, userId }) {
  const current = await getAgent(workspaceId, agentId);
  if (!current) {
    throw new ApiError(404, 'NOT_FOUND', 'That agent could not be found.');
  }

  const db = getDb();
  const rows = await db
    .update(agents)
    .set({ archivedAt: new Date(), enabled: false })
    .where(
      and(
        eq(agents.workspaceId, workspaceId),
        eq(agents.id, agentId),
        isNull(agents.archivedAt),
      ),
    )
    .returning();
  const agent = rows[0];
  if (!agent) {
    throw new ApiError(404, 'NOT_FOUND', 'That agent could not be found.');
  }

  const openRuns = await db
    .update(agentRuns)
    .set({
      status: 'cancelled',
      cancelRequested: true,
      errorMessage: 'The agent was archived, so the run was cancelled.',
      completedAt: new Date(),
    })
    .where(
      and(
        eq(agentRuns.workspaceId, workspaceId),
        eq(agentRuns.agentId, agentId),
        inArray(agentRuns.status, ['queued', 'running', 'awaiting_approval']),
      ),
    )
    .returning({ id: agentRuns.id });

  if (openRuns.length) {
    await db
      .update(approvals)
      .set({
        status: 'cancelled',
        decidedByUserId: userId,
        decidedAt: new Date(),
        decisionNote: 'The agent was archived.',
      })
      .where(
        and(
          eq(approvals.workspaceId, workspaceId),
          eq(approvals.resourceType, 'agent_run'),
          inArray(
            approvals.resourceId,
            openRuns.map((run) => run.id),
          ),
          eq(approvals.status, 'pending'),
        ),
      );

    for (const run of openRuns) {
      await appendRunLog({
        workspaceId,
        runId: run.id,
        level: 'warn',
        message: 'Run cancelled because the agent was archived.',
      });
    }
  }

  await recordAudit({
    workspaceId,
    actorUserId: userId,
    action: 'agent.archive',
    resourceType: 'agent',
    resourceId: agentId,
    metadata: { cancelledRuns: openRuns.length },
  });

  return agent;
}

// ---------------------------------------------------------------------------
// Provider settings (non-secret metadata only)
// ---------------------------------------------------------------------------

export async function listProviderSettings(workspaceId) {
  const rows = await getDb()
    .select()
    .from(aiProviderSettings)
    .where(eq(aiProviderSettings.workspaceId, workspaceId));
  return Object.fromEntries(rows.map((row) => [row.provider, row]));
}

export async function getProviderSetting(workspaceId, provider) {
  const rows = await getDb()
    .select()
    .from(aiProviderSettings)
    .where(
      and(
        eq(aiProviderSettings.workspaceId, workspaceId),
        eq(aiProviderSettings.provider, provider),
      ),
    )
    .limit(1);
  return rows[0] || null;
}

export async function updateProviderSetting({
  workspaceId,
  provider,
  userId,
  changes,
}) {
  const definition = getProviderDefinition(provider);
  if (!definition) {
    throw new ApiError(404, 'NOT_FOUND', 'That AI provider is not supported.');
  }

  const values = {};
  if (changes.enabled !== undefined) values.enabled = changes.enabled;
  if (changes.defaultModel !== undefined) {
    values.defaultModel = changes.defaultModel;
  }
  if (!Object.keys(values).length) {
    throw new ApiError(422, 'VALIDATION_FAILED', 'There is nothing to update.');
  }

  const rows = await getDb()
    .insert(aiProviderSettings)
    .values({ workspaceId, provider, ...values })
    .onConflictDoUpdate({
      target: [aiProviderSettings.workspaceId, aiProviderSettings.provider],
      set: values,
    })
    .returning();

  await recordAudit({
    workspaceId,
    actorUserId: userId,
    action: 'ai_provider.update',
    resourceType: 'ai_provider',
    resourceId: provider,
    metadata: { fields: Object.keys(values), enabled: rows[0]?.enabled },
  });

  return rows[0];
}

async function isProviderEnabledForWorkspace(workspaceId, provider) {
  const setting = await getProviderSetting(workspaceId, provider);
  return !setting || setting.enabled;
}

export async function updateWorkspaceAiLimits({ workspaceId, userId, changes }) {
  const values = {};
  if (changes.monthlyTokenLimit !== undefined) {
    values.aiMonthlyTokenLimit = changes.monthlyTokenLimit;
  }
  if (changes.monthlyBudgetCents !== undefined) {
    values.aiMonthlyBudgetCents = changes.monthlyBudgetCents;
  }
  if (!Object.keys(values).length) {
    throw new ApiError(422, 'VALIDATION_FAILED', 'There is nothing to update.');
  }

  const rows = await getDb()
    .update(workspaces)
    .set(values)
    .where(eq(workspaces.id, workspaceId))
    .returning();
  if (!rows[0]) {
    throw new ApiError(404, 'NOT_FOUND', 'Workspace not found.');
  }

  await recordAudit({
    workspaceId,
    actorUserId: userId,
    action: 'ai_settings.update',
    resourceType: 'workspace',
    resourceId: workspaceId,
    metadata: {
      monthlyTokenLimit: rows[0].aiMonthlyTokenLimit,
      monthlyBudgetCents: rows[0].aiMonthlyBudgetCents,
    },
  });

  return rows[0];
}

// ---------------------------------------------------------------------------
// Usage and budgets
// ---------------------------------------------------------------------------

async function aggregateUsage(workspaceId, agentId = null) {
  const filters = [
    eq(agentRuns.workspaceId, workspaceId),
    gte(agentRuns.createdAt, monthStart()),
  ];
  if (agentId) filters.push(eq(agentRuns.agentId, agentId));

  const rows = await getDb()
    .select({
      runs: count(),
      tokens:
        sql`coalesce(sum(${agentRuns.promptTokens} + ${agentRuns.completionTokens}), 0)`.mapWith(
          Number,
        ),
      costCents:
        sql`coalesce(sum(${agentRuns.costEstimateCents}), 0)`.mapWith(Number),
      completed:
        sql`count(*) filter (where ${agentRuns.status} = 'completed')`.mapWith(
          Number,
        ),
      failed:
        sql`count(*) filter (where ${agentRuns.status} = 'failed')`.mapWith(
          Number,
        ),
      cancelled:
        sql`count(*) filter (where ${agentRuns.status} = 'cancelled')`.mapWith(
          Number,
        ),
      open:
        sql`count(*) filter (where ${agentRuns.status} in ('queued','running','awaiting_approval'))`.mapWith(
          Number,
        ),
    })
    .from(agentRuns)
    .where(and(...filters));

  const row = rows[0] || {};
  return {
    month: monthLabel(),
    runs: Number(row.runs || 0),
    completed: Number(row.completed || 0),
    failed: Number(row.failed || 0),
    cancelled: Number(row.cancelled || 0),
    open: Number(row.open || 0),
    tokens: Number(row.tokens || 0),
    costCents: Number(row.costCents || 0),
  };
}

export async function getWorkspaceUsage(workspaceId) {
  const [totals, byAgentRows, workspaceRows] = await Promise.all([
    aggregateUsage(workspaceId),
    getDb()
      .select({
        agentId: agentRuns.agentId,
        name: agents.name,
        type: agents.type,
        archivedAt: agents.archivedAt,
        runs: count(),
        tokens:
          sql`coalesce(sum(${agentRuns.promptTokens} + ${agentRuns.completionTokens}), 0)`.mapWith(
            Number,
          ),
        costCents:
          sql`coalesce(sum(${agentRuns.costEstimateCents}), 0)`.mapWith(Number),
      })
      .from(agentRuns)
      .innerJoin(agents, eq(agents.id, agentRuns.agentId))
      .where(
        and(
          eq(agentRuns.workspaceId, workspaceId),
          gte(agentRuns.createdAt, monthStart()),
        ),
      )
      .groupBy(agentRuns.agentId, agents.name, agents.type, agents.archivedAt)
      .orderBy(desc(count())),
    getDb()
      .select({
        tokenLimit: workspaces.aiMonthlyTokenLimit,
        budgetLimitCents: workspaces.aiMonthlyBudgetCents,
      })
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId))
      .limit(1),
  ]);

  const limits = workspaceRows[0] || { tokenLimit: null, budgetLimitCents: null };
  return {
    ...totals,
    tokenLimit: limits.tokenLimit,
    budgetLimitCents: limits.budgetLimitCents,
    byAgent: byAgentRows.map((row) => ({
      ...row,
      runs: Number(row.runs || 0),
      tokens: Number(row.tokens || 0),
      costCents: Number(row.costCents || 0),
    })),
  };
}

export async function getAgentUsage(workspaceId, agentId) {
  return aggregateUsage(workspaceId, agentId);
}

function budgetError(scope, metric, used, limit) {
  return new ApiError(
    429,
    'BUDGET_EXCEEDED',
    scope === 'workspace'
      ? `The workspace monthly ${metric} budget is exhausted (${used} of ${limit}). Ask an owner or admin to raise it.`
      : `This agent's monthly ${metric} budget is exhausted (${used} of ${limit}).`,
    { scope, metric, used, limit },
  );
}

async function assertRunBudget({ workspaceId, agent }) {
  const [workspaceRows, usage, agentUsage] = await Promise.all([
    getDb()
      .select({
        tokenLimit: workspaces.aiMonthlyTokenLimit,
        budgetLimitCents: workspaces.aiMonthlyBudgetCents,
      })
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId))
      .limit(1),
    aggregateUsage(workspaceId),
    aggregateUsage(workspaceId, agent.id),
  ]);

  const limits = workspaceRows[0] || {};

  if (limits.tokenLimit != null && usage.tokens >= limits.tokenLimit) {
    throw budgetError('workspace', 'token', usage.tokens, limits.tokenLimit);
  }
  if (
    limits.budgetLimitCents != null &&
    usage.costCents >= limits.budgetLimitCents
  ) {
    throw budgetError(
      'workspace',
      'cost',
      usage.costCents,
      limits.budgetLimitCents,
    );
  }
  if (
    agent.monthlyTokenLimit != null &&
    agentUsage.tokens >= agent.monthlyTokenLimit
  ) {
    throw budgetError('agent', 'token', agentUsage.tokens, agent.monthlyTokenLimit);
  }
  if (
    agent.monthlyBudgetCents != null &&
    agentUsage.costCents >= agent.monthlyBudgetCents
  ) {
    throw budgetError(
      'agent',
      'cost',
      agentUsage.costCents,
      agent.monthlyBudgetCents,
    );
  }
}

async function assertProviderReady(workspaceId, agent) {
  const definition = getProviderDefinition(agent.provider);
  if (!definition) {
    throw new ApiError(
      409,
      'PROVIDER_UNSUPPORTED',
      'This agent uses a provider that is no longer supported.',
    );
  }
  if (!(await isProviderEnabledForWorkspace(workspaceId, agent.provider))) {
    throw new ApiError(
      409,
      'PROVIDER_DISABLED',
      `${definition.label} is disabled for this workspace. Re-enable it in AI settings.`,
    );
  }
  if (!isProviderConfigured(agent.provider)) {
    throw new ApiError(
      409,
      'AI_NOT_CONFIGURED',
      `${definition.label} is not configured on this server. Add ${definition.envKeys.join(' or ')} to enable AI execution.`,
    );
  }
}

// ---------------------------------------------------------------------------
// Runs
// ---------------------------------------------------------------------------

export async function listRuns(
  workspaceId,
  { page = 1, pageSize = 20, status, agentId } = {},
) {
  const filters = [eq(agentRuns.workspaceId, workspaceId)];
  if (status) filters.push(eq(agentRuns.status, status));
  if (agentId) filters.push(eq(agentRuns.agentId, agentId));
  const where = and(...filters);

  const db = getDb();
  const [items, totals] = await Promise.all([
    db
      .select({
        id: agentRuns.id,
        agentId: agentRuns.agentId,
        status: agentRuns.status,
        promptTokens: agentRuns.promptTokens,
        completionTokens: agentRuns.completionTokens,
        costEstimateCents: agentRuns.costEstimateCents,
        durationMs: agentRuns.durationMs,
        attempts: agentRuns.attempts,
        approvalRequired: agentRuns.approvalRequired,
        errorMessage: agentRuns.errorMessage,
        createdAt: agentRuns.createdAt,
        completedAt: agentRuns.completedAt,
        agentName: agents.name,
        agentType: agents.type,
        requestedByName: users.name,
        requestedByEmail: users.email,
      })
      .from(agentRuns)
      .innerJoin(agents, eq(agents.id, agentRuns.agentId))
      .leftJoin(users, eq(users.id, agentRuns.requestedByUserId))
      .where(where)
      .orderBy(desc(agentRuns.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db
      .select({ value: count() })
      .from(agentRuns)
      .innerJoin(agents, eq(agents.id, agentRuns.agentId))
      .where(where),
  ]);

  const total = Number(totals[0]?.value || 0);
  return {
    items,
    total,
    page,
    pageSize,
    pages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export async function getRun(workspaceId, runId) {
  const rows = await getDb()
    .select({
      run: agentRuns,
      agentName: agents.name,
      agentType: agents.type,
      agentArchivedAt: agents.archivedAt,
      requestedByName: users.name,
      requestedByEmail: users.email,
    })
    .from(agentRuns)
    .innerJoin(agents, eq(agents.id, agentRuns.agentId))
    .leftJoin(users, eq(users.id, agentRuns.requestedByUserId))
    .where(
      and(eq(agentRuns.workspaceId, workspaceId), eq(agentRuns.id, runId)),
    )
    .limit(1);
  return rows[0] || null;
}

export async function getRunLogs(workspaceId, runId) {
  return getDb()
    .select()
    .from(agentRunLogs)
    .where(
      and(
        eq(agentRunLogs.workspaceId, workspaceId),
        eq(agentRunLogs.runId, runId),
      ),
    )
    .orderBy(asc(agentRunLogs.createdAt));
}

export async function getRunDetail(workspaceId, runId) {
  const detail = await getRun(workspaceId, runId);
  if (!detail) return null;
  const [logs, approvalRows] = await Promise.all([
    getRunLogs(workspaceId, runId),
    getDb()
      .select()
      .from(approvals)
      .where(
        and(
          eq(approvals.workspaceId, workspaceId),
          eq(approvals.resourceType, 'agent_run'),
          eq(approvals.resourceId, runId),
        ),
      )
      .orderBy(desc(approvals.createdAt)),
  ]);
  return { ...detail, logs, approvals: approvalRows };
}

export async function appendRunLog({
  workspaceId,
  runId,
  level = 'info',
  message,
  metadata = null,
}) {
  try {
    await getDb()
      .insert(agentRunLogs)
      .values({
        workspaceId,
        runId,
        level,
        message: clip(message, 2_000),
        metadata: metadata ? sanitizeMetadata(metadata) : null,
      });
  } catch {
    console.error('[ai-runtime] run log could not be recorded');
  }
}

async function findRunByIdempotencyKey(workspaceId, idempotencyKey) {
  const rows = await getDb()
    .select()
    .from(agentRuns)
    .where(
      and(
        eq(agentRuns.workspaceId, workspaceId),
        eq(agentRuns.idempotencyKey, idempotencyKey),
      ),
    )
    .limit(1);
  return rows[0] || null;
}

async function startRun(run, enqueue) {
  try {
    const jobId = await enqueue(run.id);
    if (!jobId) throw new Error('The queue rejected the job');

    const rows = await getDb()
      .update(agentRuns)
      .set({ jobId })
      .where(eq(agentRuns.id, run.id))
      .returning();

    await appendRunLog({
      workspaceId: run.workspaceId,
      runId: run.id,
      message: 'Run queued for the AI worker.',
      metadata: { jobId },
    });

    return { run: rows[0] || run, queued: true };
  } catch (error) {
    const message =
      'The background queue is unavailable. Start the AI worker and try again.';
    const failed = await failRunRow(run.id, message, {
      workspaceId: run.workspaceId,
      code: 'queue_unavailable',
    });
    await recordAudit({
      workspaceId: run.workspaceId,
      actorType: 'system',
      action: 'agent_run.failed',
      resourceType: 'agent_run',
      resourceId: run.id,
      success: false,
      metadata: { reason: 'queue_unavailable', detail: clip(error.message, 200) },
    });
    return { run: failed || run, queued: false, error: message };
  }
}

export async function createAgentRun({
  workspaceId,
  agentId,
  userId,
  input,
  contextRefs = null,
  idempotencyKey = null,
  enqueue = enqueueAgentRun,
}) {
  if (idempotencyKey) {
    const existing = await findRunByIdempotencyKey(workspaceId, idempotencyKey);
    if (existing) return { run: existing, reused: true };
  }

  const agent = await getAgent(workspaceId, agentId);
  if (!agent) {
    throw new ApiError(404, 'NOT_FOUND', 'That agent could not be found.');
  }
  if (!agent.enabled) {
    throw new ApiError(
      409,
      'AGENT_DISABLED',
      'This agent is disabled. Enable it before starting a run.',
    );
  }

  await assertRunBudget({ workspaceId, agent });

  const approvalRequired = Boolean(agent.approvalRequired);
  if (!approvalRequired) {
    await assertProviderReady(workspaceId, agent);
  }

  let run;
  try {
    const rows = await getDb()
      .insert(agentRuns)
      .values({
        workspaceId,
        agentId,
        status: approvalRequired ? 'awaiting_approval' : 'queued',
        input: {
          [AI_INPUT_FIELD]: input,
          ...(contextRefs ? { contextRefs } : {}),
        },
        approvalRequired,
        requestedByUserId: userId,
        idempotencyKey,
      })
      .returning();
    run = rows[0];
  } catch (error) {
    if (
      idempotencyKey &&
      isUniqueViolation(error, 'agent_runs_idempotency_unique')
    ) {
      const existing = await findRunByIdempotencyKey(workspaceId, idempotencyKey);
      if (existing) return { run: existing, reused: true };
    }
    throw error;
  }

  if (approvalRequired) {
    await getDb().insert(approvals).values({
      workspaceId,
      resourceType: 'agent_run',
      resourceId: run.id,
      requestedByUserId: userId,
    });
    await appendRunLog({
      workspaceId,
      runId: run.id,
      message: 'Run is waiting for human approval before execution.',
    });
  } else {
    const started = await startRun(run, enqueue);
    run = started.run;
  }

  await recordAudit({
    workspaceId,
    actorUserId: userId,
    action: 'agent_run.create',
    resourceType: 'agent_run',
    resourceId: run.id,
    success: run.status !== 'failed',
    metadata: {
      agentId,
      agentType: agent.type,
      status: run.status,
      approvalRequired,
      reused: false,
    },
  });

  return { run, reused: false };
}

export async function cancelAgentRun({ workspaceId, runId, userId }) {
  const detail = await getRun(workspaceId, runId);
  if (!detail) {
    throw new ApiError(404, 'NOT_FOUND', 'That run could not be found.');
  }
  const run = detail.run;

  if (['completed', 'failed', 'cancelled'].includes(run.status)) {
    throw new ApiError(
      409,
      'RUN_FINISHED',
      'This run has already finished and cannot be cancelled.',
    );
  }

  const db = getDb();
  const now = new Date();

  if (run.status === 'running') {
    // The worker polls this flag and aborts the provider request in flight.
    const rows = await db
      .update(agentRuns)
      .set({ cancelRequested: true })
      .where(
        and(
          eq(agentRuns.workspaceId, workspaceId),
          eq(agentRuns.id, runId),
          eq(agentRuns.status, 'running'),
        ),
      )
      .returning();
    if (!rows[0]) {
      throw new ApiError(409, 'RUN_FINISHED', 'This run has already finished.');
    }
    await appendRunLog({
      workspaceId,
      runId,
      level: 'warn',
      message: 'Cancellation requested. The worker will stop at the next check.',
    });
    await recordAudit({
      workspaceId,
      actorUserId: userId,
      action: 'agent_run.cancel',
      resourceType: 'agent_run',
      resourceId: runId,
      metadata: { deferred: true },
    });
    return { run: rows[0], deferred: true };
  }

  const rows = await db
    .update(agentRuns)
    .set({
      status: 'cancelled',
      cancelRequested: true,
      errorMessage: 'Cancelled before completion.',
      completedAt: now,
    })
    .where(
      and(
        eq(agentRuns.workspaceId, workspaceId),
        eq(agentRuns.id, runId),
        inArray(agentRuns.status, ['queued', 'awaiting_approval']),
      ),
    )
    .returning();
  if (!rows[0]) {
    throw new ApiError(409, 'RUN_FINISHED', 'This run has already finished.');
  }

  await db
    .update(approvals)
    .set({
      status: 'cancelled',
      decidedByUserId: userId,
      decidedAt: now,
      decisionNote: 'Cancelled with the run.',
    })
    .where(
      and(
        eq(approvals.workspaceId, workspaceId),
        eq(approvals.resourceType, 'agent_run'),
        eq(approvals.resourceId, runId),
        eq(approvals.status, 'pending'),
      ),
    );

  await appendRunLog({
    workspaceId,
    runId,
    level: 'warn',
    message: 'Run cancelled before completion.',
  });
  await recordAudit({
    workspaceId,
    actorUserId: userId,
    action: 'agent_run.cancel',
    resourceType: 'agent_run',
    resourceId: runId,
    metadata: { deferred: false, previousStatus: run.status },
  });

  return { run: rows[0], deferred: false };
}

// ---------------------------------------------------------------------------
// Approvals
// ---------------------------------------------------------------------------

export async function listApprovals(
  workspaceId,
  { page = 1, pageSize = 20, status } = {},
) {
  const filters = [eq(approvals.workspaceId, workspaceId)];
  if (status) filters.push(eq(approvals.status, status));
  const where = and(...filters);

  const db = getDb();
  const [items, totals] = await Promise.all([
    db
      .select({
        id: approvals.id,
        status: approvals.status,
        decisionNote: approvals.decisionNote,
        decidedAt: approvals.decidedAt,
        createdAt: approvals.createdAt,
        runId: approvals.resourceId,
        requestedByName: users.name,
        requestedByEmail: users.email,
        runStatus: agentRuns.status,
        runCreatedAt: agentRuns.createdAt,
        agentId: agents.id,
        agentName: agents.name,
        agentType: agents.type,
        approvalRequired: agentRuns.approvalRequired,
      })
      .from(approvals)
      .innerJoin(agentRuns, eq(agentRuns.id, approvals.resourceId))
      .innerJoin(agents, eq(agents.id, agentRuns.agentId))
      .leftJoin(users, eq(users.id, approvals.requestedByUserId))
      .where(where)
      .orderBy(desc(approvals.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db
      .select({ value: count() })
      .from(approvals)
      .innerJoin(agentRuns, eq(agentRuns.id, approvals.resourceId))
      .where(where),
  ]);

  const total = Number(totals[0]?.value || 0);
  return {
    items,
    total,
    page,
    pageSize,
    pages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export async function countPendingApprovals(workspaceId) {
  const rows = await getDb()
    .select({ value: count() })
    .from(approvals)
    .where(
      and(
        eq(approvals.workspaceId, workspaceId),
        eq(approvals.status, 'pending'),
      ),
    );
  return Number(rows[0]?.value || 0);
}

export async function decideApproval({
  workspaceId,
  approvalId,
  userId,
  decision,
  note = null,
  enqueue = enqueueAgentRun,
}) {
  const rows = await getDb()
    .select()
    .from(approvals)
    .where(
      and(
        eq(approvals.workspaceId, workspaceId),
        eq(approvals.id, approvalId),
      ),
    )
    .limit(1);
  const approval = rows[0];
  if (!approval) {
    throw new ApiError(404, 'NOT_FOUND', 'That approval could not be found.');
  }
  if (approval.status !== 'pending') {
    throw new ApiError(
      409,
      'ALREADY_DECIDED',
      'This approval has already been decided.',
    );
  }

  const approved = decision === 'approve';
  const updatedRows = await getDb()
    .update(approvals)
    .set({
      status: approved ? 'approved' : 'rejected',
      decidedByUserId: userId,
      decidedAt: new Date(),
      decisionNote: note,
    })
    .where(
      and(
        eq(approvals.workspaceId, workspaceId),
        eq(approvals.id, approvalId),
        eq(approvals.status, 'pending'),
      ),
    )
    .returning();
  const updatedApproval = updatedRows[0];
  if (!updatedApproval) {
    throw new ApiError(
      409,
      'ALREADY_DECIDED',
      'This approval has already been decided.',
    );
  }

  const runRows = await getDb()
    .select()
    .from(agentRuns)
    .where(
      and(
        eq(agentRuns.workspaceId, workspaceId),
        eq(agentRuns.id, approval.resourceId),
      ),
    )
    .limit(1);
  const run = runRows[0];

  let runResult = { run: run || null, queued: false, error: null };

  if (!run) {
    runResult.error = 'The linked run no longer exists.';
  } else if (run.status !== 'awaiting_approval') {
    runResult.error = `The run is already ${run.status.replace('_', ' ')}.`;
  } else if (!approved) {
    const cancelled = await getDb()
      .update(agentRuns)
      .set({
        status: 'cancelled',
        errorMessage: note
          ? `Rejected by a reviewer: ${clip(note, 300)}`
          : 'Rejected by a reviewer.',
        completedAt: new Date(),
      })
      .where(
        and(
          eq(agentRuns.id, run.id),
          eq(agentRuns.status, 'awaiting_approval'),
        ),
      )
      .returning();
    runResult.run = cancelled[0] || run;
    await appendRunLog({
      workspaceId,
      runId: run.id,
      level: 'warn',
      message: 'Run rejected by a reviewer.',
      metadata: note ? { note: clip(note, 300) } : null,
    });
  } else {
    const agentRows = await getDb()
      .select()
      .from(agents)
      .where(eq(agents.id, run.agentId))
      .limit(1);
    const agent = agentRows[0];
    let readinessError = null;
    if (!agent) {
      readinessError = 'The agent no longer exists.';
    } else if (!agent.enabled) {
      readinessError = 'The agent is disabled.';
    } else {
      try {
        await assertProviderReady(workspaceId, agent);
      } catch (error) {
        readinessError = error.message;
      }
    }

    if (readinessError) {
      const failed = await failRunRow(run.id, readinessError, {
        workspaceId,
        code: 'not_ready_after_approval',
      });
      runResult = { run: failed || run, queued: false, error: readinessError };
    } else {
      const transitioned = await getDb()
        .update(agentRuns)
        .set({ status: 'queued', errorMessage: null })
        .where(
          and(
            eq(agentRuns.id, run.id),
            eq(agentRuns.status, 'awaiting_approval'),
            eq(agentRuns.cancelRequested, false),
          ),
        )
        .returning();
      if (!transitioned[0]) {
        runResult = {
          run,
          queued: false,
          error: 'The run was cancelled before approval could be applied.',
        };
      } else {
        await appendRunLog({
          workspaceId,
          runId: run.id,
          message: 'Run approved by a reviewer and queued for execution.',
        });
        const started = await startRun(transitioned[0], enqueue);
        runResult = {
          run: started.run,
          queued: started.queued,
          error: started.error || null,
        };
      }
    }
  }

  await recordAudit({
    workspaceId,
    actorUserId: userId,
    action: 'approval.decide',
    resourceType: 'approval',
    resourceId: approvalId,
    success: !runResult.error,
    metadata: {
      decision,
      runId: approval.resourceId,
      note: note ? clip(note, 300) : null,
      queued: runResult.queued,
    },
  });

  return { approval: updatedApproval, ...runResult };
}

// ---------------------------------------------------------------------------
// Worker execution
// ---------------------------------------------------------------------------

async function claimRun(runId) {
  const rows = await getDb()
    .update(agentRuns)
    .set({
      status: 'running',
      startedAt: new Date(),
      errorMessage: null,
      attempts: sql`${agentRuns.attempts} + 1`,
    })
    .where(
      and(
        eq(agentRuns.id, runId),
        eq(agentRuns.status, 'queued'),
        eq(agentRuns.cancelRequested, false),
      ),
    )
    .returning();
  return rows[0] || null;
}

async function failRunRow(runId, message, { workspaceId, code = null } = {}) {
  const rows = await getDb()
    .update(agentRuns)
    .set({
      status: 'failed',
      errorMessage: clip(message, 1_000),
      completedAt: new Date(),
    })
    .where(
      and(
        eq(agentRuns.id, runId),
        inArray(agentRuns.status, ['awaiting_approval', 'queued', 'running']),
      ),
    )
    .returning();
  const run = rows[0] || null;
  if (run) {
    await appendRunLog({
      workspaceId: workspaceId || run.workspaceId,
      runId,
      level: 'error',
      message: clip(message, 1_000),
      metadata: code ? { code } : null,
    });
  }
  return run;
}

async function markRunCancelled(run, message) {
  const rows = await getDb()
    .update(agentRuns)
    .set({
      status: 'cancelled',
      errorMessage: clip(message, 1_000),
      completedAt: new Date(),
    })
    .where(
      and(
        eq(agentRuns.id, run.id),
        inArray(agentRuns.status, ['queued', 'running']),
      ),
    )
    .returning();
  const updated = rows[0] || run;
  await appendRunLog({
    workspaceId: run.workspaceId,
    runId: run.id,
    level: 'warn',
    message: clip(message, 1_000),
  });
  await recordAudit({
    workspaceId: run.workspaceId,
    actorType: 'system',
    action: 'agent_run.cancel',
    resourceType: 'agent_run',
    resourceId: run.id,
    metadata: { source: 'worker' },
  });
  return updated;
}

async function readCancelRequested(runId) {
  const rows = await getDb()
    .select({ cancelRequested: agentRuns.cancelRequested })
    .from(agentRuns)
    .where(eq(agentRuns.id, runId))
    .limit(1);
  return Boolean(rows[0]?.cancelRequested);
}

async function checkExecutionReadiness(workspaceId, agent) {
  const definition = getProviderDefinition(agent.provider);
  if (!definition) {
    return { ok: false, code: 'provider_unsupported', message: 'The provider is no longer supported.' };
  }
  if (!agent.enabled) {
    return { ok: false, code: 'agent_disabled', message: 'The agent is disabled.' };
  }
  if (!(await isProviderEnabledForWorkspace(workspaceId, agent.provider))) {
    return {
      ok: false,
      code: 'provider_disabled',
      message: `${definition.label} is disabled for this workspace.`,
    };
  }
  if (!isProviderConfigured(agent.provider)) {
    return {
      ok: false,
      code: 'not_configured',
      message: `${definition.label} is not configured on this server. Add ${definition.envKeys.join(' or ')} to enable AI execution.`,
    };
  }
  return { ok: true };
}

// Executes one queued run. Returns a status the worker can act on:
// completed | failed | cancelled | retry (the job should be retried).
export async function executeAgentRun(
  runId,
  { signal, maxAttempts = 3, generate = generateWithRetry } = {},
) {
  const rows = await getDb()
    .select({ run: agentRuns, agent: agents })
    .from(agentRuns)
    .innerJoin(agents, eq(agents.id, agentRuns.agentId))
    .where(eq(agentRuns.id, runId))
    .limit(1);
  const loaded = rows[0];
  if (!loaded) return { status: 'missing' };

  const { run, agent } = loaded;
  if (run.status !== 'queued') {
    return { status: 'skipped', reason: `status:${run.status}` };
  }
  if (run.cancelRequested) {
    await markRunCancelled(run, 'Cancelled before execution started.');
    return { status: 'cancelled' };
  }

  const claimed = await claimRun(runId);
  if (!claimed) return { status: 'skipped', reason: 'claim-lost' };

  const attempt = claimed.attempts;
  const startedAt = Date.now();

  await appendRunLog({
    workspaceId: run.workspaceId,
    runId,
    message: `Execution attempt ${attempt} started.`,
    metadata: { attempt, provider: agent.provider, model: agent.model },
  });
  await recordAudit({
    workspaceId: run.workspaceId,
    actorType: 'system',
    action: 'agent_run.start',
    resourceType: 'agent_run',
    resourceId: runId,
    metadata: { attempt, provider: agent.provider, model: agent.model },
  });

  const readiness = await checkExecutionReadiness(run.workspaceId, agent);
  if (!readiness.ok) {
    await failRunRow(runId, readiness.message, {
      workspaceId: run.workspaceId,
      code: readiness.code,
    });
    await recordAudit({
      workspaceId: run.workspaceId,
      actorType: 'system',
      action: 'agent_run.failed',
      resourceType: 'agent_run',
      resourceId: runId,
      success: false,
      metadata: { code: readiness.code },
    });
    return { status: 'failed', reason: readiness.code };
  }

  if (await readCancelRequested(runId)) {
    await markRunCancelled(claimed, 'Cancelled before the provider call.');
    return { status: 'cancelled' };
  }

  const controller = new AbortController();
  const onAbort = () => controller.abort();
  signal?.addEventListener('abort', onAbort, { once: true });

  // The provider call can take a minute, so cancellation is also polled from
  // the database instead of relying on a long-lived job signal only.
  const cancelPoll = setInterval(() => {
    readCancelRequested(runId)
      .then((requested) => {
        if (requested) controller.abort();
      })
      .catch(() => {});
  }, 2_000);

  const input = String(claimed.input?.[AI_INPUT_FIELD] || '');

  let contextPackage = null;
  try {
    contextPackage = await buildRunContext({
      workspaceId: run.workspaceId,
      agent,
      userId: run.requestedByUserId,
      input,
      contextRefs: claimed.input?.contextRefs || null,
    });
    if (contextPackage.hasContext) {
      await appendRunLog({
        workspaceId: run.workspaceId,
        runId,
        message: 'Workspace knowledge context attached to the task.',
        metadata: {
          counts: contextPackage.counts,
          contextTokens: contextPackage.contextTokens,
          sources: contextPackage.sources.length,
        },
      });
    } else {
      await appendRunLog({
        workspaceId: run.workspaceId,
        runId,
        message:
          'No matching workspace knowledge or memory was found for this task.',
        metadata: { counts: contextPackage.counts },
      });
    }
  } catch {
    contextPackage = null;
    await appendRunLog({
      workspaceId: run.workspaceId,
      runId,
      level: 'warn',
      message:
        'Workspace context could not be retrieved; the run continues without it.',
    });
  }

  const promptInput = contextPackage
    ? combinePromptWithContext(contextPackage, input)
    : input;

  try {
    const result = await generate({
      provider: agent.provider,
      model: agent.model,
      instructions: buildSystemInstructions(agent),
      input: promptInput,
      timeoutMs: 90_000,
      signal: controller.signal,
    });

    const durationMs = Math.max(0, Date.now() - startedAt);
    const usage = {
      promptTokens: Number(result.usage?.promptTokens || 0),
      completionTokens: Number(result.usage?.completionTokens || 0),
    };
    const costCents = estimateCostCents(agent.provider, agent.model, usage);

    if (await readCancelRequested(runId)) {
      await markRunCancelled(claimed, 'Cancelled while the provider was running.');
      return { status: 'cancelled' };
    }

    const completed = await getDb()
      .update(agentRuns)
      .set({
        status: 'completed',
        output: {
          text: result.text,
          toolCalls: result.toolCalls || [],
          provider: agent.provider,
          model: agent.model,
          context: contextPackage
            ? {
                hasContext: contextPackage.hasContext,
                counts: contextPackage.counts,
                contextTokens: contextPackage.contextTokens,
              }
            : null,
        },
        contextSources: summarizeContext(contextPackage),
        contextTokens: contextPackage?.contextTokens || 0,
        promptTokens: usage.promptTokens,
        completionTokens: usage.completionTokens,
        costEstimateCents: costCents,
        durationMs,
        errorMessage: null,
        completedAt: new Date(),
      })
      .where(
        and(
          eq(agentRuns.id, runId),
          eq(agentRuns.status, 'running'),
          eq(agentRuns.cancelRequested, false),
        ),
      )
      .returning();

    if (!completed[0]) {
      return { status: 'skipped', reason: 'completed-elsewhere' };
    }

    await appendRunLog({
      workspaceId: run.workspaceId,
      runId,
      message: 'Run completed.',
      metadata: { ...usage, costCents, durationMs, attempt },
    });
    await recordAudit({
      workspaceId: run.workspaceId,
      actorType: 'system',
      action: 'agent_run.completed',
      resourceType: 'agent_run',
      resourceId: runId,
      metadata: {
        agentId: agent.id,
        ...usage,
        costCents,
        durationMs,
        attempt,
      },
    });

    return { status: 'completed', run: completed[0] };
  } catch (error) {
    const durationMs = Math.max(0, Date.now() - startedAt);
    const providerError = error instanceof ProviderError ? error : null;
    const code = providerError?.code || 'execution_error';
    const message = clip(error?.message || 'The provider call failed.', 1_000);

    if (code === 'cancelled' || controller.signal.aborted) {
      await markRunCancelled(claimed, 'Cancelled while the provider was running.');
      return { status: 'cancelled' };
    }

    if (
      providerError &&
      RETRYABLE_CODES.has(code) &&
      attempt < maxAttempts &&
      !signal?.aborted
    ) {
      const requeued = await getDb()
        .update(agentRuns)
        .set({ status: 'queued', errorMessage: message, durationMs })
        .where(
          and(eq(agentRuns.id, runId), eq(agentRuns.status, 'running')),
        )
        .returning();
      if (!requeued[0]) return { status: 'skipped', reason: 'requeue-lost' };

      await appendRunLog({
        workspaceId: run.workspaceId,
        runId,
        level: 'warn',
        message: `Attempt ${attempt} failed; a retry has been scheduled.`,
        metadata: { code, detail: message, attempt },
      });
      await recordAudit({
        workspaceId: run.workspaceId,
        actorType: 'system',
        action: 'agent_run.retry',
        resourceType: 'agent_run',
        resourceId: runId,
        success: false,
        metadata: { code, attempt },
      });
      return { status: 'retry', reason: message };
    }

    await getDb()
      .update(agentRuns)
      .set({ durationMs })
      .where(and(eq(agentRuns.id, runId), eq(agentRuns.status, 'running')));
    const failed = await failRunRow(runId, message, {
      workspaceId: run.workspaceId,
      code,
    });
    await recordAudit({
      workspaceId: run.workspaceId,
      actorType: 'system',
      action: 'agent_run.failed',
      resourceType: 'agent_run',
      resourceId: runId,
      success: false,
      metadata: { code, attempt },
    });
    return { status: failed ? 'failed' : 'skipped', reason: code };
  } finally {
    clearInterval(cancelPoll);
    signal?.removeEventListener('abort', onAbort);
  }
}

// ---------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------

export async function getAiOverview(workspaceId) {
  const [agentRows, usage, recent, pendingApprovals, providers, providerSettings] =
    await Promise.all([
      getDb()
        .select({ enabled: agents.enabled, approvalRequired: agents.approvalRequired })
        .from(agents)
        .where(
          and(eq(agents.workspaceId, workspaceId), isNull(agents.archivedAt)),
        ),
      getWorkspaceUsage(workspaceId),
      listRuns(workspaceId, { pageSize: 5 }),
      countPendingApprovals(workspaceId),
      Promise.resolve(listProviderMetadata()),
      listProviderSettings(workspaceId),
    ]);

  const configured = providers.filter((provider) => provider.configured);

  return {
    agents: {
      total: agentRows.length,
      enabled: agentRows.filter((row) => row.enabled).length,
      approvalRequired: agentRows.filter((row) => row.approvalRequired).length,
    },
    usage,
    recentRuns: recent.items,
    pendingApprovals,
    providers: providers.map((provider) => ({
      ...provider,
      workspaceEnabled: providerSettings[provider.key]?.enabled !== false,
      workspaceDefaultModel:
        providerSettings[provider.key]?.defaultModel || null,
    })),
    configuredProviders: configured.map((provider) => provider.key),
    runtimeConfigured: configured.length > 0,
  };
}

export { monthLabel, monthStart };
