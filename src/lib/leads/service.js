import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  ilike,
  isNotNull,
  isNull,
  lt,
  lte,
  ne,
  or,
  sql,
} from 'drizzle-orm';
import { getDb } from '@/db/client';
import {
  leadActivities,
  leadStatusHistory,
  leads,
  opportunities,
  users,
  workspaceMemberships,
} from '@/db/schema';
import { ApiError } from '@/lib/api-error';
import { recordAudit } from '@/lib/audit';
import { normalizeEmail } from '@/lib/auth/hash';
import { hasPermission } from '@/lib/auth/permissions';
import { createNotification, NOTIFICATION_TYPES } from '@/lib/notifications/service';

export const LEAD_STATUS_TRANSITIONS = {
  new: ['researching', 'qualified', 'contacted', 'follow_up', 'lost'],
  researching: ['qualified', 'contacted', 'follow_up', 'lost'],
  qualified: ['contacted', 'follow_up', 'meeting', 'proposal', 'lost'],
  contacted: ['follow_up', 'meeting', 'proposal', 'lost'],
  follow_up: ['contacted', 'meeting', 'proposal', 'won', 'lost'],
  meeting: ['follow_up', 'proposal', 'won', 'lost'],
  proposal: ['follow_up', 'won', 'lost'],
  won: ['researching'],
  lost: ['researching'],
};

export function allowedNextStatuses(status) {
  return [...(LEAD_STATUS_TRANSITIONS[status] || [])];
}

export function normalizeWebsiteKey(value) {
  if (!value) return null;
  const raw = String(value)
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '');
  const key = raw.split(/[?#]/)[0].replace(/\/+$/, '');
  return key || null;
}

export function websiteHost(value) {
  const key = normalizeWebsiteKey(value);
  return key ? key.split('/')[0] : null;
}

export function normalizeCompanyKey(value) {
  if (!value) return null;
  const key = String(value)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '');
  return key || null;
}

function escapeLike(value) {
  return String(value).replace(/[\\%_]/g, '\\$&');
}

function leadOrder(sort, direction) {
  const dir = direction === 'asc' ? asc : desc;
  switch (sort) {
    case 'updated':
      return dir(leads.updatedAt);
    case 'company':
      return dir(leads.companyName);
    case 'value':
      return direction === 'asc'
        ? sql`${leads.estimatedValueCents} asc nulls last`
        : sql`${leads.estimatedValueCents} desc nulls last`;
    case 'followUp':
      return direction === 'asc'
        ? sql`${leads.nextFollowUpAt} asc nulls last`
        : sql`${leads.nextFollowUpAt} desc nulls last`;
    case 'priority':
      return direction === 'asc'
        ? sql`${leads.priority} asc`
        : sql`${leads.priority} desc`;
    default:
      return dir(leads.createdAt);
  }
}

const LEAD_SELECT = {
  id: leads.id,
  workspaceId: leads.workspaceId,
  companyName: leads.companyName,
  contactName: leads.contactName,
  email: leads.email,
  phone: leads.phone,
  website: leads.website,
  industry: leads.industry,
  businessType: leads.businessType,
  location: leads.location,
  country: leads.country,
  source: leads.source,
  estimatedValueCents: leads.estimatedValueCents,
  currency: leads.currency,
  assignedUserId: leads.assignedUserId,
  assignedName: users.name,
  assignedEmail: users.email,
  priority: leads.priority,
  status: leads.status,
  nextFollowUpAt: leads.nextFollowUpAt,
  notes: leads.notes,
  requirementsInitial: leads.requirementsInitial,
  requirementsDetailed: leads.requirementsDetailed,
  reportedAmountReceivedCents: leads.reportedAmountReceivedCents,
  reportedOutstandingCents: leads.reportedOutstandingCents,
  reportedProjectCostCents: leads.reportedProjectCostCents,
  reportedAmountVerified: leads.reportedAmountVerified,
  importBatchId: leads.importBatchId,
  discoveryProspectId: leads.discoveryProspectId,
  aiLeadScore: leads.aiLeadScore,
  aiTemperature: leads.aiTemperature,
  discoveredAt: leads.discoveredAt,
  nextAction: leads.nextAction,
  lastContactedAt: leads.lastContactedAt,
  createdByUserId: leads.createdByUserId,
  archivedAt: leads.archivedAt,
  createdAt: leads.createdAt,
  updatedAt: leads.updatedAt,
};

