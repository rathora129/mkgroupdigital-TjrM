import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {
  sql,
  query,
  closeDatabase,
  assertDisposableTestUrl,
} from './support/db.mjs';

// Database-backed Phase 2D-B checks. Runs only against
// PHASE2A_TEST_DATABASE_URL (a disposable database whose name ends in _test).
const TEST_DATABASE_URL = process.env.PHASE2A_TEST_DATABASE_URL || '';
const skip = TEST_DATABASE_URL
  ? false
  : 'set PHASE2A_TEST_DATABASE_URL to a disposable, migrated database';

if (TEST_DATABASE_URL) {
  assertDisposableTestUrl(TEST_DATABASE_URL);
  process.env.DATABASE_URL = TEST_DATABASE_URL;
}

const proposalsService = await import('@/lib/proposals/service');
const validation = await import('@/lib/proposals/validation');
const opportunities = await import('@/lib/opportunities/service');
const opportunityValidation = await import('@/lib/opportunities/validation');
const catalogue = await import('@/lib/service-catalogue/service');
const leads = await import('@/lib/leads/service');
const leadValidation = await import('@/lib/leads/validation');
const permissions = await import('@/lib/auth/permissions');

after(async () => {
  await closeDatabase();
});

async function createWorkspace(label) {
  const suffix = randomUUID();
  const [workspace] = await query(sql`
    insert into workspaces (name, slug)
    values (${`Phase 2D-B ${label}`}, ${`p2db-${label}-${suffix}`})
    returning id
  `);

  const users = {};
  const memberships = [
    ['owner', 'owner'],
    ['member', 'member'],
    ['viewer', 'viewer'],
    ['manager', 'manager'],
  ];
  for (const [key, role] of memberships) {
    const [user] = await query(sql`
      insert into users (email, name)
      values (${`p2db-${label}-${key}-${suffix}@example.test`}, ${`${key} person`})
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
    viewerId: users.viewer,
    managerId: users.manager,
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
    cleanupUsers: [...main.userIds, ...other.userIds],
    cleanupWorkspaces: [main.workspaceId, other.workspaceId],
  };
}

async function cleanup(fixture) {
  await query(
    sql`delete from audit_logs where workspace_id in (${fixture.workspaceId}, ${fixture.otherWorkspaceId})`,
  );
  await query(
    sql`delete from workspaces where id in (${fixture.workspaceId}, ${fixture.otherWorkspaceId})`,
  );
  for (const userId of fixture.cleanupUsers) {
    await query(sql`delete from users where id = ${userId}`);
  }
}

async function makeLead(fixture, workspaceId = fixture.workspaceId) {
  const data = await leadValidation.leadCreateSchema.validate({
    companyName: `Acme ${randomUUID().slice(0, 6)}`,
    email: `lead-${randomUUID().slice(0, 8)}@acme.test`,
    website: 'https://www.acme.test',
  });
  const result = await leads.createLead({
    workspaceId,
    userId: fixture.ownerId,
    data,
  });
  return result.lead;
}

async function makeOpportunity(
  fixture,
  leadId,
  workspaceId = fixture.workspaceId,
  userId = fixture.ownerId,
) {
  const data = await opportunityValidation.opportunityCreateSchema.validate({
    leadId,
    title: `Opportunity ${randomUUID().slice(0, 8)}`,
  });
  return opportunities.createOpportunity({
    workspaceId,
    userId,
    data,
  });
}

async function makeProposal(fixture, opportunityId, overrides = {}, scope = {}) {
  const data = await validation.proposalCreateSchema.validate({
    opportunityId,
    ...overrides,
  });
  return proposalsService.createProposal({
    workspaceId: scope.workspaceId || fixture.workspaceId,
    userId: scope.userId || fixture.ownerId,
    data,
  });
}

async function saveDraft(fixture, detail, items, overrides = {}) {
  const data = await validation.versionContentSchema.validate({
    expectedUpdatedAt: new Date(detail.currentVersion.updatedAt).toISOString(),
    currency: 'INR',
    validityDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10),
    items,
    ...overrides,
  });
  return proposalsService.saveDraftContent({
    workspaceId: fixture.workspaceId,
    userId: fixture.ownerId,
    proposalId: detail.proposal.id,
    data,
  });
}

function line(overrides = {}) {
  return {
    name: 'Implementation',
    quantity: 1,
    unitPriceCents: 100_000,
    billingType: 'one_time',
    kind: 'included',
    ...overrides,
  };
}

async function submit(fixture, proposalId) {
  return proposalsService.submitProposal({
    workspaceId: fixture.workspaceId,
    userId: fixture.ownerId,
    proposalId,
  });
}

async function approve(fixture, proposalId, notes = null) {
  return proposalsService.decideProposal({
    workspaceId: fixture.workspaceId,
    userId: fixture.ownerId,
    proposalId,
    decision: 'approved',
    notes,
  });
}

async function markSent(fixture, proposalId) {
  return proposalsService.markProposalSent({
    workspaceId: fixture.workspaceId,
    userId: fixture.ownerId,
    proposalId,
  });
}

test('proposal lifecycle records versions, approvals, responses and audit', { skip }, async () => {
  const fixture = await createFixture();
  try {
    const lead = await makeLead(fixture);
    const opportunity = await makeOpportunity(fixture, lead.id);
    const created = await makeProposal(fixture, opportunity.opportunity.id, {
      prefill: false,
    });

    assert.equal(created.proposal.reference, 'PROP-0001');
    assert.equal(created.proposal.status, 'draft');
    assert.equal(created.currentVersion.versionNumber, 1);
    assert.equal(created.currentVersion.status, 'draft');
    assert.ok(created.currentVersion.isEditable);

    const saved = await saveDraft(fixture, created, [
      line({ name: 'Website build', unitPriceCents: 100_000 }),
      line({ name: 'Care plan', unitPriceCents: 50_000, billingType: 'monthly' }),
    ]);
    assert.equal(saved.items.length, 2);
    assert.equal(saved.calc.totals.oneTimeTotalCents, 100_000);
    assert.equal(saved.calc.totals.recurringMonthlyCents, 50_000);

    const submitted = await submit(fixture, created.proposal.id);
    assert.equal(submitted.currentVersion.status, 'internal_review');

    await assert.rejects(
      () => saveDraft(fixture, submitted, [line()]),
      (error) => error.code === 'VERSION_LOCKED' && error.status === 409,
      'a version awaiting review cannot be edited',
    );

    await assert.rejects(
      () =>
        proposalsService.decideProposal({
          workspaceId: fixture.workspaceId,
          userId: fixture.ownerId,
          proposalId: created.proposal.id,
          decision: 'changes_requested',
        }),
      (error) => error.code === 'NOTES_REQUIRED' && error.status === 422,
    );

    const changes = await proposalsService.decideProposal({
      workspaceId: fixture.workspaceId,
      userId: fixture.ownerId,
      proposalId: created.proposal.id,
      decision: 'changes_requested',
      notes: 'Tighten the scope.',
    });
    assert.equal(changes.currentVersion.status, 'draft');
    assert.equal(changes.approvals.length, 1);
    assert.equal(changes.approvals[0].decision, 'changes_requested');

    await submit(fixture, created.proposal.id);
    const approved = await approve(fixture, created.proposal.id, 'Approved for issue.');
    assert.equal(approved.currentVersion.status, 'approved');
    assert.equal(approved.currentVersion.approvedByUserId, fixture.ownerId);
    assert.ok(approved.currentVersion.approvedAt);
    assert.equal(approved.approvals[0].decision, 'approved');

    await assert.rejects(
      () => saveDraft(fixture, approved, [line()]),
      (error) => error.code === 'VERSION_LOCKED',
      'approved versions are immutable',
    );

    const sent = await markSent(fixture, created.proposal.id);
    assert.equal(sent.changed, true);
    assert.equal(sent.currentVersion.status, 'sent');
    assert.ok(sent.currentVersion.sentAt);
    const sentAgain = await markSent(fixture, created.proposal.id);
    assert.equal(sentAgain.changed, false, 'marking sent twice is idempotent');

    const accepted = await proposalsService.recordProposalResponse({
      workspaceId: fixture.workspaceId,
      userId: fixture.ownerId,
      proposalId: created.proposal.id,
      response: 'accepted',
      notes: 'Client signed.',
    });
    assert.equal(accepted.changed, true);
    assert.equal(accepted.currentVersion.status, 'accepted');
    assert.equal(accepted.response.response, 'accepted');

    const opportunityAfter = await opportunities.getOpportunity(
      fixture.workspaceId,
      opportunity.opportunity.id,
    );
    assert.equal(
      opportunityAfter.opportunity.stage,
      'discovery',
      'recording a response never moves the opportunity stage',
    );

    const sameResponse = await proposalsService.recordProposalResponse({
      workspaceId: fixture.workspaceId,
      userId: fixture.ownerId,
      proposalId: created.proposal.id,
      response: 'accepted',
    });
    assert.equal(sameResponse.changed, false);

    await assert.rejects(
      () =>
        proposalsService.recordProposalResponse({
          workspaceId: fixture.workspaceId,
          userId: fixture.ownerId,
          proposalId: created.proposal.id,
          response: 'rejected',
        }),
      (error) => error.code === 'RESPONSE_RECORDED' && error.status === 409,
    );

    const revision = await proposalsService.createProposalRevision({
      workspaceId: fixture.workspaceId,
      userId: fixture.ownerId,
      proposalId: created.proposal.id,
      changeSummary: 'Updated pricing for next year.',
    });
    assert.equal(revision.currentVersion.versionNumber, 2);
    assert.equal(revision.currentVersion.status, 'draft');
    assert.equal(revision.items.length, 2, 'revision copies the line items');
    assert.equal(revision.versions.length, 2);
    const original = revision.versions.find((entry) => entry.versionNumber === 1);
    assert.equal(original.status, 'accepted', 'the accepted version is preserved');

    await assert.rejects(
      () =>
        proposalsService.createProposalRevision({
          workspaceId: fixture.workspaceId,
          userId: fixture.ownerId,
          proposalId: created.proposal.id,
        }),
      (error) => error.code === 'DRAFT_EXISTS' && error.status === 409,
    );

    const audits = await query(sql`
      select action from audit_logs
      where workspace_id = ${fixture.workspaceId}
    `);
    const actions = new Set(audits.map((row) => row.action));
    for (const expected of [
      'proposal.create',
      'proposal.content_update',
      'proposal.submit',
      'proposal.approve',
      'proposal.reject',
      'proposal.send',
      'proposal.response',
      'proposal.version_create',
    ]) {
      assert.ok(actions.has(expected), `missing audit action ${expected}`);
    }
  } finally {
    await cleanup(fixture);
  }
});

test('stale drafts, invalid services and cross-workspace isolation', { skip }, async () => {
  const fixture = await createFixture();
  try {
    const lead = await makeLead(fixture);
    const opportunity = await makeOpportunity(fixture, lead.id);
    const created = await makeProposal(fixture, opportunity.opportunity.id, {
      prefill: false,
    });

    const staleData = await validation.versionContentSchema.validate({
      expectedUpdatedAt: new Date(Date.now() - 60_000).toISOString(),
      currency: 'INR',
      items: [line()],
    });
    await assert.rejects(
      () =>
        proposalsService.saveDraftContent({
          workspaceId: fixture.workspaceId,
          userId: fixture.ownerId,
          proposalId: created.proposal.id,
          data: staleData,
        }),
      (error) => error.code === 'STALE_PROPOSAL' && error.status === 409,
    );

    const invalidServiceData = await validation.versionContentSchema.validate({
      expectedUpdatedAt: new Date(created.currentVersion.updatedAt).toISOString(),
      currency: 'INR',
      items: [line({ serviceId: randomUUID() })],
    });
    await assert.rejects(
      () =>
        proposalsService.saveDraftContent({
          workspaceId: fixture.workspaceId,
          userId: fixture.ownerId,
          proposalId: created.proposal.id,
          data: invalidServiceData,
        }),
      (error) => error.code === 'SERVICE_NOT_FOUND' && error.status === 422,
    );

    const saved = await saveDraft(fixture, created, [line()]);
    assert.equal(saved.items.length, 1);

    assert.equal(
      await proposalsService.getProposal(fixture.otherWorkspaceId, created.proposal.id),
      null,
      'another workspace cannot read the proposal',
    );
    const otherList = await proposalsService.listProposals(
      fixture.otherWorkspaceId,
      fixture.otherOwnerId,
      { page: 1, pageSize: 20, sort: 'created', direction: 'desc' },
    );
    assert.equal(otherList.total, 0);

    assert.equal(
      await proposalsService.submitProposal({
        workspaceId: fixture.otherWorkspaceId,
        userId: fixture.otherOwnerId,
        proposalId: created.proposal.id,
      }),
      null,
    );
    assert.equal(
      await proposalsService.updateProposalDetails({
        workspaceId: fixture.otherWorkspaceId,
        userId: fixture.otherOwnerId,
        proposalId: created.proposal.id,
        data: { title: 'Hijacked proposal' },
      }),
      null,
    );
    assert.equal(
      await proposalsService.createProposalRevision({
        workspaceId: fixture.otherWorkspaceId,
        userId: fixture.otherOwnerId,
        proposalId: created.proposal.id,
      }),
      null,
    );

    const overview = await proposalsService.getProposalOverview(fixture.workspaceId);
    assert.equal(overview.total, 1);
    assert.equal(overview.draft, 1);
    assert.equal(overview.proposalValueCents, 0, 'drafts are not proposal value');

    assert.equal(permissions.hasPermission('viewer', 'proposals.view'), true);
    assert.equal(permissions.hasPermission('viewer', 'proposals.approve'), false);
    assert.equal(permissions.hasPermission('viewer', 'proposals.export'), false);
    assert.equal(permissions.hasPermission('member', 'proposals.approve'), false);
    assert.equal(permissions.hasPermission('manager', 'proposals.approve'), true);
    assert.equal(permissions.hasPermission('manager', 'proposals.record_response'), true);
  } finally {
    await cleanup(fixture);
  }
});

test('references stay unique per workspace under concurrent creation', { skip }, async () => {
  const fixture = await createFixture();
  try {
    const lead = await makeLead(fixture);
    const opportunity = await makeOpportunity(fixture, lead.id);

    const results = await Promise.all(
      [0, 1, 2].map(() =>
        makeProposal(fixture, opportunity.opportunity.id, { prefill: false }),
      ),
    );
    const references = results.map((entry) => entry.proposal.reference);
    assert.equal(new Set(references).size, 3, 'concurrent creation must not reuse a reference');
    for (const reference of references) {
      assert.match(reference, /^PROP-\d{4,}$/);
    }

    const otherLead = await makeLead(fixture, fixture.otherWorkspaceId);
    const otherOpportunity = await makeOpportunity(
      fixture,
      otherLead.id,
      fixture.otherWorkspaceId,
      fixture.otherOwnerId,
    );
    const otherProposal = await makeProposal(
      fixture,
      otherOpportunity.opportunity.id,
      { prefill: false },
      { workspaceId: fixture.otherWorkspaceId, userId: fixture.otherOwnerId },
    );
    assert.equal(
      otherProposal.proposal.reference,
      'PROP-0001',
      'each workspace keeps its own reference sequence',
    );
  } finally {
    await cleanup(fixture);
  }
});

test('prefill, regulated snapshot, document export and expiry derivation', { skip }, async () => {
  const fixture = await createFixture();
  try {
    await catalogue.ensureDefaultCatalogue(fixture.workspaceId, fixture.ownerId);
    const options = await catalogue.getCatalogueOptions(fixture.workspaceId);
    const bookkeeping = options.find((entry) => entry.name === 'Bookkeeping');
    assert.ok(bookkeeping?.regulated, 'the fixture needs a regulated catalogue service');

    const lead = await makeLead(fixture);
    const opportunity = await makeOpportunity(fixture, lead.id);

    await opportunities.upsertDiscovery({
      workspaceId: fixture.workspaceId,
      userId: fixture.ownerId,
      opportunityId: opportunity.opportunity.id,
      data: await opportunityValidation.discoverySchema.validate({
        status: 'approved',
        companyOverview: 'A regional manufacturer with 40 staff.',
        expectedOutcomes: 'Reliable monthly books.',
      }),
    });
    await opportunities.createRequirementItem({
      workspaceId: fixture.workspaceId,
      userId: fixture.ownerId,
      opportunityId: opportunity.opportunity.id,
      data: await opportunityValidation.requirementItemCreateSchema.validate({
        serviceId: bookkeeping.id,
        name: 'Monthly bookkeeping',
        status: 'confirmed',
      }),
    });

    const created = await makeProposal(fixture, opportunity.opportunity.id);
    assert.equal(created.items.length, 1, 'confirmed requirements prefill the draft');
    assert.equal(created.items[0].unitPriceCents, 0, 'prices never come from the catalogue');
    assert.equal(created.items[0].billingType, 'one_time');
    assert.match(created.sections.businessUnderstanding, /regional manufacturer/);
    assert.match(created.sections.scopeOfWork, /Monthly bookkeeping/);

    const priced = await saveDraft(fixture, created, [
      line({
        name: 'Monthly bookkeeping',
        serviceId: bookkeeping.id,
        unitPriceCents: 500_000,
      }),
    ]);
    assert.equal(priced.items[0].regulated, true);
    assert.equal(priced.items[0].reviewProfession, 'CA');

    await submit(fixture, created.proposal.id);
    await approve(fixture, created.proposal.id, 'INTERNAL-ONLY-NOTE');

    const document = await proposalsService.buildProposalDocument(
      fixture.workspaceId,
      created.proposal.id,
    );
    assert.equal(document.isClientFacing, true);
    assert.equal(document.disclosures.length, 1);
    assert.equal(document.disclosures[0].profession, 'CA');
    assert.ok(!Object.prototype.hasOwnProperty.call(document, 'approvals'));
    assert.ok(!Object.prototype.hasOwnProperty.call(document, 'activity'));
    assert.ok(
      !JSON.stringify(document).includes('INTERNAL-ONLY-NOTE'),
      'internal approval notes never reach the client document',
    );
    assert.match(document.notice, /does not certify/);

    await proposalsService.recordProposalExport({
      workspaceId: fixture.workspaceId,
      userId: fixture.ownerId,
      proposalId: created.proposal.id,
    });
    const exportAudit = await query(sql`
      select count(*)::int as total from audit_logs
      where workspace_id = ${fixture.workspaceId} and action = 'proposal.export'
    `);
    assert.equal(exportAudit[0].total, 1);

    await query(sql`
      update proposal_versions
      set validity_date = ${new Date(Date.now() - 3 * 24 * 60 * 60 * 1000)}
      where id = ${created.currentVersion.id}
    `);

    const expired = await proposalsService.getProposal(
      fixture.workspaceId,
      created.proposal.id,
    );
    assert.equal(expired.currentVersion.status, 'approved', 'stored status is unchanged');
    assert.equal(expired.currentVersion.displayStatus, 'expired');
    assert.equal(expired.currentVersion.isExpired, true);

    await assert.rejects(
      () => markSent(fixture, created.proposal.id),
      (error) => error.code === 'VALIDITY_EXPIRED' && error.status === 409,
    );

    const overview = await proposalsService.getProposalOverview(fixture.workspaceId);
    assert.equal(overview.expired, 1);
    assert.equal(overview.approved, 1);
    assert.equal(overview.proposalValueCents, 500_000);
  } finally {
    await cleanup(fixture);
  }
});
