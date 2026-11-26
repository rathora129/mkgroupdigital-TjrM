import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {
  sql,
  query,
  closeDatabase,
  assertDisposableTestUrl,
} from './support/db.mjs';

// Phase 2I sales workspace checks: call logging, caller assignment scope,
// follow-up tasks, meeting storage with an honest calendar contract, and the
// worker reminder/escalation scan. Database fixtures only run against a
// disposable migrated database (name must end in _test).
const TEST_DATABASE_URL = process.env.PHASE2A_TEST_DATABASE_URL || '';
const skip = TEST_DATABASE_URL
  ? false
  : 'set PHASE2A_TEST_DATABASE_URL to a disposable, migrated database';

const validation = await import('@/lib/sales/validation');
const calendar = await import('@/lib/workforce/calendar');

if (TEST_DATABASE_URL) {
  assertDisposableTestUrl(TEST_DATABASE_URL);
  process.env.DATABASE_URL = TEST_DATABASE_URL;
}

const salesService = await import('@/lib/sales/service');
const meetingsService = await import('@/lib/meetings/service');
const reminders = await import('@/lib/sales/reminders');
const leadService = await import('@/lib/leads/service');
const notifications = await import('@/lib/notifications/service');

after(async () => {
  await closeDatabase();
});

const DAY_MS = 24 * 60 * 60 * 1000;

function daysFromNow(days) {
  return new Date(Date.now() + days * DAY_MS);
}

function withCalendarEnv() {
  const keys = [
    'GOOGLE_CALENDAR_CLIENT_ID',
    'GOOGLE_CALENDAR_CLIENT_SECRET',
    'GOOGLE_CALENDAR_REDIRECT_URI',
  ];
  const saved = {};
  for (const key of keys) {
    saved[key] = process.env[key] ?? null;
    process.env[key] = `test-${key.toLowerCase()}`;
  }
  return () => {
    for (const key of keys) {
      if (saved[key] == null) delete process.env[key];
      else process.env[key] = saved[key];
    }
  };
}

function withoutCalendarEnv() {
  const keys = [
    'GOOGLE_CALENDAR_CLIENT_ID',
    'GOOGLE_CALENDAR_CLIENT_SECRET',
    'GOOGLE_CALENDAR_REDIRECT_URI',
  ];
  const saved = {};
  for (const key of keys) {
    saved[key] = process.env[key] ?? null;
    delete process.env[key];
  }
  return () => {
    for (const key of keys) {
      if (saved[key] != null) process.env[key] = saved[key];
    }
  };
}

// ---- pure logic -------------------------------------------------------------

test('call outcome schema only accepts the supported outcomes', async () => {
  await assert.rejects(
    () =>
      validation.callLogSchema.validate(
        { outcome: 'left_voicemail' },
        { abortEarly: false },
      ),
    (error) => error.errors.some((message) => message.includes('valid call outcome')),
  );

  const parsed = await validation.callLogSchema.validate(
    { outcome: 'connected', summary: 'Spoke to the owner.' },
    { abortEarly: false },
  );
  assert.equal(parsed.outcome, 'connected');
  assert.equal(parsed.durationSeconds, 0);
  assert.equal(parsed.createFollowUpTask, true);

  await assert.rejects(
    () =>
      validation.callLogSchema.validate(
        { outcome: 'busy', durationSeconds: 12.5 },
        { abortEarly: false },
      ),
    (error) => error.errors.some((message) => message.includes('whole number')),
  );

  await assert.rejects(
    () =>
      validation.callLogSchema.validate(
        { outcome: 'busy', followUpTime: '9am' },
        { abortEarly: false },
      ),
    (error) => error.errors.some((message) => message.includes('HH:MM')),
  );

  await assert.rejects(
    () =>
      validation.callLogSchema.validate(
        { outcome: 'busy', timezone: 'Mars/Olympus' },
        { abortEarly: false },
      ),
    (error) => error.errors.some((message) => message.includes('valid timezone')),
  );
});

test('only answered outcomes count as contact', () => {
  assert.equal(validation.CALL_OUTCOME_META.connected.countsAsContact, true);
  assert.equal(validation.CALL_OUTCOME_META.callback_requested.countsAsContact, true);
  assert.equal(validation.CALL_OUTCOME_META.not_interested.countsAsContact, true);
  assert.equal(validation.CALL_OUTCOME_META.no_answer.countsAsContact, false);
  assert.equal(validation.CALL_OUTCOME_META.voicemail.countsAsContact, false);
  assert.equal(validation.CALL_OUTCOME_META.wrong_number.countsAsContact, false);
});

