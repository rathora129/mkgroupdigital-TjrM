import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  ilike,
  lt,
  or,
} from 'drizzle-orm';
import { getDb } from '@/db/client';
import {
  clients,
  leads,
  projects,
  proposals,
  serviceEngagements,
  services,
  users,
} from '@/db/schema';
import { ApiError } from '@/lib/api-error';
import { recordAudit } from '@/lib/audit';
import { assertMembers, escapeLike, staleError } from './helpers';
import {
  ENGAGEMENT_STATUS_TRANSITIONS,
  canTransitionEngagement,
} from './transitions';

const DAY_MS = 24 * 60 * 60 * 1000;

function engagementNotFound() {
  return new ApiError(404, 'NOT_FOUND', 'That engagement could not be found.');
}

async function assertClient(workspaceId, clientId) {
  const rows = await getDb()
    .select({ id: clients.id, companyName: clients.companyName })
    .from(clients)
    .where(and(eq(clients.workspaceId, workspaceId), eq(clients.id, clientId)))
    .limit(1);
  if (!rows[0]) {
    throw new ApiError(
      422,
      'CLIENT_NOT_FOUND',
      'Choose a client from this workspace.',
      { clientId: 'Choose a client from this workspace.' },
    );
  }
  return rows[0];
}

async function assertLink(workspaceId, table, id, code, message) {
  if (!id) return null;
  const rows = await getDb()
    .select({ id: table.id })
    .from(table)
    .where(and(eq(table.workspaceId, workspaceId), eq(table.id, id)))
    .limit(1);
  if (!rows[0]) throw new ApiError(422, code, message);
  return rows[0];
}

async function assertManager(workspaceId, userId) {
  if (!userId) return;
  const ids = await assertMembers(workspaceId, [userId]);
  if (ids.length === 0) {
    throw new ApiError(422, 'MANAGER_NOT_MEMBER', 'Choose a workspace member.');
  }
}

const ENGAGEMENT_SELECT = {
  id: serviceEngagements.id,
  name: serviceEngagements.name,
  status: serviceEngagements.status,
  frequency: serviceEngagements.frequency,
  startDate: serviceEngagements.startDate,
  endDate: serviceEngagements.endDate,
  renewalDate: serviceEngagements.renewalDate,
  scopeReference: serviceEngagements.scopeReference,
  contractValueCents: serviceEngagements.contractValueCents,
  currency: serviceEngagements.currency,
  internalNotes: serviceEngagements.internalNotes,
  clientId: serviceEngagements.clientId,
  companyName: clients.companyName,
  clientReference: clients.reference,
  serviceId: serviceEngagements.serviceId,
  serviceName: services.name,
  proposalId: serviceEngagements.proposalId,
  proposalReference: proposals.reference,
  projectId: serviceEngagements.projectId,
  projectReference: projects.reference,
  managerUserId: serviceEngagements.managerUserId,
  managerName: users.name,
  createdAt: serviceEngagements.createdAt,
  updatedAt: serviceEngagements.updatedAt,
};

function baseQuery() {
  return getDb()
    .select(ENGAGEMENT_SELECT)
    .from(serviceEngagements)
    .innerJoin(clients, eq(clients.id, serviceEngagements.clientId))
    .leftJoin(services, eq(services.id, serviceEngagements.serviceId))
    .leftJoin(proposals, eq(proposals.id, serviceEngagements.proposalId))
    .leftJoin(projects, eq(projects.id, serviceEngagements.projectId))
    .leftJoin(users, eq(users.id, serviceEngagements.managerUserId));
}

async function loadEngagementRow(workspaceId, engagementId) {
  const rows = await baseQuery()
    .where(
      and(
        eq(serviceEngagements.workspaceId, workspaceId),
        eq(serviceEngagements.id, engagementId),
      ),
    )
    .limit(1);
  return rows[0] || null;
}

function renewalWindow(days) {
  const start = new Date();
  const end = new Date(start.getTime() + days * DAY_MS);
  return { start, end };
}

