import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  isNotNull,
  isNull,
  lt,
  lte,
  notInArray,
  or,
  sql,
} from 'drizzle-orm';
import { getDb } from '@/db/client';
import {
  agents,
  leads,
  opportunityActivities,
  opportunityDiscoveries,
  opportunityRequirementItems,
  opportunityStageHistory,
  opportunities,
  serviceCategories,
  services,
  users,
  workspaceMemberships,
} from '@/db/schema';
import { createAgentRun } from '@/lib/ai/runtime';
import { ApiError } from '@/lib/api-error';
import { recordAudit } from '@/lib/audit';
import { DISCOVERY_FIELDS } from './validation';

export const OPEN_STAGES = ['discovery', 'requirements', 'proposal', 'negotiation'];
export const CLOSED_STAGES = ['won', 'lost'];

export const OPPORTUNITY_STAGE_TRANSITIONS = {
  discovery: ['requirements', 'lost'],
  requirements: ['discovery', 'proposal', 'lost'],
  proposal: ['requirements', 'negotiation', 'won', 'lost'],
  negotiation: ['proposal', 'won', 'lost'],
  won: [],
  lost: ['discovery'],
};

export function allowedNextStages(stage) {
  return [...(OPPORTUNITY_STAGE_TRANSITIONS[stage] || [])];
}

function addDays(days) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

function escapeLike(value) {
  return String(value).replace(/[\\%_]/g, '\\$&');
}

function opportunityOrder(sort, direction) {
  const dir = direction === 'asc' ? asc : desc;
  switch (sort) {
    case 'updated':
      return dir(opportunities.updatedAt);
    case 'value':
      return direction === 'asc'
        ? sql`${opportunities.expectedValueCents} asc nulls last`
        : sql`${opportunities.expectedValueCents} desc nulls last`;
    case 'closeDate':
      return direction === 'asc'
        ? sql`${opportunities.expectedCloseDate} asc nulls last`
        : sql`${opportunities.expectedCloseDate} desc nulls last`;
    case 'followUp':
      return direction === 'asc'
        ? sql`${opportunities.nextFollowUpAt} asc nulls last`
        : sql`${opportunities.nextFollowUpAt} desc nulls last`;
    case 'stage':
      return direction === 'asc'
        ? sql`${opportunities.stage} asc`
        : sql`${opportunities.stage} desc`;
    default:
      return dir(opportunities.createdAt);
  }
}

const OPPORTUNITY_SELECT = {
  id: opportunities.id,
  workspaceId: opportunities.workspaceId,
  leadId: opportunities.leadId,
  title: opportunities.title,
  stage: opportunities.stage,
  priority: opportunities.priority,
  expectedValueCents: opportunities.expectedValueCents,
  currency: opportunities.currency,
  expectedCloseDate: opportunities.expectedCloseDate,
  nextFollowUpAt: opportunities.nextFollowUpAt,
  ownerUserId: opportunities.ownerUserId,
  ownerName: users.name,
  ownerEmail: users.email,
  source: opportunities.source,
  summary: opportunities.summary,
  lostReason: opportunities.lostReason,
  createdAt: opportunities.createdAt,
  updatedAt: opportunities.updatedAt,
  companyName: leads.companyName,
  contactName: leads.contactName,
  leadEmail: leads.email,
  leadStatus: leads.status,
};

