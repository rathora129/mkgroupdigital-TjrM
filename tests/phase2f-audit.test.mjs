import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { formatAuditAction, formatResourceType, AUDIT_ACTION_OPTIONS } from '@/lib/audit-labels';
import { sanitizeMetadata } from '@/lib/audit';
import {
  sql,
  query,
  closeDatabase,
  assertDisposableTestUrl,
} from './support/db.mjs';

// Phase 2F-H — audit logging and traceability: labels stay accurate, metadata
// is sanitised, and every mutation records the correct actor, workspace and
// resource without leaking sensitive fields.
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
const proposalsService = await import('@/lib/proposals/service');
const proposalsValidation = await import('@/lib/proposals/validation');
const clientsService = await import('@/lib/clients/service');
const clientValidation = await import('@/lib/clients/validation');
const knowledge = await import('@/lib/knowledge/service');
const knowledgeValidation = await import('@/lib/knowledge/validation');
const memory = await import('@/lib/knowledge/memory');
const billing = await import('@/lib/billing/service');
const billingValidation = await import('@/lib/billing/validation');

after(async () => {
  await closeDatabase();
});

const EXPECTED_LABELS = {
  'lead.create': 'Lead created',
  'lead.update': 'Lead updated',
  'lead.status_change': 'Lead status changed',
  'lead.assign': 'Lead owner assigned',
  'lead.archive': 'Lead archived',
  'lead.restore': 'Lead restored',
  'lead.note': 'Lead note added',
  'opportunity.create': 'Opportunity created',
  'opportunity.update': 'Opportunity updated',
  'opportunity.stage_change': 'Opportunity stage changed',
  'opportunity.assign': 'Opportunity owner assigned',
  'opportunity.note': 'Opportunity note added',
  'opportunity.ai_draft': 'Opportunity AI draft requested',
  'requirement.discovery_update': 'Discovery notes updated',
  'requirement.item_create': 'Requirement item added',
  'requirement.item_update': 'Requirement item updated',
  'research.create': 'Research requested',
  'research.started': 'Research started',
  'research.completed': 'Research completed',
  'research.failed': 'Research failed',
  'research.cancelled': 'Research cancelled',
  'research.cancel': 'Research cancellation requested',
  'website_audit.create': 'Website audit requested',
  'website_audit.completed': 'Website audit completed',
  'website_audit.failed': 'Website audit failed',
  'website_audit.cancel': 'Website audit cancellation requested',
  'website_audit.cancelled': 'Website audit cancelled',
  'service_catalogue.seed': 'Service catalogue seeded',
  'service_category.create': 'Service category created',
  'service_category.update': 'Service category updated',
  'service.create': 'Service created',
  'service.update': 'Service updated',
  'client.status': 'Client status changed',
  'client.contact_update': 'Client contact updated',
  'client.timeline_entry': 'Client timeline entry added',
  'client.ai_brief': 'Client AI brief requested',
  'engagement.status': 'Service engagement status changed',
  'ticket.status': 'Support request status changed',
  'ticket.ai_draft': 'Support request AI draft requested',
};

test('every emitted audit action has an explicit, readable label', () => {
  for (const [action, label] of Object.entries(EXPECTED_LABELS)) {
    assert.equal(formatAuditAction(action), label, `label for ${action}`);
    assert.ok(
      AUDIT_ACTION_OPTIONS.includes(action),
      `${action} must be selectable in the audit filter`,
    );
  }
  assert.equal(formatAuditAction('client.ai_brief').includes('Ai '), false);
  assert.equal(formatAuditAction(null), 'Unknown action');
  assert.equal(formatAuditAction('custom.event_name'), 'Custom Event Name');
  assert.equal(formatResourceType('lead'), 'Lead');
  assert.equal(formatResourceType('research_job'), 'Research job');
  assert.equal(formatResourceType('website_audit'), 'Website audit');
  assert.equal(formatResourceType(null), '—');
});

