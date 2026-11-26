import { and, asc, count, desc, eq, gte, ilike, or } from 'drizzle-orm';
import { getDb } from '@/db/client';
import {
  clients,
  leads,
  meetings,
  projects,
  users,
} from '@/db/schema';
import { ApiError } from '@/lib/api-error';
import { recordAudit } from '@/lib/audit';
import { hasPermission } from '@/lib/auth/permissions';
import { getLead } from '@/lib/leads/service';
import { createNotification, NOTIFICATION_TYPES } from '@/lib/notifications/service';
import { getCalendarReadiness } from '@/lib/workforce/calendar';

export function meetingAccessFor(viewer) {
  return {
    userId: viewer.user.id,
    canViewAll: hasPermission(viewer.membership.role, 'leads.view_all'),
  };
}

export const MEETING_TRANSITIONS = {
  scheduled: ['rescheduled', 'completed', 'cancelled'],
  rescheduled: ['rescheduled', 'completed', 'cancelled'],
  completed: [],
  cancelled: [],
};

export function allowedMeetingStatuses(status) {
  return [...(MEETING_TRANSITIONS[status] || [])];
}

function escapeLike(value) {
  return String(value).replace(/[\\%_]/g, '\\$&');
}

function meetingFilters(workspaceId, query, access) {
  const filters = [eq(meetings.workspaceId, workspaceId)];

  if (access && access.canViewAll === false) {
    filters.push(
      or(
        eq(meetings.createdByUserId, access.userId),
        eq(leads.assignedUserId, access.userId),
      ),
    );
  }

  if (query.status) filters.push(eq(meetings.status, query.status));
  if (query.upcoming) filters.push(gte(meetings.startsAt, new Date()));

  if (query.search) {
    const like = `%${escapeLike(query.search)}%`;
    filters.push(
      or(
        ilike(meetings.title, like),
        ilike(meetings.location, like),
        ilike(leads.companyName, like),
        ilike(clients.companyName, like),
      ),
    );
  }

  return and(...filters);
}

const MEETING_SELECT = {
  id: meetings.id,
  workspaceId: meetings.workspaceId,
  leadId: meetings.leadId,
  leadCompanyName: leads.companyName,
  clientId: meetings.clientId,
  clientName: clients.companyName,
  projectId: meetings.projectId,
  projectName: projects.name,
  title: meetings.title,
  status: meetings.status,
  startsAt: meetings.startsAt,
  endsAt: meetings.endsAt,
  timezone: meetings.timezone,
  location: meetings.location,
  meetLink: meetings.meetLink,
  calendarProvider: meetings.calendarProvider,
  calendarEventId: meetings.calendarEventId,
  calendarHtmlLink: meetings.calendarHtmlLink,
  attendees: meetings.attendees,
  agenda: meetings.agenda,
  notes: meetings.notes,
  outcome: meetings.outcome,
  createdByUserId: meetings.createdByUserId,
  createdByName: users.name,
  createdAt: meetings.createdAt,
  updatedAt: meetings.updatedAt,
};

function meetingQuery() {
  return getDb()
    .select(MEETING_SELECT)
    .from(meetings)
    .leftJoin(leads, eq(leads.id, meetings.leadId))
    .leftJoin(clients, eq(clients.id, meetings.clientId))
    .leftJoin(projects, eq(projects.id, meetings.projectId))
    .leftJoin(users, eq(users.id, meetings.createdByUserId));
}

export async function listMeetings(workspaceId, query, access = null) {
  const where = meetingFilters(workspaceId, query, access);
  const offset = (query.page - 1) * query.pageSize;

  const [rows, totals] = await Promise.all([
    meetingQuery()
      .where(where)
      .orderBy(asc(meetings.startsAt))
      .limit(query.pageSize)
      .offset(offset),
    getDb()
      .select({ value: count() })
      .from(meetings)
      .leftJoin(leads, eq(leads.id, meetings.leadId))
      .leftJoin(clients, eq(clients.id, meetings.clientId))
      .where(where),
  ]);

  const total = Number(totals[0]?.value || 0);
  return {
    items: rows,
    total,
    page: query.page,
    pageSize: query.pageSize,
    pages: Math.max(1, Math.ceil(total / query.pageSize)),
  };
}

export async function getMeeting(workspaceId, meetingId, access = null) {
  const where = [eq(meetings.workspaceId, workspaceId), eq(meetings.id, meetingId)];
  if (access && access.canViewAll === false) {
    where.push(
      or(
        eq(meetings.createdByUserId, access.userId),
        eq(leads.assignedUserId, access.userId),
      ),
    );
  }
  const rows = await meetingQuery()
    .where(and(...where))
    .limit(1);
  const meeting = rows[0];
  if (!meeting) return null;
  return {
    meeting,
    allowedTransitions: allowedMeetingStatuses(meeting.status),
  };
}