function opportunityFilters(workspaceId, query, viewerUserId) {
  const filters = [eq(opportunities.workspaceId, workspaceId)];

  if (query.scope === 'closed') {
    filters.push(inArray(opportunities.stage, CLOSED_STAGES));
  } else if (query.scope !== 'all') {
    filters.push(notInArray(opportunities.stage, CLOSED_STAGES));
  }

  if (query.stage) filters.push(eq(opportunities.stage, query.stage));
  if (query.leadId) filters.push(eq(opportunities.leadId, query.leadId));

  if (query.owner === 'me') {
    filters.push(eq(opportunities.ownerUserId, viewerUserId));
  } else if (query.owner === 'unassigned') {
    filters.push(isNull(opportunities.ownerUserId));
  } else if (query.owner) {
    filters.push(eq(opportunities.ownerUserId, query.owner));
  }

  if (query.due === 'overdue') {
    filters.push(
      and(
        isNotNull(opportunities.nextFollowUpAt),
        lt(opportunities.nextFollowUpAt, new Date()),
      ),
    );
  } else if (query.due === 'upcoming') {
    filters.push(
      and(
        isNotNull(opportunities.nextFollowUpAt),
        gte(opportunities.nextFollowUpAt, new Date()),
        lte(opportunities.nextFollowUpAt, addDays(7)),
      ),
    );
  }

  if (query.search) {
    const like = `%${escapeLike(query.search)}%`;
    filters.push(
      or(
        ilike(opportunities.title, like),
        ilike(opportunities.summary, like),
        ilike(leads.companyName, like),
        ilike(leads.contactName, like),
        ilike(leads.email, like),
      ),
    );
  }

  return and(...filters);
}

