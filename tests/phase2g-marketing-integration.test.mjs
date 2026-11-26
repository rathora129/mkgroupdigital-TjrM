import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {
  sql,
  query,
  closeDatabase,
  assertDisposableTestUrl,
} from './support/db.mjs';

// Phase 2G — marketing & website execution engine integration coverage.
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

after(async () => {
  await closeDatabase();
});

function expectCode(code) {
  return (error) => {
    assert.equal(error.code, code, `expected ${code}, received ${error.code}`);
    return true;
  };
}

async function createWorkspace(label) {
  const suffix = randomUUID();
  const [workspace] = await query(sql`
    insert into workspaces (name, slug)
    values (${`Phase 2G ${label}`}, ${`p2g-mkt-${label}-${suffix}`})
    returning id
  `);
  const users = {};
  for (const [key, role] of [
    ['owner', 'owner'],
    ['member', 'member'],
  ]) {
    const [user] = await query(sql`
      insert into users (email, name)
      values (${`p2g-mkt-${label}-${key}-${suffix}@example.test`}, ${`${key} person`})
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

async function makeClient(fixture, ownerId = fixture.ownerId) {
  const data = await clientValidation.clientCreateSchema.validate({
    companyName: `Client ${randomUUID().slice(0, 8)}`,
  });
  const detail = await clientsService.createClient({
    workspaceId: fixture.workspaceId,
    userId: ownerId,
    data,
  });
  return detail.client;
}

test('marketing profiles are workspace scoped and upserted', { skip }, async () => {
  const fixture = await createFixture();
  try {
    const client = await makeClient(fixture);
    const data = await marketingValidation.marketingProfileSchema.validate({
      clientId: client.id,
      industry: 'Dental',
      selectedServices: ['seo', 'local_seo'],
    });
    await marketing.upsertMarketingProfile({
      workspaceId: fixture.workspaceId,
      userId: fixture.ownerId,
      data,
    });

    const detail = await marketing.getMarketingProfile(
      fixture.workspaceId,
      client.id,
    );
    assert.equal(detail.profile.clientId, client.id);
    assert.deepEqual(detail.profile.selectedServices, ['seo', 'local_seo']);
    assert.equal(detail.counts.campaigns, 0);

    // A second workspace must not be able to read the profile by client id.
    await assert.rejects(
      marketing.getMarketingProfile(fixture.otherWorkspaceId, client.id),
      expectCode('CLIENT_NOT_FOUND'),
    );
  } finally {
    await cleanup(fixture);
  }
});

test('campaigns enforce the planned → executed workflow', { skip }, async () => {
  const fixture = await createFixture();
  try {
    const client = await makeClient(fixture);
    const data = await marketingValidation.campaignCreateSchema.validate({
      clientId: client.id,
      name: 'Spring push',
      channel: 'organic_seo',
      budgetEstimate: 5_000_00,
    });
    const created = await marketing.createCampaign({
      workspaceId: fixture.workspaceId,
      userId: fixture.ownerId,
      data,
    });
    assert.equal(created.campaign.status, 'planned');
    assert.equal(created.campaign.budgetEstimate, 500_000);

    // Cannot jump from planned straight to executed.
    await assert.rejects(
      marketing.changeCampaignStatus({
        workspaceId: fixture.workspaceId,
        userId: fixture.ownerId,
        campaignId: created.campaign.id,
        status: 'executed',
        note: 'should fail',
      }),
      expectCode('INVALID_TRANSITION'),
    );

    await marketing.changeCampaignStatus({
      workspaceId: fixture.workspaceId,
      userId: fixture.ownerId,
      campaignId: created.campaign.id,
      status: 'draft',
      note: null,
    });
    const moved = await marketing.getCampaign(
      fixture.workspaceId,
      created.campaign.id,
    );
    assert.equal(moved.campaign.status, 'draft');
  } finally {
    await cleanup(fixture);
  }
});

test('content versions append and approval survives a new draft', { skip }, async () => {
  const fixture = await createFixture();
  try {
    const client = await makeClient(fixture);
    const data = await marketingValidation.contentCreateSchema.validate({
      clientId: client.id,
      contentType: 'blog_draft',
      title: 'First post',
      body: 'Original body',
    });
    const created = await contentService.createContentItem({
      workspaceId: fixture.workspaceId,
      userId: fixture.ownerId,
      data,
    });
    assert.equal(created.item.latestVersion, 1);

    const acted = async (action, extra = {}) => {
      const current = await contentService.getContentItem(
        fixture.workspaceId,
        created.item.id,
      );
      return contentService.contentAction({
        workspaceId: fixture.workspaceId,
        userId: fixture.ownerId,
        contentId: created.item.id,
        data: {
          action,
          expectedUpdatedAt: current.item.updatedAt,
          ...extra,
        },
      });
    };

    assert.equal((await acted('submit')).item.status, 'in_review');
    const approved = await acted('approve');
    assert.equal(approved.item.status, 'approved');
    assert.equal(approved.item.approvedVersion, 1);

    // Editing after approval appends and returns the item to draft.
    await contentService.addContentVersion({
      workspaceId: fixture.workspaceId,
      userId: fixture.ownerId,
      contentId: created.item.id,
      data: {
        body: 'Revised body',
        changeNote: 'Second pass',
        expectedVersion: 1,
      },
    });
    const afterEdit = await contentService.getContentItem(
      fixture.workspaceId,
      created.item.id,
    );
    assert.equal(afterEdit.item.status, 'draft');
    assert.equal(afterEdit.item.latestVersion, 2);
    assert.equal(afterEdit.versions.length, 2);
  } finally {
    await cleanup(fixture);
  }
});

test('website proposals never claim a live change', { skip }, async () => {
  const fixture = await createFixture();
  try {
    const client = await makeClient(fixture);
    const page = await websiteService.createWebsitePage({
      workspaceId: fixture.workspaceId,
      userId: fixture.ownerId,
      data: await marketingValidation.websitePageCreateSchema.validate({
        clientId: client.id,
        pageTitle: 'Home',
        pageUrl: 'https://example.test/',
      }),
    });
    const created = await websiteService.createProposal({
      workspaceId: fixture.workspaceId,
      userId: fixture.ownerId,
      data: await marketingValidation.proposalCreateSchema.validate({
        clientId: client.id,
        pageId: page.page.id,
        title: 'Home hero copy',
        proposedContent: 'New hero copy',
      }),
    });

    const acted = async (action, extra = {}) => {
      const current = await websiteService.getProposal(
        fixture.workspaceId,
        created.proposal.id,
      );
      return websiteService.proposalAction({
        workspaceId: fixture.workspaceId,
        userId: fixture.ownerId,
        proposalId: created.proposal.id,
        data: {
          action,
          expectedUpdatedAt: current.proposal.updatedAt,
          ...extra,
        },
      });
    };

    assert.equal((await acted('submit')).proposal.status, 'awaiting_review');
    assert.equal((await acted('approve')).proposal.status, 'approved');

    await assert.rejects(acted('record_execution', {}), expectCode('EVIDENCE_REQUIRED'));

    const executed = await acted('record_execution', {
      evidence: 'Uploaded to the CMS manually and verified in a browser',
    });
    assert.equal(executed.proposal.status, 'executed');
    assert.equal(executed.externalAction, false);
    assert.match(executed.note, /manually/i);
  } finally {
    await cleanup(fixture);
  }
});

test('findings require completion evidence and never duplicate tasks', { skip }, async () => {
  const fixture = await createFixture();
  try {
    const client = await makeClient(fixture);
    const [project] = await query(sql`
      insert into projects (workspace_id, reference, name, client_id)
      values (
        ${fixture.workspaceId},
        ${`PRJ-2G-${randomUUID().slice(0, 8)}`},
        'SEO delivery',
        ${client.id}
      )
      returning id
    `);
    const [audit] = await query(sql`
      insert into website_audits (
        workspace_id, status, requested_url, normalized_url, domain, client_id
      ) values (
        ${fixture.workspaceId}, 'completed',
        'https://example.test/', 'https://example.test/', 'example.test',
        ${client.id}
      )
      returning id
    `);

    const created = await seoService.addAuditFinding({
      workspaceId: fixture.workspaceId,
      userId: fixture.ownerId,
      auditId: audit.id,
      data: await marketingValidation.auditFindingCreateSchema.validate({
        category: 'technical_seo',
        severity: 'high',
        code: 'missing-title',
        title: 'Home page has no title',
        description: 'The home page is missing a <title> element.',
        recommendation: 'Add a descriptive title tag.',
        sourceType: 'verified',
      }),
    });
    assert.equal(created.finding.status, 'open');

    // Resolving without notes is refused.
    await assert.rejects(
      seoService.updateAuditFinding({
        workspaceId: fixture.workspaceId,
        userId: fixture.ownerId,
        findingId: created.finding.id,
        data: { status: 'resolved' },
      }),
      expectCode('EVIDENCE_REQUIRED'),
    );

    const resolved = await seoService.updateAuditFinding({
      workspaceId: fixture.workspaceId,
      userId: fixture.ownerId,
      findingId: created.finding.id,
      data: {
        status: 'resolved',
        completionNotes: 'Title added and verified in the browser',
      },
    });
    assert.equal(resolved.finding.status, 'resolved');

    const first = await seoService.convertFindingToTask({
      workspaceId: fixture.workspaceId,
      userId: fixture.ownerId,
      findingId: created.finding.id,
      data: { projectId: project.id },
    });
    assert.ok(first.task.id);
    assert.equal(first.task.sourceType, 'audit_finding');

    await assert.rejects(
      seoService.convertFindingToTask({
        workspaceId: fixture.workspaceId,
        userId: fixture.ownerId,
        findingId: created.finding.id,
        data: { projectId: project.id },
      }),
      expectCode('TASK_EXISTS'),
    );
  } finally {
    await cleanup(fixture);
  }
});

test('metrics and reports label every data source', { skip }, async () => {
  const fixture = await createFixture();
  try {
    const client = await makeClient(fixture);
    const metric = await reporting.recordMetric({
      workspaceId: fixture.workspaceId,
      userId: fixture.ownerId,
      data: await marketingValidation.metricCreateSchema.validate({
        clientId: client.id,
        metricKey: 'leads',
        value: 12,
        source: 'manual',
        periodStart: '2026-01-01',
        periodEnd: '2026-01-31',
      }),
    });
    assert.ok(metric.id);

    const report = await reporting.createReport({
      workspaceId: fixture.workspaceId,
      userId: fixture.ownerId,
      data: await marketingValidation.reportCreateSchema.validate({
        clientId: client.id,
        title: 'January performance',
        periodStart: '2026-01-01',
        periodEnd: '2026-01-31',
      }),
    });
    assert.equal(report.report.dataSnapshot.sums.leads, 12);
    assert.ok(report.report.dataSources.includes('manual'));
    assert.match(report.report.summary, /12/);

    const metrics = await reporting.listMetrics(fixture.workspaceId, {
      page: 1,
      pageSize: 20,
    });
    assert.equal(metrics.total, 1);
    assert.equal(metrics.items[0].sourceLabel, 'Manually entered');
  } finally {
    await cleanup(fixture);
  }
});
