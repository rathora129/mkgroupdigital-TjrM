import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {
  sql,
  query,
  closeDatabase,
  assertDisposableTestUrl,
} from './support/db.mjs';

// Phase 2I notification centre and owner dashboard checks. Notifications are
// scoped to the recipient, and the dashboard keeps owner-reported money apart
// from verified finance records. Database fixtures only run against a
// disposable migrated database (name must end in _test).
const TEST_DATABASE_URL = process.env.PHASE2A_TEST_DATABASE_URL || '';
const skip = TEST_DATABASE_URL
  ? false
  : 'set PHASE2A_TEST_DATABASE_URL to a disposable, migrated database';

if (TEST_DATABASE_URL) {
  assertDisposableTestUrl(TEST_DATABASE_URL);
  process.env.DATABASE_URL = TEST_DATABASE_URL;
}

const notifications = await import('@/lib/notifications/service');
const leadService = await import('@/lib/leads/service');
const meetingsService = await import('@/lib/meetings/service');
const analytics = await import('@/lib/analytics/owner-dashboard');
const { hasPermission, permissionsFor } = await import('@/lib/auth/permissions');

after(async () => {
  await closeDatabase();
});

const DAY_MS = 24 * 60 * 60 * 1000;

test('notification types cover assignments and meetings', () => {
  assert.equal(notifications.NOTIFICATION_TYPES.leadAssigned, 'lead_assigned');
  assert.equal(
    notifications.NOTIFICATION_TYPES.meetingScheduled,
    'meeting_scheduled',
  );
  assert.ok(notifications.NOTIFICATION_LEVELS.includes('warning'));
});

test('phase 2I permissions stay inside the intended roles', () => {
  assert.equal(hasPermission('owner', 'dashboard.view'), true);
  assert.equal(hasPermission('manager', 'dashboard.view'), true);
  assert.equal(hasPermission('member', 'dashboard.view'), false);
  assert.equal(hasPermission('viewer', 'dashboard.view'), false);

  assert.equal(hasPermission('viewer', 'notifications.view'), true);
  assert.equal(permissionsFor('viewer').includes('calls.log'), false);

  assert.equal(hasPermission('manager', 'leads.convert'), true);
  assert.equal(hasPermission('member', 'leads.convert'), false);

  assert.equal(hasPermission('manager', 'leads.view_all'), true);
  assert.equal(hasPermission('member', 'leads.view_all'), false);

  assert.equal(hasPermission('admin', 'leads.import'), true);
  assert.equal(hasPermission('manager', 'leads.import'), false);
});

async function createFixture() {
  const suffix = randomUUID();
  const [workspace] = await query(sql`
    insert into workspaces (name, slug)
    values ('Phase 2I notifications', ${`p2i-notify-${suffix}`})
    returning id
  `);
  const [owner] = await query(sql`
    insert into users (email, name)
    values (${`p2i-notify-owner-${suffix}@example.test`}, 'Notify Owner')
    returning id
  `);
  const [caller] = await query(sql`
    insert into users (email, name)
    values (${`p2i-notify-caller-${suffix}@example.test`}, 'Notify Caller')
    returning id
  `);
  await query(sql`
    insert into workspace_memberships (workspace_id, user_id, role)
    values
      (${workspace.id}, ${owner.id}, 'owner'),
      (${workspace.id}, ${caller.id}, 'member')
  `);
  return { workspaceId: workspace.id, ownerId: owner.id, callerId: caller.id, suffix };
}

async function cleanup(fixture) {
  await query(sql`delete from payments where workspace_id = ${fixture.workspaceId}`);
  await query(sql`delete from invoices where workspace_id = ${fixture.workspaceId}`);
  await query(
    sql`delete from client_timeline_entries where workspace_id = ${fixture.workspaceId}`,
  );
  await query(sql`delete from clients where workspace_id = ${fixture.workspaceId}`);
  await query(sql`delete from audit_logs where workspace_id = ${fixture.workspaceId}`);
  await query(sql`delete from notifications where workspace_id = ${fixture.workspaceId}`);
  await query(sql`delete from meetings where workspace_id = ${fixture.workspaceId}`);
  await query(sql`delete from project_tasks where workspace_id = ${fixture.workspaceId}`);
  await query(sql`delete from lead_activities where workspace_id = ${fixture.workspaceId}`);
  await query(sql`delete from lead_status_history where workspace_id = ${fixture.workspaceId}`);
  await query(sql`delete from leads where workspace_id = ${fixture.workspaceId}`);
  await query(sql`delete from workspaces where id = ${fixture.workspaceId}`);
  await query(
    sql`delete from users where id in (${fixture.ownerId}, ${fixture.callerId})`,
  );
}