export async function listOpportunities(workspaceId, viewerUserId, query) {
  const db = getDb();
  const where = opportunityFilters(workspaceId, query, viewerUserId);
  const offset = (query.page - 1) * query.pageSize;

  const [rows, totals] = await Promise.all([
    db
      .select(OPPORTUNITY_SELECT)
      .from(opportunities)
      .innerJoin(leads, eq(leads.id, opportunities.leadId))
      .leftJoin(users, eq(users.id, opportunities.ownerUserId))
      .where(where)
      .orderBy(opportunityOrder(query.sort, query.direction))
      .limit(query.pageSize)
      .offset(offset),
    db
      .select({ value: count() })
      .from(opportunities)
      .innerJoin(leads, eq(leads.id, opportunities.leadId))
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

async function getOpportunityRow(workspaceId, opportunityId) {
  const rows = await getDb()
    .select(OPPORTUNITY_SELECT)
    .from(opportunities)
    .innerJoin(leads, eq(leads.id, opportunities.leadId))
    .leftJoin(users, eq(users.id, opportunities.ownerUserId))
    .where(
      and(
        eq(opportunities.workspaceId, workspaceId),
        eq(opportunities.id, opportunityId),
      ),
    )
    .limit(1);
  return rows[0] || null;
}

export async function getOpportunity(workspaceId, opportunityId) {
  const opportunity = await getOpportunityRow(workspaceId, opportunityId);
  if (!opportunity) return null;

  const db = getDb();
  const [discoveryRows, requirementItems, activities, stageHistory] =
    await Promise.all([
      db
        .select()
        .from(opportunityDiscoveries)
        .where(
          and(
            eq(opportunityDiscoveries.workspaceId, workspaceId),
            eq(opportunityDiscoveries.opportunityId, opportunityId),
          ),
        )
        .limit(1),
      db
        .select({
          id: opportunityRequirementItems.id,
          serviceId: opportunityRequirementItems.serviceId,
          serviceName: services.name,
          serviceCategory: serviceCategories.name,
          regulated: services.regulated,
          reviewProfession: services.reviewProfession,
          name: opportunityRequirementItems.name,
          description: opportunityRequirementItems.description,
          priority: opportunityRequirementItems.priority,
          status: opportunityRequirementItems.status,
          sortOrder: opportunityRequirementItems.sortOrder,
          createdAt: opportunityRequirementItems.createdAt,
          updatedAt: opportunityRequirementItems.updatedAt,
        })
        .from(opportunityRequirementItems)
        .leftJoin(services, eq(services.id, opportunityRequirementItems.serviceId))
        .leftJoin(
          serviceCategories,
          eq(serviceCategories.id, services.categoryId),
        )
        .where(
          and(
            eq(opportunityRequirementItems.workspaceId, workspaceId),
            eq(opportunityRequirementItems.opportunityId, opportunityId),
          ),
        )
        .orderBy(
          asc(opportunityRequirementItems.sortOrder),
          asc(opportunityRequirementItems.createdAt),
        ),
      db
        .select({
          id: opportunityActivities.id,
          type: opportunityActivities.type,
          body: opportunityActivities.body,
          metadata: opportunityActivities.metadata,
          actorUserId: opportunityActivities.actorUserId,
          actorName: users.name,
          actorEmail: users.email,
          createdAt: opportunityActivities.createdAt,
        })
        .from(opportunityActivities)
        .leftJoin(users, eq(users.id, opportunityActivities.actorUserId))
        .where(
          and(
            eq(opportunityActivities.workspaceId, workspaceId),
            eq(opportunityActivities.opportunityId, opportunityId),
          ),
        )
        .orderBy(desc(opportunityActivities.createdAt))
        .limit(100),
      db
        .select({
          id: opportunityStageHistory.id,
          fromStage: opportunityStageHistory.fromStage,
          toStage: opportunityStageHistory.toStage,
          note: opportunityStageHistory.note,
          changedByName: users.name,
          changedByEmail: users.email,
          createdAt: opportunityStageHistory.createdAt,
        })
        .from(opportunityStageHistory)
        .leftJoin(users, eq(users.id, opportunityStageHistory.changedByUserId))
        .where(
          and(
            eq(opportunityStageHistory.workspaceId, workspaceId),
            eq(opportunityStageHistory.opportunityId, opportunityId),
          ),
        )
        .orderBy(desc(opportunityStageHistory.createdAt))
        .limit(100),
    ]);

  return {
    opportunity,
    discovery: discoveryRows[0] || null,
    requirementItems,
    activities,
    stageHistory,
    allowedTransitions: allowedNextStages(opportunity.stage),
  };
}

export async function listOpportunitiesForLead(workspaceId, leadId) {
  return getDb()
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
    .orderBy(desc(opportunities.updatedAt));
}

export async function listLeadOptions(workspaceId) {
  return getDb()
    .select({
      id: leads.id,
      companyName: leads.companyName,
      contactName: leads.contactName,
      status: leads.status,
      archivedAt: leads.archivedAt,
    })
    .from(leads)
    .where(eq(leads.workspaceId, workspaceId))
    .orderBy(asc(leads.companyName))
    .limit(500);
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
      { ownerUserId: 'Choose a workspace member.' },
    );
  }
  return userId;
}

async function assertLeadInWorkspace(workspaceId, leadId) {
  const rows = await getDb()
    .select({ id: leads.id })
    .from(leads)
    .where(and(eq(leads.workspaceId, workspaceId), eq(leads.id, leadId)))
    .limit(1);
  if (!rows[0]) {
    throw new ApiError(
      422,
      'LEAD_NOT_FOUND',
      'That lead does not exist in this workspace.',
      { leadId: 'Choose a lead from this workspace.' },
    );
  }
  return rows[0].id;
}

async function assertServiceInWorkspace(workspaceId, serviceId) {
  if (!serviceId) return null;
  const rows = await getDb()
    .select({ id: services.id, status: services.status })
    .from(services)
    .where(and(eq(services.workspaceId, workspaceId), eq(services.id, serviceId)))
    .limit(1);
  if (!rows[0] || rows[0].status !== 'active') {
    throw new ApiError(
      422,
      'SERVICE_NOT_FOUND',
      'Choose an active service from this workspace catalogue.',
      { serviceId: 'Choose a valid service.' },
    );
  }
  return serviceId;
}

async function insertActivity({
  workspaceId,
  opportunityId,
  userId,
  type,
  body = null,
  metadata = null,
}) {
  await getDb().insert(opportunityActivities).values({
    workspaceId,
    opportunityId,
    actorUserId: userId || null,
    type,
    body,
    metadata,
  });
}

export async function createOpportunity({ workspaceId, userId, data }) {
  await assertLeadInWorkspace(workspaceId, data.leadId);
  const ownerUserId =
    data.ownerUserId === undefined ? userId : data.ownerUserId;
  await assertAssigneeInWorkspace(workspaceId, ownerUserId);

  const rows = await getDb()
    .insert(opportunities)
    .values({
      workspaceId,
      leadId: data.leadId,
      title: data.title,
      stage: 'discovery',
      priority: data.priority || 'medium',
      source: data.source || 'other',
      expectedValueCents: data.expectedValueCents ?? null,
      currency: data.currency || 'INR',
      expectedCloseDate: data.expectedCloseDate ?? null,
      nextFollowUpAt: data.nextFollowUpAt ?? null,
      ownerUserId,
      summary: data.summary ?? null,
      createdByUserId: userId,
    })
    .returning({ id: opportunities.id });

  const opportunityId = rows[0].id;

  await insertActivity({
    workspaceId,
    opportunityId,
    userId,
    type: 'created',
    body: 'Opportunity created at the discovery stage.',
  });

  await getDb().insert(opportunityStageHistory).values({
    workspaceId,
    opportunityId,
    fromStage: null,
    toStage: 'discovery',
    note: 'Opportunity created.',
    changedByUserId: userId,
  });

  await recordAudit({
    workspaceId,
    actorUserId: userId,
    action: 'opportunity.create',
    resourceType: 'opportunity',
    resourceId: opportunityId,
    metadata: { leadId: data.leadId, stage: 'discovery' },
  });

  return getOpportunity(workspaceId, opportunityId);
}

export async function updateOpportunity({ workspaceId, userId, opportunityId, data }) {
  const current = await getOpportunityRow(workspaceId, opportunityId);
  if (!current) return null;

  const changes = {};
  for (const key of [
    'title',
    'priority',
    'source',
    'expectedValueCents',
    'currency',
    'expectedCloseDate',
    'nextFollowUpAt',
    'summary',
  ]) {
    if (data[key] !== undefined) changes[key] = data[key];
  }

  if (Object.keys(changes).length === 0) {
    return getOpportunity(workspaceId, opportunityId);
  }

  await getDb()
    .update(opportunities)
    .set({ ...changes, updatedAt: new Date() })
    .where(
      and(
        eq(opportunities.workspaceId, workspaceId),
        eq(opportunities.id, opportunityId),
      ),
    );

  const fields = Object.keys(changes);
  await insertActivity({
    workspaceId,
    opportunityId,
    userId,
    type: 'updated',
    body: `Opportunity details updated: ${fields.join(', ')}.`,
    metadata: { fields },
  });

  await recordAudit({
    workspaceId,
    actorUserId: userId,
    action: 'opportunity.update',
    resourceType: 'opportunity',
    resourceId: opportunityId,
    metadata: { fields },
  });

  return getOpportunity(workspaceId, opportunityId);
}

export async function changeOpportunityStage({
  workspaceId,
  userId,
  opportunityId,
  stage,
  note = null,
  lostReason = null,
}) {
  const current = await getOpportunityRow(workspaceId, opportunityId);
  if (!current) return null;

  if (current.stage === stage) {
    return { ...(await getOpportunity(workspaceId, opportunityId)), changed: false };
  }

  if (!allowedNextStages(current.stage).includes(stage)) {
    const allowed = allowedNextStages(current.stage);
    throw new ApiError(
      409,
      'INVALID_STAGE_TRANSITION',
      `An opportunity cannot move from ${current.stage} to ${stage}.`,
      {
        stage: `Allowed next stages: ${allowed.join(', ') || 'none'}.`,
      },
    );
  }

  if (stage === 'lost' && !lostReason && !current.lostReason) {
    throw new ApiError(
      422,
      'LOST_REASON_REQUIRED',
      'Record why this opportunity was lost.',
      { lostReason: 'A lost reason is required.' },
    );
  }

  const rows = await getDb()
    .update(opportunities)
    .set({
      stage,
      lostReason: stage === 'lost' ? lostReason || current.lostReason : null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(opportunities.workspaceId, workspaceId),
        eq(opportunities.id, opportunityId),
        eq(opportunities.stage, current.stage),
      ),
    )
    .returning({ id: opportunities.id });

  if (!rows[0]) {
    throw new ApiError(
      409,
      'STAGE_CONFLICT',
      'This opportunity changed while you were updating it. Reload and try again.',
    );
  }

  await getDb().insert(opportunityStageHistory).values({
    workspaceId,
    opportunityId,
    fromStage: current.stage,
    toStage: stage,
    note,
    changedByUserId: userId,
  });

  await insertActivity({
    workspaceId,
    opportunityId,
    userId,
    type: 'stage_changed',
    body: `Stage changed from ${current.stage} to ${stage}.`,
    metadata: { from: current.stage, to: stage },
  });

  await recordAudit({
    workspaceId,
    actorUserId: userId,
    action: 'opportunity.stage_change',
    resourceType: 'opportunity',
    resourceId: opportunityId,
    metadata: { from: current.stage, to: stage },
  });

  return { ...(await getOpportunity(workspaceId, opportunityId)), changed: true };
}

export async function assignOpportunity({
  workspaceId,
  userId,
  opportunityId,
  ownerUserId,
}) {
  const current = await getOpportunityRow(workspaceId, opportunityId);
  if (!current) return null;

  await assertAssigneeInWorkspace(workspaceId, ownerUserId);

  if (current.ownerUserId === ownerUserId) {
    return { opportunity: current, changed: false };
  }

  await getDb()
    .update(opportunities)
    .set({ ownerUserId, updatedAt: new Date() })
    .where(
      and(
        eq(opportunities.workspaceId, workspaceId),
        eq(opportunities.id, opportunityId),
      ),
    );

  const next = await getOpportunityRow(workspaceId, opportunityId);

  await insertActivity({
    workspaceId,
    opportunityId,
    userId,
    type: 'assigned',
    body: next.ownerUserId
      ? `Owner changed to ${next.ownerName || next.ownerEmail || 'a member'}.`
      : 'Opportunity owner cleared.',
    metadata: { ownerUserId },
  });

  await recordAudit({
    workspaceId,
    actorUserId: userId,
    action: 'opportunity.assign',
    resourceType: 'opportunity',
    resourceId: opportunityId,
    metadata: { ownerUserId },
  });

  return { opportunity: next, changed: true };
}

export async function addOpportunityNote({ workspaceId, userId, opportunityId, body }) {
  const current = await getOpportunityRow(workspaceId, opportunityId);
  if (!current) return null;

  const inserted = await getDb()
    .insert(opportunityActivities)
    .values({
      workspaceId,
      opportunityId,
      actorUserId: userId,
      type: 'note',
      body,
    })
    .returning({ id: opportunityActivities.id });

  await recordAudit({
    workspaceId,
    actorUserId: userId,
    action: 'opportunity.note',
    resourceType: 'opportunity',
    resourceId: opportunityId,
  });

  const rows = await getDb()
    .select({
      id: opportunityActivities.id,
      type: opportunityActivities.type,
      body: opportunityActivities.body,
      metadata: opportunityActivities.metadata,
      actorUserId: opportunityActivities.actorUserId,
      actorName: users.name,
      actorEmail: users.email,
      createdAt: opportunityActivities.createdAt,
    })
    .from(opportunityActivities)
    .leftJoin(users, eq(users.id, opportunityActivities.actorUserId))
    .where(
      and(
        eq(opportunityActivities.workspaceId, workspaceId),
        eq(opportunityActivities.id, inserted[0].id),
      ),
    )
    .limit(1);

  return rows[0] || null;
}

export async function upsertDiscovery({ workspaceId, userId, opportunityId, data }) {
  const current = await getOpportunityRow(workspaceId, opportunityId);
  if (!current) return null;

  const values = { updatedByUserId: userId };
  for (const field of DISCOVERY_FIELDS) {
    if (data[field] !== undefined) values[field] = data[field];
  }
  const status = data.status || 'draft';
  values.status = status;
  values.completedAt = status === 'approved' ? new Date() : null;

  const existingRows = await getDb()
    .select({ id: opportunityDiscoveries.id })
    .from(opportunityDiscoveries)
    .where(
      and(
        eq(opportunityDiscoveries.workspaceId, workspaceId),
        eq(opportunityDiscoveries.opportunityId, opportunityId),
      ),
    )
    .limit(1);

  if (existingRows[0]) {
    await getDb()
      .update(opportunityDiscoveries)
      .set({ ...values, updatedAt: new Date() })
      .where(
        and(
          eq(opportunityDiscoveries.workspaceId, workspaceId),
          eq(opportunityDiscoveries.opportunityId, opportunityId),
        ),
      );
  } else {
    await getDb().insert(opportunityDiscoveries).values({
      workspaceId,
      opportunityId,
      createdByUserId: userId,
      ...values,
    });
  }

  await insertActivity({
    workspaceId,
    opportunityId,
    userId,
    type: 'discovery_updated',
    body: `Discovery saved with status ${status}.`,
    metadata: { status },
  });

  await recordAudit({
    workspaceId,
    actorUserId: userId,
    action: 'requirement.discovery_update',
    resourceType: 'opportunity',
    resourceId: opportunityId,
    metadata: { status },
  });

  return getOpportunity(workspaceId, opportunityId);
}

export async function createRequirementItem({
  workspaceId,
  userId,
  opportunityId,
  data,
}) {
  const current = await getOpportunityRow(workspaceId, opportunityId);
  if (!current) return null;

  await assertServiceInWorkspace(workspaceId, data.serviceId);

  const rows = await getDb()
    .insert(opportunityRequirementItems)
    .values({
      workspaceId,
      opportunityId,
      serviceId: data.serviceId ?? null,
      name: data.name,
      description: data.description ?? null,
      priority: data.priority || 'medium',
      status: data.status || 'requested',
      createdByUserId: userId,
    })
    .returning({ id: opportunityRequirementItems.id });

  await insertActivity({
    workspaceId,
    opportunityId,
    userId,
    type: 'requirement_added',
    body: `Requirement added: ${data.name}.`,
    metadata: { requirementId: rows[0].id, serviceId: data.serviceId || null },
  });

  await recordAudit({
    workspaceId,
    actorUserId: userId,
    action: 'requirement.item_create',
    resourceType: 'opportunity',
    resourceId: opportunityId,
    metadata: { requirementId: rows[0].id },
  });

  return getOpportunity(workspaceId, opportunityId);
}

export async function updateRequirementItem({
  workspaceId,
  userId,
  opportunityId,
  requirementId,
  data,
}) {
  const current = await getOpportunityRow(workspaceId, opportunityId);
  if (!current) return null;

  const existingRows = await getDb()
    .select({ id: opportunityRequirementItems.id })
    .from(opportunityRequirementItems)
    .where(
      and(
        eq(opportunityRequirementItems.workspaceId, workspaceId),
        eq(opportunityRequirementItems.opportunityId, opportunityId),
        eq(opportunityRequirementItems.id, requirementId),
      ),
    )
    .limit(1);

  if (!existingRows[0]) return null;

  if (data.serviceId !== undefined) {
    await assertServiceInWorkspace(workspaceId, data.serviceId);
  }

  const changes = {};
  for (const key of ['serviceId', 'name', 'description', 'priority', 'status']) {
    if (data[key] !== undefined) changes[key] = data[key];
  }
  if (Object.keys(changes).length === 0) {
    return getOpportunity(workspaceId, opportunityId);
  }

  await getDb()
    .update(opportunityRequirementItems)
    .set({ ...changes, updatedAt: new Date() })
    .where(
      and(
        eq(opportunityRequirementItems.workspaceId, workspaceId),
        eq(opportunityRequirementItems.opportunityId, opportunityId),
        eq(opportunityRequirementItems.id, requirementId),
      ),
    );

  await insertActivity({
    workspaceId,
    opportunityId,
    userId,
    type: 'requirement_updated',
    body: `Requirement updated: ${changes.name || 'existing requirement'}.`,
    metadata: { requirementId, fields: Object.keys(changes) },
  });

  await recordAudit({
    workspaceId,
    actorUserId: userId,
    action: 'requirement.item_update',
    resourceType: 'opportunity',
    resourceId: opportunityId,
    metadata: { requirementId, fields: Object.keys(changes) },
  });

  return getOpportunity(workspaceId, opportunityId);
}

function documentCurrency(cents, currency) {
  if (cents == null) return 'Not recorded';
  try {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: currency || 'INR',
      maximumFractionDigits: 0,
    }).format(Number(cents));
  } catch {
    return `${currency || ''} ${Number(cents).toLocaleString('en-IN')}`.trim();
  }
}

