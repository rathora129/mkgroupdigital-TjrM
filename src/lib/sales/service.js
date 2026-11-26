import { and, asc, count, desc, eq, gte, inArray, isNotNull, lt, lte } from 'drizzle-orm';
import { getDb } from '@/db/client';
import {
  clients,
  leadActivities,
  leads,
  meetings,
  projectTasks,
  users,
} from '@/db/schema';
import { ApiError } from '@/lib/api-error';
import { recordAudit } from '@/lib/audit';
import {
  changeLeadStatus,
  getLead,
  getLeadOverview,
  listLeads,
} from '@/lib/leads/service';
import { CALL_OUTCOME_META, FOLLOW_UP_TASK_TYPE } from './validation';

const OPEN_TASK_STATUSES = ['todo', 'in_progress', 'blocked', 'in_review'];
const AUTO_CONTACT_STATUSES = ['new', 'researching', 'qualified'];

async function loadLeadForCaller(workspaceId, leadId, access) {
  const detail = await getLead(workspaceId, leadId, access);
  if (!detail) return null;
  if (detail.lead.archivedAt) {
    throw new ApiError(
      409,
      'LEAD_ARCHIVED',
      'Restore this lead before logging calls.',
    );
  }
  return detail.lead;
}

function taskTitle(lead, custom) {
  if (custom && custom.trim()) return custom.trim();
  return `Follow up with ${lead.companyName}`;
}

async function insertFollowUpTask({
  workspaceId,
  userId,
  lead,
  data,
  sourceId = null,
}) {
  const ownerUserId = data.ownerUserId || lead.assignedUserId || userId;
  const rows = await getDb()
    .insert(projectTasks)
    .values({
      workspaceId,
      leadId: lead.id,
      taskType: FOLLOW_UP_TASK_TYPE,
      title: taskTitle(lead, data.title),
      description: data.description ?? null,
      status: 'todo',
      priority: data.priority || 'medium',
      ownerUserId,
      dueDate: data.dueDate,
      dueTime: data.dueTime ?? null,
      timezone: data.timezone ?? null,
      sourceType: 'lead_follow_up',
      sourceId,
      createdByUserId: userId,
      updatedByUserId: userId,
    })
    .returning({
      id: projectTasks.id,
      title: projectTasks.title,
      dueDate: projectTasks.dueDate,
      dueTime: projectTasks.dueTime,
      ownerUserId: projectTasks.ownerUserId,
      priority: projectTasks.priority,
    });
  return rows[0];
}

async function syncLeadFollowUp({ workspaceId, lead, dueDate, nextAction, contactedAt }) {
  const patch = { updatedAt: new Date() };
  if (contactedAt) patch.lastContactedAt = contactedAt;
  if (nextAction !== undefined) patch.nextAction = nextAction;
  if (dueDate) {
    if (!lead.nextFollowUpAt || dueDate < new Date(lead.nextFollowUpAt)) {
      patch.nextFollowUpAt = dueDate;
    }
  }
  await getDb()
    .update(leads)
    .set(patch)
    .where(and(eq(leads.workspaceId, workspaceId), eq(leads.id, lead.id)));
}

export async function logCall({ workspaceId, userId, leadId, data, access = null }) {
  const lead = await loadLeadForCaller(workspaceId, leadId, access);
  if (!lead) return null;

  const outcome = CALL_OUTCOME_META[data.outcome];
  const now = new Date();

  const activityRows = await getDb()
    .insert(leadActivities)
    .values({
      workspaceId,
      leadId,
      actorUserId: userId,
      type: 'call_logged',
      body: data.summary || `Call outcome: ${outcome.label}.`,
      metadata: {
        outcome: data.outcome,
        durationSeconds: data.durationSeconds || 0,
        followUpAt: data.followUpAt ? data.followUpAt.toISOString() : null,
        nextAction: data.nextAction || null,
      },
    })
    .returning({ id: leadActivities.id });
  const activityId = activityRows[0].id;

  await syncLeadFollowUp({
    workspaceId,
    lead,
    dueDate: data.followUpAt || null,
    nextAction: data.nextAction ?? null,
    contactedAt: now,
  });

  let statusChange = null;
  if (outcome.countsAsContact && AUTO_CONTACT_STATUSES.includes(lead.status)) {
    try {
      const moved = await changeLeadStatus({
        workspaceId,
        userId,
        leadId,
        status: 'contacted',
        note: `Automatic from call outcome: ${outcome.label}.`,
      });
      if (moved?.changed) statusChange = 'contacted';
    } catch {
      // A transition conflict must not discard the call record; the note and
      // activity are already saved and the caller can change status manually.
      statusChange = null;
    }
  }

  let task = null;
  if (data.createFollowUpTask && data.followUpAt) {
    task = await insertFollowUpTask({
      workspaceId,
      userId,
      lead,
      data: {
        dueDate: data.followUpAt,
        dueTime: data.followUpTime,
        timezone: data.timezone,
        title: null,
        description: data.summary || null,
        priority: 'medium',
        ownerUserId: lead.assignedUserId || userId,
      },
      sourceId: activityId,
    });
  }

  await recordAudit({
    workspaceId,
    actorUserId: userId,
    action: 'lead.call_logged',
    resourceType: 'lead',
    resourceId: leadId,
    metadata: {
      outcome: data.outcome,
      followUpTaskId: task?.id || null,
      statusChange,
    },
  });

  return {
    activityId,
    outcome: data.outcome,
    statusChange,
    followUpTask: task,
    lead: await loadLeadForCaller(workspaceId, leadId, access),
  };
}

