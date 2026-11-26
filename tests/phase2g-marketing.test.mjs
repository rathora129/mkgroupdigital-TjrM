import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PERMISSIONS,
  hasPermission,
} from '@/lib/auth/permissions';
import {
  CAMPAIGN_STATUSES,
  CAMPAIGN_STATUS_LABELS,
  CAMPAIGN_TRANSITIONS,
  CONTENT_STATUSES,
  CONTENT_STATUS_LABELS,
  CONTENT_TRANSITIONS,
  FINDING_SOURCES,
  FINDING_SOURCE_LABELS,
  FINDING_STATUS_LABELS,
  FINDING_STATUSES,
  METRIC_KEYS,
  METRIC_LABELS,
  METRIC_SOURCES,
  METRIC_SOURCE_LABELS,
  NO_EXTERNAL_EXECUTION_NOTE,
  NO_EXTERNAL_PUBLISHING_NOTE,
  PROPOSAL_STATUSES,
  PROPOSAL_STATUS_LABELS,
  PROPOSAL_TRANSITIONS,
  canTransition,
} from '@/lib/marketing/constants';
import {
  auditFindingCreateSchema,
  auditFindingUpdateSchema,
  campaignCreateSchema,
  contentActionSchema,
  contentCreateSchema,
  isUuid,
  metricCreateSchema,
  proposalActionSchema,
  proposalCreateSchema,
  reportCreateSchema,
  reportNarrativeSchema,
} from '@/lib/marketing/validation';

const CLIENT_ID = '8a1d6f7b-2c3d-4e5f-8a9b-0c1d2e3f4a5b';

// ---------------------------------------------------------------------------
// 2G-J — permissions
// ---------------------------------------------------------------------------

test('phase 2G marketing permissions follow least privilege', () => {
  const all = [
    PERMISSIONS.marketingView,
    PERMISSIONS.marketingManage,
    PERMISSIONS.marketingApprove,
    PERMISSIONS.marketingExecute,
    PERMISSIONS.marketingReport,
  ];
  for (const role of ['owner', 'admin', 'manager']) {
    for (const permission of all) {
      assert.equal(
        hasPermission(role, permission),
        true,
        `${role} should have ${permission}`,
      );
    }
  }

  for (const role of ['member', 'specialist']) {
    for (const permission of [
      PERMISSIONS.marketingView,
      PERMISSIONS.marketingManage,
      PERMISSIONS.marketingReport,
    ]) {
      assert.equal(
        hasPermission(role, permission),
        true,
        `${role} should have ${permission}`,
      );
    }
    for (const permission of [
      PERMISSIONS.marketingApprove,
      PERMISSIONS.marketingExecute,
    ]) {
      assert.equal(
        hasPermission(role, permission),
        false,
        `${role} must not have ${permission}`,
      );
    }
  }

  assert.equal(hasPermission('viewer', PERMISSIONS.marketingView), true);
  for (const permission of [
    PERMISSIONS.marketingManage,
    PERMISSIONS.marketingApprove,
    PERMISSIONS.marketingExecute,
    PERMISSIONS.marketingReport,
  ]) {
    assert.equal(
      hasPermission('viewer', permission),
      false,
      `viewer must not have ${permission}`,
    );
  }
});

// ---------------------------------------------------------------------------
// Vocabulary — Planned ≠ Draft ≠ Executed, scheduled ≠ published, etc.
// ---------------------------------------------------------------------------

test('every marketing status has a distinct human label', () => {
  for (const map of [
    [CAMPAIGN_STATUSES, CAMPAIGN_STATUS_LABELS],
    [CONTENT_STATUSES, CONTENT_STATUS_LABELS],
    [PROPOSAL_STATUSES, PROPOSAL_STATUS_LABELS],
    [FINDING_STATUSES, FINDING_STATUS_LABELS],
  ]) {
    const [statuses, labels] = map;
    for (const status of statuses) {
      assert.ok(labels[status], `missing label for ${status}`);
    }
  }
  for (const source of FINDING_SOURCES) {
    assert.ok(FINDING_SOURCE_LABELS[source], `missing label for ${source}`);
  }
  for (const key of METRIC_KEYS) {
    assert.ok(METRIC_LABELS[key], `missing label for ${key}`);
  }
  for (const source of METRIC_SOURCES) {
    assert.ok(METRIC_SOURCE_LABELS[source], `missing label for ${source}`);
  }
});