function documentDate(value) {
  if (!value) return 'Not recorded';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not recorded';
  return date.toISOString().slice(0, 10);
}

const DISCOVERY_DOCUMENT_LABELS = {
  companyOverview: 'Company overview',
  industry: 'Industry',
  businessModel: 'Business model',
  challenges: 'Current challenges',
  websitePresence: 'Website and digital presence',
  technologyRequirements: 'Technology requirements',
  marketingRequirements: 'Marketing requirements',
  financeRequirements: 'Finance and accounting requirements',
  complianceRequirements: 'Corporate compliance requirements',
  expectedOutcomes: 'Expected outcomes',
  budgetRange: 'Budget range',
  timeline: 'Timeline',
  specialRequirements: 'Special requirements',
};

export async function buildRequirementDocument(workspaceId, opportunityId) {
  const detail = await getOpportunity(workspaceId, opportunityId);
  if (!detail) return null;

  const { opportunity, discovery, requirementItems } = detail;
  const reference = `REQ-${opportunity.id.slice(0, 8).toUpperCase()}`;
  const generatedAt = new Date();
  const sections = [
    {
      title: 'Client and opportunity',
      rows: [
        ['Company', opportunity.companyName],
        ['Primary contact', opportunity.contactName || 'Not recorded'],
        ['Contact email', opportunity.leadEmail || 'Not recorded'],
        ['Opportunity', opportunity.title],
        ['Current stage', opportunity.stage],
        ['Sales owner', opportunity.ownerName || opportunity.ownerEmail || 'Unassigned'],
        ['Expected value', documentCurrency(opportunity.expectedValueCents, opportunity.currency)],
        ['Expected close', documentDate(opportunity.expectedCloseDate)],
        ['Lead source', opportunity.source],
      ],
    },
  ];

  if (discovery) {
    sections.push({
      title: `Discovery (${discovery.status})`,
      rows: DISCOVERY_FIELDS.filter((field) => field !== 'internalNotes').map(
        (field) => [
          DISCOVERY_DOCUMENT_LABELS[field] || field,
          discovery[field] || 'Not recorded',
        ],
      ),
    });
  } else {
    sections.push({
      title: 'Discovery',
      rows: [['Status', 'No discovery record has been saved yet.']],
    });
  }

  sections.push({
    title: 'Service requirements',
    rows: requirementItems.length
      ? requirementItems.map((item) => [
          item.serviceName
            ? `${item.name} (${item.serviceName})`
            : item.name,
          [
            `Status: ${item.status}`,
            `Priority: ${item.priority}`,
            item.serviceCategory ? `Category: ${item.serviceCategory}` : null,
            item.regulated && item.reviewProfession
              ? `Professional review: ${item.reviewProfession}`
              : null,
            item.description || null,
          ]
            .filter(Boolean)
            .join(' · '),
        ])
      : [['Requirements', 'No service requirements have been recorded yet.']],
  });

  const lines = [
    reference,
    `Generated ${generatedAt.toISOString()}`,
    'Prepared from saved discovery and requirement records.',
    'Commercial terms, legal review, signatures and filings are handled outside this document.',
  ];

  for (const section of sections) {
    lines.push('', section.title.toUpperCase());
    for (const [label, value] of section.rows) {
      lines.push(`${label}: ${value}`);
    }
  }

  return {
    reference,
    generatedAt,
    opportunity,
    discovery,
    requirementItems,
    sections,
    text: lines.join('\n'),
  };
}