function leadFilters(workspaceId, query, viewerUserId, access = null) {
  const filters = [eq(leads.workspaceId, workspaceId)];
  leadAccessFilter(filters, access);

  if (query.archived === 'archived') {
    filters.push(isNotNull(leads.archivedAt));
  } else if (query.archived !== 'all') {
    filters.push(isNull(leads.archivedAt));
  }

  if (query.status) filters.push(eq(leads.status, query.status));
  if (query.priority) filters.push(eq(leads.priority, query.priority));
  if (query.source) filters.push(eq(leads.source, query.source));
  if (query.temperature) {
    filters.push(eq(leads.aiTemperature, query.temperature));
  }

  if (query.assigned === 'me') {
    filters.push(eq(leads.assignedUserId, viewerUserId));
  } else if (query.assigned === 'unassigned') {
    filters.push(isNull(leads.assignedUserId));
  } else if (query.assigned) {
    filters.push(eq(leads.assignedUserId, query.assigned));
  }

  if (query.due === 'overdue') {
    filters.push(
      and(isNotNull(leads.nextFollowUpAt), lt(leads.nextFollowUpAt, new Date())),
    );
  } else if (query.due === 'upcoming') {
    filters.push(
      and(
        isNotNull(leads.nextFollowUpAt),
        gte(leads.nextFollowUpAt, new Date()),
        lte(leads.nextFollowUpAt, addDays(7)),
      ),
    );
  }

  if (query.search) {
    const like = `%${escapeLike(query.search)}%`;
    filters.push(
      or(
        ilike(leads.companyName, like),
        ilike(leads.contactName, like),
        ilike(leads.email, like),
        ilike(leads.phone, like),
        ilike(leads.website, like),
        ilike(leads.industry, like),
        ilike(leads.location, like),
      ),
    );
  }

  return and(...filters);
}

function addDays(days) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

// A caller without leads.view_all may only ever see leads assigned to them.
// Access is resolved from the stored membership role by the route layer; the
// service re-checks it so a direct API call cannot bypass the rule.
function leadAccessFilter(filters, access) {
  if (access && access.canViewAll === false) {
    filters.push(eq(leads.assignedUserId, access.userId));
  }
}

function assertLeadAccess(lead, access) {
  if (!access || access.canViewAll !== false) return;
  if (lead.assignedUserId !== access.userId) {
    throw new ApiError(
      403,
      'FORBIDDEN',
      'This lead is assigned to another sales executive.',
    );
  }
}

// Routes and pages call this so the same membership role drives both the API
// and server-rendered reads.
export function leadAccessFor(viewer) {
  return {
    userId: viewer.user.id,
    canViewAll: hasPermission(viewer.membership.role, 'leads.view_all'),
  };
}

