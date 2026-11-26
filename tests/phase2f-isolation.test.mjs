import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {
  sql,
  query,
  closeDatabase,
  assertDisposableTestUrl,
} from './support/db.mjs';

// Phase 2F-D — cross-workspace isolation for records not already covered by the
// per-module Phase 2C/2D/2E suites (leads, requirements, knowledge, memory).
const TEST_DATABASE_URL = process.env.PHASE2A_TEST_DATABASE_URL || '';
const skip = TEST_DATABASE_URL
  ? false
  : 'set PHASE2A_TEST_DATABASE_URL to a disposable, migrated database';

if (TEST_DATABASE_URL) {
  assertDisposableTestUrl(TEST_DATABASE_URL);
  process.env.DATABASE_URL = TEST_DATABASE_URL;
}

const leads = await import('@/lib/leads/service');
const leadValidation = await import('@/lib/leads/validation');
const opportunities = await import('@/lib/opportunities/service');
const opportunityValidation = await import('@/lib/opportunities/validation');
const knowledge = await import('@/lib/knowledge/service');
const memory = await import('@/lib/knowledge/memory');
const knowledgeValidation = await import('@/lib/knowledge/validation');

after(async () => {
  await closeDatabase();
});

async function createWorkspace(label) {
  const suffix = randomUUID();
  const [workspace] = await query(sql`
    insert into workspaces (name, slug)
    values (${`Phase 2F iso ${label}`}, ${`p2f-iso-${label}-${suffix}`})
    returning id
  `);
  const [user] = await query(sql`
    insert into users (email, name)
    values (${`p2f-iso-${label}-${suffix}@example.test`}, ${'owner person'})
    returning id
  `);
  await query(sql`
    insert into workspace_memberships (workspace_id, user_id, role)
    values (${workspace.id}, ${user.id}, 'owner')
  `);
  return { workspaceId: workspace.id, ownerId: user.id };
}

async function createFixture() {
  const main = await createWorkspace('main');
  const other = await createWorkspace('other');
  return { main, other };
}

async function cleanup(fixture) {
  const ids = [fixture.main.workspaceId, fixture.other.workspaceId];
  await query(sql`
    delete from audit_logs where workspace_id in (${ids[0]}, ${ids[1]})
  `);
  await query(sql`
    delete from workspaces where id in (${ids[0]}, ${ids[1]})
  `);
  for (const ownerId of [fixture.main.ownerId, fixture.other.ownerId]) {
    await query(sql`delete from users where id = ${ownerId}`);
  }
}

async function makeLead(workspaceId, ownerId) {
  const data = await leadValidation.leadCreateSchema.validate({
    companyName: `Lead ${randomUUID().slice(0, 8)}`,
    email: `lead-${randomUUID().slice(0, 8)}@iso.test`,
  });
  const detail = await leads.createLead({ workspaceId, userId: ownerId, data });
  return detail.lead;
}

test('leads, opportunities and requirements never leak across workspaces', { skip }, async () => {
  const fixture = await createFixture();
  const { main, other } = fixture;
  try {
    const lead = await makeLead(main.workspaceId, main.ownerId);

    assert.equal(await leads.getLead(other.workspaceId, lead.id), null);
    const otherLeads = await leads.listLeads(
      other.workspaceId,
      other.ownerId,
      await leadValidation.leadQuerySchema.validate({}),
    );
    assert.equal(otherLeads.total, 0);

    const opportunity = await opportunities.createOpportunity({
      workspaceId: main.workspaceId,
      userId: main.ownerId,
      data: await opportunityValidation.opportunityCreateSchema.validate({
        leadId: lead.id,
        title: 'Isolation opportunity',
      }),
    });
    const opportunityId = opportunity.opportunity.id;

    assert.equal(
      await opportunities.getOpportunity(other.workspaceId, opportunityId),
      null,
    );

    const requirementData =
      await opportunityValidation.requirementItemCreateSchema.validate({
        name: 'Discovery workshop',
      });
    assert.equal(
      await opportunities.createRequirementItem({
        workspaceId: other.workspaceId,
        userId: main.ownerId,
        opportunityId,
        data: requirementData,
      }),
      null,
      'a foreign workspace cannot add a requirement to this opportunity',
    );

    const otherOpportunities = await opportunities.listOpportunities(
      other.workspaceId,
      other.ownerId,
      await opportunityValidation.opportunityQuerySchema.validate({}),
    );
    assert.equal(otherOpportunities.total, 0);
  } finally {
    await cleanup(fixture);
  }
});

test('knowledge entries and memories stay inside their workspace', { skip }, async () => {
  const fixture = await createFixture();
  const { main, other } = fixture;
  try {
    const entry = await knowledge.createKnowledgeEntry({
      workspaceId: main.workspaceId,
      userId: main.ownerId,
      data: await knowledgeValidation.knowledgeEntryCreateSchema.validate({
        title: 'Service handover policy',
        content: 'Handovers are recorded in the shared workspace drive.',
        status: 'published',
      }),
    });
    const entryId = entry.entry.id;

    assert.equal(await knowledge.getKnowledgeEntry(other.workspaceId, entryId), null);
    const otherKnowledge = await knowledge.listKnowledge(
      other.workspaceId,
      await knowledgeValidation.knowledgeQuerySchema.validate({}),
    );
    assert.equal(otherKnowledge.total, 0);

    const createdMemory = await memory.createMemory({
      workspaceId: main.workspaceId,
      userId: main.ownerId,
      data: await knowledgeValidation.memoryCreateSchema.validate({
        memoryType: 'workspace',
        key: 'billing-currency',
        content: 'All invoices default to INR unless a client contract says otherwise.',
      }),
    });
    const memoryId = createdMemory.memory?.id || createdMemory.id;

    assert.equal(await memory.getMemory(other.workspaceId, memoryId), null);
    const otherMemories = await memory.listMemories(
      other.workspaceId,
      await knowledgeValidation.memoryQuerySchema.validate({}),
    );
    assert.equal(otherMemories.total, 0);

    // Audit events carry the owning workspace and are never shared.
    const otherAudit = await query(sql`
      select count(*)::int as count from audit_logs where workspace_id = ${other.workspaceId}
    `);
    assert.equal(otherAudit[0].count, 0);
  } finally {
    await cleanup(fixture);
  }
});