export async function getOpportunityOverview(workspaceId) {
  const db = getDb();
  const active = and(
    eq(opportunities.workspaceId, workspaceId),
    notInArray(opportunities.stage, CLOSED_STAGES),
  );

  const [byStage, byCurrency, closingSoon, overdue, requirementRows, discoveryRows] =
    await Promise.all([
      db
        .select({ stage: opportunities.stage, value: count() })
        .from(opportunities)
        .where(eq(opportunities.workspaceId, workspaceId))
        .groupBy(opportunities.stage),
      db
        .select({
          currency: opportunities.currency,
          value: count(),
          amount: sql`coalesce(sum(${opportunities.expectedValueCents}), 0)`,
        })
        .from(opportunities)
        .where(active)
        .groupBy(opportunities.currency),
      db
        .select({ value: count() })
        .from(opportunities)
        .where(
          and(
            active,
            isNotNull(opportunities.expectedCloseDate),
            gte(opportunities.expectedCloseDate, new Date()),
            lte(opportunities.expectedCloseDate, addDays(30)),
          ),
        ),
      db
        .select({ value: count() })
        .from(opportunities)
        .where(
          and(
            active,
            isNotNull(opportunities.nextFollowUpAt),
            lt(opportunities.nextFollowUpAt, new Date()),
          ),
        ),
      db
        .select({ value: count() })
        .from(opportunityRequirementItems)
        .where(
          and(
            eq(opportunityRequirementItems.workspaceId, workspaceId),
            eq(opportunityRequirementItems.status, 'in_review'),
          ),
        ),
      db
        .select({ value: count() })
        .from(opportunityDiscoveries)
        .where(
          and(
            eq(opportunityDiscoveries.workspaceId, workspaceId),
            eq(opportunityDiscoveries.status, 'approved'),
          ),
        ),
    ]);

  const stageCounts = {};
  let total = 0;
  for (const row of byStage) {
    const value = Number(row.value || 0);
    stageCounts[row.stage] = value;
    total += value;
  }

  const open = OPEN_STAGES.reduce(
    (sum, stage) => sum + (stageCounts[stage] || 0),
    0,
  );
  const won = stageCounts.won || 0;
  const lost = stageCounts.lost || 0;

  const pipeline = byCurrency.map((row) => ({
    currency: row.currency,
    count: Number(row.value || 0),
    amountCents: Number(row.amount || 0),
  }));
  const primary =
    pipeline.find((entry) => entry.currency === 'INR') || pipeline[0] || null;

  return {
    total,
    open,
    won,
    lost,
    stageCounts,
    pipeline,
    pipelineValueCents: primary ? primary.amountCents : 0,
    pipelineCurrency: primary ? primary.currency : 'INR',
    pipelineCurrencies: pipeline.length,
    closingSoon: Number(closingSoon[0]?.value || 0),
    overdueFollowUps: Number(overdue[0]?.value || 0),
    requirementsInReview: Number(requirementRows[0]?.value || 0),
    discoveryApproved: Number(discoveryRows[0]?.value || 0),
  };
}