export async function listLeads(workspaceId, viewerUserId, query, access = null) {
  const db = getDb();
  const where = leadFilters(workspaceId, query, viewerUserId, access);
  const offset = (query.page - 1) * query.pageSize;

  const [rows, totals] = await Promise.all([
    db
      .select(LEAD_SELECT)
      .from(leads)
      .leftJoin(users, eq(users.id, leads.assignedUserId))
      .where(where)
      .orderBy(leadOrder(query.sort, query.direction))
      .limit(query.pageSize)
      .offset(offset),
    db.select({ value: count() }).from(leads).where(where),
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

async function getLeadRow(workspaceId, leadId) {
  const rows = await getDb()
    .select(LEAD_SELECT)
    .from(leads)
    .leftJoin(users, eq(users.id, leads.assignedUserId))
    .where(and(eq(leads.workspaceId, workspaceId), eq(leads.id, leadId)))
    .limit(1);
  return rows[0] || null;
}

export async function getLead(workspaceId, leadId, access = null) {
  const lead = await getLeadRow(workspaceId, leadId);
  if (!lead) return null;
  assertLeadAccess(lead, access);

  const db = getDb();
  const [activities, statusHistory, possibleDuplicates, linkedOpportunities] =
    await Promise.all([
    db
      .select({
        id: leadActivities.id,
        type: leadActivities.type,
        body: leadActivities.body,
        metadata: leadActivities.metadata,
        actorUserId: leadActivities.actorUserId,
        actorName: users.name,
        actorEmail: users.email,
        createdAt: leadActivities.createdAt,
      })
      .from(leadActivities)
      .leftJoin(users, eq(users.id, leadActivities.actorUserId))
      .where(
        and(
          eq(leadActivities.workspaceId, workspaceId),
          eq(leadActivities.leadId, leadId),
        ),
      )
      .orderBy(desc(leadActivities.createdAt))
      .limit(100),
    db
      .select({
        id: leadStatusHistory.id,
        fromStatus: leadStatusHistory.fromStatus,
        toStatus: leadStatusHistory.toStatus,
        note: leadStatusHistory.note,
        changedByName: users.name,
        changedByEmail: users.email,
        createdAt: leadStatusHistory.createdAt,
      })
      .from(leadStatusHistory)
      .leftJoin(users, eq(users.id, leadStatusHistory.changedByUserId))
      .where(
        and(
          eq(leadStatusHistory.workspaceId, workspaceId),
          eq(leadStatusHistory.leadId, leadId),
        ),
      )
      .orderBy(desc(leadStatusHistory.createdAt))
      .limit(100),
    findPossibleDuplicates(
      workspaceId,
      {
        companyName: lead.companyName,
        email: lead.email,
        website: lead.website,
      },
      { excludeLeadId: leadId },
    ),
    db
      .select({
        id: opportunities.id,
        title: opportunities.title,
        stage: opportunities.stage,
        expectedValueCents: opportunities.expectedValueCents,
        currency: opportunities.currency,
        nextFollowUpAt: opportunities.nextFollowUpAt,
        ownerName: users.name,
        ownerEmail: users.email,
        updatedAt: opportunities.updatedAt,
      })
      .from(opportunities)
      .leftJoin(users, eq(users.id, opportunities.ownerUserId))
      .where(
        and(
          eq(opportunities.workspaceId, workspaceId),
          eq(opportunities.leadId, leadId),
        ),
      )
      .orderBy(desc(opportunities.updatedAt)),
  ]);

  return {
    lead,
    activities,
    statusHistory,
    possibleDuplicates,
    opportunities: linkedOpportunities,
    allowedTransitions: allowedNextStatuses(lead.status),
  };
}

export async function findPossibleDuplicates(
  workspaceId,
  { companyName, email, website },
  { excludeLeadId = null } = {},
) {
  const emailKey = email ? normalizeEmail(email) : null;
  const hostKey = websiteHost(website);
  const companyKey = normalizeCompanyKey(companyName);

  if (!emailKey && !hostKey && !companyKey) return [];

  const clauses = [];
  if (emailKey) clauses.push(ilike(leads.email, escapeLike(emailKey)));
  if (hostKey) clauses.push(ilike(leads.website, `%${escapeLike(hostKey)}%`));
  if (companyName && companyName.trim()) {
    clauses.push(ilike(leads.companyName, escapeLike(companyName.trim())));
  }

  const filters = [eq(leads.workspaceId, workspaceId), or(...clauses)];
  if (excludeLeadId) filters.push(ne(leads.id, excludeLeadId));

  const rows = await getDb()
    .select({
      id: leads.id,
      companyName: leads.companyName,
      email: leads.email,
      website: leads.website,
      status: leads.status,
      archivedAt: leads.archivedAt,
      createdAt: leads.createdAt,
    })
    .from(leads)
    .where(and(...filters))
    .orderBy(desc(leads.createdAt))
    .limit(25);

  const matches = [];
  for (const row of rows) {
    const reasons = [];
    if (emailKey && row.email && normalizeEmail(row.email) === emailKey) {
      reasons.push('email');
    }
    if (hostKey && websiteHost(row.website) === hostKey) {
      reasons.push('website');
    }
    if (
      companyKey &&
      row.companyName &&
      normalizeCompanyKey(row.companyName) === companyKey
    ) {
      reasons.push('company');
    }
    if (reasons.length > 0) matches.push({ ...row, reasons });
  }

  return matches;
}

async function assertAssigneeInWorkspace(workspaceId, userId) {
  if (!userId) return null;
  const rows = await getDb()
    .select({ userId: workspaceMemberships.userId })
    .from(workspaceMemberships)
    .where(
      and(
        eq(workspaceMemberships.workspaceId, workspaceId),
        eq(workspaceMemberships.userId, userId),
      ),
    )
    .limit(1);
  if (!rows[0]) {
    throw new ApiError(
      422,
      'ASSIGNEE_NOT_MEMBER',
      'That person is not a member of this workspace.',
      { assignedUserId: 'Choose a workspace member.' },
    );
  }
  return userId;
}

async function insertActivity({
  workspaceId,
  leadId,
  userId,
  type,
  body = null,
  metadata = null,
}) {
  await getDb().insert(leadActivities).values({
    workspaceId,
    leadId,
    actorUserId: userId || null,
    type,
    body,
    metadata,
  });
}

export async function createLead({ workspaceId, userId, data }) {
  const assignee = await assertAssigneeInWorkspace(
    workspaceId,
    data.assignedUserId || null,
  );

  const { status = 'new', ...rest } = data;
  const duplicates = await findPossibleDuplicates(workspaceId, {
    companyName: data.companyName,
    email: data.email,
    website: data.website,
  });

  const rows = await getDb()
    .insert(leads)
    .values({
      ...rest,
      workspaceId,
      status,
      assignedUserId: assignee,
      createdByUserId: userId,
    })
    .returning();
  const lead = rows[0];

  await insertActivity({
    workspaceId,
    leadId: lead.id,
    userId,
    type: 'created',
    body: `Lead created with status “${status}”.`,
    metadata: {
      possibleDuplicateIds: duplicates.map((item) => item.id),
    },
  });

  await getDb().insert(leadStatusHistory).values({
    workspaceId,
    leadId: lead.id,
    fromStatus: null,
    toStatus: status,
    note: 'Lead created.',
    changedByUserId: userId,
  });

  await recordAudit({
    workspaceId,
    actorUserId: userId,
    action: 'lead.create',
    resourceType: 'lead',
    resourceId: lead.id,
    metadata: { status, possibleDuplicates: duplicates.length },
  });

  return {
    lead: await getLeadRow(workspaceId, lead.id),
    possibleDuplicates: duplicates,
  };
}

export async function updateLead({ workspaceId, userId, leadId, data, access = null }) {
  const current = await getLead(workspaceId, leadId, access);
  if (!current) return null;
  if (current.lead.archivedAt) {
    throw new ApiError(
      409,
      'LEAD_ARCHIVED',
      'Restore this lead before editing it.',
    );
  }

  const changes = {};
  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined) changes[key] = value;
  }

  if (Object.keys(changes).length === 0) {
    return { lead: current.lead, possibleDuplicates: current.possibleDuplicates };
  }

  const rows = await getDb()
    .update(leads)
    .set({ ...changes, updatedAt: new Date() })
    .where(and(eq(leads.workspaceId, workspaceId), eq(leads.id, leadId)))
    .returning({ id: leads.id });

  if (!rows[0]) return null;

  const changedFields = Object.keys(changes);
  await insertActivity({
    workspaceId,
    leadId,
    userId,
    type: 'updated',
    body: `Lead details updated: ${changedFields.join(', ')}.`,
    metadata: { fields: changedFields },
  });

  await recordAudit({
    workspaceId,
    actorUserId: userId,
    action: 'lead.update',
    resourceType: 'lead',
    resourceId: leadId,
    metadata: { fields: changedFields },
  });

  const next = await getLead(workspaceId, leadId, access);
  return {
    lead: next.lead,
    possibleDuplicates: next.possibleDuplicates,
  };
}

// Reported amounts are what the owner was told, never a verified payment or an
// invoice. They are stored separately from any accepted proposal total so
// finance reporting can label them as unverified.
export async function updateLeadReportedAmounts({
  workspaceId,
  userId,
  leadId,
  data,
  access = null,
}) {
  const current = await getLead(workspaceId, leadId, access);
  if (!current) return null;
  if (current.lead.archivedAt) {
    throw new ApiError(
      409,
      'LEAD_ARCHIVED',
      'Restore this lead before editing reported amounts.',
    );
  }

  const patch = {};
  for (const key of [
    'reportedAmountReceivedCents',
    'reportedOutstandingCents',
    'reportedProjectCostCents',
    'reportedAmountVerified',
  ]) {
    if (data[key] !== undefined) patch[key] = data[key];
  }
  if (Object.keys(patch).length === 0) {
    return { lead: current.lead, changed: false };
  }

  await getDb()
    .update(leads)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(leads.workspaceId, workspaceId), eq(leads.id, leadId)));

  await insertActivity({
    workspaceId,
    leadId,
    userId,
    type: 'reported_amounts_updated',
    body: 'Reported amounts were updated. These are owner-reported figures, not verified payments.',
    metadata: patch,
  });

  await recordAudit({
    workspaceId,
    actorUserId: userId,
    action: 'lead.reported_amounts',
    resourceType: 'lead',
    resourceId: leadId,
    metadata: patch,
  });

  const next = await getLead(workspaceId, leadId, access);
  return { lead: next.lead, changed: true };
}