test('follow-up task schema requires a due date', async () => {
  await assert.rejects(
    () => validation.followUpTaskSchema.validate({}, { abortEarly: false }),
    (error) => error.errors.some((message) => message.includes('when to follow up')),
  );

  const parsed = await validation.followUpTaskSchema.validate(
    { dueDate: '2026-12-01', dueTime: '09:30', priority: 'high' },
    { abortEarly: false },
  );
  assert.equal(parsed.priority, 'high');
  assert.equal(parsed.dueTime, '09:30');
});

test('meeting schemas bound the status set and required times', async () => {
  await assert.rejects(
    () =>
      validation.meetingCreateSchema.validate(
        { title: 'Discovery call' },
        { abortEarly: false },
      ),
    (error) =>
      error.errors.some((message) => message.includes('when the meeting starts')) &&
      error.errors.some((message) => message.includes('when the meeting ends')),
  );

  const meeting = await validation.meetingCreateSchema.validate(
    {
      title: 'Discovery call',
      startsAt: '2026-12-01T10:00:00.000Z',
      endsAt: '2026-12-01T10:30:00.000Z',
      attendees: ['owner@example.test', ''],
    },
    { abortEarly: false },
  );
  assert.equal(meeting.timezone, 'UTC');
  assert.deepEqual(meeting.attendees, ['owner@example.test']);
  assert.equal(meeting.syncCalendar, false);

  await assert.rejects(
    () =>
      validation.meetingUpdateSchema.validate(
        { status: 'postponed' },
        { abortEarly: false },
      ),
    (error) => error.errors.some((message) => message.includes('valid meeting status')),
  );

  const query = await validation.meetingQuerySchema.validate({}, { abortEarly: false });
  assert.equal(query.pageSize, 20);
  assert.equal(query.upcoming, false);
});

test('meeting transitions stop at terminal states', () => {
  assert.deepEqual(meetingsService.allowedMeetingStatuses('scheduled'), [
    'rescheduled',
    'completed',
    'cancelled',
  ]);
  assert.deepEqual(meetingsService.allowedMeetingStatuses('completed'), []);
  assert.deepEqual(meetingsService.allowedMeetingStatuses('cancelled'), []);
  assert.deepEqual(meetingsService.allowedMeetingStatuses('unknown'), []);
});

test('calendar readiness never claims a connection or leaks secrets', () => {
  const restore = withoutCalendarEnv();
  try {
    const readiness = calendar.getCalendarReadiness();
    assert.equal(readiness.connected, false);
    assert.equal(readiness.syncCapable, false);
    assert.equal(readiness.reason, 'NOT_CONFIGURED');
    assert.equal(JSON.stringify(readiness).includes('test-google'), false);
  } finally {
    restore();
  }

  const restoreConfigured = withCalendarEnv();
  try {
    const readiness = calendar.getCalendarReadiness();
    assert.equal(readiness.configured, true);
    // Credentials alone are not an OAuth connection.
    assert.equal(readiness.connected, false);
    assert.equal(readiness.reason, 'NOT_CONNECTED');
    assert.equal(
      JSON.stringify(readiness).includes('test-google_calendar_client_id'),
      false,
    );

    assert.throws(
      () => calendar.assertCalendarConnected(),
      (error) => error.code === 'CALENDAR_NOT_CONNECTED',
    );
  } finally {
    restoreConfigured();
  }

  return assert.rejects(
    () => calendar.createCalendarEvent(),
    (error) => error.code === 'CALENDAR_NOT_CONNECTED',
  );
});

// ---- database fixtures ------------------------------------------------------

async function createFixture() {
  const suffix = randomUUID();
  const [workspace] = await query(sql`
    insert into workspaces (name, slug)
    values ('Phase 2I sales', ${`p2i-sales-${suffix}`})
    returning id
  `);

  const [owner] = await query(sql`
    insert into users (email, name)
    values (${`p2i-sales-owner-${suffix}@example.test`}, 'Sales Owner')
    returning id
  `);
  const [caller] = await query(sql`
    insert into users (email, name)
    values (${`p2i-sales-caller-${suffix}@example.test`}, 'Sales Caller')
    returning id
  `);
  const [manager] = await query(sql`
    insert into users (email, name)
    values (${`p2i-sales-manager-${suffix}@example.test`}, 'Sales Manager')
    returning id
  `);

  await query(sql`
    insert into workspace_memberships (workspace_id, user_id, role)
    values
      (${workspace.id}, ${owner.id}, 'owner'),
      (${workspace.id}, ${caller.id}, 'member'),
      (${workspace.id}, ${manager.id}, 'manager')
  `);

  return {
    workspaceId: workspace.id,
    ownerId: owner.id,
    callerId: caller.id,
    managerId: manager.id,
    suffix,
  };
}