export async function listEngagements(workspaceId, query) {
  const db = getDb();
  const filters = [eq(serviceEngagements.workspaceId, workspaceId)];
  if (query.clientId) filters.push(eq(serviceEngagements.clientId, query.clientId));
  if (query.status) filters.push(eq(serviceEngagements.status, query.status));
  if (query.frequency) filters.push(eq(serviceEngagements.frequency, query.frequency));
  if (query.renewal) {
    const days = query.renewal === 'due_30' ? 30 : 90;
    const { start, end } = renewalWindow(days);
    filters.push(
      gte(serviceEngagements.renewalDate, start),
      lt(serviceEngagements.renewalDate, end),
    );
  }
  if (query.search) {
    const like = `%${escapeLike(query.search)}%`;
    filters.push(
      or(
        ilike(serviceEngagements.name, like),
        ilike(serviceEngagements.scopeReference, like),
        ilike(clients.companyName, like),
      ),
    );
  }
  const where = and(...filters);
  const offset = (query.page - 1) * query.pageSize;

  const [rows, totals] = await Promise.all([
    baseQuery()
      .where(where)
      .orderBy(
        asc(serviceEngagements.renewalDate),
        desc(serviceEngagements.createdAt),
      )
      .limit(query.pageSize)
      .offset(offset),
    db
      .select({ value: count() })
      .from(serviceEngagements)
      .innerJoin(clients, eq(clients.id, serviceEngagements.clientId))
      .where(where),
  ]);

  const total = Number(totals[0]?.value || 0);
  const now = Date.now();
  return {
    items: rows.map((row) => ({
      ...row,
      renewalDueInDays: row.renewalDate
        ? Math.ceil((new Date(row.renewalDate).getTime() - now) / DAY_MS)
        : null,
    })),
    total,
    page: query.page,
    pageSize: query.pageSize,
    pages: Math.max(1, Math.ceil(total / query.pageSize)),
  };
}

export async function getEngagementsOverview(workspaceId) {
  const db = getDb();
  const { start: soon30, end: soon30End } = renewalWindow(30);
  const { end: soon90End } = renewalWindow(90);

  const [statusRows, renewals30, renewals90, activeValue] = await Promise.all([
    db
      .select({ status: serviceEngagements.status, value: count() })
      .from(serviceEngagements)
      .where(eq(serviceEngagements.workspaceId, workspaceId))
      .groupBy(serviceEngagements.status),
    db
      .select({ value: count() })
      .from(serviceEngagements)
      .where(
        and(
          eq(serviceEngagements.workspaceId, workspaceId),
          eq(serviceEngagements.status, 'active'),
          gte(serviceEngagements.renewalDate, soon30),
          lt(serviceEngagements.renewalDate, soon30End),
        ),
      ),
    db
      .select({ value: count() })
      .from(serviceEngagements)
      .where(
        and(
          eq(serviceEngagements.workspaceId, workspaceId),
          eq(serviceEngagements.status, 'active'),
          gte(serviceEngagements.renewalDate, soon30),
          lt(serviceEngagements.renewalDate, soon90End),
        ),
      ),
    db
      .select({ value: count() })
      .from(serviceEngagements)
      .where(
        and(
          eq(serviceEngagements.workspaceId, workspaceId),
          eq(serviceEngagements.status, 'active'),
        ),
      ),
  ]);

  const counts = {};
  for (const row of statusRows) counts[row.status] = Number(row.value || 0);

  return {
    total: Object.values(counts).reduce((sum, value) => sum + value, 0),
    planned: counts.planned || 0,
    active: Number(activeValue[0]?.value || 0),
    paused: counts.paused || 0,
    ending: counts.ending || 0,
    ended: counts.ended || 0,
    cancelled: counts.cancelled || 0,
    renewals30: Number(renewals30[0]?.value || 0),
    renewals90: Number(renewals90[0]?.value || 0),
  };
}