test('audit metadata drops sensitive keys and bounds its payload', () => {
  const sanitized = sanitizeMetadata({
    reference: 'INV-0001',
    totalCents: 118_000,
    password: 'should-not-survive',
    accessToken: 'should-not-survive',
    apiKey: 'should-not-survive',
    secret: 'should-not-survive',
    sessionId: 'should-not-survive',
    credentials: { user: 'x', pass: 'y' },
    nested: { keep: 'yes', authHeader: 'drop me' },
    note: 'x'.repeat(500),
    items: Array.from({ length: 30 }, (_, index) => index),
  });
  assert.deepEqual(Object.keys(sanitized).sort(), [
    'items',
    'nested',
    'note',
    'reference',
    'totalCents',
  ]);
  assert.deepEqual(sanitized.nested, { keep: 'yes' });
  assert.equal(sanitized.note.length, 300);
  assert.equal(sanitized.items.length, 20);
  assert.equal(sanitized.reference, 'INV-0001');
  assert.equal(sanitized.totalCents, 118_000);

  const deep = sanitizeMetadata({ a: { b: { c: { d: 'too deep' } } } });
  assert.deepEqual(deep.a.b.c, { d: '[truncated]' });
});

async function createWorkspace(label) {
  const suffix = randomUUID();
  const [workspace] = await query(sql`
    insert into workspaces (name, slug)
    values (${`Phase 2F ${label}`}, ${`p2f-audit-${label}-${suffix}`})
    returning id
  `);
  const users = {};
  for (const [key, role] of [
    ['owner', 'owner'],
    ['member', 'member'],
  ]) {
    const [user] = await query(sql`
      insert into users (email, name)
      values (${`p2f-audit-${label}-${key}-${suffix}@example.test`}, ${`${key} person`})
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

test('mutations record the actor, workspace and resource across modules', { skip }, async () => {
  const fixture = await createFixture();
  try {
    const leadData = await leadValidation.leadCreateSchema.validate({
      companyName: `Trace ${randomUUID().slice(0, 6)}`,
      email: `trace-${randomUUID().slice(0, 8)}@trace.test`,
      website: 'https://www.trace.test',
    });
    const lead = (await leads.createLead({
      workspaceId: fixture.workspaceId,
      userId: fixture.ownerId,
      data: leadData,
    })).lead;

    const opportunityData = await opportunityValidation.opportunityCreateSchema.validate({
      leadId: lead.id,
      title: `Trace opportunity ${randomUUID().slice(0, 6)}`,
    });
    const opportunity = (await opportunities.createOpportunity({
      workspaceId: fixture.workspaceId,
      userId: fixture.ownerId,
      data: opportunityData,
    })).opportunity;

    const proposalData = await proposalsValidation.proposalCreateSchema.validate({
      opportunityId: opportunity.id,
      prefill: false,
    });
    await proposalsService.createProposal({
      workspaceId: fixture.workspaceId,
      userId: fixture.ownerId,
      data: proposalData,
    });

    const client = (await clientsService.createClient({
      workspaceId: fixture.workspaceId,
      userId: fixture.ownerId,
      data: await clientValidation.clientCreateSchema.validate({
        companyName: `Trace client ${randomUUID().slice(0, 6)}`,
      }),
    })).client;

    await knowledge.createKnowledgeEntry({
      workspaceId: fixture.workspaceId,
      userId: fixture.ownerId,
      data: await knowledgeValidation.knowledgeEntryCreateSchema.validate({
        title: `Trace entry ${randomUUID().slice(0, 6)}`,
        content: 'Documented trace procedure for operational review.',
      }),
    });

    await memory.createMemory({
      workspaceId: fixture.workspaceId,
      userId: fixture.ownerId,
      data: await knowledgeValidation.memoryCreateSchema.validate({
        memoryType: 'workspace',
        key: `trace-${randomUUID().slice(0, 8)}`,
        content: 'A durable trace fact for the workspace.',
      }),
    });

    const created = await billing.createInvoice({
      workspaceId: fixture.workspaceId,
      userId: fixture.ownerId,
      data: await billingValidation.invoiceCreateSchema.validate({
        source: 'manual',
        clientId: client.id,
        invoiceDate: new Date().toISOString().slice(0, 10),
        lines: [
          {
            description: 'Trace work',
            quantity: 1,
            unitPriceCents: 50_000,
            taxScheme: 'cgst_sgst',
            taxRateBps: 1_800,
          },
        ],
      }),
    });
    const invoiceBase = {
      workspaceId: fixture.workspaceId,
      userId: fixture.ownerId,
      invoiceId: created.invoice.id,
    };
    await billing.submitInvoice(invoiceBase);
    await billing.approveInvoice(invoiceBase);
    await billing.issueInvoice(invoiceBase);
    await billing.recordPayment({
      workspaceId: fixture.workspaceId,
      userId: fixture.ownerId,
      data: await billingValidation.paymentCreateSchema.validate({
        invoiceId: created.invoice.id,
        amountCents: 10_000,
        paymentDate: new Date().toISOString().slice(0, 10),
        method: 'upi',
      }),
    });

    // A refused operation must not leave a success audit behind.
    await assert.rejects(
      () =>
        billing.updateDraftInvoice({
          workspaceId: fixture.workspaceId,
          userId: fixture.ownerId,
          invoiceId: created.invoice.id,
          data: { expectedUpdatedAt: new Date().toISOString(), lines: [] },
        }),
      (error) => error.code === 'INVOICE_LOCKED',
    );

    const rows = await query(sql`
      select action, actor_user_id, actor_type, resource_type, resource_id, success, metadata
      from audit_logs
      where workspace_id = ${fixture.workspaceId}
      order by created_at asc, id asc
    `);

    const expected = [
      'lead.create',
      'opportunity.create',
      'proposal.create',
      'client.create',
      'knowledge.create',
      'memory.create',
      'invoice.create',
      'invoice.submit',
      'invoice.approve',
      'invoice.issue',
      'payment.record',
    ];
    const actions = rows.map((row) => row.action);
    for (const action of expected) {
      assert.ok(actions.includes(action), `expected an audit row for ${action}`);
    }
    assert.equal(
      actions.filter((action) => action === 'invoice.create').length,
      1,
      'a refused update must not duplicate or falsify audit rows',
    );

    for (const row of rows) {
      assert.equal(row.actor_user_id, fixture.ownerId, `${row.action} actor`);
      assert.equal(row.actor_type, 'user', `${row.action} actor type`);
      assert.equal(row.success, true, `${row.action} success`);
      assert.ok(row.resource_type, `${row.action} resource type`);
      assert.ok(row.resource_id, `${row.action} resource id`);
      for (const key of Object.keys(row.metadata || {})) {
        assert.doesNotMatch(
          key,
          /pass|token|secret|key|auth|cookie|session|credential/i,
          `${row.action} metadata must not carry the sensitive key "${key}"`,
        );
      }
    }

    const byAction = new Map(rows.map((row) => [row.action, row]));
    assert.equal(byAction.get('client.create').resource_type, 'client');
    assert.equal(byAction.get('client.create').resource_id, client.id);
    assert.equal(byAction.get('lead.create').resource_type, 'lead');
    assert.equal(byAction.get('lead.create').resource_id, lead.id);
    assert.equal(byAction.get('proposal.create').resource_type, 'proposal');
    assert.equal(byAction.get('invoice.issue').resource_type, 'invoice');
    assert.equal(byAction.get('payment.record').resource_type, 'payment');
    assert.equal(byAction.get('payment.record').metadata.amountCents, 10_000);

    // Another workspace's events are not visible in this workspace's trail.
    const otherLead = (await leads.createLead({
      workspaceId: fixture.otherWorkspaceId,
      userId: fixture.otherOwnerId,
      data: await leadValidation.leadCreateSchema.validate({
        companyName: `Other ${randomUUID().slice(0, 6)}`,
      }),
    })).lead;
    const otherRows = await query(sql`
      select action, resource_id from audit_logs where workspace_id = ${fixture.otherWorkspaceId}
    `);
    assert.equal(otherRows.length, 1);
    assert.equal(otherRows[0].action, 'lead.create');
    assert.equal(otherRows[0].resource_id, otherLead.id);
    const mainLeadIds = rows
      .filter((row) => row.action === 'lead.create')
      .map((row) => row.resource_id);
    assert.deepEqual(mainLeadIds, [lead.id]);
  } finally {
    await cleanup(fixture);
  }
});