async function cleanup(fixture) {
  await query(sql`delete from audit_logs where workspace_id = ${fixture.workspaceId}`);
  await query(sql`delete from notifications where workspace_id = ${fixture.workspaceId}`);
  await query(sql`delete from meetings where workspace_id = ${fixture.workspaceId}`);
  await query(sql`delete from project_tasks where workspace_id = ${fixture.workspaceId}`);
  await query(sql`delete from lead_activities where workspace_id = ${fixture.workspaceId}`);
  await query(sql`delete from lead_status_history where workspace_id = ${fixture.workspaceId}`);
  await query(sql`delete from leads where workspace_id = ${fixture.workspaceId}`);
  await query(sql`delete from workspaces where id = ${fixture.workspaceId}`);
  await query(
    sql`delete from users where id in (${fixture.ownerId}, ${fixture.callerId}, ${fixture.managerId})`,
  );
}

function callerAccess(userId) {
  return { userId, canViewAll: false };
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

async function insertFollowUpTask({ fixture, leadId, ownerUserId, dueDate, title }) {
  const [task] = await query(sql`
    insert into project_tasks
      (workspace_id, lead_id, task_type, title, status, priority, owner_user_id,
       due_date, source_type, created_by_user_id, updated_by_user_id)
    values
      (${fixture.workspaceId}, ${leadId}, 'follow_up', ${title || 'Follow-up'},
       'todo', 'medium', ${ownerUserId}, ${dueDate}, 'lead_follow_up',
       ${fixture.ownerId}, ${fixture.ownerId})
    returning id
  `);
  return task.id;
}

async function notificationCount(fixture, dedupeKey) {
  const rows = await query(sql`
    select count(*)::int as count
    from notifications
    where workspace_id = ${fixture.workspaceId} and dedupe_key = ${dedupeKey}
  `);
  return rows[0].count;
}

test('logging a call records the activity, moves the stage and schedules a follow-up', { skip }, async () => {
  const fixture = await createFixture();
  try {
    const lead = await createLead(fixture, {
      companyName: 'Acme Dental',
      assignedUserId: fixture.callerId,
    });

    const data = await validation.callLogSchema.validate(
      {
        outcome: 'connected',
        summary: 'Spoke to the practice owner.',
        durationSeconds: 180,
        followUpAt: daysFromNow(2).toISOString(),
        followUpTime: '09:30',
        timezone: 'Europe/London',
        nextAction: 'Send the audit summary.',
        createFollowUpTask: true,
      },
      { abortEarly: false },
    );

    const result = await salesService.logCall({
      workspaceId: fixture.workspaceId,
      userId: fixture.callerId,
      leadId: lead.id,
      data,
      access: callerAccess(fixture.callerId),
    });

    assert.equal(result.outcome, 'connected');
    assert.equal(result.statusChange, 'contacted');
    assert.equal(result.lead.status, 'contacted');
    assert.ok(result.lead.lastContactedAt);
    assert.ok(result.followUpTask?.id);

    const [activity] = await query(sql`
      select type, metadata
      from lead_activities
      where lead_id = ${lead.id} and type = 'call_logged'
    `);
    assert.equal(activity.metadata.outcome, 'connected');
    assert.equal(activity.metadata.durationSeconds, 180);

    const [task] = await query(sql`
      select task_type, source_type, source_id, owner_user_id, status, due_time
      from project_tasks
      where id = ${result.followUpTask.id}
    `);
    assert.equal(task.task_type, 'follow_up');
    assert.equal(task.source_type, 'lead_follow_up');
    assert.equal(task.source_id, result.activityId);
    assert.equal(task.owner_user_id, fixture.callerId);
    assert.equal(task.status, 'todo');
    assert.equal(task.due_time, '09:30');

    const calls = await salesService.listLeadCalls({
      workspaceId: fixture.workspaceId,
      leadId: lead.id,
      access: callerAccess(fixture.callerId),
    });
    assert.equal(calls.length, 1);

    const audits = await query(sql`
      select action from audit_logs
      where workspace_id = ${fixture.workspaceId} and action = 'lead.call_logged'
    `);
    assert.equal(audits.length, 1);

    const workspace = await salesService.getSalesCallerWorkspace({
      workspaceId: fixture.workspaceId,
      userId: fixture.callerId,
      access: callerAccess(fixture.callerId),
      leadQuery: {
        page: 1,
        pageSize: 20,
        sort: 'followUp',
        direction: 'asc',
        archived: 'active',
      },
    });
    assert.equal(workspace.scope, 'assigned');
    assert.equal(workspace.stats.callsToday, 1);
    assert.equal(workspace.stats.followUpsDue, 1);
    assert.equal(workspace.leads.items.every((item) => item.assignedUserId === fixture.callerId), true);
  } finally {
    await cleanup(fixture);
  }
});

test('a caller cannot read or log against another executive’s lead', { skip }, async () => {
  const fixture = await createFixture();
  try {
    const ownerLead = await createLead(fixture, {
      companyName: 'Owner Only Lead',
      assignedUserId: fixture.ownerId,
    });
    const callerLead = await createLead(fixture, {
      companyName: 'Caller Lead',
      assignedUserId: fixture.callerId,
    });

    await assert.rejects(
      () =>
        salesService.logCall({
          workspaceId: fixture.workspaceId,
          userId: fixture.callerId,
          leadId: ownerLead.id,
          data: { outcome: 'connected', createFollowUpTask: false },
          access: callerAccess(fixture.callerId),
        }),
      (error) => error.status === 403 && error.code === 'FORBIDDEN',
    );

    await assert.rejects(
      () =>
        salesService.listLeadCalls({
          workspaceId: fixture.workspaceId,
          leadId: ownerLead.id,
          access: callerAccess(fixture.callerId),
        }),
      (error) => error.status === 403,
    );

    await assert.rejects(
      () =>
        salesService.createLeadFollowUpTask({
          workspaceId: fixture.workspaceId,
          userId: fixture.callerId,
          leadId: ownerLead.id,
          data: { dueDate: daysFromNow(1) },
          access: callerAccess(fixture.callerId),
        }),
      (error) => error.status === 403,
    );

    // A manager with leads.view_all may log against any lead.
    const managerCall = await salesService.logCall({
      workspaceId: fixture.workspaceId,
      userId: fixture.managerId,
      leadId: ownerLead.id,
      data: { outcome: 'no_answer', createFollowUpTask: false },
      access: fullAccess(fixture.managerId),
    });
    assert.equal(managerCall.statusChange, null);

    const workspace = await salesService.getSalesCallerWorkspace({
      workspaceId: fixture.workspaceId,
      userId: fixture.callerId,
      access: callerAccess(fixture.callerId),
      leadQuery: {
        page: 1,
        pageSize: 20,
        sort: 'followUp',
        direction: 'asc',
        archived: 'active',
      },
    });
    assert.equal(workspace.leads.items.length, 1);
    assert.equal(workspace.leads.items[0].id, callerLead.id);
  } finally {
    await cleanup(fixture);
  }
});

test('scheduling a follow-up task updates the lead next action', { skip }, async () => {
  const fixture = await createFixture();
  try {
    const lead = await createLead(fixture, {
      companyName: 'Bright Smiles',
      assignedUserId: fixture.callerId,
    });
    const dueDate = daysFromNow(3);

    const data = await validation.followUpTaskSchema.validate(
      {
        dueDate: dueDate.toISOString(),
        dueTime: '11:00',
        timezone: 'Europe/London',
        priority: 'high',
        description: 'Confirm the meeting slot.',
      },
      { abortEarly: false },
    );

    const result = await salesService.createLeadFollowUpTask({
      workspaceId: fixture.workspaceId,
      userId: fixture.callerId,
      leadId: lead.id,
      data,
      access: callerAccess(fixture.callerId),
    });

    assert.equal(result.task.priority, 'high');
    assert.ok(result.lead.nextFollowUpAt);
    assert.equal(result.lead.nextAction, 'Confirm the meeting slot.');

    const [activity] = await query(sql`
      select type from lead_activities
      where lead_id = ${lead.id} and type = 'follow_up_scheduled'
    `);
    assert.ok(activity);

    const tasks = await salesService.listFollowUpTasks({
      workspaceId: fixture.workspaceId,
      access: callerAccess(fixture.callerId),
    });
    assert.equal(tasks.length, 1);
    assert.equal(tasks[0].isOverdue, false);
  } finally {
    await cleanup(fixture);
  }
});

test('meetings save locally and report calendar status honestly', { skip }, async () => {
  const fixture = await createFixture();
  const restoreEnv = withoutCalendarEnv();
  try {
    const lead = await createLead(fixture, {
      companyName: 'Calendar Lead',
      assignedUserId: fixture.callerId,
    });

    const data = await validation.meetingCreateSchema.validate(
      {
        title: 'Discovery call',
        leadId: lead.id,
        startsAt: daysFromNow(2).toISOString(),
        endsAt: new Date(daysFromNow(2).getTime() + 30 * 60 * 1000).toISOString(),
        timezone: 'Europe/London',
        location: 'Video call',
        attendees: ['owner@example.test'],
      },
      { abortEarly: false },
    );

    const created = await meetingsService.createMeeting({
      workspaceId: fixture.workspaceId,
      userId: fixture.callerId,
      data,
      access: callerAccess(fixture.callerId),
    });

    assert.equal(created.meeting.status, 'scheduled');
    assert.equal(created.meeting.meetLink, null);
    assert.equal(created.meeting.calendarProvider, null);
    assert.equal(created.calendarSync.requested, false);
    assert.equal(created.calendarSync.synced, false);
    assert.equal(created.calendarSync.reason, 'NOT_REQUESTED');

    const requested = await meetingsService.createMeeting({
      workspaceId: fixture.workspaceId,
      userId: fixture.callerId,
      data: { ...data, title: 'Sync requested', syncCalendar: true },
      access: callerAccess(fixture.callerId),
    });
    assert.equal(requested.calendarSync.requested, true);
    assert.equal(requested.calendarSync.synced, false);
    assert.equal(requested.calendarSync.reason, 'NOT_CONFIGURED');
    assert.equal(requested.meeting.meetLink, null);

    const restoreConfigured = withCalendarEnv();
    try {
      const configured = await meetingsService.createMeeting({
        workspaceId: fixture.workspaceId,
        userId: fixture.callerId,
        data: { ...data, title: 'Credentials present', syncCalendar: true },
        access: callerAccess(fixture.callerId),
      });
      // Credentials without a completed OAuth consent still must not sync.
      assert.equal(configured.calendarSync.synced, false);
      assert.equal(configured.calendarSync.reason, 'NOT_CONNECTED');
    } finally {
      restoreConfigured();
    }

    await assert.rejects(
      () =>
        meetingsService.createMeeting({
          workspaceId: fixture.workspaceId,
          userId: fixture.callerId,
          data: {
            ...data,
            title: 'Backwards',
            startsAt: daysFromNow(2).toISOString(),
            endsAt: daysFromNow(1).toISOString(),
          },
          access: callerAccess(fixture.callerId),
        }),
      (error) => error.code === 'INVALID_TIME_RANGE',
    );

    await assert.rejects(
      () =>
        meetingsService.createMeeting({
          workspaceId: fixture.workspaceId,
          userId: fixture.callerId,
          data: { ...data, leadId: randomUUID() },
          access: callerAccess(fixture.callerId),
        }),
      (error) => error.code === 'LEAD_NOT_FOUND',
    );
  } finally {
    restoreEnv();
    await cleanup(fixture);
  }
});

test('meeting scope and status transitions are enforced', { skip }, async () => {
  const fixture = await createFixture();
  try {
    const ownerLead = await createLead(fixture, {
      companyName: 'Owner Meeting Lead',
      assignedUserId: fixture.ownerId,
    });
    const callerLead = await createLead(fixture, {
      companyName: 'Caller Meeting Lead',
      assignedUserId: fixture.callerId,
    });

    const base = await validation.meetingCreateSchema.validate(
      {
        title: 'Scope test',
        startsAt: daysFromNow(1).toISOString(),
        endsAt: new Date(daysFromNow(1).getTime() + 60 * 60 * 1000).toISOString(),
      },
      { abortEarly: false },
    );

    await meetingsService.createMeeting({
      workspaceId: fixture.workspaceId,
      userId: fixture.ownerId,
      data: { ...base, leadId: ownerLead.id },
      access: fullAccess(fixture.ownerId),
    });
    const callerMeeting = await meetingsService.createMeeting({
      workspaceId: fixture.workspaceId,
      userId: fixture.callerId,
      data: { ...base, title: 'Caller meeting', leadId: callerLead.id },
      access: callerAccess(fixture.callerId),
    });

    const callerList = await meetingsService.listMeetings(
      fixture.workspaceId,
      { page: 1, pageSize: 20, upcoming: false },
      callerAccess(fixture.callerId),
    );
    assert.equal(callerList.total, 1);
    assert.equal(callerList.items[0].id, callerMeeting.meeting.id);

    const ownerList = await meetingsService.listMeetings(
      fixture.workspaceId,
      { page: 1, pageSize: 20, upcoming: false },
      fullAccess(fixture.ownerId),
    );
    assert.equal(ownerList.total, 2);

    const hidden = await meetingsService.getMeeting(
      fixture.workspaceId,
      callerMeeting.meeting.id,
      callerAccess(fixture.managerId),
    );
    assert.equal(hidden, null);

    const completed = await meetingsService.updateMeetingStatus({
      workspaceId: fixture.workspaceId,
      userId: fixture.callerId,
      meetingId: callerMeeting.meeting.id,
      data: { status: 'completed', outcome: 'Positive call.' },
      access: callerAccess(fixture.callerId),
    });
    assert.equal(completed.changed, true);
    assert.equal(completed.meeting.status, 'completed');
    assert.equal(completed.meeting.outcome, 'Positive call.');

    await assert.rejects(
      () =>
        meetingsService.updateMeetingStatus({
          workspaceId: fixture.workspaceId,
          userId: fixture.callerId,
          meetingId: callerMeeting.meeting.id,
          data: { status: 'cancelled' },
          access: callerAccess(fixture.callerId),
        }),
      (error) =>
        error.code === 'INVALID_STATUS_TRANSITION' &&
        deepEqualSafe(error.details?.allowed, []),
    );
  } finally {
    await cleanup(fixture);
  }
});

function deepEqualSafe(actual, expected) {
  try {
    assert.deepEqual(actual, expected);
    return true;
  } catch {
    return false;
  }
}

test('reminder scan notifies once, then escalates stale follow-ups', { skip }, async () => {
  const fixture = await createFixture();
  try {
    const lead = await createLead(fixture, {
      companyName: 'Reminder Lead',
      assignedUserId: fixture.callerId,
    });

    const dueTask = await insertFollowUpTask({
      fixture,
      leadId: lead.id,
      ownerUserId: fixture.callerId,
      // Due in two hours: inside the 24h horizon but not yet overdue.
      dueDate: new Date(Date.now() + 2 * 60 * 60 * 1000),
      title: 'Due soon follow-up',
    });

    const now = new Date();
    await reminders.runFollowUpReminderScan({ now });

    assert.equal(
      await notificationCount(fixture, `follow-up-due:${dueTask}`),
      1,
    );
    const [dueRow] = await query(
      sql`select reminder_sent_at from project_tasks where id = ${dueTask}`,
    );
    assert.ok(dueRow.reminder_sent_at);

    const saved = await notifications.listNotifications({
      workspaceId: fixture.workspaceId,
      userId: fixture.callerId,
      unreadOnly: true,
    });
    assert.equal(saved.items.some((item) => item.type === 'follow_up_due'), true);

    // A second tick must not duplicate the reminder.
    await reminders.runFollowUpReminderScan({ now });
    assert.equal(
      await notificationCount(fixture, `follow-up-due:${dueTask}`),
      1,
    );

    const staleTask = await insertFollowUpTask({
      fixture,
      leadId: lead.id,
      ownerUserId: fixture.callerId,
      dueDate: new Date(Date.now() - 3 * DAY_MS),
      title: 'Stale follow-up',
    });
    await reminders.runFollowUpReminderScan({ now });

    assert.equal(
      await notificationCount(fixture, `follow-up-escalation:${staleTask}:${fixture.ownerId}`),
      1,
    );
    assert.equal(
      await notificationCount(fixture, `follow-up-escalation:${staleTask}:${fixture.managerId}`),
      1,
    );
    // The task owner is never escalated to for their own task.
    assert.equal(
      await notificationCount(fixture, `follow-up-escalation:${staleTask}:${fixture.callerId}`),
      0,
    );

    const [staleRow] = await query(
      sql`select escalated_at from project_tasks where id = ${staleTask}`,
    );
    assert.ok(staleRow.escalated_at);

    await reminders.runFollowUpReminderScan({ now });
    assert.equal(
      await notificationCount(fixture, `follow-up-escalation:${staleTask}:${fixture.ownerId}`),
      1,
    );
  } finally {
    await cleanup(fixture);
  }
});
