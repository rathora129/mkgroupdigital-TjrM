import { and, asc, count, desc, eq, ilike, or, sql } from 'drizzle-orm';
import { getDb } from '@/db/client';
import {
  clients,
  marketingCampaigns,
  marketingContentItems,
  marketingProfiles,
  marketingWebsiteProposals,
  projects,
  users,
} from '@/db/schema';
import { ApiError } from '@/lib/api-error';
import { recordAudit } from '@/lib/audit';
import {
  CAMPAIGN_TRANSITIONS,
  canTransition,
  MARKETING_SERVICE_KEYS,
} from './constants';
import {
  assertCampaign,
  assertClient,
  assertMembers,
  assertProject,
  assertDateOrder,
  escapeLike,
  marketingNotFound,
  staleError,
} from './helpers';

const OPEN_CONTENT_STATUSES = [
  'idea',
  'draft',
  'in_review',
  'changes_requested',
  'approved',
  'scheduled',
];

function staleCampaign() {
  return staleError('campaign');
}

function toIso(value) {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function ensureCurrent(expected, actual, errorFactory) {
  if (!expected) return;
  if (toIso(expected) !== toIso(actual)) throw errorFactory();
}

// ---------------------------------------------------------------------------
// 2G-A — marketing profiles
// ---------------------------------------------------------------------------

const PROFILE_COUNTS = (workspaceId) => ({
  campaignCount: sql`(
    select count(*) from ${marketingCampaigns}
    where ${marketingCampaigns.clientId} = ${clients.id}
      and ${marketingCampaigns.workspaceId} = ${workspaceId}
  )`,
  openContentCount: sql`(
    select count(*) from ${marketingContentItems}
    where ${marketingContentItems.clientId} = ${clients.id}
      and ${marketingContentItems.workspaceId} = ${workspaceId}
      and ${marketingContentItems.status} in ('idea','draft','in_review','changes_requested','approved','scheduled')
  )`,
  pendingProposalCount: sql`(
    select count(*) from ${marketingWebsiteProposals}
    where ${marketingWebsiteProposals.clientId} = ${clients.id}
      and ${marketingWebsiteProposals.workspaceId} = ${workspaceId}
      and ${marketingWebsiteProposals.status} = 'awaiting_review'
  )`,
});

export async function listMarketingClients(workspaceId, query) {
  const db = getDb();
  const filters = [eq(clients.workspaceId, workspaceId)];
  if (query.search) {
    const like = `%${escapeLike(query.search)}%`;
    filters.push(
      or(
        ilike(clients.companyName, like),
        ilike(clients.reference, like),
        ilike(clients.industry, like),
      ),
    );
  }
  if (query.hasProfile === 'yes') {
    filters.push(sql`${marketingProfiles.id} is not null`);
  } else if (query.hasProfile === 'no') {
    filters.push(sql`${marketingProfiles.id} is null`);
  }
  const where = and(...filters);
  const offset = (query.page - 1) * query.pageSize;

  const [rows, totals] = await Promise.all([
    db
      .select({
        id: clients.id,
        reference: clients.reference,
        companyName: clients.companyName,
        industry: clients.industry,
        website: clients.website,
        status: clients.status,
        profileId: marketingProfiles.id,
        profileStatus: marketingProfiles.status,
        contentLanguage: marketingProfiles.contentLanguage,
        selectedServices: marketingProfiles.selectedServices,
        ...PROFILE_COUNTS(workspaceId),
      })
      .from(clients)
      .leftJoin(
        marketingProfiles,
        and(
          eq(marketingProfiles.workspaceId, clients.workspaceId),
          eq(marketingProfiles.clientId, clients.id),
        ),
      )
      .where(where)
      .orderBy(asc(clients.companyName))
      .limit(query.pageSize)
      .offset(offset),
    db
      .select({ value: count() })
      .from(clients)
      .leftJoin(
        marketingProfiles,
        and(
          eq(marketingProfiles.workspaceId, clients.workspaceId),
          eq(marketingProfiles.clientId, clients.id),
        ),
      )
      .where(where),
  ]);

  const total = Number(totals[0]?.value || 0);
  return {
    items: rows.map(normalizeProfileClient),
    total,
    page: query.page,
    pageSize: query.pageSize,
    pages: Math.max(1, Math.ceil(total / query.pageSize)),
  };
}

function normalizeProfileClient(row) {
  return {
    ...row,
    campaignCount: Number(row.campaignCount || 0),
    openContentCount: Number(row.openContentCount || 0),
    pendingProposalCount: Number(row.pendingProposalCount || 0),
    selectedServices: Array.isArray(row.selectedServices)
      ? row.selectedServices
      : [],
    hasProfile: Boolean(row.profileId),
  };
}

export async function getMarketingProfile(workspaceId, clientId) {
  const client = await assertClient(workspaceId, clientId);
  const rows = await getDb()
    .select({
      profile: marketingProfiles,
      createdByName: users.name,
    })
    .from(marketingProfiles)
    .leftJoin(users, eq(users.id, marketingProfiles.createdByUserId))
    .where(
      and(
        eq(marketingProfiles.workspaceId, workspaceId),
        eq(marketingProfiles.clientId, clientId),
      ),
    )
    .limit(1);
  const row = rows[0] || null;

  const [campaignRows, contentRows, proposalRows] = await Promise.all([
    getDb()
      .select({ value: count() })
      .from(marketingCampaigns)
      .where(
        and(
          eq(marketingCampaigns.workspaceId, workspaceId),
          eq(marketingCampaigns.clientId, clientId),
        ),
      ),
    getDb()
      .select({ value: count() })
      .from(marketingContentItems)
      .where(
        and(
          eq(marketingContentItems.workspaceId, workspaceId),
          eq(marketingContentItems.clientId, clientId),
        ),
      ),
    getDb()
      .select({ value: count() })
      .from(marketingWebsiteProposals)
      .where(
        and(
          eq(marketingWebsiteProposals.workspaceId, workspaceId),
          eq(marketingWebsiteProposals.clientId, clientId),
        ),
      ),
  ]);
  return {
    client,
    profile: row?.profile
      ? {
          ...row.profile,
          targetLocations: Array.isArray(row.profile.targetLocations)
            ? row.profile.targetLocations
            : [],
          serviceAreas: Array.isArray(row.profile.serviceAreas)
            ? row.profile.serviceAreas
            : [],
          availableServices: Array.isArray(row.profile.availableServices)
            ? row.profile.availableServices
            : [],
          selectedServices: Array.isArray(row.profile.selectedServices)
            ? row.profile.selectedServices
            : [],
        }
      : null,
    createdByName: row?.createdByName || null,
    counts: {
      campaigns: Number(campaignRows[0]?.value || 0),
      content: Number(contentRows[0]?.value || 0),
      proposals: Number(proposalRows[0]?.value || 0),
    },
    services: MARKETING_SERVICE_KEYS,
  };
}

export async function upsertMarketingProfile({ workspaceId, userId, data }) {
  const client = await assertClient(workspaceId, data.clientId);
  const selected = new Set(data.selectedServices || []);
  const available = new Set(data.availableServices || []);
  for (const key of selected) available.add(key);

  const values = {
    workspaceId,
    clientId: client.id,
    businessDescription: data.businessDescription ?? null,
    industry: data.industry ?? client.industry ?? null,
    targetAudience: data.targetAudience ?? null,
    targetLocations: data.targetLocations || [],
    serviceAreas: data.serviceAreas || [],
    websiteUrl: data.websiteUrl ?? client.website ?? null,
    businessGoals: data.businessGoals ?? null,
    competitors: data.competitors ?? null,
    brandVoice: data.brandVoice ?? null,
    communicationGuidelines: data.communicationGuidelines ?? null,
    contentLanguage: data.contentLanguage || 'en',
    marketingNotes: data.marketingNotes ?? null,
    availableServices: [...available],
    selectedServices: [...selected],
    updatedByUserId: userId,
    updatedAt: new Date(),
  };

  await getDb()
    .insert(marketingProfiles)
    .values({ ...values, createdByUserId: userId })
    .onConflictDoUpdate({
      target: [marketingProfiles.workspaceId, marketingProfiles.clientId],
      set: values,
    });

  await recordAudit({
    workspaceId,
    actorUserId: userId,
    action: 'marketing.profile_update',
    resourceType: 'marketing_profile',
    resourceId: client.id,
    metadata: {
      clientId: client.id,
      selectedServices: values.selectedServices,
      contentLanguage: values.contentLanguage,
    },
  });

  return getMarketingProfile(workspaceId, client.id);
}

// ---------------------------------------------------------------------------
// 2G-C — campaigns
// ---------------------------------------------------------------------------

const CAMPAIGN_SELECT = {
  id: marketingCampaigns.id,
  clientId: marketingCampaigns.clientId,
  clientName: clients.companyName,
  clientReference: clients.reference,
  projectId: marketingCampaigns.projectId,
  projectName: projects.name,
  projectReference: projects.reference,
  name: marketingCampaigns.name,
  objective: marketingCampaigns.objective,
  objectiveDescription: marketingCampaigns.objectiveDescription,
  targetAudience: marketingCampaigns.targetAudience,
  targetGeography: marketingCampaigns.targetGeography,
  channel: marketingCampaigns.channel,
  startDate: marketingCampaigns.startDate,
  endDate: marketingCampaigns.endDate,
  budgetEstimate: marketingCampaigns.budgetEstimate,
  currency: marketingCampaigns.currency,
  successMetrics: marketingCampaigns.successMetrics,
  status: marketingCampaigns.status,
  ownerUserId: marketingCampaigns.ownerUserId,
  ownerName: users.name,
  clientApprovalStatus: marketingCampaigns.clientApprovalStatus,
  notes: marketingCampaigns.notes,
  createdAt: marketingCampaigns.createdAt,
  updatedAt: marketingCampaigns.updatedAt,
};

const CAMPAIGN_JOINS = (query) =>
  query
    .innerJoin(clients, eq(clients.id, marketingCampaigns.clientId))
    .leftJoin(projects, eq(projects.id, marketingCampaigns.projectId))
    .leftJoin(users, eq(users.id, marketingCampaigns.ownerUserId));

export async function listCampaigns(workspaceId, query) {
  const filters = [eq(marketingCampaigns.workspaceId, workspaceId)];
  if (query.status) filters.push(eq(marketingCampaigns.status, query.status));
  if (query.channel) filters.push(eq(marketingCampaigns.channel, query.channel));
  if (query.clientId) filters.push(eq(marketingCampaigns.clientId, query.clientId));
  if (query.owner) filters.push(eq(marketingCampaigns.ownerUserId, query.owner));
  if (query.search) {
    const like = `%${escapeLike(query.search)}%`;
    filters.push(
      or(
        ilike(marketingCampaigns.name, like),
        ilike(clients.companyName, like),
        ilike(marketingCampaigns.objective, like),
      ),
    );
  }
  const where = and(...filters);
  const offset = (query.page - 1) * query.pageSize;

  const [rows, totals] = await Promise.all([
    CAMPAIGN_JOINS(getDb().select(CAMPAIGN_SELECT).from(marketingCampaigns))
      .where(where)
      .orderBy(desc(marketingCampaigns.createdAt))
      .limit(query.pageSize)
      .offset(offset),
    getDb()
      .select({ value: count() })
      .from(marketingCampaigns)
      .innerJoin(clients, eq(clients.id, marketingCampaigns.clientId))
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

export async function getCampaignsOverview(workspaceId) {
  const rows = await getDb()
    .select({
      status: marketingCampaigns.status,
      value: count(),
      budget: sql`coalesce(sum(${marketingCampaigns.budgetEstimate}), 0)`,
    })
    .from(marketingCampaigns)
    .where(eq(marketingCampaigns.workspaceId, workspaceId))
    .groupBy(marketingCampaigns.status);

  const statusCounts = {};
  let total = 0;
  let budget = 0;
  for (const row of rows) {
    const value = Number(row.value || 0);
    statusCounts[row.status] = value;
    total += value;
    budget += Number(row.budget || 0);
  }
  return { total, statusCounts, budgetEstimate: budget };
}

export async function getCampaign(workspaceId, campaignId) {
  const rows = await CAMPAIGN_JOINS(
    getDb().select(CAMPAIGN_SELECT).from(marketingCampaigns),
  )
    .where(
      and(
        eq(marketingCampaigns.workspaceId, workspaceId),
        eq(marketingCampaigns.id, campaignId),
      ),
    )
    .limit(1);
  const campaign = rows[0];
  if (!campaign) throw marketingNotFound('campaign');

  const [contentCounts, content] = await Promise.all([
    getDb()
      .select({
        status: marketingContentItems.status,
        value: count(),
      })
      .from(marketingContentItems)
      .where(
        and(
          eq(marketingContentItems.workspaceId, workspaceId),
          eq(marketingContentItems.campaignId, campaignId),
        ),
      )
      .groupBy(marketingContentItems.status),
    getDb()
      .select({
        id: marketingContentItems.id,
        title: marketingContentItems.title,
        contentType: marketingContentItems.contentType,
        status: marketingContentItems.status,
        scheduledFor: marketingContentItems.scheduledFor,
        updatedAt: marketingContentItems.updatedAt,
      })
      .from(marketingContentItems)
      .where(
        and(
          eq(marketingContentItems.workspaceId, workspaceId),
          eq(marketingContentItems.campaignId, campaignId),
        ),
      )
      .orderBy(desc(marketingContentItems.updatedAt))
      .limit(20),
  ]);

  return {
    campaign,
    content,
    statusCounts: Object.fromEntries(
      contentCounts.map((row) => [row.status, Number(row.value || 0)]),
    ),
  };
}

export async function createCampaign({ workspaceId, userId, data }) {
  const client = await assertClient(workspaceId, data.clientId);
  await assertProject(workspaceId, data.projectId, client.id);
  if (data.ownerUserId) await assertMembers(workspaceId, [data.ownerUserId]);
  assertDateOrder(data.startDate, data.endDate, 'endDate');

  const rows = await getDb()
    .insert(marketingCampaigns)
    .values({
      workspaceId,
      clientId: client.id,
      projectId: data.projectId || null,
      name: data.name,
      objective: data.objective ?? null,
      objectiveDescription: data.objectiveDescription ?? null,
      targetAudience: data.targetAudience ?? null,
      targetGeography: data.targetGeography ?? null,
      channel: data.channel,
      startDate: data.startDate ?? null,
      endDate: data.endDate ?? null,
      budgetEstimate: data.budgetEstimate ?? 0,
      currency: data.currency || 'INR',
      successMetrics: data.successMetrics ?? null,
      status: data.status || 'planned',
      ownerUserId: data.ownerUserId || null,
      notes: data.notes ?? null,
      createdByUserId: userId,
      updatedByUserId: userId,
    })
    .returning({ id: marketingCampaigns.id });

  await recordAudit({
    workspaceId,
    actorUserId: userId,
    action: 'marketing.campaign_create',
    resourceType: 'marketing_campaign',
    resourceId: rows[0].id,
    metadata: {
      clientId: client.id,
      channel: data.channel,
      budgetEstimate: data.budgetEstimate ?? 0,
    },
  });

  return getCampaign(workspaceId, rows[0].id);
}

export async function updateCampaign({ workspaceId, userId, campaignId, data }) {
  const existing = await assertCampaign(workspaceId, campaignId);
  ensureCurrent(data.expectedUpdatedAt, existing.updatedAt ?? (await loadCampaignUpdatedAt(workspaceId, campaignId)), staleCampaign);
  const client = await assertClient(workspaceId, data.clientId);
  await assertProject(workspaceId, data.projectId, client.id);
  if (data.ownerUserId) await assertMembers(workspaceId, [data.ownerUserId]);
  assertDateOrder(data.startDate, data.endDate, 'endDate');

  await getDb()
    .update(marketingCampaigns)
    .set({
      clientId: client.id,
      projectId: data.projectId || null,
      name: data.name,
      objective: data.objective ?? null,
      objectiveDescription: data.objectiveDescription ?? null,
      targetAudience: data.targetAudience ?? null,
      targetGeography: data.targetGeography ?? null,
      channel: data.channel,
      startDate: data.startDate ?? null,
      endDate: data.endDate ?? null,
      budgetEstimate: data.budgetEstimate ?? 0,
      currency: data.currency || 'INR',
      successMetrics: data.successMetrics ?? null,
      ownerUserId: data.ownerUserId || null,
      notes: data.notes ?? null,
      updatedByUserId: userId,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(marketingCampaigns.workspaceId, workspaceId),
        eq(marketingCampaigns.id, campaignId),
      ),
    );

  await recordAudit({
    workspaceId,
    actorUserId: userId,
    action: 'marketing.campaign_update',
    resourceType: 'marketing_campaign',
    resourceId: campaignId,
    metadata: { clientId: client.id, channel: data.channel },
  });

  return getCampaign(workspaceId, campaignId);
}

async function loadCampaignUpdatedAt(workspaceId, campaignId) {
  const rows = await getDb()
    .select({ updatedAt: marketingCampaigns.updatedAt })
    .from(marketingCampaigns)
    .where(
      and(
        eq(marketingCampaigns.workspaceId, workspaceId),
        eq(marketingCampaigns.id, campaignId),
      ),
    )
    .limit(1);
  return rows[0]?.updatedAt;
}

export async function changeCampaignStatus({
  workspaceId,
  userId,
  campaignId,
  status,
  note,
}) {
  const existing = await assertCampaign(workspaceId, campaignId);
  if (existing.status === status) {
    throw new ApiError(
      409,
      'STATUS_UNCHANGED',
      `The campaign is already ${status}.`,
    );
  }
  if (!canTransition(CAMPAIGN_TRANSITIONS, existing.status, status)) {
    throw new ApiError(
      409,
      'INVALID_TRANSITION',
      `A campaign cannot move from ${existing.status} to ${status}.`,
    );
  }
  if (status === 'executed' && !note?.trim()) {
    throw new ApiError(
      422,
      'EXECUTION_NOTE_REQUIRED',
      'Record what was executed. This is a planning record, not an external campaign action.',
    );
  }

  await getDb()
    .update(marketingCampaigns)
    .set({
      status,
      notes: note?.trim()
        ? [existing.notes, note.trim()].filter(Boolean).join('\n\n')
        : existing.notes,
      updatedByUserId: userId,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(marketingCampaigns.workspaceId, workspaceId),
        eq(marketingCampaigns.id, campaignId),
      ),
    );

  await recordAudit({
    workspaceId,
    actorUserId: userId,
    action: 'marketing.campaign_status',
    resourceType: 'marketing_campaign',
    resourceId: campaignId,
    metadata: { from: existing.status, to: status },
  });

  return getCampaign(workspaceId, campaignId);
}

export async function setCampaignClientApproval({
  workspaceId,
  userId,
  campaignId,
  clientApprovalStatus,
  note,
}) {
  await assertCampaign(workspaceId, campaignId);
  await getDb()
    .update(marketingCampaigns)
    .set({
      clientApprovalStatus,
      updatedByUserId: userId,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(marketingCampaigns.workspaceId, workspaceId),
        eq(marketingCampaigns.id, campaignId),
      ),
    );

  await recordAudit({
    workspaceId,
    actorUserId: userId,
    action: 'marketing.campaign_approval',
    resourceType: 'marketing_campaign',
    resourceId: campaignId,
    metadata: { clientApprovalStatus, note: note || null },
  });

  return getCampaign(workspaceId, campaignId);
}

export async function listCampaignOptions(workspaceId, clientId = null) {
  const filters = [eq(marketingCampaigns.workspaceId, workspaceId)];
  if (clientId) filters.push(eq(marketingCampaigns.clientId, clientId));
  const rows = await getDb()
    .select({
      id: marketingCampaigns.id,
      name: marketingCampaigns.name,
      clientId: marketingCampaigns.clientId,
      status: marketingCampaigns.status,
    })
    .from(marketingCampaigns)
    .where(and(...filters))
    .orderBy(asc(marketingCampaigns.name))
    .limit(500);
  return rows;
}

export { OPEN_CONTENT_STATUSES };