export async function getEngagement(workspaceId, engagementId) {
  const row = await loadEngagementRow(workspaceId, engagementId);
  if (!row) return null;
  return {
    engagement: row,
    permissionsHints: {
      canTransitionTo: [...(ENGAGEMENT_STATUS_TRANSITIONS[row.status] || [])],
    },
  };
}

export async function createEngagement({ workspaceId, userId, data }) {
  const client = await assertClient(workspaceId, data.clientId);
  await assertLink(
    workspaceId,
    services,
    data.serviceId,
    'SERVICE_NOT_FOUND',
    'Choose a service from the catalogue.',
  );
  await assertLink(
    workspaceId,
    proposals,
    data.proposalId,
    'PROPOSAL_NOT_FOUND',
    'Choose a proposal from this workspace.',
  );
  await assertLink(
    workspaceId,
    projects,
    data.projectId,
    'PROJECT_NOT_FOUND',
    'Choose a project from this workspace.',
  );
  await assertManager(workspaceId, data.managerUserId);

  const rows = await getDb()
    .insert(serviceEngagements)
    .values({
      workspaceId,
      clientId: data.clientId,
      serviceId: data.serviceId ?? null,
      proposalId: data.proposalId ?? null,
      projectId: data.projectId ?? null,
      name: data.name,
      managerUserId: data.managerUserId ?? null,
      status: data.status || 'planned',
      frequency: data.frequency || 'monthly',
      startDate: data.startDate ?? null,
      endDate: data.endDate ?? null,
      renewalDate: data.renewalDate ?? null,
      scopeReference: data.scopeReference ?? null,
      contractValueCents: data.contractValueCents ?? 0,
      currency: data.currency || 'INR',
      internalNotes: data.internalNotes ?? null,
      createdByUserId: userId,
      updatedByUserId: userId,
    })
    .returning({ id: serviceEngagements.id });

  await recordAudit({
    workspaceId,
    actorUserId: userId,
    action: 'engagement.create',
    resourceType: 'engagement',
    resourceId: rows[0].id,
    metadata: { clientId: client.id, name: data.name },
  });

  return getEngagement(workspaceId, rows[0].id);
}

export async function updateEngagement({
  workspaceId,
  userId,
  engagementId,
  data,
}) {
  const existing = await loadEngagementRow(workspaceId, engagementId);
  if (!existing) return null;

  const expected = new Date(data.expectedUpdatedAt);
  if (Number.isNaN(expected.getTime())) throw staleError('engagement');

  await assertClient(workspaceId, data.clientId);
  await assertLink(
    workspaceId,
    services,
    data.serviceId,
    'SERVICE_NOT_FOUND',
    'Choose a service from the catalogue.',
  );
  await assertLink(
    workspaceId,
    proposals,
    data.proposalId,
    'PROPOSAL_NOT_FOUND',
    'Choose a proposal from this workspace.',
  );
  await assertLink(
    workspaceId,
    projects,
    data.projectId,
    'PROJECT_NOT_FOUND',
    'Choose a project from this workspace.',
  );
  await assertManager(workspaceId, data.managerUserId);

  if (data.status && data.status !== existing.status) {
    if (!canTransitionEngagement(existing.status, data.status)) {
      throw new ApiError(
        409,
        'INVALID_STATE',
        `An engagement cannot move from ${existing.status} to ${data.status}.`,
        { allowed: ENGAGEMENT_STATUS_TRANSITIONS[existing.status] || [] },
      );
    }
  }

  const updated = await getDb()
    .update(serviceEngagements)
    .set({
      clientId: data.clientId,
      serviceId: data.serviceId ?? null,
      proposalId: data.proposalId ?? null,
      projectId: data.projectId ?? null,
      name: data.name,
      managerUserId: data.managerUserId ?? null,
      status: data.status ?? existing.status,
      frequency: data.frequency || 'monthly',
      startDate: data.startDate ?? null,
      endDate: data.endDate ?? null,
      renewalDate: data.renewalDate ?? null,
      scopeReference: data.scopeReference ?? null,
      contractValueCents: data.contractValueCents ?? 0,
      currency: data.currency || 'INR',
      internalNotes: data.internalNotes ?? null,
      updatedByUserId: userId,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(serviceEngagements.workspaceId, workspaceId),
        eq(serviceEngagements.id, engagementId),
        gte(serviceEngagements.updatedAt, expected),
        lt(serviceEngagements.updatedAt, new Date(expected.getTime() + 1)),
      ),
    )
    .returning({ id: serviceEngagements.id });
  if (!updated[0]) throw staleError('engagement');

  await recordAudit({
    workspaceId,
    actorUserId: userId,
    action: 'engagement.update',
    resourceType: 'engagement',
    resourceId: engagementId,
    metadata: { fields: Object.keys(data) },
  });

  return getEngagement(workspaceId, engagementId);
}

