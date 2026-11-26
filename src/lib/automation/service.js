import { and, count, desc, eq, lt, sql } from 'drizzle-orm';
import { getDb } from '@/db/client';
import {
  approvals,
  clients,
  executionRequests,
  integrations,
  marketingCampaigns,
  marketingContentItems,
  marketingMetrics,
  marketingProfiles,
  marketingReports,
  marketingWebsiteProposals,
  projectDeliverables,
  projectMilestones,
  projectTasks,
  projects,
  serviceEngagements,
  webhookEvents,
  workflowRunSteps,
  workflowRuns,
} from '@/db/schema';
import { ApiError } from '@/lib/api-error';
import { recordAudit } from '@/lib/audit';
import {
  WORKFLOW_JOB_MAX_ATTEMPTS,
  enqueueWorkflowRun,
} from '@/lib/ai/queue';
import {
  getWorkflowDefinition,
  WORKFLOW_DEFINITIONS,
} from './constants';

export function workflowNotFound() {
  return new ApiError(
    404,
    'NOT_FOUND',
    'That automation run could not be found in this workspace.',
  );
}

function toIso(value) {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

async function assertClientBelongs(workspaceId, clientId) {
  if (!clientId) return null;
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
  return rows[0];
}

async function assertProjectBelongs(workspaceId, projectId) {
  if (!projectId) return null;
  const rows = await getDb()
    .select({ id: projects.id, name: projects.name, clientId: projects.clientId })
    .from(projects)
    .where(and(eq(projects.workspaceId, workspaceId), eq(projects.id, projectId)))
    .limit(1);
  if (!rows[0]) {
    throw new ApiError(422, 'PROJECT_NOT_FOUND', 'Choose a project from this workspace.', {
      projectId: 'Choose a project from this workspace.',
    });
  }
  return rows[0];
}

export function listWorkflowDefinitions() {
  return WORKFLOW_DEFINITIONS.map((item) => ({ ...item }));
}

export async function startWorkflowRun({
  workspaceId,
  userId,
  workflowKey,
  clientId = null,
  projectId = null,
  input = null,
  idempotencyKey = null,
  enqueue = enqueueWorkflowRun,
}) {
  const definition = getWorkflowDefinition(workflowKey);
  if (!definition) {
    throw new ApiError(422, 'VALIDATION_FAILED', 'Choose a known workflow.', {
      workflowKey: 'That workflow is not supported by this build.',
    });
  }
  const client = await assertClientBelongs(workspaceId, clientId);
  const project = await assertProjectBelongs(workspaceId, projectId);
  if (definition.requiresClient && !client) {
    throw new ApiError(422, 'VALIDATION_FAILED', 'This workflow needs a client.', {
      clientId: 'Choose a client.',
    });
  }
  if (definition.requiresProject && !project) {
    throw new ApiError(422, 'VALIDATION_FAILED', 'This workflow needs a project.', {
      projectId: 'Choose a project.',
    });
  }

  const db = getDb();
  try {
    const inserted = await db
      .insert(workflowRuns)
      .values({
        workspaceId,
        workflowKey,
        trigger: 'manual',
        status: 'queued',
        input: {
          ...(input || {}),
          clientId: clientId || null,
          projectId: projectId || null,
        },
        idempotencyKey,
        startedByUserId: userId,
      })
      .returning();

    await recordAudit({
      workspaceId,
      actorUserId: userId,
      action: 'automation.start',
      resourceType: 'workflow_run',
      resourceId: inserted[0].id,
      metadata: { workflowKey, clientId, projectId },
    });

    try {
      await enqueue(inserted[0].id);
    } catch {
      await db
        .update(workflowRuns)
        .set({
          status: 'failed',
          lastError: 'The worker queue is unavailable.',
          finishedAt: new Date(),
        })
        .where(eq(workflowRuns.id, inserted[0].id));
      throw new ApiError(
        503,
        'WORKER_UNAVAILABLE',
        'The worker queue is unavailable. The automation was recorded but did not start.',
      );
    }

    return getWorkflowRun(workspaceId, inserted[0].id);
  } catch (error) {
    if (error?.code === '23505' && idempotencyKey) {
      const existing = await db
        .select()
        .from(workflowRuns)
        .where(
          and(
            eq(workflowRuns.workspaceId, workspaceId),
            eq(workflowRuns.idempotencyKey, idempotencyKey),
          ),
        )
        .limit(1);
      if (existing[0]) return getWorkflowRun(workspaceId, existing[0].id);
    }
    throw error;
  }
}

async function loadRun(workspaceId, runId) {
  const rows = await getDb()
    .select()
    .from(workflowRuns)
    .where(and(eq(workflowRuns.workspaceId, workspaceId), eq(workflowRuns.id, runId)))
    .limit(1);
  const row = rows[0];
  if (!row) throw workflowNotFound();
  return row;
}

export async function getWorkflowRun(workspaceId, runId) {
  const row = await loadRun(workspaceId, runId);
  const steps = await getDb()
    .select()
    .from(workflowRunSteps)
    .where(eq(workflowRunSteps.runId, row.id))
    .orderBy(workflowRunSteps.createdAt);

  return {
    id: row.id,
    workflowKey: row.workflowKey,
    trigger: row.trigger,
    status: row.status,
    input: row.input,
    result: row.result,
    attempts: row.attempts,
    lastError: row.lastError,
    startedByUserId: row.startedByUserId,
    startedAt: toIso(row.startedAt),
    finishedAt: toIso(row.finishedAt),
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
    steps: steps.map((step) => ({
      id: step.id,
      stepKey: step.stepKey,
      label: step.label,
      status: step.status,
      detail: step.detail,
      startedAt: toIso(step.startedAt),
      finishedAt: toIso(step.finishedAt),
    })),
  };
}

export async function listWorkflowRuns(workspaceId, { status, page = 1, pageSize = 20 }) {
  const db = getDb();
  const filters = [eq(workflowRuns.workspaceId, workspaceId)];
  if (status) filters.push(eq(workflowRuns.status, status));
  const where = and(...filters);

  const [rows, totals] = await Promise.all([
    db
      .select()
      .from(workflowRuns)
      .where(where)
      .orderBy(desc(workflowRuns.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ total: count() }).from(workflowRuns).where(where),
  ]);

  return {
    runs: rows.map((row) => ({
      id: row.id,
      workflowKey: row.workflowKey,
      trigger: row.trigger,
      status: row.status,
      attempts: row.attempts,
      lastError: row.lastError,
      input: row.input,
      result: row.result,
      createdAt: toIso(row.createdAt),
      startedAt: toIso(row.startedAt),
      finishedAt: toIso(row.finishedAt),
    })),
    page,
    pageSize,
    total: Number(totals[0]?.total || 0),
  };
}

export async function cancelWorkflowRun({ workspaceId, userId, runId }) {
  const row = await loadRun(workspaceId, runId);
  if (row.status !== 'queued') {
    throw new ApiError(
      409,
      'INVALID_STATE',
      'Only a queued automation can be cancelled.',
    );
  }
  const updated = await getDb()
    .update(workflowRuns)
    .set({ status: 'cancelled', finishedAt: new Date() })
    .where(eq(workflowRuns.id, row.id))
    .returning();

  await recordAudit({
    workspaceId,
    actorUserId: userId,
    action: 'automation.cancel',
    resourceType: 'workflow_run',
    resourceId: row.id,
    metadata: { workflowKey: row.workflowKey },
  });

  return getWorkflowRun(workspaceId, updated[0].id);
}

// ---------------------------------------------------------------------------
// Step readers. Every query is workspace-scoped and read-only; no external
// message, publish or spend can happen here.
// ---------------------------------------------------------------------------

async function scalar(queryPromise) {
  const rows = await queryPromise;
  return Number(rows[0]?.value || 0);
}

async function stepsFor(definition, context) {
  const { workspaceId, clientId, projectId } = context;
  const db = getDb();
  const clientFilter = clientId ? eq(marketingProfiles.clientId, clientId) : null;
  const steps = [];

  switch (definition.key) {
    case 'new_client_onboarding': {
      const profile = clientFilter
        ? await db
            .select({ id: marketingProfiles.id, status: marketingProfiles.status })
            .from(marketingProfiles)
            .where(and(eq(marketingProfiles.workspaceId, workspaceId), clientFilter))
            .limit(1)
        : [];
      const engagements = await scalar(
        db
          .select({ value: count() })
          .from(serviceEngagements)
          .where(
            and(
              eq(serviceEngagements.workspaceId, workspaceId),
              eq(serviceEngagements.clientId, clientId),
              eq(serviceEngagements.status, 'active'),
            ),
          ),
      );
      const tasks = await scalar(
        db
          .select({ value: count() })
          .from(projectTasks)
          .where(
            and(
              eq(projectTasks.workspaceId, workspaceId),
              sql`${projectTasks.status} not in ('completed','cancelled')`,
            ),
          ),
      );
      steps.push({ stepKey: 'client_profile', label: definition.steps[0].label, detail: { hasMarketingProfile: Boolean(profile[0]) } });
      steps.push({ stepKey: 'engagements', label: definition.steps[1].label, detail: { activeEngagements: engagements } });
      steps.push({ stepKey: 'open_tasks', label: definition.steps[2].label, detail: { openTasks: tasks } });
      steps.push({
        stepKey: 'marketing_profile',
        label: definition.steps[3].label,
        detail: { marketingStatus: profile[0]?.status || 'missing' },
      });
      break;
    }

    case 'website_audit_followup': {
      const findings = await scalar(
        db
          .select({ value: count() })
          .from(marketingWebsiteProposals)
          .where(
            and(
              eq(marketingWebsiteProposals.workspaceId, workspaceId),
              eq(marketingWebsiteProposals.clientId, clientId),
              sql`${marketingWebsiteProposals.status} in ('draft','awaiting_review')`,
            ),
          ),
      );
      const proposals = await scalar(
        db
          .select({ value: count() })
          .from(marketingWebsiteProposals)
          .where(
            and(
              eq(marketingWebsiteProposals.workspaceId, workspaceId),
              eq(marketingWebsiteProposals.clientId, clientId),
            ),
          ),
      );
      steps.push({ stepKey: 'latest_audit', label: definition.steps[0].label, detail: { proposalsTotal: proposals } });
      steps.push({ stepKey: 'open_findings', label: definition.steps[1].label, detail: { pendingProposals: findings } });
      steps.push({ stepKey: 'followup_tasks', label: definition.steps[2].label, detail: { note: 'Task creation stays manual.' } });
      break;
    }

    case 'seo_task_creation': {
      const openTasks = await scalar(
        db
          .select({ value: count() })
          .from(projectTasks)
          .where(
            and(
              eq(projectTasks.workspaceId, workspaceId),
              sql`${projectTasks.status} not in ('completed','cancelled')`,
            ),
          ),
      );
      const overdue = await scalar(
        db
          .select({ value: count() })
          .from(projectTasks)
          .where(
            and(
              eq(projectTasks.workspaceId, workspaceId),
              sql`${projectTasks.status} not in ('completed','cancelled')`,
              lt(projectTasks.dueDate, new Date()),
            ),
          ),
      );
      steps.push({ stepKey: 'marketing_tasks', label: definition.steps[0].label, detail: { openTasks } });
      steps.push({ stepKey: 'findings_without_tasks', label: definition.steps[1].label, detail: { note: 'Findings without tasks are reported, never auto-created.' } });
      steps.push({ stepKey: 'overdue', label: definition.steps[2].label, detail: { overdueTasks: overdue } });
      break;
    }

    case 'content_approval_reminder': {
      const awaiting = await scalar(
        db
          .select({ value: count() })
          .from(marketingContentItems)
          .where(
            and(
              eq(marketingContentItems.workspaceId, workspaceId),
              eq(marketingContentItems.status, 'in_review'),
            ),
          ),
      );
      const staleBefore = new Date(Date.now() - 7 * 86_400_000);
      const stale = await scalar(
        db
          .select({ value: count() })
          .from(marketingContentItems)
          .where(
            and(
              eq(marketingContentItems.workspaceId, workspaceId),
              eq(marketingContentItems.status, 'draft'),
              lt(marketingContentItems.updatedAt, staleBefore),
            ),
          ),
      );
      steps.push({ stepKey: 'awaiting_review', label: definition.steps[0].label, detail: { awaitingReview: awaiting } });
      steps.push({ stepKey: 'stale_drafts', label: definition.steps[1].label, detail: { staleDrafts: stale } });
      steps.push({ stepKey: 'reminder_ready', label: definition.steps[2].label, detail: { reminder: 'Prepared for manual review; no message was sent.' } });
      break;
    }

    case 'marketing_report_preparation': {
      const campaigns = await scalar(
        db
          .select({ value: count() })
          .from(marketingCampaigns)
          .where(
            and(
              eq(marketingCampaigns.workspaceId, workspaceId),
              clientId ? eq(marketingCampaigns.clientId, clientId) : undefined,
            ),
          ),
      );
      const metrics = await scalar(
        db
          .select({ value: count() })
          .from(marketingMetrics)
          .where(
            and(
              eq(marketingMetrics.workspaceId, workspaceId),
              clientId ? eq(marketingMetrics.clientId, clientId) : undefined,
            ),
          ),
      );
      const reports = await scalar(
        db
          .select({ value: count() })
          .from(marketingReports)
          .where(
            and(
              eq(marketingReports.workspaceId, workspaceId),
              clientId ? eq(marketingReports.clientId, clientId) : undefined,
            ),
          ),
      );
      steps.push({ stepKey: 'campaigns', label: definition.steps[0].label, detail: { campaigns } });
      steps.push({ stepKey: 'metrics', label: definition.steps[1].label, detail: { recordedMetrics: metrics } });
      steps.push({ stepKey: 'reports', label: definition.steps[2].label, detail: { reports } });
      break;
    }

    case 'website_improvement_review': {
      const pending = await scalar(
        db
          .select({ value: count() })
          .from(marketingWebsiteProposals)
          .where(
            and(
              eq(marketingWebsiteProposals.workspaceId, workspaceId),
              eq(marketingWebsiteProposals.clientId, clientId),
              eq(marketingWebsiteProposals.status, 'awaiting_review'),
            ),
          ),
      );
      const executed = await scalar(
        db
          .select({ value: count() })
          .from(marketingWebsiteProposals)
          .where(
            and(
              eq(marketingWebsiteProposals.workspaceId, workspaceId),
              eq(marketingWebsiteProposals.clientId, clientId),
              eq(marketingWebsiteProposals.status, 'executed'),
            ),
          ),
      );
      const missingEvidence = await scalar(
        db
          .select({ value: count() })
          .from(marketingWebsiteProposals)
          .where(
            and(
              eq(marketingWebsiteProposals.workspaceId, workspaceId),
              eq(marketingWebsiteProposals.clientId, clientId),
              eq(marketingWebsiteProposals.status, 'executed'),
              sql`${marketingWebsiteProposals.executionEvidence} is null`,
            ),
          ),
      );
      steps.push({ stepKey: 'pending_proposals', label: definition.steps[0].label, detail: { pending } });
      steps.push({ stepKey: 'executed_proposals', label: definition.steps[1].label, detail: { executed } });
      steps.push({ stepKey: 'missing_evidence', label: definition.steps[2].label, detail: { missingEvidence } });
      break;
    }

    case 'pending_approval_reminder': {
      const agentApprovals = await scalar(
        db
          .select({ value: count() })
          .from(approvals)
          .where(
            and(
              eq(approvals.workspaceId, workspaceId),
              eq(approvals.status, 'pending'),
            ),
          ),
      );
      const executionApprovals = await scalar(
        db
          .select({ value: count() })
          .from(executionRequests)
          .where(
            and(
              eq(executionRequests.workspaceId, workspaceId),
              eq(executionRequests.status, 'awaiting_approval'),
            ),
          ),
      );
      const reviews = await scalar(
        db
          .select({ value: count() })
          .from(marketingContentItems)
          .where(
            and(
              eq(marketingContentItems.workspaceId, workspaceId),
              eq(marketingContentItems.status, 'in_review'),
            ),
          ),
      );
      steps.push({ stepKey: 'agent_approvals', label: definition.steps[0].label, detail: { pendingApprovals: agentApprovals } });
      steps.push({ stepKey: 'execution_approvals', label: definition.steps[1].label, detail: { pendingExecutions: executionApprovals } });
      steps.push({ stepKey: 'marketing_reviews', label: definition.steps[2].label, detail: { contentInReview: reviews } });
      break;
    }

    case 'failed_integration_notification': {
      const failedIntegrations = await scalar(
        db
          .select({ value: count() })
          .from(integrations)
          .where(
            and(
              eq(integrations.workspaceId, workspaceId),
              eq(integrations.status, 'error'),
            ),
          ),
      );
      const failedWebhooks = await scalar(
        db
          .select({ value: count() })
          .from(webhookEvents)
          .where(
            and(
              eq(webhookEvents.workspaceId, workspaceId),
              eq(webhookEvents.status, 'failed'),
            ),
          ),
      );
      steps.push({ stepKey: 'integration_errors', label: definition.steps[0].label, detail: { failedIntegrations } });
      steps.push({ stepKey: 'failed_webhooks', label: definition.steps[1].label, detail: { failedWebhooks } });
      steps.push({ stepKey: 'notification_ready', label: definition.steps[2].label, detail: { reminder: 'Prepared internally; no external message was sent.' } });
      break;
    }

    case 'project_progress_summary': {
      const project = await db
        .select({ id: projects.id, name: projects.name, status: projects.status })
        .from(projects)
        .where(and(eq(projects.workspaceId, workspaceId), eq(projects.id, projectId)))
        .limit(1);
      const milestones = await scalar(
        db
          .select({ value: count() })
          .from(projectMilestones)
          .where(
            and(
              eq(projectMilestones.workspaceId, workspaceId),
              eq(projectMilestones.projectId, projectId),
              sql`${projectMilestones.completionDate} is null`,
            ),
          ),
      );
      const deliverables = await scalar(
        db
          .select({ value: count() })
          .from(projectDeliverables)
          .where(
            and(
              eq(projectDeliverables.workspaceId, workspaceId),
              eq(projectDeliverables.projectId, projectId),
              sql`${projectDeliverables.completionDate} is null`,
            ),
          ),
      );
      const openTasks = await scalar(
        db
          .select({ value: count() })
          .from(projectTasks)
          .where(
            and(
              eq(projectTasks.workspaceId, workspaceId),
              eq(projectTasks.projectId, projectId),
              sql`${projectTasks.status} not in ('completed','cancelled')`,
            ),
          ),
      );
      steps.push({ stepKey: 'project_status', label: definition.steps[0].label, detail: { status: project[0]?.status || 'unknown' } });
      steps.push({ stepKey: 'milestones', label: definition.steps[1].label, detail: { openMilestones: milestones, openDeliverables: deliverables } });
      steps.push({ stepKey: 'open_tasks', label: definition.steps[2].label, detail: { openTasks } });
      break;
    }

    default:
      throw new ApiError(422, 'VALIDATION_FAILED', 'Unknown workflow.');
  }

  return steps;
}

// Worker entry point. Cancelled runs are never executed; unexpected failures
// retry a bounded number of times and then settle as failed.
export async function processWorkflowJob(runId) {
  const rows = await getDb()
    .select()
    .from(workflowRuns)
    .where(eq(workflowRuns.id, runId))
    .limit(1);
  const run = rows[0];
  if (!run) return { status: 'skipped', reason: 'missing-run' };
  if (['cancelled', 'completed'].includes(run.status)) {
    return { status: 'skipped', reason: `settled:${run.status}` };
  }

  const definition = getWorkflowDefinition(run.workflowKey);
  if (!definition) {
    await getDb()
      .update(workflowRuns)
      .set({ status: 'failed', lastError: 'Unknown workflow.', finishedAt: new Date() })
      .where(eq(workflowRuns.id, run.id));
    return { status: 'failed', reason: 'unknown-workflow' };
  }

  const attempts = run.attempts + 1;
  await getDb()
    .update(workflowRuns)
    .set({ status: 'running', attempts, startedAt: run.startedAt || new Date() })
    .where(eq(workflowRuns.id, run.id));

  try {
    const steps = await stepsFor(definition, {
      workspaceId: run.workspaceId,
      clientId: run.input?.clientId || null,
      projectId: run.input?.projectId || null,
    });

    if (steps.length) {
      await getDb().insert(workflowRunSteps).values(
        steps.map((step) => ({
          workspaceId: run.workspaceId,
          runId: run.id,
          stepKey: step.stepKey,
          label: step.label,
          status: 'completed',
          detail: step.detail || null,
          startedAt: new Date(),
          finishedAt: new Date(),
        })),
      );
    }

    await getDb()
      .update(workflowRuns)
      .set({
        status: 'completed',
        result: { steps: steps.length },
        lastError: null,
        finishedAt: new Date(),
      })
      .where(eq(workflowRuns.id, run.id));

    await recordAudit({
      workspaceId: run.workspaceId,
      actorUserId: run.startedByUserId,
      action: 'automation.complete',
      resourceType: 'workflow_run',
      resourceId: run.id,
      metadata: { workflowKey: run.workflowKey, steps: steps.length },
    });

    return { status: 'completed', steps: steps.length };
  } catch (error) {
    const message = 'The automation step could not be completed.';
    if (attempts < WORKFLOW_JOB_MAX_ATTEMPTS) {
      await getDb()
        .update(workflowRuns)
        .set({ status: 'queued', lastError: message })
        .where(eq(workflowRuns.id, run.id));
      throw error;
    }

    await getDb()
      .update(workflowRuns)
      .set({ status: 'failed', lastError: message, finishedAt: new Date() })
      .where(eq(workflowRuns.id, run.id));

    await recordAudit({
      workspaceId: run.workspaceId,
      actorUserId: run.startedByUserId,
      action: 'automation.fail',
      resourceType: 'workflow_run',
      resourceId: run.id,
      success: false,
      metadata: { workflowKey: run.workflowKey, error: error?.name || 'Error' },
    });

    return { status: 'failed', reason: message };
  }
}
