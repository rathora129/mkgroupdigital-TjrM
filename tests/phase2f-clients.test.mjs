import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {
  sql,
  query,
  closeDatabase,
  assertDisposableTestUrl,
} from './support/db.mjs';

// Phase 2F-C.2 — clients, engagements and support ticket integration coverage.
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
const engagements = await import('@/lib/clients/engagements');
const tickets = await import('@/lib/clients/tickets');

after(async () => {
  await closeDatabase();
});

async function createWorkspace(label) {
  const suffix = randomUUID();
  const [workspace] = await query(sql`
    insert into workspaces (name, slug)
    values (${`Phase 2F ${label}`}, ${`p2f-cli-${label}-${suffix}`})
    returning id
  `);
  const users = {};
  for (const [key, role] of [
    ['owner', 'owner'],
    ['member', 'member'],
  ]) {
    const [user] = await query(sql`
      insert into users (email, name)
      values (${`p2f-cli-${label}-${key}-${suffix}@example.test`}, ${`${key} person`})
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

async function makeClient(fixture) {
  const data = await clientValidation.clientCreateSchema.validate({
    companyName: `Client ${randomUUID().slice(0, 8)}`,
  });
  const detail = await clientsService.createClient({
    workspaceId: fixture.workspaceId,
    userId: fixture.ownerId,
    data,
  });
  return detail.client;
}

async function auditActions(fixture) {
  const rows = await query(sql`
    select action from audit_logs where workspace_id = ${fixture.workspaceId}
  `);
  return new Set(rows.map((row) => row.action));
}

test('client lifecycle creates, updates and transitions status', { skip }, async () => {
  const fixture = await createFixture();
  try {
    const client = await makeClient(fixture);
    assert.match(client.reference, /^CLI-\d{4,}$/);

    const updated = await clientsService.updateClient({
      workspaceId: fixture.workspaceId,
      userId: fixture.ownerId,
      clientId: client.id,
      data: await clientValidation.clientUpdateSchema.validate({
        expectedUpdatedAt: new Date(client.updatedAt).toISOString(),
        companyName: 'Renamed Co',
        industry: 'Retail',
        status: 'inactive',
      }),
    });
    assert.equal(updated.client.companyName, 'Renamed Co');
    assert.equal(updated.client.status, 'inactive');

    const reactivated = await clientsService.changeClientStatus({
      workspaceId: fixture.workspaceId,
      userId: fixture.ownerId,
      clientId: client.id,
      status: 'active',
      note: 'Client resumed work.',
    });
    assert.equal(reactivated.client.status, 'active');

    // A fresh client has an empty, but valid, project relationship list.
    const projects = await clientsService.listClientProjects(
      fixture.workspaceId,
      client.id,
    );
    assert.ok(Array.isArray(projects));

    const actions = await auditActions(fixture);
    for (const expected of ['client.create', 'client.update', 'client.status']) {
      assert.ok(actions.has(expected), `missing audit action ${expected}`);
    }
  } finally {
    await cleanup(fixture);
  }
});

test('engagement lifecycle validates links and enforces transitions', { skip }, async () => {
  const fixture = await createFixture();
  try {
    const client = await makeClient(fixture);

    const created = await engagements.createEngagement({
      workspaceId: fixture.workspaceId,
      userId: fixture.ownerId,
      data: await clientValidation.engagementCreateSchema.validate({
        clientId: client.id,
        name: 'Retainer',
        managerUserId: fixture.memberId,
        frequency: 'monthly',
        contractValueCents: 500_000,
        currency: 'INR',
        startDate: new Date().toISOString().slice(0, 10),
      }),
    });
    const engagement = created.engagement;
    assert.equal(engagement.status, 'planned');
    assert.equal(engagement.contractValueCents, 500_000);

    const updated = await engagements.updateEngagement({
      workspaceId: fixture.workspaceId,
      userId: fixture.ownerId,
      engagementId: engagement.id,
      data: await clientValidation.engagementUpdateSchema.validate({
        clientId: client.id,
        name: 'Retainer (updated)',
        managerUserId: fixture.memberId,
        frequency: 'monthly',
        contractValueCents: 600_000,
        currency: 'INR',
        expectedUpdatedAt: new Date(engagement.updatedAt).toISOString(),
      }),
    });
    assert.equal(updated.engagement.name, 'Retainer (updated)');
    assert.equal(updated.engagement.contractValueCents, 600_000);

    const active = await engagements.changeEngagementStatus({
      workspaceId: fixture.workspaceId,
      userId: fixture.ownerId,
      engagementId: engagement.id,
      status: 'active',
    });
    assert.equal(active.engagement.status, 'active');
    const paused = await engagements.changeEngagementStatus({
      workspaceId: fixture.workspaceId,
      userId: fixture.ownerId,
      engagementId: engagement.id,
      status: 'paused',
    });
    assert.equal(paused.engagement.status, 'paused');

    // Cross-workspace access is denied by both read and create paths.
    assert.equal(
      await engagements.getEngagement(fixture.otherWorkspaceId, engagement.id),
      null,
    );
    await assert.rejects(
      () =>
        engagements.createEngagement({
          workspaceId: fixture.otherWorkspaceId,
          userId: fixture.otherOwnerId,
          data: { clientId: client.id, name: 'Foreign', status: 'planned', frequency: 'monthly' },
        }),
      (error) => error.status === 404 || error.status === 422,
    );

    const actions = await auditActions(fixture);
    for (const expected of [
      'engagement.create',
      'engagement.update',
      'engagement.status',
    ]) {
      assert.ok(actions.has(expected), `missing audit action ${expected}`);
    }
  } finally {
    await cleanup(fixture);
  }
});

test('support tickets assign, message and transition status', { skip }, async () => {
  const fixture = await createFixture();
  try {
    const client = await makeClient(fixture);

    const created = await tickets.createTicket({
      workspaceId: fixture.workspaceId,
      userId: fixture.ownerId,
      data: await clientValidation.ticketCreateSchema.validate({
        clientId: client.id,
        subject: 'Login problem',
        description: 'Cannot sign in.',
        category: 'technical',
        priority: 'high',
      }),
    });
    const ticket = created.ticket;
    assert.match(ticket.reference, /^TKT-\d{4,}$/);
    assert.equal(ticket.status, 'open');

    const assigned = await tickets.updateTicket({
      workspaceId: fixture.workspaceId,
      userId: fixture.ownerId,
      ticketId: ticket.id,
      data: await clientValidation.ticketUpdateSchema.validate({
        expectedUpdatedAt: new Date(ticket.updatedAt).toISOString(),
        subject: ticket.subject,
        assignedUserId: fixture.memberId,
        category: 'technical',
        priority: 'high',
      }),
    });
    assert.equal(assigned.ticket.status, 'assigned');
    assert.equal(assigned.ticket.assignedUserId, fixture.memberId);

    const withMessage = await tickets.addTicketMessage({
      workspaceId: fixture.workspaceId,
      userId: fixture.ownerId,
      ticketId: ticket.id,
      data: await clientValidation.ticketMessageSchema.validate({
        body: 'We are investigating.',
        visibility: 'client',
      }),
    });
    assert.equal(withMessage.messages.length, 1);
    assert.equal(withMessage.messages[0].visibility, 'client');

    const inProgress = await tickets.changeTicketStatus({
      workspaceId: fixture.workspaceId,
      userId: fixture.ownerId,
      ticketId: ticket.id,
      status: 'in_progress',
    });
    assert.equal(inProgress.ticket.status, 'in_progress');

    const resolved = await tickets.changeTicketStatus({
      workspaceId: fixture.workspaceId,
      userId: fixture.memberId,
      ticketId: ticket.id,
      status: 'resolved',
      resolutionNotes: 'Password reset.',
    });
    assert.equal(resolved.ticket.status, 'resolved');
    assert.ok(resolved.ticket.resolvedAt);

    // Closed is terminal: no further transitions are accepted.
    await tickets.changeTicketStatus({
      workspaceId: fixture.workspaceId,
      userId: fixture.ownerId,
      ticketId: ticket.id,
      status: 'closed',
    });
    await assert.rejects(
      () =>
        tickets.changeTicketStatus({
          workspaceId: fixture.workspaceId,
          userId: fixture.ownerId,
          ticketId: ticket.id,
          status: 'in_progress',
        }),
      (error) => error.code === 'INVALID_STATE' && error.status === 409,
    );

    // Cross-workspace reads and writes return nothing rather than leaking.
    assert.equal(await tickets.getTicket(fixture.otherWorkspaceId, ticket.id), null);
    assert.equal(
      await tickets.addTicketMessage({
        workspaceId: fixture.otherWorkspaceId,
        userId: fixture.otherOwnerId,
        ticketId: ticket.id,
        data: { body: 'foreign', visibility: 'internal' },
      }),
      null,
    );

    const actions = await auditActions(fixture);
    for (const expected of [
      'ticket.create',
      'ticket.update',
      'ticket.message',
      'ticket.status',
    ]) {
      assert.ok(actions.has(expected), `missing audit action ${expected}`);
    }
  } finally {
    await cleanup(fixture);
  }
});