export async function changeLeadStatus({
  workspaceId,
  userId,
  leadId,
  status,
  note = null,
  access = null,
}) {
  const current = await getLeadRow(workspaceId, leadId);
  if (!current) return null;
  assertLeadAccess(current, access);
  if (current.archivedAt) {
    throw new ApiError(
      409,
      'LEAD_ARCHIVED',
      'Restore this lead before changing its status.',
    );
  }

  if (current.status === status) {
    return { lead: current, changed: false };
  }

  if (!allowedNextStatuses(current.status).includes(status)) {
    throw new ApiError(
      409,
      'INVALID_STATUS_TRANSITION',
      `A lead cannot move from ${current.status} to ${status}.`,
      { status: `Allowed next statuses: ${allowedNextStatuses(current.status).join(', ') || 'none'}.` },
    );
  }

  const rows = await getDb()
    .update(leads)
    .set({ status, updatedAt: new Date() })
    .where(
      and(
        eq(leads.workspaceId, workspaceId),
        eq(leads.id, leadId),
        eq(leads.status, current.status),
      ),
    )
    .returning({ id: leads.id });

  if (!rows[0]) {
    throw new ApiError(
      409,
      'STATUS_CONFLICT',
      'This lead changed while you were updating it. Reload and try again.',
    );
  }

  await getDb().insert(leadStatusHistory).values({
    workspaceId,
    leadId,
    fromStatus: current.status,
    toStatus: status,
    note,
    changedByUserId: userId,
  });

  await insertActivity({
    workspaceId,
    leadId,
    userId,
    type: 'status_changed',
    body: `Status changed from ${current.status} to ${status}.`,
    metadata: { from: current.status, to: status },
  });

  await recordAudit({
    workspaceId,
    actorUserId: userId,
    action: 'lead.status_change',
    resourceType: 'lead',
    resourceId: leadId,
    metadata: { from: current.status, to: status },
  });

  return { lead: await getLeadRow(workspaceId, leadId), changed: true };
}

