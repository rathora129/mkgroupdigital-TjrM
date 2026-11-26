import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {
  sql,
  query,
  closeDatabase,
  assertDisposableTestUrl,
} from './support/db.mjs';

// Database-backed Phase 2D-A checks. Runs only against
// PHASE2A_TEST_DATABASE_URL (a disposable database whose name ends in _test).
const TEST_DATABASE_URL = process.env.PHASE2A_TEST_DATABASE_URL || '';
const skip = TEST_DATABASE_URL
  ? false
  : 'set PHASE2A_TEST_DATABASE_URL to a disposable, migrated database';

if (TEST_DATABASE_URL) {
  assertDisposableTestUrl(TEST_DATABASE_URL);
  process.env.DATABASE_URL = TEST_DATABASE_URL;
}

const opportunities = await import('@/lib/opportunities/service');
const opportunityValidation = await import('@/lib/opportunities/validation');
const catalogue = await import('@/lib/service-catalogue/service');
const leads = await import('@/lib/leads/service');
const leadValidation = await import('@/lib/leads/validation');
const runtime = await import('@/lib/ai/runtime');

after(async () => {
  await closeDatabase();
});

async function createWorkspace(label) {
  const suffix = randomUUID();
  const [workspace] = await query(sql`
    insert into workspaces (name, slug)
    values (${`Phase 2D ${label}`}, ${`p2d-${label}-${suffix}`})
    returning id
  `);

  const [owner] = await query(sql`
    insert into users (email, name)
    values (${`p2d-${label}-owner-${suffix}@example.test`}, 'Owner Person')
    returning id
  `);
  await query(sql`
    insert into workspace_memberships (workspace_id, user_id, role)
    values (${workspace.id}, ${owner.id}, 'owner')
  `);

  const [member] = await query(sql`
    insert into users (email, name)
    values (${`p2d-${label}-member-${suffix}@example.test`}, 'Member Person')
    returning id
  `);
  await query(sql`
    insert into workspace_memberships (workspace_id, user_id, role)
    values (${workspace.id}, ${member.id}, 'member')
  `);

  const [outsider] = await query(sql`
    insert into users (email, name)
    values (${`p2d-${label}-outsider-${suffix}@example.test`}, 'Outsider Person')
    returning id
  `);

  return {
    workspaceId: workspace.id,
    ownerId: owner.id,
    memberId: member.id,
    outsiderId: outsider.id,
  };
}

