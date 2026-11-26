import { and, count, desc, eq, inArray } from 'drizzle-orm';
import { getDb } from '@/db/client';
import {
  clients,
  executionRequests,
  integrations,
  projects,
  users,
} from '@/db/schema';
import { ApiError } from '@/lib/api-error';
import { recordAudit } from '@/lib/audit';
import { hasPermission } from '@/lib/auth/permissions';
import { enqueueExecution } from '@/lib/ai/queue';
import { getMockAdapter } from './adapters';
import { EXECUTION_STATUS_LABELS, isExecutionTransitionAllowed } from './constants';
import { getProviderDefinition, providerConfigured } from './registry';
import { getIntegrationRow } from './service';

const ACTIVE_STATUSES = ['proposed', 'awaiting_approval', 'approved', 'queued', 'executing'];

export function executionNotFound() {
  return new ApiError(
    404,
    'NOT_FOUND',
    'That execution request could not be found in this workspace.',
  );
}

function toIso(value) {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function assertTransition(row, next) {
  if (!isExecutionTransitionAllowed(row.status, next)) {
    throw new ApiError(
      409,
      'INVALID_STATE',
      `This request is ${EXECUTION_STATUS_LABELS[row.status]}; it cannot become ${EXECUTION_STATUS_LABELS[next]}.`,
    );
  }
}

async function assertClientBelongs(workspaceId, clientId) {
  if (!clientId) return;
  const rows = await getDb()
    .select({ id: clients.id, companyName: clients.companyName })
    .from(clients)
    .where(and(eq(clients.workspaceId, workspaceId), eq(clients.id, clientId)))
    .limit(1);
  if (!rows[0]) {
    throw new ApiError(422, 'CLIENT_NOT_FOUND', 'Choose a client from this workspace.', {
      clientId: 'Choose a client from this workspace.',
    });
  }
}

async function assertProjectBelongs(workspaceId, projectId, clientId) {
  if (!projectId) return;
  const rows = await getDb()
    .select({ id: projects.id, clientId: projects.clientId, name: projects.name })
    .from(projects)
    .where(and(eq(projects.workspaceId, workspaceId), eq(projects.id, projectId)))
    .limit(1);
  const project = rows[0];
  if (!project) {
    throw new ApiError(422, 'PROJECT_NOT_FOUND', 'Choose a project from this workspace.', {
      projectId: 'Choose a project from this workspace.',
    });
  }
  if (clientId && project.clientId && project.clientId !== clientId) {
    throw new ApiError(
      422,
      'PROJECT_NOT_FOUND',
      'That project belongs to a different client.',
      { projectId: 'Choose a project for the selected client.' },
    );
  }
}

async function assertIntegrationAuthorized(workspaceId, integrationId) {
  if (!integrationId) return null;
  const row = await getIntegrationRow(workspaceId, integrationId);
  const definition = getProviderDefinition(row.kind, row.provider);
  if (!definition || !providerConfigured(definition) || row.disconnectedAt) {
    throw new ApiError(
      409,
      'INTEGRATION_NOT_CONFIGURED',
      'That integration is not authorised. External actions stay disabled until it is configured and connected.',
    );
  }
  return row;
}

export async function createExecutionRequest({
  workspaceId,
  userId,
  input,
}) {
  await assertClientBelongs(workspaceId, input.clientId);
  await assertProjectBelongs(workspaceId, input.projectId, input.clientId);
  const integrationRow = await assertIntegrationAuthorized(
    workspaceId,
    input.integrationId,
  );

  if (input.category !== 'internal_record' && !integrationRow) {
    throw new ApiError(
      422,
      'INTEGRATION_REQUIRED',
      'Choose a configured integration for an external action.',
      { integrationId: 'This action needs an integration.' },
    );
  }

  const db = getDb();
  try {
    const inserted = await db
      .insert(executionRequests)
      .values({
        workspaceId,
        clientId: input.clientId || null,
        projectId: input.projectId || null,
        integrationId: integrationRow?.id || null,
        category: input.category,
        operation: input.operation,
        targetSystem: input.targetSystem,
        payload: input.payload || null,
        riskLevel: input.riskLevel || 'medium',
        requiredPermission: input.requiredPermission,
        status: 'proposed',
        requestedByUserId: userId,
        idempotencyKey: input.idempotencyKey || null,
      })
      .returning();

    await recordAudit({
      workspaceId,
      actorUserId: userId,
      action: 'execution.create',
      resourceType: 'execution_request',
      resourceId: inserted[0].id,
      metadata: {
        category: input.category,
        operation: input.operation,
        targetSystem: input.targetSystem,
        riskLevel: input.riskLevel,
      },
    });

    return getExecution(workspaceId, inserted[0].id);
  } catch (error) {
    if (error?.code === '23505' && input.idempotencyKey) {
      const existing = await db
        .select()
        .from(executionRequests)
        .where(
          and(
            eq(executionRequests.workspaceId, workspaceId),
            eq(executionRequests.idempotencyKey, input.idempotencyKey),
          ),
        )
        .limit(1);
      if (existing[0]) return getExecution(workspaceId, existing[0].id);
    }
    throw error;
  }
}

async function loadRow(workspaceId, executionId) {
  const rows = await getDb()
    .select()
    .from(executionRequests)
    .where(
      and(
        eq(executionRequests.workspaceId, workspaceId),
        eq(executionRequests.id, executionId),
      ),
    )
    .limit(1);
  const row = rows[0];
  if (!row) throw executionNotFound();
  return row;
}

export async function getExecution(workspaceId, executionId) {
  const row = await loadRow(workspaceId, executionId);
  const [client, project, integration] = await Promise.all([
    row.clientId
      ? getDb()
          .select({ id: clients.id, companyName: clients.companyName })
          .from(clients)
          .where(eq(clients.id, row.clientId))
          .limit(1)
      : [],
    row.projectId
      ? getDb()
          .select({ id: projects.id, name: projects.name })
          .from(projects)
          .where(eq(projects.id, row.projectId))
          .limit(1)
      : [],
    row.integrationId
      ? getDb()
          .select({
            id: integrations.id,
            kind: integrations.kind,
            provider: integrations.provider,
            name: integrations.name,
          })
          .from(integrations)
          .where(eq(integrations.id, row.integrationId))
          .limit(1)
      : [],
  ]);

  const userIds = [row.requestedByUserId, row.approverUserId].filter(Boolean);
  const people = userIds.length
    ? await getDb()
        .select({ id: users.id, name: users.name, email: users.email })
        .from(users)
        .where(inArray(users.id, userIds))
    : [];
  const names = new Map(people.map((person) => [person.id, person.name || person.email]));

  return shapeExecution(row, {
    client: client[0] || null,
    project: project[0] || null,
    integration: integration[0] || null,
    requesterName: row.requestedByUserId ? names.get(row.requestedByUserId) || null : null,
    approverName: row.approverUserId ? names.get(row.approverUserId) || null : null,
  });
}

function shapeExecution(row, extra = {}) {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    clientId: row.clientId,
    projectId: row.projectId,
    integrationId: row.integrationId,
    category: row.category,
    operation: row.operation,
    targetSystem: row.targetSystem,
    payload: row.payload,
    riskLevel: row.riskLevel,
    requiredPermission: row.requiredPermission,
    status: row.status,
    statusLabel: EXECUTION_STATUS_LABELS[row.status],
    requestedByUserId: row.requestedByUserId,
    approverUserId: row.approverUserId,
    decisionNote: row.decisionNote,
    decidedAt: toIso(row.decidedAt),
    queuedAt: toIso(row.queuedAt),
    executionStartedAt: toIso(row.executionStartedAt),
    executedAt: toIso(row.executedAt),
    evidence: row.evidence,
    resultSummary: row.resultSummary,
    failureReason: row.failureReason,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
    ...extra,
  };
}