async function assertLead(workspaceId, leadId, access) {
  if (!leadId) return null;
  const detail = await getLead(workspaceId, leadId, access);
  if (!detail) {
    throw new ApiError(422, 'LEAD_NOT_FOUND', 'That lead could not be found.');
  }
  return detail.lead;
}

async function assertEntity(table, workspaceId, id, code, message) {
  if (!id) return null;
  const rows = await getDb()
    .select({ id: table.id })
    .from(table)
    .where(and(eq(table.workspaceId, workspaceId), eq(table.id, id)))
    .limit(1);
  if (!rows[0]) throw new ApiError(422, code, message);
  return rows[0].id;
}

function calendarSyncState(requested) {
  const readiness = getCalendarReadiness();
  if (!requested) {
    return {
      requested: false,
      synced: false,
      reason: 'NOT_REQUESTED',
      message:
        'Calendar sync was not requested. The meeting is stored in this workspace only.',
    };
  }
  return {
    requested: true,
    synced: false,
    reason: readiness.reason,
    message: readiness.message,
  };
}

export async function createMeeting({ workspaceId, userId, data, access = null }) {
  if (data.endsAt <= data.startsAt) {
    throw new ApiError(
      422,
      'INVALID_TIME_RANGE',
      'The meeting must end after it starts.',
      { endsAt: 'Choose a time after the start.' },
    );
  }

  const lead = await assertLead(workspaceId, data.leadId, access);
  await assertEntity(clients, workspaceId, data.clientId, 'CLIENT_NOT_FOUND', 'That client could not be found.');
  await assertEntity(
    projects,
    workspaceId,
    data.projectId,
    'PROJECT_NOT_FOUND',
    'That project could not be found.',
  );

  const rows = await getDb()
    .insert(meetings)
    .values({
      workspaceId,
      leadId: lead?.id || null,
      clientId: data.clientId || null,
      projectId: data.projectId || null,
      title: data.title,
      status: 'scheduled',
      startsAt: data.startsAt,
      endsAt: data.endsAt,
      timezone: data.timezone || 'UTC',
      location: data.location ?? null,
      attendees: data.attendees || [],
      agenda: data.agenda ?? null,
      notes: data.notes ?? null,
      createdByUserId: userId,
      updatedByUserId: userId,
    })
    .returning({ id: meetings.id });

  const meetingId = rows[0].id;

  await recordAudit({
    workspaceId,
    actorUserId: userId,
    action: 'meeting.create',
    resourceType: 'meeting',
    resourceId: meetingId,
    metadata: {
      leadId: data.leadId || null,
      startsAt: data.startsAt.toISOString(),
      calendarSyncRequested: Boolean(data.syncCalendar),
    },
  });

  const detail = await getMeeting(workspaceId, meetingId, access);

  if (lead?.assignedUserId && lead.assignedUserId !== userId) {
    await createNotification({
      workspaceId,
      userId: lead.assignedUserId,
      type: NOTIFICATION_TYPES.meetingScheduled,
      title: `Meeting scheduled: ${data.title}`,
      body: `Starts ${data.startsAt.toISOString()}. Review the agenda before the call.`,
      level: 'info',
      resourceType: 'meeting',
      resourceId: meetingId,
      actionUrl: '/workspace/meetings',
    });
  }

  return {
    ...detail,
    calendarSync: calendarSyncState(Boolean(data.syncCalendar)),
  };
}

export async function updateMeetingStatus({
  workspaceId,
  userId,
  meetingId,
  data,
  access = null,
}) {
  const existing = await getMeeting(workspaceId, meetingId, access);
  if (!existing) return null;

  const current = existing.meeting;
  if (current.status === data.status) {
    return { meeting: current, changed: false };
  }

  if (!allowedMeetingStatuses(current.status).includes(data.status)) {
    throw new ApiError(
      409,
      'INVALID_STATUS_TRANSITION',
      `A meeting cannot move from ${current.status} to ${data.status}.`,
      { allowed: allowedMeetingStatuses(current.status) },
    );
  }

  await getDb()
    .update(meetings)
    .set({
      status: data.status,
      notes: data.notes ?? current.notes,
      outcome: data.outcome ?? current.outcome,
      updatedByUserId: userId,
      updatedAt: new Date(),
    })
    .where(and(eq(meetings.workspaceId, workspaceId), eq(meetings.id, meetingId)));

  await recordAudit({
    workspaceId,
    actorUserId: userId,
    action: 'meeting.status_change',
    resourceType: 'meeting',
    resourceId: meetingId,
    metadata: { from: current.status, to: data.status },
  });

  const next = await getMeeting(workspaceId, meetingId, access);
  return { meeting: next.meeting, changed: true };
}