test('scheduled is never the same state as published/executed', () => {
  assert.ok(CONTENT_TRANSITIONS.scheduled.includes('published'));
  assert.deepEqual(CONTENT_TRANSITIONS.published, []);
  assert.ok(CAMPAIGN_TRANSITIONS.approved.includes('executed'));
  assert.deepEqual(CAMPAIGN_TRANSITIONS.executed, []);
  assert.deepEqual(PROPOSAL_TRANSITIONS.executed, []);
});

test('external action copy never claims a live change', () => {
  assert.match(NO_EXTERNAL_PUBLISHING_NOTE, /No /);
  assert.match(NO_EXTERNAL_EXECUTION_NOTE, /manually/i);
});

// ---------------------------------------------------------------------------
// Transitions
// ---------------------------------------------------------------------------

test('content transitions guard the workflow', () => {
  assert.equal(canTransition(CONTENT_TRANSITIONS, 'idea', 'draft'), true);
  assert.equal(canTransition(CONTENT_TRANSITIONS, 'draft', 'in_review'), true);
  assert.equal(canTransition(CONTENT_TRANSITIONS, 'in_review', 'approved'), true);
  assert.equal(canTransition(CONTENT_TRANSITIONS, 'in_review', 'changes_requested'), true);
  assert.equal(canTransition(CONTENT_TRANSITIONS, 'approved', 'scheduled'), true);
  assert.equal(canTransition(CONTENT_TRANSITIONS, 'scheduled', 'published'), true);
  assert.equal(canTransition(CONTENT_TRANSITIONS, 'scheduled', 'failed'), true);
  // Drafts and approvals are never published directly.
  assert.equal(canTransition(CONTENT_TRANSITIONS, 'draft', 'published'), false);
  assert.equal(canTransition(CONTENT_TRANSITIONS, 'approved', 'published'), false);
  assert.equal(canTransition(CONTENT_TRANSITIONS, 'published', 'draft'), false);
});

test('campaign and proposal transitions guard execution', () => {
  assert.equal(canTransition(CAMPAIGN_TRANSITIONS, 'planned', 'draft'), true);
  assert.equal(canTransition(CAMPAIGN_TRANSITIONS, 'approved', 'executed'), true);
  assert.equal(canTransition(CAMPAIGN_TRANSITIONS, 'executed', 'cancelled'), false);
  assert.equal(canTransition(CAMPAIGN_TRANSITIONS, 'planned', 'executed'), false);

  assert.equal(canTransition(PROPOSAL_TRANSITIONS, 'draft', 'awaiting_review'), true);
  assert.equal(canTransition(PROPOSAL_TRANSITIONS, 'awaiting_review', 'approved'), true);
  assert.equal(canTransition(PROPOSAL_TRANSITIONS, 'approved', 'executing'), true);
  assert.equal(canTransition(PROPOSAL_TRANSITIONS, 'executing', 'executed'), true);
  assert.equal(canTransition(PROPOSAL_TRANSITIONS, 'executed', 'cancelled'), false);
  assert.equal(canTransition(PROPOSAL_TRANSITIONS, 'draft', 'executed'), false);
});

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

