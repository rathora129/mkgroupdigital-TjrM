import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {
  sql,
  query,
  closeDatabase,
  assertDisposableTestUrl,
} from './support/db.mjs';

// Phase 2H-H — the end-to-end local operational workflow. Every step runs
// against a disposable *_test database. No live website, CMS, ad account,
// social account, mailbox or AI provider is contacted: the audit is a manual
// capture, the "worker" is invoked directly, and every queue call is a stub.
const TEST_DATABASE_URL = process.env.PHASE2A_TEST_DATABASE_URL || '';
const skip = TEST_DATABASE_URL
  ? false
  : 'set PHASE2A_TEST_DATABASE_URL to a disposable, migrated database';

if (TEST_DATABASE_URL) {
  assertDisposableTestUrl(TEST_DATABASE_URL);
  process.env.DATABASE_URL = TEST_DATABASE_URL;
}

const clientsService = await import('@/lib/clients/service');
const clientValidation = await import('@/lib/clients/validation');
const marketing = await import('@/lib/marketing/service');
const marketingValidation = await import('@/lib/marketing/validation');
const contentService = await import('@/lib/marketing/content');
const websiteService = await import('@/lib/marketing/website');
const seoService = await import('@/lib/marketing/seo');
const reporting = await import('@/lib/marketing/reporting');
const auditsService = await import('@/lib/audits/service');
const auditsValidation = await import('@/lib/audits/validation');
const integrationsService = await import('@/lib/integrations/service');
const executionService = await import('@/lib/integrations/execution');
const integrationValidation = await import('@/lib/integrations/validation');
const webhooks = await import('@/lib/integrations/webhooks');
const automationService = await import('@/lib/automation/service');
const monitoring = await import('@/lib/integrations/monitoring');
const worker = await import('@/lib/integrations/worker');
const queue = await import('@/lib/ai/queue');
const { hasPermission } = await import('@/lib/auth/permissions');

const WEBHOOK_SECRET = 'phase2h-e2e-webhook-secret';
const previousWebhookSecret = process.env.INTEGRATION_WEBHOOK_SECRET;
process.env.INTEGRATION_WEBHOOK_SECRET = WEBHOOK_SECRET;

after(async () => {
  if (previousWebhookSecret === undefined) delete process.env.INTEGRATION_WEBHOOK_SECRET;
  else process.env.INTEGRATION_WEBHOOK_SECRET = previousWebhookSecret;
  await closeDatabase();
});

function expectCode(code) {
  return (error) => {
    assert.equal(error.code, code, `expected ${code}, received ${error.code}`);
    return true;
  };
}

function fakeEnqueue() {
  const jobs = [];
  const enqueue = async (id) => {
    jobs.push(id);
    return `job-${id.slice(0, 8)}`;
  };
  enqueue.jobs = jobs;
  return enqueue;
}

async function createWorkspace(label) {
  const suffix = randomUUID();
  const [workspace] = await query(sql`
    insert into workspaces (name, slug)
    values (${`Phase 2H ${label}`}, ${`p2h-${label}-${suffix}`})
    returning id
  `);
  const users = {};
  for (const [key, role] of [
    ['owner', 'owner'],
    ['member', 'member'],
  ]) {
    const [user] = await query(sql`
      insert into users (email, name)
      values (${`p2h-${label}-${key}-${suffix}@example.test`}, ${`${key} person`})
      returning id
    `);
    await query(sql`
      insert into workspace_memberships (workspace_id, user_id, role)
      values (${workspace.id}, ${user.id}, ${role})
    `);
    users[key] = user.id;
  }
  return {
    workspaceId: workspace.id,
    ownerId: users.owner,
    memberId: users.member,
    userIds: Object.values(users),
  };
}

async function createFixture() {
  const main = await createWorkspace('main');
  const other = await createWorkspace('other');
  return {
    ...main,
    otherWorkspaceId: other.workspaceId,
    otherOwnerId: other.ownerId,
    otherUserIds: other.userIds,
  };
}

async function cleanup(fixture) {
  await query(sql`
    delete from audit_logs
    where workspace_id in (${fixture.workspaceId}, ${fixture.otherWorkspaceId})
  `);
  await query(sql`
    delete from workspaces
    where id in (${fixture.workspaceId}, ${fixture.otherWorkspaceId})
  `);
  for (const userId of [...fixture.userIds, ...fixture.otherUserIds]) {
    await query(sql`delete from users where id = ${userId}`);
  }
}