export async function createLeadFollowUpTask({
  workspaceId,
  userId,
  leadId,
  data,
  access = null,
}) {
  const lead = await loadLeadForCaller(workspaceId, leadId, access);
  if (!lead) return null;

  const task = await insertFollowUpTask({
    workspaceId,
    userId,
    lead,
    data,
  });

  await syncLeadFollowUp({
    workspaceId,
    lead,
    dueDate: data.dueDate,
    nextAction: data.description ?? undefined,
  });

  await getDb().insert(leadActivities).values({
    workspaceId,
    leadId,
    actorUserId: userId,
    type: 'follow_up_scheduled',
    body: `Follow-up scheduled for ${data.dueDate.toISOString()}.`,
    metadata: { taskId: task.id },
  });

  await recordAudit({
    workspaceId,
    actorUserId: userId,
    action: 'lead.follow_up_create',
    resourceType: 'lead',
    resourceId: leadId,
    metadata: { taskId: task.id },
  });

  return { task, lead: await loadLeadForCaller(workspaceId, leadId, access) };
}

export async function listFollowUpTasks({ workspaceId, access = null, limit = 50 }) {
  const filters = [
    eq(projectTasks.workspaceId, workspaceId),
    eq(projectTasks.taskType, FOLLOW_UP_TASK_TYPE),
    inArray(projectTasks.status, OPEN_TASK_STATUSES),
    isNotNull(projectTasks.dueDate),
  ];
  if (access && access.canViewAll === false) {
    filters.push(eq(projectTasks.ownerUserId, access.userId));
  }

  const rows = await getDb()
    .select({
      id: projectTasks.id,
      title: projectTasks.title,
      status: projectTasks.status,
      priority: projectTasks.priority,
      dueDate: projectTasks.dueDate,
      dueTime: projectTasks.dueTime,
      timezone: projectTasks.timezone,
      ownerUserId: projectTasks.ownerUserId,
      ownerName: users.name,
      leadId: projectTasks.leadId,
      leadCompanyName: leads.companyName,
    })
    .from(projectTasks)
    .leftJoin(leads, eq(leads.id, projectTasks.leadId))
    .leftJoin(users, eq(users.id, projectTasks.ownerUserId))
    .where(and(...filters))
    .orderBy(asc(projectTasks.dueDate))
    .limit(limit);

  const now = Date.now();
  return rows.map((row) => ({
    ...row,
    isOverdue: row.dueDate ? new Date(row.dueDate).getTime() < now : false,
  }));
}

export async function getSalesCallerWorkspace({
  workspaceId,
  userId,
  access,
  leadQuery,
  limit = 50,
}) {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const endOfToday = new Date(startOfToday);
  endOfToday.setDate(endOfToday.getDate() + 1);
  const weekAhead = new Date();
  weekAhead.setDate(weekAhead.getDate() + 7);

  const query = {
    page: 1,
    pageSize: 50,
    sort: 'followUp',
    direction: 'asc',
    archived: 'active',
    assigned: access.canViewAll ? undefined : 'me',
    ...leadQuery,
  };
  if (!access.canViewAll) query.assigned = 'me';

  const [overview, assignedLeads, followUpTasks, callsToday, upcomingMeetings] =
    await Promise.all([
      getLeadOverview(workspaceId, userId, access),
      listLeads(workspaceId, userId, query, access),
      listFollowUpTasks({ workspaceId, access, limit }),
      getDb()
        .select({ value: count() })
        .from(leadActivities)
        .where(
          and(
            eq(leadActivities.workspaceId, workspaceId),
            eq(leadActivities.actorUserId, userId),
            eq(leadActivities.type, 'call_logged'),
            gte(leadActivities.createdAt, startOfToday),
            lt(leadActivities.createdAt, endOfToday),
          ),
        ),
      getDb()
        .select({ value: count() })
        .from(meetings)
        .where(
          and(
            eq(meetings.workspaceId, workspaceId),
            inArray(meetings.status, ['scheduled', 'rescheduled']),
            gte(meetings.startsAt, startOfToday),
            lte(meetings.startsAt, weekAhead),
          ),
        ),
    ]);

  return {
    overview,
    leads: assignedLeads,
    followUpTasks,
    stats: {
      callsToday: Number(callsToday[0]?.value || 0),
      followUpsDue: followUpTasks.length,
      meetingsThisWeek: Number(upcomingMeetings[0]?.value || 0),
    },
    scope: access.canViewAll ? 'workspace' : 'assigned',
  };
}

export async function listLeadCalls({ workspaceId, leadId, access = null, limit = 50 }) {
  const lead = await loadLeadForCaller(workspaceId, leadId, access);
  if (!lead) return null;
  return getDb()
    .select({
      id: leadActivities.id,
      body: leadActivities.body,
      metadata: leadActivities.metadata,
      actorName: users.name,
      createdAt: leadActivities.createdAt,
    })
    .from(leadActivities)
    .leftJoin(users, eq(users.id, leadActivities.actorUserId))
    .where(
      and(
        eq(leadActivities.workspaceId, workspaceId),
        eq(leadActivities.leadId, leadId),
        eq(leadActivities.type, 'call_logged'),
      ),
    )
    .orderBy(desc(leadActivities.createdAt))
    .limit(limit);
}

export async function listCallerClients(workspaceId) {
  return getDb()
    .select({ id: clients.id, companyName: clients.companyName })
    .from(clients)
    .where(eq(clients.workspaceId, workspaceId))
    .orderBy(asc(clients.companyName))
    .limit(100);
}