function fullAccess(userId) {
  return { userId, canViewAll: true };
}

async function createLead(fixture, { companyName, assignedUserId }) {
  const created = await leadService.createLead({
    workspaceId: fixture.workspaceId,
    userId: fixture.ownerId,
    data: { companyName, assignedUserId },
  });
  return created.lead;
}

test('notifications are listed and read per recipient only', { skip }, async () => {
  const fixture = await createFixture();
  try {
    const first = await notifications.createNotification({
      workspaceId: fixture.workspaceId,
      userId: fixture.callerId,
      type: 'follow_up_due',
      title: 'Follow-up due soon',
      actionUrl: '/workspace/tasks',
    });
    await notifications.createNotification({
      workspaceId: fixture.workspaceId,
      userId: fixture.callerId,
      type: 'meeting_scheduled',
      title: 'Meeting scheduled',
    });
    await notifications.createNotification({
      workspaceId: fixture.workspaceId,
      userId: fixture.ownerId,
      type: 'lead_assigned',
      title: 'Owner notice',
    });

    const callerList = await notifications.listNotifications({
      workspaceId: fixture.workspaceId,
      userId: fixture.callerId,
    });
    assert.equal(callerList.total, 2);
    assert.equal(callerList.unreadTotal, 2);
    assert.equal(callerList.items.every((item) => item.unread), true);

    const ownerList = await notifications.listNotifications({
      workspaceId: fixture.workspaceId,
      userId: fixture.ownerId,
    });
    assert.equal(ownerList.total, 1);

    const unauthorized = await notifications.markNotificationRead({
      workspaceId: fixture.workspaceId,
      userId: fixture.ownerId,
      notificationId: first.id,
    });
    assert.equal(unauthorized, null);

    const read = await notifications.markNotificationRead({
      workspaceId: fixture.workspaceId,
      userId: fixture.callerId,
      notificationId: first.id,
    });
    assert.ok(read.readAt);

    const updated = await notifications.markAllNotificationsRead({
      workspaceId: fixture.workspaceId,
      userId: fixture.callerId,
    });
    assert.equal(updated, 1);

    const unreadOnly = await notifications.listNotifications({
      workspaceId: fixture.workspaceId,
      userId: fixture.callerId,
      unreadOnly: true,
    });
    assert.equal(unreadOnly.total, 0);
    assert.equal(unreadOnly.allTotal, 2);
    assert.equal(unreadOnly.unreadTotal, 0);

    const ownerUnread = await notifications.countUnreadNotifications(
      fixture.workspaceId,
      fixture.ownerId,
    );
    assert.equal(ownerUnread, 1);
  } finally {
    await cleanup(fixture);
  }
});

test('assigning a lead notifies the assignee once', { skip }, async () => {
  const fixture = await createFixture();
  try {
    const lead = await createLead(fixture, { companyName: 'Assignment Co' });

    const assigned = await leadService.assignLead({
      workspaceId: fixture.workspaceId,
      userId: fixture.ownerId,
      leadId: lead.id,
      assignedUserId: fixture.callerId,
    });
    assert.equal(assigned.changed, true);

    const rows = await query(sql`
      select type, title, action_url, user_id
      from notifications
      where workspace_id = ${fixture.workspaceId}
    `);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].type, 'lead_assigned');
    assert.equal(rows[0].user_id, fixture.callerId);
    assert.equal(rows[0].action_url, `/workspace/leads/${lead.id}`);

    const repeat = await leadService.assignLead({
      workspaceId: fixture.workspaceId,
      userId: fixture.ownerId,
      leadId: lead.id,
      assignedUserId: fixture.callerId,
    });
    assert.equal(repeat.changed, false);

    const afterRepeat = await query(sql`
      select count(*)::int as count
      from notifications
      where workspace_id = ${fixture.workspaceId}
    `);
    assert.equal(afterRepeat[0].count, 1);

    const selfAssign = await leadService.assignLead({
      workspaceId: fixture.workspaceId,
      userId: fixture.ownerId,
      leadId: lead.id,
      assignedUserId: fixture.ownerId,
    });
    assert.equal(selfAssign.changed, true);

    const afterSelf = await query(sql`
      select count(*)::int as count
      from notifications
      where workspace_id = ${fixture.workspaceId}
    `);
    assert.equal(afterSelf[0].count, 1);
  } finally {
    await cleanup(fixture);
  }
});