export async function listExecutions(workspaceId, { status, clientId, page = 1, pageSize = 20 }) {
  const db = getDb();
  const filters = [eq(executionRequests.workspaceId, workspaceId)];
  if (status) filters.push(eq(executionRequests.status, status));
  if (clientId) filters.push(eq(executionRequests.clientId, clientId));
  const where = and(...filters);

  const [rows, totals] = await Promise.all([
    db
      .select()
      .from(executionRequests)
      .where(where)
      .orderBy(desc(executionRequests.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ total: count() }).from(executionRequests).where(where),
  ]);

  return {
    executions: rows.map((row) => shapeExecution(row)),
    page,
    pageSize,
    total: Number(totals[0]?.total || 0),
  };
}

export async function submitExecution({ workspaceId, userId, executionId }) {
  const row = await loadRow(workspaceId, executionId);
  assertTransition(row, 'awaiting_approval');

  const updated = await getDb()
    .update(executionRequests)
    .set({ status: 'awaiting_approval', updatedAt: new Date() })
    .where(eq(executionRequests.id, row.id))
    .returning();

  await recordAudit({
    workspaceId,
    actorUserId: userId,
    action: 'execution.submit',
    resourceType: 'execution_request',
    resourceId: row.id,
    metadata: { riskLevel: row.riskLevel, operation: row.operation },
  });

  return getExecution(workspaceId, updated[0].id);
}