export async function assignLead({ workspaceId, userId, leadId, assignedUserId }) {
  const current = await getLeadRow(workspaceId, leadId);
  if (!current) return null;
  if (current.archivedAt) {
    throw new ApiError(
      409,
      'LEAD_ARCHIVED',
      'Restore this lead before assigning it.',
    );
  }

  await assertAssigneeInWorkspace(workspaceId, assignedUserId);

  if (current.assignedUserId === assignedUserId) {
    return { lead: current, changed: false };
  }

  await getDb()
    .update(leads)
    .set({ assignedUserId, updatedAt: new Date() })
    .where(and(eq(leads.workspaceId, workspaceId), eq(leads.id, leadId)));

  const next = await getLeadRow(workspaceId, leadId);

  await insertActivity({
    workspaceId,
    leadId,
    userId,
    type: 'assigned',
    body: next.assignedUserId
      ? `Assigned to ${next.assignedName || next.assignedEmail || 'a member'}.`
      : 'Lead unassigned.',
    metadata: { assignedUserId },
  });

  await recordAudit({
    workspaceId,
    actorUserId: userId,
    action: 'lead.assign',
    resourceType: 'lead',
    resourceId: leadId,
    metadata: { assignedUserId },
  });

  if (assignedUserId && assignedUserId !== userId) {
    await createNotification({
      workspaceId,
      userId: assignedUserId,
      type: NOTIFICATION_TYPES.leadAssigned,
      title: `Lead assigned: ${next.companyName}`,
      body: 'You are now responsible for this lead. Review the next action and follow-up date.',
      level: 'info',
      resourceType: 'lead',
      resourceId: leadId,
      actionUrl: `/workspace/leads/${leadId}`,
    });
  }

  return { lead: next, changed: true };
}