async function countLeads(workspaceId) {
  const rows = await query(sql`
    select count(*)::int as total from leads where workspace_id = ${workspaceId}
  `);
  return Number(rows[0]?.total || 0);
}

test('Phase 2H operational workflow runs end to end locally', { skip }, async () => {
  const fixture = await createFixture();
  try {
    // Step 1 — select (create) a client.
    const createdClient = await clientsService.createClient({
      workspaceId: fixture.workspaceId,
      userId: fixture.ownerId,
      data: await clientValidation.clientCreateSchema.validate({
        companyName: `E2E Client ${randomUUID().slice(0, 6)}`,
        email: 'contact@example.test',
        website: 'https://www.example.test',
      }),
    });
    const client = createdClient.client;
    assert.ok(client.id);

    // Step 2 — the client's marketing workspace.
    await marketing.upsertMarketingProfile({
      workspaceId: fixture.workspaceId,
      userId: fixture.ownerId,
      data: await marketingValidation.marketingProfileSchema.validate({
        clientId: client.id,
        industry: 'Dental',
        websiteUrl: 'https://www.example.test',
        selectedServices: ['seo'],
      }),
    });
    const profile = await marketing.getMarketingProfile(fixture.workspaceId, client.id);
    assert.equal(profile.profile.clientId, client.id);

    // A project row is a prerequisite for SEO task conversion. Project
    // creation itself has its own 2D coverage; here it is fixture data.
    const [project] = await query(sql`
      insert into projects (workspace_id, reference, client_id, name, created_by_user_id)
      values (
        ${fixture.workspaceId},
        ${`E2E-${randomUUID().slice(0, 8).toUpperCase()}`},
        ${client.id},
        'E2E delivery project',
        ${fixture.ownerId}
      )
      returning id
    `);

    // Step 3 — website audit. Manual capture records observations without
    // contacting the website (no live crawl).
    const audit = await auditsService.createWebsiteAudit({
      workspaceId: fixture.workspaceId,
      userId: fixture.ownerId,
      data: await auditsValidation.websiteAuditCreateSchema.validate({
        url: 'https://www.example.test',
        clientId: client.id,
        projectId: project.id,
        captureMode: 'manual',
        notes: 'Manual capture for the Phase 2H E2E workflow.',
      }),
    });
    assert.equal(audit.status, 'completed');
    assert.equal(audit.captureMode, 'manual');

    // Step 4 — SEO recommendations (findings).
    const findingResult = await seoService.addAuditFinding({
      workspaceId: fixture.workspaceId,
      userId: fixture.ownerId,
      auditId: audit.id,
      data: {
        category: 'seo',
        severity: 'high',
        code: 'missing_h1',
        title: 'Homepage is missing a descriptive H1',
        description: 'The page has no H1 heading.',
        recommendation: 'Add a single descriptive H1 that matches search intent.',
        sourceType: 'manual',
      },
    });
    const findingId = findingResult.finding.id;
    assert.ok(findingId);

    // Step 5 — convert the recommendation to a task.
    const converted = await seoService.convertFindingToTask({
      workspaceId: fixture.workspaceId,
      userId: fixture.ownerId,
      findingId,
      data: {},
    });
    assert.ok(converted.task.id);
    assert.equal(converted.task.sourceType, 'audit_finding');

    // Step 6 — plan a campaign.
    const campaign = await marketing.createCampaign({
      workspaceId: fixture.workspaceId,
      userId: fixture.ownerId,
      data: await marketingValidation.campaignCreateSchema.validate({
        clientId: client.id,
        name: 'E2E Q4 campaign',
        channel: 'website',
      }),
    });
    assert.equal(campaign.campaign.clientId, client.id);

    // Step 7 — prepare content (local draft, no provider call).
    const content = await contentService.createContentItem({
      workspaceId: fixture.workspaceId,
      userId: fixture.ownerId,
      data: await marketingValidation.contentCreateSchema.validate({
        clientId: client.id,
        campaignId: campaign.campaign.id,
        contentType: 'blog_draft',
        title: 'E2E draft: choosing a dentist',
        body: 'A locally written draft. No AI provider call was made.',
        status: 'draft',
      }),
    });
    const contentId = content.item.id;
    assert.equal(content.item.status, 'draft');

    // Step 8 — submit for review, then approve.
    await contentService.contentAction({
      workspaceId: fixture.workspaceId,
      userId: fixture.ownerId,
      contentId,
      data: { action: 'submit' },
    });
    const approvedContent = await contentService.contentAction({
      workspaceId: fixture.workspaceId,
      userId: fixture.ownerId,
      contentId,
      data: { action: 'approve' },
    });
    assert.equal(approvedContent.item.status, 'approved');

    // Step 9 — website change proposal.
    const page = await websiteService.createWebsitePage({
      workspaceId: fixture.workspaceId,
      userId: fixture.ownerId,
      data: await marketingValidation.websitePageCreateSchema.validate({
        clientId: client.id,
        pageTitle: 'Home',
        pageUrl: 'https://www.example.test',
      }),
    });
    const proposal = await websiteService.createProposal({
      workspaceId: fixture.workspaceId,
      userId: fixture.ownerId,
      data: await marketingValidation.proposalCreateSchema.validate({
        clientId: client.id,
        pageId: page.id,
        title: 'E2E homepage copy update',
        proposedContent: 'A clearer homepage headline for the E2E workflow.',
      }),
    });
    const proposalId = proposal.proposal.id;

    // Step 10 — submit the proposal for review (approval gate).
    await websiteService.proposalAction({
      workspaceId: fixture.workspaceId,
      userId: fixture.ownerId,
      proposalId,
      data: { action: 'submit' },
    });

    // Step 11 — approve, start execution, then record manual evidence.
    await websiteService.proposalAction({
      workspaceId: fixture.workspaceId,
      userId: fixture.ownerId,
      proposalId,
      data: { action: 'approve' },
    });
    await websiteService.proposalAction({
      workspaceId: fixture.workspaceId,
      userId: fixture.ownerId,
      proposalId,
      data: { action: 'start_execution' },
    });
    const executed = await websiteService.proposalAction({
      workspaceId: fixture.workspaceId,
      userId: fixture.ownerId,
      proposalId,
      data: {
        action: 'record_execution',
        evidence: 'Editor applied the copy change manually (E2E evidence).',
      },
    });
    assert.equal(executed.proposal.status, 'executed');
    assert.equal(executed.externalAction, false);

    // Step 12 — an integration registry entry refuses to fake a connection.
    const builtin = await integrationsService.registerIntegration({
      workspaceId: fixture.workspaceId,
      userId: fixture.ownerId,
      kind: 'file_storage',
      provider: 'local_document_store',
    });
    assert.equal(builtin.status, 'configured');
    const cms = await integrationsService.registerIntegration({
      workspaceId: fixture.workspaceId,
      userId: fixture.ownerId,
      kind: 'cms',
      provider: 'wordpress_rest',
      name: 'E2E CMS',
    });
    assert.equal(cms.status, 'not_configured');
    await assert.rejects(
      integrationsService.connectIntegration({
        workspaceId: fixture.workspaceId,
        userId: fixture.ownerId,
        integrationId: cms.id,
      }),
      expectCode('INTEGRATION_NOT_CONFIGURED'),
    );

    // External requests need a configured integration; this one is not.
    await assert.rejects(
      executionService.createExecutionRequest({
        workspaceId: fixture.workspaceId,
        userId: fixture.ownerId,
        input: await integrationValidation.executionCreateSchema.validate({
          category: 'website_publish',
          operation: 'Publish homepage',
          targetSystem: 'CMS',
        }),
      }),
      expectCode('INTEGRATION_REQUIRED'),
    );

    // Step 13 — propose an internal execution request (requester: member).
    const requestInput = await integrationValidation.executionCreateSchema.validate({
      clientId: client.id,
      projectId: project.id,
      category: 'internal_record',
      operation: 'Record the approved website change internally',
      targetSystem: 'internal',
      riskLevel: 'medium',
      requiredPermission: 'marketing.execute',
      payload: { proposalId },
    });
    const request = await executionService.createExecutionRequest({
      workspaceId: fixture.workspaceId,
      userId: fixture.memberId,
      input: requestInput,
    });
    assert.equal(request.status, 'proposed');
    assert.equal(request.requestedByUserId, fixture.memberId);

    // Step 14 — submit for approval, then the owner approves.
    await executionService.submitExecution({
      workspaceId: fixture.workspaceId,
      userId: fixture.memberId,
      executionId: request.id,
    });
    const approved = await executionService.decideExecution({
      workspaceId: fixture.workspaceId,
      userId: fixture.ownerId,
      actorRole: 'owner',
      executionId: request.id,
      decision: 'approved',
    });
    assert.equal(approved.status, 'approved');
    assert.equal(approved.approverUserId, fixture.ownerId);

    // Step 15 — the requester cannot execute: permission is checked
    // independently of the approval.
    await assert.rejects(
      executionService.executeExecution({
        workspaceId: fixture.workspaceId,
        userId: fixture.memberId,
        actorRole: 'member',
        executionId: request.id,
      }),
      expectCode('FORBIDDEN'),
    );

    // Step 16 — the owner executes; the queue is a stub, then the worker
    // handler runs the labelled mock adapter.
    const executionQueue = fakeEnqueue();
    const queued = await executionService.executeExecution({
      workspaceId: fixture.workspaceId,
      userId: fixture.ownerId,
      actorRole: 'owner',
      executionId: request.id,
      enqueue: executionQueue,
    });
    assert.equal(queued.status, 'queued');
    assert.equal(executionQueue.jobs[0], request.id);

    const completed = await executionService.processExecutionJob(request.id);
    assert.equal(completed.status, 'completed');
    assert.match(completed.evidence, /^mock-adapter:internal_record:/);

    // Step 17 — completed evidence is durable and re-execution is idempotent.
    const stored = await executionService.getExecution(fixture.workspaceId, request.id);
    assert.equal(stored.status, 'completed');
    assert.match(stored.evidence, /^mock-adapter:/);
    const again = await executionService.executeExecution({
      workspaceId: fixture.workspaceId,
      userId: fixture.ownerId,
      actorRole: 'owner',
      executionId: request.id,
      enqueue: fakeEnqueue(),
    });
    assert.equal(again.status, 'completed');

    // A rejected request can never execute.
    const rejected = await executionService.createExecutionRequest({
      workspaceId: fixture.workspaceId,
      userId: fixture.memberId,
      input: await integrationValidation.executionCreateSchema.validate({
        category: 'internal_record',
        operation: 'Rejected request',
        targetSystem: 'internal',
      }),
    });
    await executionService.submitExecution({
      workspaceId: fixture.workspaceId,
      userId: fixture.memberId,
      executionId: rejected.id,
    });
    await executionService.decideExecution({
      workspaceId: fixture.workspaceId,
      userId: fixture.ownerId,
      actorRole: 'owner',
      executionId: rejected.id,
      decision: 'rejected',
    });
    await assert.rejects(
      executionService.executeExecution({
        workspaceId: fixture.workspaceId,
        userId: fixture.ownerId,
        actorRole: 'owner',
        executionId: rejected.id,
        enqueue: fakeEnqueue(),
      }),
      expectCode('APPROVAL_REQUIRED'),
    );

    // A cancelled request is never picked up by the worker.
    const cancelled = await executionService.createExecutionRequest({
      workspaceId: fixture.workspaceId,
      userId: fixture.memberId,
      input: await integrationValidation.executionCreateSchema.validate({
        category: 'internal_record',
        operation: 'Cancelled request',
        targetSystem: 'internal',
      }),
    });
    await executionService.submitExecution({
      workspaceId: fixture.workspaceId,
      userId: fixture.memberId,
      executionId: cancelled.id,
    });
    await executionService.cancelExecution({
      workspaceId: fixture.workspaceId,
      userId: fixture.memberId,
      actorRole: 'member',
      executionId: cancelled.id,
    });
    const cancelledJob = await executionService.processExecutionJob(cancelled.id);
    assert.equal(cancelledJob.status, 'skipped');
    assert.match(cancelledJob.reason, /^not-queued:cancelled$/);

    // Step 18 — metrics and a report built only from sourced test data.
    await reporting.recordMetric({
      workspaceId: fixture.workspaceId,
      userId: fixture.ownerId,
      data: await marketingValidation.metricCreateSchema.validate({
        clientId: client.id,
        campaignId: campaign.campaign.id,
        metricKey: 'website_sessions',
        value: 120,
        source: 'manual',
        periodStart: '2026-11-01',
        periodEnd: '2026-11-30',
      }),
    });
    const report = await reporting.createReport({
      workspaceId: fixture.workspaceId,
      userId: fixture.ownerId,
      data: await marketingValidation.reportCreateSchema.validate({
        clientId: client.id,
        projectId: project.id,
        title: 'E2E November report',
        periodStart: '2026-11-01',
        periodEnd: '2026-11-30',
      }),
    });
    assert.equal(report.report.clientId, client.id);

    // Step 19 — trigger an automation and run it on the worker handler.
    const workflowQueue = fakeEnqueue();
    const workflowRun = await automationService.startWorkflowRun({
      workspaceId: fixture.workspaceId,
      userId: fixture.ownerId,
      workflowKey: 'marketing_report_preparation',
      clientId: client.id,
      enqueue: workflowQueue,
    });
    assert.equal(workflowRun.status, 'queued');
    assert.equal(workflowQueue.jobs[0], workflowRun.id);

    const workflowJob = await worker.processWorkflowRunJob({
      data: { runId: workflowRun.id },
    });
    assert.equal(workflowJob.status, 'completed');
    const workflowDetail = await automationService.getWorkflowRun(
      fixture.workspaceId,
      workflowRun.id,
    );
    assert.equal(workflowDetail.status, 'completed');
    assert.equal(workflowDetail.steps.length, 3);

    // Re-invoking a settled run is a no-op (retry safety).
    const rereun = await worker.processWorkflowRunJob({ data: { runId: workflowRun.id } });
    assert.equal(rereun.status, 'skipped');

    // Project-scoped workflow.
    const projectRun = await automationService.startWorkflowRun({
      workspaceId: fixture.workspaceId,
      userId: fixture.ownerId,
      workflowKey: 'project_progress_summary',
      projectId: project.id,
      enqueue: fakeEnqueue(),
    });
    const projectJob = await worker.processWorkflowRunJob({ data: { runId: projectRun.id } });
    assert.equal(projectJob.status, 'completed');

    // Cancelled runs are never executed.
    const cancelRun = await automationService.startWorkflowRun({
      workspaceId: fixture.workspaceId,
      userId: fixture.ownerId,
      workflowKey: 'pending_approval_reminder',
      enqueue: fakeEnqueue(),
    });
    await automationService.cancelWorkflowRun({
      workspaceId: fixture.workspaceId,
      userId: fixture.ownerId,
      runId: cancelRun.id,
    });
    const cancelJob = await worker.processWorkflowRunJob({ data: { runId: cancelRun.id } });
    assert.equal(cancelJob.status, 'skipped');
    assert.match(cancelJob.reason, /^settled:cancelled$/);

    // Retry budgets are bounded, so a stuck job cannot loop forever.
    assert.equal(queue.AI_JOB_MAX_ATTEMPTS, 3);
    assert.equal(queue.WORKFLOW_JOB_MAX_ATTEMPTS, 2);

    // Step 20 — signed inbound webhook is recorded, not trusted.
    const leadsBefore = await countLeads(fixture.workspaceId);
    const rawBody = JSON.stringify({
      workspaceId: fixture.workspaceId,
      eventType: 'lead.created',
      externalEventId: `evt-${randomUUID()}`,
      data: { lead: { name: 'Ada Lovelace', email: 'ada@example.test' } },
    });
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = webhooks.computeSignature({
      secret: WEBHOOK_SECRET,
      timestamp,
      rawBody,
    });

    const webhookQueue = fakeEnqueue();
    const ingested = await webhooks.ingestWebhook({
      provider: 'inbound_hmac',
      rawBody,
      signature,
      timestamp,
      enqueue: webhookQueue,
    });
    assert.equal(ingested.duplicate, false);

    const duplicate = await webhooks.ingestWebhook({
      provider: 'inbound_hmac',
      rawBody,
      signature,
      timestamp,
      enqueue: fakeEnqueue(),
    });
    assert.equal(duplicate.duplicate, true);
    assert.equal(duplicate.id, ingested.id);

    const processed = await worker.processWebhookJob({
      data: { webhookEventId: ingested.id },
    });
    assert.equal(processed.status, 'processed');

    const settled = await worker.processWebhookJob({
      data: { webhookEventId: ingested.id },
    });
    assert.equal(settled.status, 'skipped');

    // The event never created a lead automatically.
    assert.equal(await countLeads(fixture.workspaceId), leadsBefore);

    await assert.rejects(
      webhooks.ingestWebhook({
        provider: 'inbound_hmac',
        rawBody,
        signature: 'not-a-valid-signature',
        timestamp,
        enqueue: fakeEnqueue(),
      }),
      expectCode('INVALID_SIGNATURE'),
    );

    const syncEvents = await integrationsService.listSyncEvents(fixture.workspaceId);
    assert.ok(syncEvents.events.some((event) => event.source === 'inbound_hmac'));

    const integrationOverview = await integrationsService.getIntegrationOverview(
      fixture.workspaceId,
    );
    assert.equal(integrationOverview.webhookSecretConfigured, true);
    assert.ok(integrationOverview.summary.total >= 2);

    // Step 21 — monitoring reports real state, with injected probes.
    const overview = await monitoring.getOperationsOverview(fixture.workspaceId, {
      workerHealth: async () => ({ status: 'running', processed: 5, failed: 0, startedAt: null }),
      queueCounts: async () => ({
        agentRuns: { queued: 0, active: 0, failed: 0, total: 0 },
        research: { queued: 0, active: 0, failed: 0, total: 0 },
        websiteAudits: { queued: 0, active: 0, failed: 0, total: 0 },
        integrationEvents: { queued: 0, active: 0, failed: 0, total: 0 },
        executions: { queued: 0, active: 0, failed: 0, total: 0 },
        workflows: { queued: 0, active: 0, failed: 0, total: 0 },
      }),
    });
    assert.equal(overview.worker.status, 'running');
    assert.ok(overview.executions.recent.some((row) => row.id === request.id));
    assert.ok(overview.automations.recent.some((row) => row.id === workflowRun.id));
    assert.ok(overview.integrations.total >= 2);

    // Audit history records every consequential transition.
    const auditRows = await query(sql`
      select action from audit_logs where workspace_id = ${fixture.workspaceId}
    `);
    const actions = new Set(auditRows.map((row) => row.action));
    for (const action of [
      'client.create',
      'marketing.campaign_create',
      'marketing.content_create',
      'marketing.proposal_execution',
      'integration.create',
      'execution.create',
      'execution.submit',
      'execution.approve',
      'execution.reject',
      'execution.execute',
      'execution.complete',
      'execution.cancel',
      'automation.start',
      'automation.complete',
      'automation.cancel',
      'integration.webhook_received',
      'integration.webhook_processed',
      'marketing.metric_record',
      'marketing.report_create',
    ]) {
      assert.ok(actions.has(action), `missing audit action ${action}`);
    }

    // Isolation — another workspace cannot read any of it.
    await assert.rejects(
      executionService.getExecution(fixture.otherWorkspaceId, request.id),
      expectCode('NOT_FOUND'),
    );
    await assert.rejects(
      automationService.getWorkflowRun(fixture.otherWorkspaceId, workflowRun.id),
      expectCode('NOT_FOUND'),
    );
    await assert.rejects(
      integrationsService.getIntegration(
        fixture.otherWorkspaceId,
        builtin.id,
      ),
      expectCode('NOT_FOUND'),
    );
    const otherOverview = await monitoring.getOperationsOverview(
      fixture.otherWorkspaceId,
      {
        workerHealth: async () => ({ status: 'not_running' }),
        queueCounts: async () => null,
      },
    );
    assert.equal(otherOverview.executions.recent.length, 0);
    assert.equal(otherOverview.automations.recent.length, 0);

    // Unauthorized roles cannot approve or execute restricted actions.
    assert.equal(hasPermission('member', 'executions.approve'), false);
    assert.equal(hasPermission('member', 'executions.execute'), false);
    assert.equal(hasPermission('member', 'marketing.execute'), false);
    assert.equal(hasPermission('viewer', 'executions.request'), false);
    assert.equal(hasPermission('owner', 'executions.execute'), true);
  } finally {
    await cleanup(fixture);
  }
});