// Pure rule kept separate so it can be unit tested and reused by the UI.
export function canDecideExecution({ actorUserId, actorRole, row }) {
  if (row.status !== 'awaiting_approval') return false;
  if (actorUserId && actorUserId === row.requestedByUserId) return false;
  if (
    (row.riskLevel === 'high' || row.riskLevel === 'critical') &&
    !['owner', 'admin'].includes(actorRole)
  ) {
    return false;
  }
  return true;
}

export async function decideExecution({
  workspaceId,
  userId,
  actorRole,
  executionId,
  decision,
  note,
}) {
  const row = await loadRow(workspaceId, executionId);
  if (row.status !== 'awaiting_approval') {
    throw new ApiError(
      409,
      'ALREADY_DECIDED',
      'This request is no longer awaiting a decision.',
    );
  }
  if (userId === row.requestedByUserId) {
    throw new ApiError(
      403,
      'SELF_APPROVAL_FORBIDDEN',
      'You cannot approve or reject your own execution request.',
    );
  }
  if (
    (row.riskLevel === 'high' || row.riskLevel === 'critical') &&
    !['owner', 'admin'].includes(actorRole)
  ) {
    throw new ApiError(
      403,
      'FORBIDDEN',
      'High-risk executions require an owner or admin decision.',
    );
  }

  const nextStatus = decision === 'approved' ? 'approved' : 'rejected';
  const updated = await getDb()
    .update(executionRequests)
    .set({
      status: nextStatus,
      approverUserId: userId,
      decisionNote: note || null,
      decidedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(executionRequests.id, row.id))
    .returning();

  await recordAudit({
    workspaceId,
    actorUserId: userId,
    action: decision === 'approved' ? 'execution.approve' : 'execution.reject',
    resourceType: 'execution_request',
    resourceId: row.id,
    metadata: { riskLevel: row.riskLevel, operation: row.operation },
  });

  return getExecution(workspaceId, updated[0].id);
}

export async function cancelExecution({
  workspaceId,
  userId,
  actorRole,
  executionId,
}) {
  const row = await loadRow(workspaceId, executionId);
  if (!['proposed', 'awaiting_approval', 'approved', 'queued', 'failed'].includes(row.status)) {
    throw new ApiError(
      409,
      'INVALID_STATE',
      'This request can no longer be cancelled.',
    );
  }
  const isRequester = row.requestedByUserId && row.requestedByUserId === userId;
  if (!isRequester && !hasPermission(actorRole, 'executions.approve')) {
    throw new ApiError(403, 'FORBIDDEN', 'You cannot cancel this request.');
  }

  const updated = await getDb()
    .update(executionRequests)
    .set({ status: 'cancelled', updatedAt: new Date() })
    .where(eq(executionRequests.id, row.id))
    .returning();

  await recordAudit({
    workspaceId,
    actorUserId: userId,
    action: 'execution.cancel',
    resourceType: 'execution_request',
    resourceId: row.id,
    metadata: { previousStatus: row.status },
  });

  return getExecution(workspaceId, updated[0].id);
}

export async function executeExecution({
  workspaceId,
  userId,
  actorRole,
  executionId,
  enqueue = enqueueExecution,
}) {
  const row = await loadRow(workspaceId, executionId);

  // Idempotent: a repeated call returns the current state instead of queueing
  // a second external action.
  if (['queued', 'executing', 'completed'].includes(row.status)) {
    return getExecution(workspaceId, row.id);
  }

  if (row.status !== 'approved' && row.status !== 'failed') {
    throw new ApiError(
      409,
      'APPROVAL_REQUIRED',
      'This request must be approved before it can execute.',
    );
  }

  // Authorization for execution is independent of the approval decision.
  if (!hasPermission(actorRole, row.requiredPermission)) {
    throw new ApiError(
      403,
      'FORBIDDEN',
      'Your role does not hold the permission this action requires.',
    );
  }

  if (row.integrationId) {
    await assertIntegrationAuthorized(workspaceId, row.integrationId);
  }

  if (row.category !== 'internal_record' && !row.integrationId) {
    throw new ApiError(
      409,
      'INTEGRATION_NOT_CONFIGURED',
      'External actions stay disabled without a configured integration.',
    );
  }

  const updated = await getDb()
    .update(executionRequests)
    .set({
      status: 'queued',
      queuedAt: new Date(),
      failureReason: null,
      updatedAt: new Date(),
    })
    .where(eq(executionRequests.id, row.id))
    .returning();

  await recordAudit({
    workspaceId,
    actorUserId: userId,
    action: 'execution.execute',
    resourceType: 'execution_request',
    resourceId: row.id,
    metadata: { mode: 'mock', operation: row.operation },
  });

  try {
    // Always the labelled mock path: no network call or credential is used.
    await enqueue(row.id);
  } catch {
    await getDb()
      .update(executionRequests)
      .set({
        status: 'approved',
        failureReason: 'The worker queue is unavailable. Try again when it is running.',
        updatedAt: new Date(),
      })
      .where(eq(executionRequests.id, row.id));
    throw new ApiError(
      503,
      'WORKER_UNAVAILABLE',
      'The worker queue is unavailable. The request stays approved so it can be retried.',
    );
  }

  return getExecution(workspaceId, updated[0].id);
}

// Worker entry point. Approval is not execution success: only this function
// moves a queued request to completed, and it records its own evidence.
export async function processExecutionJob(executionRequestId) {
  const rows = await getDb()
    .select()
    .from(executionRequests)
    .where(eq(executionRequests.id, executionRequestId))
    .limit(1);
  const row = rows[0];
  if (!row) return { status: 'skipped', reason: 'missing-request' };
  if (!['queued', 'executing'].includes(row.status)) {
    // Cancelled requests are never picked up later.
    return { status: 'skipped', reason: `not-queued:${row.status}` };
  }

  await getDb()
    .update(executionRequests)
    .set({
      status: 'executing',
      executionStartedAt: row.executionStartedAt || new Date(),
      updatedAt: new Date(),
    })
    .where(eq(executionRequests.id, row.id));

  try {
    let kind = 'internal_record';
    if (row.integrationId) {
      const integration = await getDb()
        .select({ kind: integrations.kind })
        .from(integrations)
        .where(eq(integrations.id, row.integrationId))
        .limit(1);
      kind = integration[0]?.kind || 'internal_record';
    }

    const adapter = getMockAdapter(kind);
    const method =
      adapter.methods[
        kind === 'cms'
          ? 'submitPublishingRequest'
          : kind === 'email'
            ? 'prepareNotification'
            : kind === 'social'
              ? 'submitPost'
              : kind === 'lead_source' || kind === 'webhook'
                ? 'receiveEvent'
                : Object.keys(adapter.methods)[0]
      ];
    const result = typeof method === 'function' ? await method(row.payload || {}) : null;

    const evidence = `mock-adapter:${kind}:${result?.inputDigest || 'none'}`;
    const resultSummary = result?.summary || `Mock ${kind} execution recorded.`;

    await getDb()
      .update(executionRequests)
      .set({
        status: 'completed',
        executedAt: new Date(),
        evidence,
        resultSummary,
        failureReason: null,
        updatedAt: new Date(),
      })
      .where(eq(executionRequests.id, row.id));

    await recordAudit({
      workspaceId: row.workspaceId,
      actorUserId: row.requestedByUserId,
      action: 'execution.complete',
      resourceType: 'execution_request',
      resourceId: row.id,
      metadata: {
        mode: 'mock',
        kind,
        operation: row.operation,
        evidence,
      },
    });

    return { status: 'completed', evidence };
  } catch (error) {
    const message = 'The mock execution could not be completed.';
    await getDb()
      .update(executionRequests)
      .set({
        status: 'failed',
        failureReason: message,
        updatedAt: new Date(),
      })
      .where(eq(executionRequests.id, row.id));

    await recordAudit({
      workspaceId: row.workspaceId,
      action: 'execution.fail',
      resourceType: 'execution_request',
      resourceId: row.id,
      success: false,
      metadata: { error: error?.name || 'Error' },
    });

    return { status: 'failed', reason: message };
  }
}

export const OPEN_EXECUTION_STATUSES = ACTIVE_STATUSES;