test('scheduling a meeting notifies the lead assignee', { skip }, async () => {
  const fixture = await createFixture();
  try {
    const lead = await createLead(fixture, {
      companyName: 'Meeting Notice Co',
      assignedUserId: fixture.callerId,
    });

    const startsAt = new Date(Date.now() + DAY_MS);
    const created = await meetingsService.createMeeting({
      workspaceId: fixture.workspaceId,
      userId: fixture.ownerId,
      data: {
        title: 'Kickoff meeting',
        leadId: lead.id,
        startsAt,
        endsAt: new Date(startsAt.getTime() + 30 * 60 * 1000),
        timezone: 'UTC',
      },
      access: fullAccess(fixture.ownerId),
    });
    assert.ok(created.meeting.id);

    const rows = await query(sql`
      select type, user_id, action_url
      from notifications
      where workspace_id = ${fixture.workspaceId}
    `);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].type, 'meeting_scheduled');
    assert.equal(rows[0].user_id, fixture.callerId);
    assert.equal(rows[0].action_url, '/workspace/meetings');
  } finally {
    await cleanup(fixture);
  }
});

test('owner dashboard separates reported money from verified finance', { skip }, async () => {
  const fixture = await createFixture();
  try {
    const first = await createLead(fixture, { companyName: 'Reported Co' });
    await leadService.updateLeadReportedAmounts({
      workspaceId: fixture.workspaceId,
      userId: fixture.ownerId,
      leadId: first.id,
      data: {
        reportedAmountReceivedCents: 150_000,
        reportedOutstandingCents: 50_000,
        reportedProjectCostCents: 25_000,
      },
      access: fullAccess(fixture.ownerId),
    });

    const second = await createLead(fixture, { companyName: 'Verified Co' });
    await leadService.updateLeadReportedAmounts({
      workspaceId: fixture.workspaceId,
      userId: fixture.ownerId,
      leadId: second.id,
      data: {
        reportedAmountReceivedCents: 100_000,
        reportedAmountVerified: true,
      },
      access: fullAccess(fixture.ownerId),
    });

    const [client] = await query(sql`
      insert into clients (workspace_id, reference, company_name, email)
      values (${fixture.workspaceId}, ${`CLI-DASH-${fixture.suffix.slice(0, 8)}`},
              'Verified Co', 'billing@verified.example.test')
      returning id
    `);

    const [invoice] = await query(sql`
      insert into invoices
        (workspace_id, reference, client_id, currency, invoice_date, status,
         subtotal_cents, total_cents, amount_paid_cents, balance_due_cents)
      values
        (${fixture.workspaceId}, ${`INV-DASH-${fixture.suffix.slice(0, 8)}`},
         ${client.id}, 'INR', now(), 'issued', 100000, 100000, 40000, 60000)
      returning id
    `);

    await query(sql`
      insert into payments
        (workspace_id, reference, invoice_id, client_id, payment_date, amount_cents)
      values
        (${fixture.workspaceId}, ${`PAY-DASH-${fixture.suffix.slice(0, 8)}`},
         ${invoice.id}, ${client.id}, now(), 40000)
    `);

    const dashboard = await analytics.getOwnerDashboard({
      workspaceId: fixture.workspaceId,
    });

    assert.equal(dashboard.leads.total, 2);
    assert.equal(dashboard.leads.reportedLeadCount, 2);
    assert.equal(dashboard.leads.reportedVerifiedLeadCount, 1);

    const reported = dashboard.money.reportedByCurrency.find(
      (row) => row.currency === 'INR',
    );
    assert.ok(reported);
    assert.equal(reported.receivedCents, 250_000);
    assert.equal(reported.outstandingCents, 50_000);
    assert.equal(reported.projectCostCents, 25_000);
    assert.equal(reported.leadCount, 2);
    assert.equal(reported.verifiedLeads, 1);
    assert.equal(reported.unverifiedLeads, 1);

    const paid = dashboard.money.verifiedPaymentsByCurrency.find(
      (row) => row.currency === 'INR',
    );
    assert.ok(paid);
    assert.equal(paid.paidCents, 40_000);
    assert.equal(paid.payments, 1);

    const due = dashboard.money.outstandingInvoicesByCurrency.find(
      (row) => row.currency === 'INR',
    );
    assert.ok(due);
    assert.equal(due.outstandingCents, 60_000);
    assert.equal(due.invoices, 1);

    assert.equal(dashboard.clients.total, 1);
    assert.equal(dashboard.imports.batches, 0);
  } finally {
    await cleanup(fixture);
  }
});
