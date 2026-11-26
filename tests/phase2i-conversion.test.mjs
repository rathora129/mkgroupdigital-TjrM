import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {
  sql,
  query,
  closeDatabase,
  assertDisposableTestUrl,
} from './support/db.mjs';

// Phase 2I conversion checks: won-lead conversion to client/project, reported
// amounts kept separate from verified finance, and the unified timeline that
// spans lead, client and project records. Database fixtures only run against a
// disposable migrated database (name must end in _test).
const TEST_DATABASE_URL = process.env.PHASE2A_TEST_DATABASE_URL || '';
const skip = TEST_DATABASE_URL
  ? false
  : 'set PHASE2A_TEST_DATABASE_URL to a disposable, migrated database';

const validation = await import('@/lib/leads/validation');

if (TEST_DATABASE_URL) {
  assertDisposableTestUrl(TEST_DATABASE_URL);
  process.env.DATABASE_URL = TEST_DATABASE_URL;
}

const conversion = await import('@/lib/leads/conversion');
const leadService = await import('@/lib/leads/service');
const salesService = await import('@/lib/sales/service');
const meetingsService = await import('@/lib/meetings/service');

after(async () => {
  await closeDatabase();
});

const DAY_MS = 24 * 60 * 60 * 1000;

function daysFromNow(days) {
  return new Date(Date.now() + days * DAY_MS);
}

function fullAccess(userId) {
  return { userId, canViewAll: true };
}

function callerAccess(userId) {
  return { userId, canViewAll: false };
}

// ---- pure logic -------------------------------------------------------------

test('conversion schema defaults and reported money bounds', async () => {
  const parsed = await validation.leadConversionSchema.validate(
    {},
    { abortEarly: false, stripUnknown: true },
  );
  assert.equal(parsed.createProject, true);
  assert.equal(parsed.proposalId, undefined);

  await assert.rejects(
    () =>
      validation.leadReportedMoneySchema.validate(
        { reportedAmountReceivedCents: -5 },
        { abortEarly: false },
      ),
    (error) => error.errors.some((message) => message.includes('negative')),
  );

  await assert.rejects(
    () =>
      validation.leadReportedMoneySchema.validate(
        { reportedOutstandingCents: 10.5 },
        { abortEarly: false },
      ),
    (error) => error.errors.some((message) => message.includes('whole currency')),
  );

  const money = await validation.leadReportedMoneySchema.validate(
    {
      reportedAmountReceivedCents: 250000,
      reportedOutstandingCents: null,
      reportedProjectCostCents: 120000,
      reportedAmountVerified: true,
    },
    { abortEarly: false },
  );
  assert.equal(money.reportedAmountReceivedCents, 250000);
  assert.equal(money.reportedAmountVerified, true);
});

// ---- database fixtures ------------------------------------------------------