export async function changeEngagementStatus({
  workspaceId,
  userId,
  engagementId,
  status,
  note = null,
}) {
  const existing = await loadEngagementRow(workspaceId, engagementId);
  if (!existing) return null;
  if (existing.status === status) return getEngagement(workspaceId, engagementId);
  if (!canTransitionEngagement(existing.status, status)) {
    throw new ApiError(
      409,
      'INVALID_STATE',
      `An engagement cannot move from ${existing.status} to ${status}.`,
      { allowed: ENGAGEMENT_STATUS_TRANSITIONS[existing.status] || [] },
    );
  }

  await getDb()
    .update(serviceEngagements)
    .set({ status, updatedByUserId: userId, updatedAt: new Date() })
    .where(
      and(
        eq(serviceEngagements.workspaceId, workspaceId),
        eq(serviceEngagements.id, engagementId),
      ),
    );

  await recordAudit({
    workspaceId,
    actorUserId: userId,
    action: 'engagement.status',
    resourceType: 'engagement',
    resourceId: engagementId,
    metadata: { from: existing.status, to: status, note: note || null },
  });

  return getEngagement(workspaceId, engagementId);
}

export async function listEngagementLinkOptions(workspaceId) {
  const [proposalRows, projectRows, serviceRows] = await Promise.all([
    getDb()
      .select({
        id: proposals.id,
        reference: proposals.reference,
        title: proposals.title,
        leadId: proposals.leadId,
        companyName: leads.companyName,
      })
      .from(proposals)
      .innerJoin(leads, eq(leads.id, proposals.leadId))
      .where(eq(proposals.workspaceId, workspaceId))
      .orderBy(desc(proposals.createdAt))
      .limit(500),
    getDb()
      .select({
        id: projects.id,
        reference: projects.reference,
        name: projects.name,
        clientId: projects.clientId,
        companyName: clients.companyName,
      })
      .from(projects)
      .leftJoin(clients, eq(clients.id, projects.clientId))
      .where(eq(projects.workspaceId, workspaceId))
      .orderBy(desc(projects.createdAt))
      .limit(500),
    getDb()
      .select({ id: services.id, name: services.name, status: services.status })
      .from(services)
      .where(and(eq(services.workspaceId, workspaceId), eq(services.status, 'active')))
      .orderBy(asc(services.name))
      .limit(500),
  ]);
  return { proposals: proposalRows, projects: projectRows, services: serviceRows };
}

export async function listEngagementOptions(workspaceId) {
  return getDb()
    .select({
      id: serviceEngagements.id,
      name: serviceEngagements.name,
      status: serviceEngagements.status,
      clientId: serviceEngagements.clientId,
      companyName: clients.companyName,
    })
    .from(serviceEngagements)
    .innerJoin(clients, eq(clients.id, serviceEngagements.clientId))
    .where(eq(serviceEngagements.workspaceId, workspaceId))
    .orderBy(asc(clients.companyName), asc(serviceEngagements.name))
    .limit(500);
}