async function createFixture() {
  const main = await createWorkspace('main');
  const other = await createWorkspace('other');
  return {
    ...main,
    otherWorkspaceId: other.workspaceId,
    otherOwnerId: other.ownerId,
    cleanupUsers: [
      main.ownerId,
      main.memberId,
      main.outsiderId,
      other.ownerId,
      other.memberId,
      other.outsiderId,
    ],
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

async function makeOpportunity(fixture, leadId, overrides = {}) {
  const data = await opportunityValidation.opportunityCreateSchema.validate({
    leadId,
    title: `Opportunity ${randomUUID().slice(0, 8)}`,
    ...overrides,
  });
  return opportunities.createOpportunity({
    workspaceId: fixture.workspaceId,
    userId: fixture.ownerId,
    data,
  });
}

async function moveTo(stage, opportunityId, fixture, extra = {}) {
  const path = {
    requirements: ['requirements'],
    proposal: ['requirements', 'proposal'],
    won: ['requirements', 'proposal', 'won'],
  }[stage];
  let last = null;
  for (const step of path) {
    last = await opportunities.changeOpportunityStage({
      workspaceId: fixture.workspaceId,
      userId: fixture.ownerId,
      opportunityId,
      stage: step,
      ...extra,
    });
  }
  return last;
}

test('starter catalogue seeds once, stays workspace-scoped and has no pricing', { skip }, async () => {
  const fixture = await createFixture();
  try {
    const seeded = await catalogue.ensureDefaultCatalogue(
      fixture.workspaceId,
      fixture.ownerId,
    );
    assert.equal(seeded, true);

    const first = await catalogue.listCatalogue(fixture.workspaceId, {
      includeArchived: true,
    });
    assert.equal(first.categories.length, 5);
    assert.equal(first.services.length, 29);
    assert.equal(first.counts.regulated, 11);

    const again = await catalogue.ensureDefaultCatalogue(
      fixture.workspaceId,
      fixture.ownerId,
    );
    assert.equal(again, false);
    const second = await catalogue.listCatalogue(fixture.workspaceId, {
      includeArchived: true,
    });
    assert.equal(second.services.length, 29, 'seeding must be idempotent');

    const options = await catalogue.getCatalogueOptions(fixture.workspaceId);
    assert.equal(options.length, 29);

    const bookkeeping = second.services.find(
      (service) => service.slug === 'bookkeeping',
    );
    assert.equal(bookkeeping.regulated, true);
    assert.equal(bookkeeping.reviewProfession, 'CA');
    assert.equal(
      Object.prototype.hasOwnProperty.call(bookkeeping, 'price'),
      false,
      'the catalogue must not store pricing',
    );

    const other = await catalogue.listCatalogue(fixture.otherWorkspaceId, {
      includeArchived: true,
    });
    assert.equal(other.categories.length, 0, 'other workspaces start empty');
  } finally {
    await cleanup(fixture);
  }
});

test('opportunity lifecycle, assignment, isolation and audit trail', { skip }, async () => {
  const fixture = await createFixture();
  try {
    const lead = await makeLead(fixture);
    const otherLead = await makeLead(fixture, fixture.otherWorkspaceId);

    const created = await makeOpportunity(fixture, lead.id, {
      expectedValueCents: 500_000,
      currency: 'INR',
    });
    assert.equal(created.opportunity.stage, 'discovery');
    assert.equal(created.opportunity.ownerUserId, fixture.ownerId);
    assert.equal(created.allowedTransitions.length, 2);

    const second = await makeOpportunity(fixture, lead.id, {
      expectedValueCents: 100_000,
    });
    assert.notEqual(second.opportunity.id, created.opportunity.id);

    const forLead = await opportunities.listOpportunitiesForLead(
      fixture.workspaceId,
      lead.id,
    );
    assert.equal(forLead.length, 2, 'a lead can hold several opportunities');

    const leadDetail = await leads.getLead(fixture.workspaceId, lead.id);
    assert.equal(leadDetail.opportunities.length, 2);

    const won = await moveTo('won', created.opportunity.id, fixture);
    assert.equal(won.opportunity.stage, 'won');
    assert.equal(won.changed, true);

    const detail = await opportunities.getOpportunity(
      fixture.workspaceId,
      created.opportunity.id,
    );
    assert.equal(detail.stageHistory.length, 4);

    await assert.rejects(
      () =>
        opportunities.changeOpportunityStage({
          workspaceId: fixture.workspaceId,
          userId: fixture.ownerId,
          opportunityId: created.opportunity.id,
          stage: 'discovery',
        }),
      (error) => error.code === 'INVALID_STAGE_TRANSITION' && error.status === 409,
    );

    const third = await makeOpportunity(fixture, lead.id);
    await assert.rejects(
      () =>
        opportunities.changeOpportunityStage({
          workspaceId: fixture.workspaceId,
          userId: fixture.ownerId,
          opportunityId: third.opportunity.id,
          stage: 'lost',
        }),
      (error) => error.code === 'LOST_REASON_REQUIRED' && error.status === 422,
    );

    const lost = await opportunities.changeOpportunityStage({
      workspaceId: fixture.workspaceId,
      userId: fixture.ownerId,
      opportunityId: third.opportunity.id,
      stage: 'lost',
      lostReason: 'Budget withdrawn',
    });
    assert.equal(lost.opportunity.lostReason, 'Budget withdrawn');

    const reopened = await opportunities.changeOpportunityStage({
      workspaceId: fixture.workspaceId,
      userId: fixture.ownerId,
      opportunityId: third.opportunity.id,
      stage: 'discovery',
    });
    assert.equal(reopened.opportunity.stage, 'discovery');
    assert.equal(reopened.opportunity.lostReason, null);

    const assigned = await opportunities.assignOpportunity({
      workspaceId: fixture.workspaceId,
      userId: fixture.ownerId,
      opportunityId: second.opportunity.id,
      ownerUserId: fixture.memberId,
    });
    assert.equal(assigned.changed, true);
    assert.equal(assigned.opportunity.ownerUserId, fixture.memberId);

    await assert.rejects(
      () =>
        opportunities.assignOpportunity({
          workspaceId: fixture.workspaceId,
          userId: fixture.ownerId,
          opportunityId: second.opportunity.id,
          ownerUserId: fixture.outsiderId,
        }),
      (error) => error.code === 'ASSIGNEE_NOT_MEMBER' && error.status === 422,
    );

    await assert.rejects(
      () =>
        opportunities.createOpportunity({
          workspaceId: fixture.workspaceId,
          userId: fixture.ownerId,
          data: {
            leadId: otherLead.id,
            title: 'Cross workspace opportunity',
            priority: 'medium',
            source: 'other',
            currency: 'INR',
          },
        }),
      (error) => error.code === 'LEAD_NOT_FOUND' && error.status === 422,
    );

    assert.equal(
      await opportunities.getOpportunity(
        fixture.otherWorkspaceId,
        created.opportunity.id,
      ),
      null,
      'another workspace must not read this opportunity',
    );

    const open = await opportunities.listOpportunities(
      fixture.workspaceId,
      fixture.ownerId,
      { page: 1, pageSize: 20, scope: 'open', sort: 'created', direction: 'desc' },
    );
    assert.equal(open.total, 2, 'won and reopened records are filtered correctly');

    const audits = await query(sql`
      select action from audit_logs
      where workspace_id = ${fixture.workspaceId}
        and action in (
          'opportunity.create',
          'opportunity.stage_change',
          'opportunity.assign'
        )
    `);
    const actions = new Set(audits.map((row) => row.action));
    assert.ok(actions.has('opportunity.create'));
    assert.ok(actions.has('opportunity.stage_change'));
    assert.ok(actions.has('opportunity.assign'));
  } finally {
    await cleanup(fixture);
  }
});

test('discovery, requirements and the generated requirement document', { skip }, async () => {
  const fixture = await createFixture();
  try {
    const lead = await makeLead(fixture);
    const created = await makeOpportunity(fixture, lead.id);
    const opportunityId = created.opportunity.id;

    await catalogue.ensureDefaultCatalogue(fixture.workspaceId, fixture.ownerId);
    const services = await catalogue.getCatalogueOptions(fixture.workspaceId);
    const bookkeeping = services.find((service) => service.name === 'Bookkeeping');
    assert.ok(bookkeeping);

    const discoveryData = await opportunityValidation.discoverySchema.validate({
      status: 'approved',
      companyOverview: 'Acme makes industrial widgets',
      industry: 'Manufacturing',
      challenges: 'Manual bookkeeping',
      budgetRange: '5 to 8 lakh',
      internalNotes: 'Do not share the internal margin note',
    });
    const saved = await opportunities.upsertDiscovery({
      workspaceId: fixture.workspaceId,
      userId: fixture.ownerId,
      opportunityId,
      data: discoveryData,
    });
    assert.equal(saved.discovery.status, 'approved');
    assert.ok(saved.discovery.completedAt instanceof Date);

    await opportunities.createRequirementItem({
      workspaceId: fixture.workspaceId,
      userId: fixture.ownerId,
      opportunityId,
      data: {
        serviceId: bookkeeping.id,
        name: 'Monthly bookkeeping',
        priority: 'high',
        status: 'requested',
      },
    });
    await opportunities.createRequirementItem({
      workspaceId: fixture.workspaceId,
      userId: fixture.ownerId,
      opportunityId,
      data: {
        name: 'Process review',
        priority: 'medium',
        status: 'in_review',
      },
    });

    const withItems = await opportunities.getOpportunity(
      fixture.workspaceId,
      opportunityId,
    );
    assert.equal(withItems.requirementItems.length, 2);
    const linked = withItems.requirementItems.find(
      (item) => item.name === 'Monthly bookkeeping',
    );
    assert.equal(linked.regulated, true);
    assert.equal(linked.reviewProfession, 'CA');

    await opportunities.updateRequirementItem({
      workspaceId: fixture.workspaceId,
      userId: fixture.ownerId,
      opportunityId,
      requirementId: linked.id,
      data: { status: 'confirmed' },
    });

    const document = await opportunities.buildRequirementDocument(
      fixture.workspaceId,
      opportunityId,
    );
    assert.match(document.reference, /^REQ-/);
    assert.ok(document.text.includes('Acme makes industrial widgets'));
    assert.ok(document.text.includes('Monthly bookkeeping'));
    assert.ok(document.text.includes('Professional review: CA'));
    assert.equal(
      document.text.includes('Do not share the internal margin note'),
      false,
      'internal notes must stay out of the requirement document',
    );

    const otherServices = await catalogue.listCatalogue(
      fixture.otherWorkspaceId,
      { includeArchived: true },
    );
    await catalogue.ensureDefaultCatalogue(
      fixture.otherWorkspaceId,
      fixture.otherOwnerId,
    );
    const foreignService = (
      await catalogue.getCatalogueOptions(fixture.otherWorkspaceId)
    )[0];
    assert.ok(foreignService, `other workspace should seed (${otherServices.length})`);

    await assert.rejects(
      () =>
        opportunities.createRequirementItem({
          workspaceId: fixture.workspaceId,
          userId: fixture.ownerId,
          opportunityId,
          data: { serviceId: foreignService.id, name: 'Foreign service' },
        }),
      (error) => error.code === 'SERVICE_NOT_FOUND' && error.status === 422,
    );

    assert.equal(
      await opportunities.buildRequirementDocument(
        fixture.otherWorkspaceId,
        opportunityId,
      ),
      null,
    );
  } finally {
    await cleanup(fixture);
  }
});

test('opportunity overview separates pipeline value from outcomes', { skip }, async () => {
  const fixture = await createFixture();
  try {
    const lead = await makeLead(fixture);
    const first = await makeOpportunity(fixture, lead.id, {
      expectedValueCents: 500_000,
    });
    await makeOpportunity(fixture, lead.id, { expectedValueCents: 100_000 });
    const third = await makeOpportunity(fixture, lead.id, {
      expectedValueCents: 200_000,
    });
    await moveTo('won', third.opportunity.id, fixture);

    await opportunities.upsertDiscovery({
      workspaceId: fixture.workspaceId,
      userId: fixture.ownerId,
      opportunityId: first.opportunity.id,
      data: { status: 'approved', companyOverview: 'Approved discovery' },
    });
    await opportunities.createRequirementItem({
      workspaceId: fixture.workspaceId,
      userId: fixture.ownerId,
      opportunityId: first.opportunity.id,
      data: { name: 'Requirement in review', status: 'in_review' },
    });

    const overview = await opportunities.getOpportunityOverview(
      fixture.workspaceId,
    );
    assert.equal(overview.total, 3);
    assert.equal(overview.open, 2);
    assert.equal(overview.won, 1);
    assert.equal(overview.lost, 0);
    assert.equal(overview.pipelineValueCents, 600_000);
    assert.equal(overview.pipelineCurrency, 'INR');
    assert.equal(overview.pipelineCurrencies, 1);
    assert.equal(overview.requirementsInReview, 1);
    assert.equal(overview.discoveryApproved, 1);
  } finally {
    await cleanup(fixture);
  }
});

test('service and category management enforces workspace boundaries', { skip }, async () => {
  const fixture = await createFixture();
  try {
    await catalogue.ensureDefaultCatalogue(fixture.workspaceId, fixture.ownerId);
    await catalogue.ensureDefaultCatalogue(
      fixture.otherWorkspaceId,
      fixture.otherOwnerId,
    );

    const category = await catalogue.createCategory({
      workspaceId: fixture.workspaceId,
      userId: fixture.ownerId,
      data: { name: 'Custom Delivery' },
    });
    assert.equal(category.slug, 'custom-delivery');

    const service = await catalogue.createService({
      workspaceId: fixture.workspaceId,
      userId: fixture.ownerId,
      data: {
        categoryId: category.id,
        name: 'Delivery audit',
        billingType: 'one_time',
      },
    });
    assert.equal(service.status, 'active');
    assert.equal(service.regulated, false);

    await assert.rejects(
      () =>
        catalogue.createService({
          workspaceId: fixture.workspaceId,
          userId: fixture.ownerId,
          data: {
            categoryId: category.id,
            name: 'Unreviewed statutory filing',
            regulated: true,
          },
        }),
      (error) => error.code === 'REVIEWER_REQUIRED' && error.status === 422,
    );

    await catalogue.updateService({
      workspaceId: fixture.workspaceId,
      userId: fixture.ownerId,
      serviceId: service.id,
      data: { status: 'archived' },
    });

    const activeOnly = await catalogue.listCatalogue(fixture.workspaceId);
    assert.equal(
      activeOnly.services.some((row) => row.id === service.id),
      false,
      'archived services are hidden from active selection',
    );
    const options = await catalogue.getCatalogueOptions(fixture.workspaceId);
    assert.equal(options.some((row) => row.id === service.id), false);

    const all = await catalogue.listCatalogue(fixture.workspaceId, {
      includeArchived: true,
    });
    const archived = all.services.find((row) => row.id === service.id);
    assert.equal(archived.status, 'archived');

    const foreignCategory = (
      await catalogue.listCatalogue(fixture.otherWorkspaceId, {
        includeArchived: true,
      })
    ).categories[0];
    await assert.rejects(
      () =>
        catalogue.createService({
          workspaceId: fixture.workspaceId,
          userId: fixture.ownerId,
          data: {
            categoryId: foreignCategory.id,
            name: 'Cross workspace service',
          },
        }),
      (error) => error.code === 'CATEGORY_NOT_FOUND' && error.status === 422,
    );

    assert.equal(
      await catalogue.findService(fixture.otherWorkspaceId, service.id),
      null,
    );
  } finally {
    await cleanup(fixture);
  }
});

test('AI drafts queue through existing agents and fail honestly when unconfigured', { skip }, async () => {
  const fixture = await createFixture();
  try {
    const lead = await makeLead(fixture);
    const created = await makeOpportunity(fixture, lead.id);
    const opportunityId = created.opportunity.id;

    await assert.rejects(
      () =>
        opportunities.requestOpportunityAiDraft({
          workspaceId: fixture.workspaceId,
          userId: fixture.ownerId,
          opportunityId,
        }),
      (error) => error.code === 'AI_AGENT_REQUIRED' && error.status === 409,
    );

    const agent = await runtime.createAgent({
      workspaceId: fixture.workspaceId,
      userId: fixture.ownerId,
      data: {
        name: 'Sales Assistant',
        type: 'sales_assistant',
        instructions: 'Summarise discovery notes as an internal draft.',
        provider: 'openai',
        model: 'gpt-4o-mini',
        enabled: true,
        approvalRequired: false,
      },
    });

    const savedKeys = {};
    for (const key of [
      'OPENAI_API_KEY',
      'ANTHROPIC_API_KEY',
      'GEMINI_API_KEY',
      'GOOGLE_API_KEY',
    ]) {
      savedKeys[key] = process.env[key];
      delete process.env[key];
    }
    try {
      await assert.rejects(
        () =>
          opportunities.requestOpportunityAiDraft({
            workspaceId: fixture.workspaceId,
            userId: fixture.ownerId,
            opportunityId,
          }),
        (error) => error.code === 'AI_NOT_CONFIGURED' && error.status === 409,
      );
    } finally {
      for (const [key, value] of Object.entries(savedKeys)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }

    await runtime.updateAgent({
      workspaceId: fixture.workspaceId,
      agentId: agent.id,
      userId: fixture.ownerId,
      data: { approvalRequired: true },
    });

    const result = await opportunities.requestOpportunityAiDraft({
      workspaceId: fixture.workspaceId,
      userId: fixture.ownerId,
      opportunityId,
    });
    assert.equal(result.agent.id, agent.id);
    assert.equal(result.run.status, 'awaiting_approval');
    assert.equal(result.run.approvalRequired, true);

    assert.equal(
      await opportunities.requestOpportunityAiDraft({
        workspaceId: fixture.otherWorkspaceId,
        userId: fixture.otherOwnerId,
        opportunityId,
      }),
      null,
    );
  } finally {
    await cleanup(fixture);
  }
});