export async function setLeadArchived({
  workspaceId,
  userId,
  leadId,
  archived,
}) {
  const current = await getLeadRow(workspaceId, leadId);
  if (!current) return null;

  if (Boolean(current.archivedAt) === Boolean(archived)) {
    return { lead: current, changed: false };
  }

  await getDb()
    .update(leads)
    .set({ archivedAt: archived ? new Date() : null, updatedAt: new Date() })
    .where(and(eq(leads.workspaceId, workspaceId), eq(leads.id, leadId)));

  const next = await getLeadRow(workspaceId, leadId);

  await insertActivity({
    workspaceId,
    leadId,
    userId,
    type: archived ? 'archived' : 'restored',
    body: archived ? 'Lead archived.' : 'Lead restored.',
  });

  await recordAudit({
    workspaceId,
    actorUserId: userId,
    action: archived ? 'lead.archive' : 'lead.restore',
    resourceType: 'lead',
    resourceId: leadId,
  });

  return { lead: next, changed: true };
}

export async function addLeadNote({
  workspaceId,
  userId,
  leadId,
  body,
  access = null,
}) {
  const current = await getLeadRow(workspaceId, leadId);
  if (!current) return null;
  assertLeadAccess(current, access);
  if (current.archivedAt) {
    throw new ApiError(
      409,
      'LEAD_ARCHIVED',
      'Restore this lead before adding notes.',
    );
  }

  const inserted = await getDb()
    .insert(leadActivities)
    .values({
      workspaceId,
      leadId,
      actorUserId: userId,
      type: 'note',
      body,
    })
    .returning({ id: leadActivities.id });

  await recordAudit({
    workspaceId,
    actorUserId: userId,
    action: 'lead.note',
    resourceType: 'lead',
    resourceId: leadId,
  });

  const rows = await getDb()
    .select({
      id: leadActivities.id,
      type: leadActivities.type,
      body: leadActivities.body,
      metadata: leadActivities.metadata,
      actorUserId: leadActivities.actorUserId,
      actorName: users.name,
      actorEmail: users.email,
      createdAt: leadActivities.createdAt,
    })
    .from(leadActivities)
    .leftJoin(users, eq(users.id, leadActivities.actorUserId))
    .where(
      and(
        eq(leadActivities.workspaceId, workspaceId),
        eq(leadActivities.id, inserted[0].id),
      ),
    )
    .limit(1);

  return rows[0] || null;
}

export async function getLeadOverview(workspaceId, userId, access = null) {
  const db = getDb();
  const scope = [eq(leads.workspaceId, workspaceId)];
  leadAccessFilter(scope, access);
  const activeFilters = and(...scope, isNull(leads.archivedAt));

  const [byStatus, assignedRows, dueRows, archivedRows] = await Promise.all([
    db
      .select({ status: leads.status, value: count() })
      .from(leads)
      .where(activeFilters)
      .groupBy(leads.status),
    db
      .select({ value: count() })
      .from(leads)
      .where(and(activeFilters, eq(leads.assignedUserId, userId))),
    db
      .select({ value: count() })
      .from(leads)
      .where(
        and(
          activeFilters,
          isNotNull(leads.nextFollowUpAt),
          lt(leads.nextFollowUpAt, new Date()),
        ),
      ),
    db
      .select({ value: count() })
      .from(leads)
      .where(and(...scope, isNotNull(leads.archivedAt))),
  ]);

  const status = {};
  let total = 0;
  for (const row of byStatus) {
    const value = Number(row.value || 0);
    status[row.status] = value;
    total += value;
  }

  return {
    total,
    byStatus: status,
    assignedToMe: Number(assignedRows[0]?.value || 0),
    followUpsOverdue: Number(dueRows[0]?.value || 0),
    archived: Number(archivedRows[0]?.value || 0),
  };
}