test('campaign validation rejects invalid channels, budgets and start states', async () => {
  const valid = await campaignCreateSchema.validate({
    clientId: CLIENT_ID,
    name: 'Autumn campaign',
    channel: 'organic_seo',
  });
  assert.equal(valid.status, 'planned');
  assert.equal(valid.budgetEstimate, 0);

  await assert.rejects(
    campaignCreateSchema.validate({
      clientId: CLIENT_ID,
      name: 'Bad channel',
      channel: 'billboard',
    }),
  );
  await assert.rejects(
    campaignCreateSchema.validate({
      clientId: CLIENT_ID,
      name: 'Negative budget',
      channel: 'organic_seo',
      budgetEstimate: -100,
    }),
  );
  await assert.rejects(
    campaignCreateSchema.validate({
      clientId: CLIENT_ID,
      name: 'Already live',
      channel: 'organic_seo',
      status: 'executed',
    }),
  );
});

test('content validation cannot start in a published state', async () => {
  const valid = await contentCreateSchema.validate({
    clientId: CLIENT_ID,
    contentType: 'blog_draft',
    title: 'A draft',
    body: 'Some body text',
  });
  assert.equal(valid.status, 'draft');

  await assert.rejects(
    contentCreateSchema.validate({
      clientId: CLIENT_ID,
      contentType: 'blog_draft',
      title: 'Published at birth',
      body: 'Some body text',
      status: 'published',
    }),
  );

  const ideaToDraft = await contentActionSchema.validate({ action: 'start_draft' });
  assert.equal(ideaToDraft.action, 'start_draft');
  await assert.rejects(contentActionSchema.validate({ action: 'publish_now' }));
});

test('proposal validation requires proposed content and valid actions', async () => {
  const valid = await proposalCreateSchema.validate({
    clientId: CLIENT_ID,
    title: 'Homepage rewrite',
    proposedContent: 'New copy',
  });
  assert.equal(valid.title, 'Homepage rewrite');

  await assert.rejects(
    proposalCreateSchema.validate({
      clientId: CLIENT_ID,
      title: 'Empty proposal',
      proposedContent: '',
    }),
  );

  const execute = await proposalActionSchema.validate({
    action: 'record_execution',
    evidence: 'Updated the live page manually',
  });
  assert.equal(execute.action, 'record_execution');
});

test('audit finding validation requires structured evidence', async () => {
  await assert.rejects(
    auditFindingCreateSchema.validate({
      category: 'technical_seo',
      title: 'Missing code',
      description: 'A description',
      recommendation: 'Fix it',
    }),
  );
  await assert.rejects(
    auditFindingCreateSchema.validate({
      category: 'technical_seo',
      code: 'missing-title',
      title: 'Bad source',
      description: 'A description',
      recommendation: 'Fix it',
      sourceType: 'trust_me',
    }),
  );

  const update = await auditFindingUpdateSchema.validate({
    status: 'resolved',
    completionNotes: 'Verified in production by a human',
  });
  assert.equal(update.status, 'resolved');
});

test('metric and report validation keep sources explicit', async () => {
  await assert.rejects(
    metricCreateSchema.validate({
      clientId: CLIENT_ID,
      metricKey: 'made_up_metric',
      value: 1,
      source: 'manual',
      periodStart: '2026-01-01',
      periodEnd: '2026-01-31',
    }),
  );
  await assert.rejects(
    metricCreateSchema.validate({
      clientId: CLIENT_ID,
      metricKey: 'leads',
      value: -1,
      source: 'manual',
      periodStart: '2026-01-01',
      periodEnd: '2026-01-31',
    }),
  );
  await assert.rejects(
    metricCreateSchema.validate({
      clientId: CLIENT_ID,
      metricKey: 'leads',
      value: 1,
      source: 'guess',
      periodStart: '2026-01-01',
      periodEnd: '2026-01-31',
    }),
  );

  const report = await reportCreateSchema.validate({
    clientId: CLIENT_ID,
    title: 'January',
    periodStart: '2026-01-01',
    periodEnd: '2026-01-31',
  });
  assert.equal(report.includeAiNarrative, false);

  await assert.rejects(reportNarrativeSchema.validate({ action: 'auto_write' }));
});

test('isUuid accepts v4-shaped ids and rejects others', () => {
  assert.equal(isUuid(CLIENT_ID), true);
  assert.equal(isUuid('not-a-uuid'), false);
  assert.equal(isUuid(null), false);
});