export async function requestOpportunityAiDraft({
  workspaceId,
  userId,
  opportunityId,
  instruction = null,
}) {
  const document = await buildRequirementDocument(workspaceId, opportunityId);
  if (!document) return null;

  const agentRows = await getDb()
    .select({
      id: agents.id,
      name: agents.name,
      type: agents.type,
    })
    .from(agents)
    .where(
      and(
        eq(agents.workspaceId, workspaceId),
        eq(agents.enabled, true),
        isNull(agents.archivedAt),
        inArray(agents.type, ['sales_assistant', 'proposal_generator']),
      ),
    )
    .orderBy(
      sql`case when ${agents.type} = 'sales_assistant' then 0 else 1 end`,
      asc(agents.name),
    )
    .limit(1);

  const agent = agentRows[0];
  if (!agent) {
    throw new ApiError(
      409,
      'AI_AGENT_REQUIRED',
      'Add an enabled Sales Assistant or Proposal Generator agent in AI Workforce before requesting an AI draft.',
    );
  }

  const prompt = [
    'Draft an internal requirement summary for the sales team from the records below.',
    'Label the output clearly as an AI-generated draft. Do not approve proposals, sign contracts, confirm payments, make filings or change any financial record.',
    'Call out missing information and suggested next questions. Keep commercial totals unconfirmed.',
    instruction ? `Additional instruction: ${instruction}` : null,
    '',
    document.text,
  ]
    .filter((line) => line !== null)
    .join('\n')
    .slice(0, 20_000);

  const { run, reused } = await createAgentRun({
    workspaceId,
    agentId: agent.id,
    userId,
    input: prompt,
  });

  await recordAudit({
    workspaceId,
    actorUserId: userId,
    action: 'opportunity.ai_draft',
    resourceType: 'opportunity',
    resourceId: opportunityId,
    metadata: { agentId: agent.id, runId: run.id, reused },
  });

  return {
    run: {
      id: run.id,
      status: run.status,
      approvalRequired: run.approvalRequired,
    },
    agent,
    reused,
  };
}
