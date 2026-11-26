import { and, count, desc, eq, inArray } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { approvals, executionRequests, workflowRuns } from '@/db/schema';
import { getQueueCounts } from '@/lib/ai/queue';
import { checkAiWorker } from '@/lib/ai/worker-health';
import { WORKFLOW_LABELS } from '@/lib/automation/constants';
import { getIntegrationOverview } from './service';

function toIso(value) {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

async function safeCount(queryPromise) {
  try {
    const rows = await queryPromise;
    return Number(rows[0]?.value || 0);
  } catch {
    return 0;
  }
}

export async function getOperationsOverview(
  workspaceId,
  { queueCounts = getQueueCounts, workerHealth = checkAiWorker } = {},
) {
  const db = getDb();

  const integrationOverview = await getIntegrationOverview(workspaceId).catch(() => ({
    summary: { total: 0, configured: 0, not_configured: 0, error: 0, disconnected: 0 },
    integrations: [],
    recentEvents: [],
    failedEvents: [],
    recentWebhooks: [],
    webhookSecretConfigured: false,
  }));

  const [
    pendingApprovals,
    awaitingExecution,
    executing,
    failedExecutions,
    queuedRuns,
    runningRuns,
    failedRuns,
    recentExecutions,
    recentRuns,
  ] = await Promise.all([
    safeCount(
      db
        .select({ value: count() })
        .from(approvals)
        .where(and(eq(approvals.workspaceId, workspaceId), eq(approvals.status, 'pending'))),
    ),
    safeCount(
      db
        .select({ value: count() })
        .from(executionRequests)
        .where(
          and(
            eq(executionRequests.workspaceId, workspaceId),
            eq(executionRequests.status, 'awaiting_approval'),
          ),
        ),
    ),
    safeCount(
      db
        .select({ value: count() })
        .from(executionRequests)
        .where(
          and(
            eq(executionRequests.workspaceId, workspaceId),
            inArray(executionRequests.status, ['queued', 'executing']),
          ),
        ),
    ),
    safeCount(
      db
        .select({ value: count() })
        .from(executionRequests)
        .where(
          and(
            eq(executionRequests.workspaceId, workspaceId),
            eq(executionRequests.status, 'failed'),
          ),
        ),
    ),
    safeCount(
      db
        .select({ value: count() })
        .from(workflowRuns)
        .where(and(eq(workflowRuns.workspaceId, workspaceId), eq(workflowRuns.status, 'queued'))),
    ),
    safeCount(
      db
        .select({ value: count() })
        .from(workflowRuns)
        .where(and(eq(workflowRuns.workspaceId, workspaceId), eq(workflowRuns.status, 'running'))),
    ),
    safeCount(
      db
        .select({ value: count() })
        .from(workflowRuns)
        .where(and(eq(workflowRuns.workspaceId, workspaceId), eq(workflowRuns.status, 'failed'))),
    ),
    db
      .select()
      .from(executionRequests)
      .where(eq(executionRequests.workspaceId, workspaceId))
      .orderBy(desc(executionRequests.createdAt))
      .limit(10)
      .catch(() => []),
    db
      .select()
      .from(workflowRuns)
      .where(eq(workflowRuns.workspaceId, workspaceId))
      .orderBy(desc(workflowRuns.createdAt))
      .limit(10)
      .catch(() => []),
  ]);

  let worker = { status: 'unavailable' };
  try {
    worker = await workerHealth();
  } catch {
    worker = { status: 'unavailable' };
  }

  let queue = null;
  try {
    queue = await queueCounts();
  } catch {
    queue = null;
  }

  return {
    integrations: integrationOverview.summary,
    integrationRows: integrationOverview.integrations,
    failedSyncEvents: integrationOverview.failedEvents,
    recentSyncEvents: integrationOverview.recentEvents,
    recentWebhooks: integrationOverview.recentWebhooks,
    webhookSecretConfigured: integrationOverview.webhookSecretConfigured,
    approvals: { pendingAgentRuns: pendingApprovals },
    executions: {
      awaitingApproval: awaitingExecution,
      active: executing,
      failed: failedExecutions,
      recent: recentExecutions.map((row) => ({
        id: row.id,
        category: row.category,
        operation: row.operation,
        targetSystem: row.targetSystem,
        status: row.status,
        riskLevel: row.riskLevel,
        createdAt: toIso(row.createdAt),
        executedAt: toIso(row.executedAt),
      })),
    },
    automations: {
      queued: queuedRuns,
      running: runningRuns,
      failed: failedRuns,
      recent: recentRuns.map((row) => ({
        id: row.id,
        workflowKey: row.workflowKey,
        label: WORKFLOW_LABELS[row.workflowKey] || row.workflowKey,
        status: row.status,
        attempts: row.attempts,
        lastError: row.lastError,
        createdAt: toIso(row.createdAt),
        finishedAt: toIso(row.finishedAt),
      })),
    },
    worker,
    queue,
  };
}