async function createFixture() {
  const suffix = randomUUID();
  const [workspace] = await query(sql`
    insert into workspaces (name, slug)
    values ('Phase 2I conversion', ${`p2i-conversion-${suffix}`})
    returning id
  `);

  const [owner] = await query(sql`
    insert into users (email, name)
    values (${`p2i-conv-owner-${suffix}@example.test`}, 'Conversion Owner')
    returning id
  `);
  const [caller] = await query(sql`
    insert into users (email, name)
    values (${`p2i-conv-caller-${suffix}@example.test`}, 'Conversion Caller')
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
  await query(sql`delete from audit_logs where workspace_id = ${fixture.workspaceId}`);
  await query(sql`delete from notifications where workspace_id = ${fixture.workspaceId}`);
  await query(
    sql`delete from client_timeline_entries where workspace_id = ${fixture.workspaceId}`,
  );
  await query(sql`delete from invoices where workspace_id = ${fixture.workspaceId}`);
  await query(sql`delete from meetings where workspace_id = ${fixture.workspaceId}`);
  await query(sql`delete from project_tasks where workspace_id = ${fixture.workspaceId}`);
  await query(sql`delete from project_activity where workspace_id = ${fixture.workspaceId}`);
  await query(
    sql`delete from project_status_history where workspace_id = ${fixture.workspaceId}`,
  );
  await query(sql`delete from projects where workspace_id = ${fixture.workspaceId}`);
  await query(sql`delete from clients where workspace_id = ${fixture.workspaceId}`);
  await query(sql`delete from lead_activities where workspace_id = ${fixture.workspaceId}`);
  await query(
    sql`delete from lead_status_history where workspace_id = ${fixture.workspaceId}`,
  );
  await query(sql`delete from leads where workspace_id = ${fixture.workspaceId}`);
  await query(sql`delete from workspaces where id = ${fixture.workspaceId}`);
  await query(
    sql`delete from users where id in (${fixture.ownerId}, ${fixture.callerId})`,
  );
}

async function createReportedLead(fixture, assignedUserId) {
  const created = await leadService.createLead({
    workspaceId: fixture.workspaceId,
    userId: fixture.ownerId,
    data: {
      companyName: 'Acme Dental',
      contactName: 'Dana Owner',
      email: 'dana@acme.example',
      phone: '0113 000 0000',
      industry: 'Dentist',
      currency: 'GBP',
      reportedAmountReceivedCents: 150000,
      reportedOutstandingCents: 50000,
      reportedProjectCostCents: 90000,
    },
  });
  if (assignedUserId) {
    await query(
      sql`update leads set assigned_user_id = ${assignedUserId} where id = ${created.lead.id}`,
    );
  }
  return created.lead;
}

async function winLead(fixture, leadId) {
  for (const status of ['qualified', 'proposal', 'won']) {
    await leadService.changeLeadStatus({
      workspaceId: fixture.workspaceId,
      userId: fixture.ownerId,
      leadId,
      status,
      note: `Moved to ${status} for conversion.`,
    });
  }
}

test('preview refuses non-won leads and conversion requires Won', { skip }, async () => {
  const fixture = await createFixture();
  try {
    const lead = await createReportedLead(fixture);

    const preview = await conversion.getLeadConversionPreview({
      workspaceId: fixture.workspaceId,
      leadId: lead.id,
      access: fullAccess(fixture.ownerId),
    });
    assert.equal(preview.eligible, false);
    assert.equal(preview.reason, 'NOT_WON');
    assert.equal(preview.client, null);
    assert.equal(preview.reportedAmounts.receivedCents, 150000);

    await assert.rejects(
      () =>
        conversion.convertLead({
          workspaceId: fixture.workspaceId,
          userId: fixture.ownerId,
          leadId: lead.id,
          data: { createProject: true },
          access: fullAccess(fixture.ownerId),
        }),
      (error) => error.code === 'LEAD_NOT_WON',
    );
  } finally {
    await cleanup(fixture);
  }
});

test('won lead converts once into a client and reported-value project', { skip }, async () => {
  const fixture = await createFixture();
  try {
    const lead = await createReportedLead(fixture, fixture.callerId);
    await winLead(fixture, lead.id);

    // A delivery record created before conversion keeps its history and is
    // relinked to the new client instead of being rewritten.
    const [preExisting] = await query(sql`
      insert into projects (workspace_id, reference, lead_id, name, status)
      values (${fixture.workspaceId}, ${`PRJ-PRE-${fixture.suffix}`}, ${lead.id},
              'Pre-existing delivery', 'not_started')
      returning id
    `);

    const preview = await conversion.getLeadConversionPreview({
      workspaceId: fixture.workspaceId,
      leadId: lead.id,
      access: fullAccess(fixture.ownerId),
    });
    assert.equal(preview.eligible, true);
    assert.equal(preview.reason, 'READY');
    assert.equal(preview.projects.length, 1);
    assert.deepEqual(preview.proposals, []);

    const data = await validation.leadConversionSchema.validate(
      {
        createProject: true,
        projectName: 'Acme retainer',
        clientNotes: 'Handover from the Leeds campaign.',
      },
      { abortEarly: false },
    );

    const result = await conversion.convertLead({
      workspaceId: fixture.workspaceId,
      userId: fixture.ownerId,
      leadId: lead.id,
      data,
      access: fullAccess(fixture.ownerId),
    });

    assert.equal(result.client.companyName, 'Acme Dental');
    assert.equal(result.client.leadId, lead.id);
    assert.ok(result.client.reference.startsWith('CLI-'));
    assert.equal(result.project.name, 'Acme retainer');
    assert.ok(result.project.reference.startsWith('PRJ-'));

    const [clientRow] = await query(
      sql`select lead_id, email, industry from clients where id = ${result.client.id}`,
    );
    assert.equal(clientRow.lead_id, lead.id);
    assert.equal(clientRow.email, 'dana@acme.example');

    const [projectRow] = await query(sql`
      select accepted_value_cents, currency, commercial_snapshot, client_id
      from projects where id = ${result.project.id}
    `);
    assert.equal(projectRow.accepted_value_cents, 0);
    assert.equal(projectRow.currency, 'GBP');
    assert.equal(projectRow.client_id, result.client.id);
    assert.equal(projectRow.commercial_snapshot.source, 'lead_conversion');
    assert.equal(projectRow.commercial_snapshot.reportedAmounts.receivedCents, 150000);
    assert.equal(projectRow.commercial_snapshot.lines.length, 0);

    const [relinked] = await query(
      sql`select client_id from projects where id = ${preExisting.id}`,
    );
    assert.equal(relinked.client_id, result.client.id);

    const activities = await query(sql`
      select type from lead_activities
      where workspace_id = ${fixture.workspaceId} and lead_id = ${lead.id}
        and type in ('converted_to_client', 'converted_to_project')
      order by type
    `);
    assert.deepEqual(
      activities.map((row) => row.type),
      ['converted_to_client', 'converted_to_project'],
    );

    const audits = await query(sql`
      select action from audit_logs
      where workspace_id = ${fixture.workspaceId} and action = 'lead.convert'
    `);
    assert.equal(audits.length, 1);

    // Reported money stays reported: no invoice or payment was invented.
    const invoices = await query(
      sql`select count(*)::int as count from invoices where workspace_id = ${fixture.workspaceId}`,
    );
    assert.equal(invoices[0].count, 0);

    await assert.rejects(
      () =>
        conversion.convertLead({
          workspaceId: fixture.workspaceId,
          userId: fixture.ownerId,
          leadId: lead.id,
          data,
          access: fullAccess(fixture.ownerId),
        }),
      (error) => error.code === 'LEAD_ALREADY_CONVERTED',
    );

    const afterPreview = await conversion.getLeadConversionPreview({
      workspaceId: fixture.workspaceId,
      leadId: lead.id,
      access: fullAccess(fixture.ownerId),
    });
    assert.equal(afterPreview.reason, 'ALREADY_CONVERTED');
    assert.equal(afterPreview.client.id, result.client.id);
    assert.equal(afterPreview.projects.length, 2);
  } finally {
    await cleanup(fixture);
  }
});

test('reported amounts update is scoped and recorded', { skip }, async () => {
  const fixture = await createFixture();
  try {
    const lead = await createReportedLead(fixture, fixture.ownerId);

    const data = await validation.leadReportedMoneySchema.validate(
      {
        reportedAmountReceivedCents: 200000,
        reportedOutstandingCents: 0,
        reportedProjectCostCents: 95000,
        reportedAmountVerified: false,
      },
      { abortEarly: false },
    );

    const updated = await leadService.updateLeadReportedAmounts({
      workspaceId: fixture.workspaceId,
      userId: fixture.ownerId,
      leadId: lead.id,
      data,
      access: fullAccess(fixture.ownerId),
    });
    assert.equal(updated.changed, true);
    assert.equal(updated.lead.reportedAmountReceivedCents, 200000);
    assert.equal(updated.lead.reportedOutstandingCents, 0);
    assert.equal(updated.lead.reportedAmountVerified, false);

    const [activity] = await query(sql`
      select type from lead_activities
      where lead_id = ${lead.id} and type = 'reported_amounts_updated'
    `);
    assert.ok(activity);

    // A caller without leads.view_all cannot edit another owner's lead money.
    await assert.rejects(
      () =>
        leadService.updateLeadReportedAmounts({
          workspaceId: fixture.workspaceId,
          userId: fixture.callerId,
          leadId: lead.id,
          data: { reportedAmountReceivedCents: 1 },
          access: callerAccess(fixture.callerId),
        }),
      (error) => error.status === 403,
    );
  } finally {
    await cleanup(fixture);
  }
});

test('unified timeline spans lead, follow-up, meeting, client and project', { skip }, async () => {
  const fixture = await createFixture();
  try {
    const lead = await createReportedLead(fixture, fixture.callerId);

    await salesService.createLeadFollowUpTask({
      workspaceId: fixture.workspaceId,
      userId: fixture.callerId,
      leadId: lead.id,
      data: { dueDate: daysFromNow(2), dueTime: '09:00', timezone: 'UTC' },
      access: callerAccess(fixture.callerId),
    });

    await meetingsService.createMeeting({
      workspaceId: fixture.workspaceId,
      userId: fixture.callerId,
      data: {
        title: 'Discovery call',
        leadId: lead.id,
        startsAt: daysFromNow(1),
        endsAt: new Date(daysFromNow(1).getTime() + 30 * 60 * 1000),
        timezone: 'UTC',
      },
      access: callerAccess(fixture.callerId),
    });

    await winLead(fixture, lead.id);

    const result = await conversion.convertLead({
      workspaceId: fixture.workspaceId,
      userId: fixture.ownerId,
      leadId: lead.id,
      data: { createProject: true, projectName: 'Timeline project' },
      access: fullAccess(fixture.ownerId),
    });

    await query(sql`
      insert into client_timeline_entries
        (workspace_id, client_id, type, title, body, occurred_at)
      values
        (${fixture.workspaceId}, ${result.client.id}, 'note', 'Kickoff call',
         'Agreed the first delivery milestone.', now())
    `);

    const timeline = await conversion.getLeadUnifiedTimeline({
      workspaceId: fixture.workspaceId,
      leadId: lead.id,
      access: fullAccess(fixture.ownerId),
    });

    const sources = new Set(timeline.items.map((item) => item.source));
    assert.equal(sources.has('lead'), true);
    assert.equal(sources.has('task'), true);
    assert.equal(sources.has('meeting'), true);
    assert.equal(sources.has('client'), true);
    assert.equal(sources.has('project'), true);

    const converted = timeline.items.find(
      (item) => item.type === 'converted_to_client',
    );
    assert.ok(converted);
    assert.match(converted.body, /Converted to client CLI-/);

    const clientNote = timeline.items.find((item) => item.title === 'Kickoff call');
    assert.ok(clientNote);

    const times = timeline.items.map((item) => new Date(item.at).getTime());
    const sorted = [...times].sort((a, b) => b - a);
    assert.deepEqual(times, sorted);

    const [callerTimeline] = await Promise.all([
      conversion.getLeadUnifiedTimeline({
        workspaceId: fixture.workspaceId,
        leadId: lead.id,
        access: callerAccess(fixture.ownerId),
      }),
    ]);
    assert.equal(callerTimeline, null);
  } finally {
    await cleanup(fixture);
  }
});
