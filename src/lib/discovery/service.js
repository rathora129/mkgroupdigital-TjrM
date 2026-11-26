import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  lte,
  ne,
  or,
} from 'drizzle-orm';
import { getDb } from '@/db/client';
import {
  discoveryCampaignRuns,
  discoveryCampaigns,
  discoveryProspects,
  leadActivities,
  leads,
  users,
} from '@/db/schema';
import { ApiError } from '@/lib/api-error';
import { recordAudit } from '@/lib/audit';
import { enqueueDiscoveryRun } from '@/lib/ai/queue';
import { createLead, findPossibleDuplicates, normalizeCompanyKey, websiteHost } from '@/lib/leads/service';
import { createResearchJob } from '@/lib/research/service';
import {
  DISCOVERY_TEMPERATURES,
} from './validation';
import {
  getDiscoveryProviderDefinition,
  isDiscoveryProviderConfigured,
  listDiscoveryProviderMetadata,
  searchBusinesses,
} from './providers';
import {
  checkEnrichmentReady,
  enrichCandidate,
  hypothesesFor,
} from './enrichment';

const ACTIVE_RUN_STATUSES = ['queued', 'running'];
const RETRYABLE_CODES = new Set(['DISCOVERY_PROVIDER_UNAVAILABLE']);

const EDITABLE_PROSPECT_FIELDS = [
  'businessName',
  'contactName',
  'phone',
  'email',
  'website',
  'city',
  'state',
  'country',
  'industry',
  'recommendedService',
  'leadScore',
  'temperature',
  'confidence',
  'reason',
  'pitch',
  'callingApproach',
  'nextAction',
  'qualificationQuestions',
];

function clip(value, max) {
  const text = String(value ?? '').trim();
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function escapeLike(value) {
  return String(value).replace(/[\\%_]/g, '\\$&');
}

function startOfUtcDay(date = new Date()) {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

export function nextRunAtFor(frequency, from = new Date()) {
  if (frequency === 'daily') {
    return new Date(from.getTime() + 24 * 60 * 60 * 1000);
  }
  if (frequency === 'weekly') {
    return new Date(from.getTime() + 7 * 24 * 60 * 60 * 1000);
  }
  return null;
}

// A prospect is identified by its website host when one exists, then by phone,
// then by name + city. The unique index on (workspace_id, dedupe_key) is the
// final guard, so concurrent runs cannot insert the same business twice.
export function prospectDedupeKey({ businessName, website, phone, city } = {}) {
  const host = websiteHost(website);
  if (host) return `site:${host}`;

  const digits = String(phone || '').replace(/\D+/g, '');
  if (digits.length >= 7) return `phone:${digits.slice(-12)}`;

  const name = normalizeCompanyKey(businessName);
  if (!name) return null;
  return `name:${name}:${normalizeCompanyKey(city) || ''}`;
}

function campaignSummary(row, extras = {}) {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    name: row.name,
    status: row.status,
    provider: row.provider,
    criteria: row.criteria || {},
    services: row.services || [],
    frequency: row.frequency,
    dailyLimit: row.dailyLimit,
    maxResearchOps: row.maxResearchOps,
    budgetCents: row.budgetCents,
    startDate: row.startDate,
    endDate: row.endDate,
    lastRunAt: row.lastRunAt,
    nextRunAt: row.nextRunAt,
    lastError: row.lastError,
    createdByUserId: row.createdByUserId,
    updatedByUserId: row.updatedByUserId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdByName: extras.createdByName ?? null,
    createdByEmail: extras.createdByEmail ?? null,
    prospectCount: extras.prospectCount ?? 0,
    pendingCount: extras.pendingCount ?? 0,
    approvedCount: extras.approvedCount ?? 0,
    lastRun: extras.lastRun ?? null,
  };
}

function runSummary(row) {
  return {
    id: row.id,
    campaignId: row.campaignId,
    trigger: row.trigger,
    status: row.status,
    discoveredCount: row.discoveredCount,
    duplicateCount: row.duplicateCount,
    failedCount: row.failedCount,
    provider: row.provider,
    errorMessage: row.errorMessage,
    usage: row.usage,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
  };
}

function prospectSummary(row, extras = {}) {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    campaignId: row.campaignId,
    campaignName: extras.campaignName ?? null,
    provider: row.provider,
    dedupeKey: row.dedupeKey,
    businessName: row.businessName,
    website: row.website,
    phone: row.phone,
    email: row.email,
    contactName: row.contactName,
    address: row.address,
    city: row.city,
    state: row.state,
    country: row.country,
    industry: row.industry,
    businessSize: row.businessSize,
    sourceUrls: row.sourceUrls || [],
    discoveryDate: row.discoveryDate,
    lastVerifiedAt: row.lastVerifiedAt,
    verificationStatus: row.verificationStatus,
    facts: row.facts || {},
    observations: row.observations || {},
    hypotheses: row.hypotheses || [],
    research: row.research,
    recommendedService: row.recommendedService,
    leadScore: row.leadScore,
    temperature: row.temperature,
    confidence: row.confidence,
    reason: row.reason,
    pitch: row.pitch,
    callingApproach: row.callingApproach,
    qualificationQuestions: row.qualificationQuestions || [],
    nextAction: row.nextAction,
    status: row.status,
    decidedByUserId: row.decidedByUserId,
    decidedAt: row.decidedAt,
    decisionNote: row.decisionNote,
    leadId: row.leadId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function loadCampaign(workspaceId, campaignId) {
  const rows = await getDb()
    .select({ campaign: discoveryCampaigns, createdByName: users.name, createdByEmail: users.email })
    .from(discoveryCampaigns)
    .leftJoin(users, eq(users.id, discoveryCampaigns.createdByUserId))
    .where(
      and(
        eq(discoveryCampaigns.workspaceId, workspaceId),
        eq(discoveryCampaigns.id, campaignId),
      ),
    )
    .limit(1);
  return rows[0] || null;
}

async function loadProspect(workspaceId, prospectId) {
  const rows = await getDb()
    .select({ prospect: discoveryProspects, campaignName: discoveryCampaigns.name })
    .from(discoveryProspects)
    .leftJoin(
      discoveryCampaigns,
      eq(discoveryCampaigns.id, discoveryProspects.campaignId),
    )
    .where(
      and(
        eq(discoveryProspects.workspaceId, workspaceId),
        eq(discoveryProspects.id, prospectId),
      ),
    )
    .limit(1);
  return rows[0] || null;
}

export async function getDiscoveryReadiness(workspaceId) {
  const enrichment = await checkEnrichmentReady(workspaceId);
  return {
    providers: listDiscoveryProviderMetadata(),
    enrichment: {
      ready: enrichment.ready,
      reason: enrichment.reason,
      message: enrichment.message,
      agentName: enrichment.agent?.name || null,
      provider: enrichment.agent?.provider || null,
      model: enrichment.model || null,
    },
    queueConfigured: Boolean(process.env.DATABASE_URL),
  };
}

async function countsForCampaigns(workspaceId, ids) {
  if (ids.length === 0) return new Map();
  const [prospectRows, runRows] = await Promise.all([
    getDb()
      .select({
        campaignId: discoveryProspects.campaignId,
        status: discoveryProspects.status,
        value: count(),
      })
      .from(discoveryProspects)
      .where(
        and(
          eq(discoveryProspects.workspaceId, workspaceId),
          inArray(discoveryProspects.campaignId, ids),
        ),
      )
      .groupBy(discoveryProspects.campaignId, discoveryProspects.status),
    getDb()
      .select()
      .from(discoveryCampaignRuns)
      .where(
        and(
          eq(discoveryCampaignRuns.workspaceId, workspaceId),
          inArray(discoveryCampaignRuns.campaignId, ids),
        ),
      )
      .orderBy(desc(discoveryCampaignRuns.startedAt)),
  ]);

  const map = new Map(ids.map((id) => [id, { total: 0, pending: 0, approved: 0, lastRun: null }]));
  for (const row of prospectRows) {
    const entry = map.get(row.campaignId);
    if (!entry) continue;
    const value = Number(row.value || 0);
    entry.total += value;
    if (row.status === 'pending_review') entry.pending += value;
    if (row.status === 'approved') entry.approved += value;
  }
  for (const run of runRows) {
    const entry = map.get(run.campaignId);
    if (entry && !entry.lastRun) entry.lastRun = runSummary(run);
  }
  return map;
}

export async function listCampaigns(workspaceId, query) {
  const filters = [eq(discoveryCampaigns.workspaceId, workspaceId)];
  if (query.status) filters.push(eq(discoveryCampaigns.status, query.status));
  if (query.provider) filters.push(eq(discoveryCampaigns.provider, query.provider));
  if (query.search) {
    const like = `%${escapeLike(query.search)}%`;
    filters.push(
      or(
        ilike(discoveryCampaigns.name, like),
        ilike(discoveryCampaigns.lastError, like),
      ),
    );
  }

  const where = and(...filters);
  const offset = (query.page - 1) * query.pageSize;

  const [rows, totals] = await Promise.all([
    getDb()
      .select({
        campaign: discoveryCampaigns,
        createdByName: users.name,
        createdByEmail: users.email,
      })
      .from(discoveryCampaigns)
      .leftJoin(users, eq(users.id, discoveryCampaigns.createdByUserId))
      .where(where)
      .orderBy(desc(discoveryCampaigns.createdAt))
      .limit(query.pageSize)
      .offset(offset),
    getDb().select({ value: count() }).from(discoveryCampaigns).where(where),
  ]);

  const counts = await countsForCampaigns(
    workspaceId,
    rows.map((row) => row.campaign.id),
  );

  const total = Number(totals[0]?.value || 0);
  return {
    items: rows.map((row) => {
      const entry = counts.get(row.campaign.id);
      return campaignSummary(row.campaign, {
        createdByName: row.createdByName,
        createdByEmail: row.createdByEmail,
        prospectCount: entry?.total || 0,
        pendingCount: entry?.pending || 0,
        approvedCount: entry?.approved || 0,
        lastRun: entry?.lastRun || null,
      });
    }),
    total,
    page: query.page,
    pageSize: query.pageSize,
    pages: Math.max(1, Math.ceil(total / query.pageSize)),
  };
}

export async function getCampaign(workspaceId, campaignId) {
  const loaded = await loadCampaign(workspaceId, campaignId);
  if (!loaded) return null;

  const db = getDb();
  const [runs, prospectStatusRows, temperatureRows, latestProspect] = await Promise.all([
    db
      .select()
      .from(discoveryCampaignRuns)
      .where(
        and(
          eq(discoveryCampaignRuns.workspaceId, workspaceId),
          eq(discoveryCampaignRuns.campaignId, campaignId),
        ),
      )
      .orderBy(desc(discoveryCampaignRuns.startedAt))
      .limit(20),
    db
      .select({ status: discoveryProspects.status, value: count() })
      .from(discoveryProspects)
      .where(
        and(
          eq(discoveryProspects.workspaceId, workspaceId),
          eq(discoveryProspects.campaignId, campaignId),
        ),
      )
      .groupBy(discoveryProspects.status),
    db
      .select({ temperature: discoveryProspects.temperature, value: count() })
      .from(discoveryProspects)
      .where(
        and(
          eq(discoveryProspects.workspaceId, workspaceId),
          eq(discoveryProspects.campaignId, campaignId),
        ),
      )
      .groupBy(discoveryProspects.temperature),
    db
      .select({ createdAt: discoveryProspects.createdAt })
      .from(discoveryProspects)
      .where(
        and(
          eq(discoveryProspects.workspaceId, workspaceId),
          eq(discoveryProspects.campaignId, campaignId),
        ),
      )
      .orderBy(desc(discoveryProspects.createdAt))
      .limit(1),
  ]);

  const byStatus = {};
  let total = 0;
  for (const row of prospectStatusRows) {
    const value = Number(row.value || 0);
    byStatus[row.status] = value;
    total += value;
  }
  const temperatures = {};
  for (const row of temperatureRows) {
    temperatures[row.temperature] = Number(row.value || 0);
  }

  return {
    campaign: campaignSummary(loaded.campaign, {
      createdByName: loaded.createdByName,
      createdByEmail: loaded.createdByEmail,
      prospectCount: total,
      pendingCount: byStatus.pending_review || 0,
      approvedCount: byStatus.approved || 0,
      lastRun: runs[0] ? runSummary(runs[0]) : null,
    }),
    runs: runs.map(runSummary),
    stats: {
      prospects: total,
      byStatus,
      temperatures,
      lastDiscoveredAt: latestProspect[0]?.createdAt || null,
    },
    readiness: await getDiscoveryReadiness(workspaceId),
  };
}

export async function createCampaign({ workspaceId, userId, data }) {
  const definition = getDiscoveryProviderDefinition(data.provider);
  if (!definition) {
    throw new ApiError(
      422,
      'DISCOVERY_PROVIDER_UNSUPPORTED',
      'Choose a supported discovery provider.',
    );
  }

  const rows = await getDb()
    .insert(discoveryCampaigns)
    .values({
      workspaceId,
      name: data.name,
      provider: data.provider,
      criteria: data.criteria,
      services: data.services,
      frequency: data.frequency,
      dailyLimit: data.dailyLimit,
      maxResearchOps: data.maxResearchOps,
      budgetCents: data.budgetCents,
      startDate: data.startDate || null,
      endDate: data.endDate || null,
      createdByUserId: userId,
      updatedByUserId: userId,
    })
    .returning();
  const campaign = rows[0];

  await recordAudit({
    workspaceId,
    actorUserId: userId,
    action: 'discovery.campaign_create',
    resourceType: 'discovery_campaign',
    resourceId: campaign.id,
    metadata: {
      provider: campaign.provider,
      frequency: campaign.frequency,
      dailyLimit: campaign.dailyLimit,
    },
  });

  return campaignSummary(campaign);
}

export async function updateCampaign({ workspaceId, userId, campaignId, data }) {
  const loaded = await loadCampaign(workspaceId, campaignId);
  if (!loaded) return null;
  const current = loaded.campaign;

  if (!['draft', 'paused'].includes(current.status)) {
    throw new ApiError(
      409,
      'CAMPAIGN_LOCKED',
      'Pause the campaign before changing its targeting.',
    );
  }

  if (data.provider) {
    const definition = getDiscoveryProviderDefinition(data.provider);
    if (!definition) {
      throw new ApiError(
        422,
        'DISCOVERY_PROVIDER_UNSUPPORTED',
        'Choose a supported discovery provider.',
      );
    }
  }

  const startDate =
    data.startDate !== undefined ? data.startDate : current.startDate;
  const endDate = data.endDate !== undefined ? data.endDate : current.endDate;
  if (startDate && endDate && new Date(endDate) < new Date(startDate)) {
    throw new ApiError(
      422,
      'VALIDATION_FAILED',
      'The end date must be on or after the start date.',
      { endDate: 'The end date must be on or after the start date.' },
    );
  }

  const changes = {};
  for (const key of [
    'name',
    'provider',
    'frequency',
    'dailyLimit',
    'maxResearchOps',
    'budgetCents',
    'services',
    'criteria',
    'startDate',
    'endDate',
  ]) {
    if (data[key] !== undefined) changes[key] = data[key];
  }
  if (Object.keys(changes).length === 0) {
    return campaignSummary(current);
  }
  changes.updatedByUserId = userId;
  changes.updatedAt = new Date();

  const rows = await getDb()
    .update(discoveryCampaigns)
    .set(changes)
    .where(
      and(
        eq(discoveryCampaigns.workspaceId, workspaceId),
        eq(discoveryCampaigns.id, campaignId),
      ),
    )
    .returning();
  const updated = rows[0];
  if (!updated) return null;

  await recordAudit({
    workspaceId,
    actorUserId: userId,
    action: 'discovery.campaign_update',
    resourceType: 'discovery_campaign',
    resourceId: campaignId,
    metadata: { fields: Object.keys(changes).filter((key) => !key.endsWith('At') && key !== 'updatedByUserId') },
  });

  return campaignSummary(updated);
}

function assertProviderReady(campaign) {
  const definition = getDiscoveryProviderDefinition(campaign.provider);
  if (!definition) {
    throw new ApiError(
      409,
      'DISCOVERY_PROVIDER_UNSUPPORTED',
      'This campaign uses a provider that is no longer supported.',
    );
  }
  if (!isDiscoveryProviderConfigured(campaign.provider)) {
    throw new ApiError(
      409,
      'DISCOVERY_PROVIDER_NOT_CONFIGURED',
      `${definition.label} is not configured on this server. Add ${definition.requiredEnvKeys.join(' or ')} before running discovery.`,
    );
  }
  return definition;
}

async function setCampaignStatus({ workspaceId, userId, campaignId, action, nextStatus, extra = {} }) {
  const loaded = await loadCampaign(workspaceId, campaignId);
  if (!loaded) return null;
  const current = loaded.campaign;

  const rows = await getDb()
    .update(discoveryCampaigns)
    .set({
      status: nextStatus,
      updatedByUserId: userId,
      updatedAt: new Date(),
      ...extra,
    })
    .where(
      and(
        eq(discoveryCampaigns.workspaceId, workspaceId),
        eq(discoveryCampaigns.id, campaignId),
        eq(discoveryCampaigns.status, current.status),
      ),
    )
    .returning();
  const updated = rows[0] || current;

  await recordAudit({
    workspaceId,
    actorUserId: userId,
    action,
    resourceType: 'discovery_campaign',
    resourceId: campaignId,
    metadata: { from: current.status, to: nextStatus },
  });

  return campaignSummary(updated);
}

export async function startCampaign({ workspaceId, userId, campaignId }) {
  const loaded = await loadCampaign(workspaceId, campaignId);
  if (!loaded) return null;
  const current = loaded.campaign;

  if (current.status === 'active') return { campaign: campaignSummary(current), changed: false };
  if (!['draft', 'paused'].includes(current.status)) {
    throw new ApiError(409, 'CAMPAIGN_CLOSED', 'This campaign can no longer be started.');
  }
  if (current.endDate && new Date(current.endDate).getTime() < Date.now()) {
    throw new ApiError(409, 'CAMPAIGN_EXPIRED', 'This campaign has already passed its end date.');
  }
  assertProviderReady(current);

  const campaign = await setCampaignStatus({
    workspaceId,
    userId,
    campaignId,
    action: 'discovery.campaign_start',
    nextStatus: 'active',
    extra: {
      lastError: null,
      nextRunAt: nextRunAtFor(current.frequency),
    },
  });
  return { campaign, changed: true };
}

export async function pauseCampaign({ workspaceId, userId, campaignId }) {
  const loaded = await loadCampaign(workspaceId, campaignId);
  if (!loaded) return null;
  const current = loaded.campaign;

  if (current.status === 'paused') return { campaign: campaignSummary(current), changed: false };
  if (current.status !== 'active') {
    throw new ApiError(409, 'CAMPAIGN_NOT_ACTIVE', 'Only an active campaign can be paused.');
  }

  const campaign = await setCampaignStatus({
    workspaceId,
    userId,
    campaignId,
    action: 'discovery.campaign_pause',
    nextStatus: 'paused',
    extra: { nextRunAt: null },
  });
  return { campaign, changed: true };
}

export async function resumeCampaign({ workspaceId, userId, campaignId }) {
  const loaded = await loadCampaign(workspaceId, campaignId);
  if (!loaded) return null;
  const current = loaded.campaign;

  if (current.status === 'active') return { campaign: campaignSummary(current), changed: false };
  if (current.status !== 'paused') {
    throw new ApiError(409, 'CAMPAIGN_NOT_PAUSED', 'Only a paused campaign can be resumed.');
  }
  if (current.endDate && new Date(current.endDate).getTime() < Date.now()) {
    throw new ApiError(409, 'CAMPAIGN_EXPIRED', 'This campaign has already passed its end date.');
  }
  assertProviderReady(current);

  const campaign = await setCampaignStatus({
    workspaceId,
    userId,
    campaignId,
    action: 'discovery.campaign_resume',
    nextStatus: 'active',
    extra: {
      lastError: null,
      nextRunAt: nextRunAtFor(current.frequency),
    },
  });
  return { campaign, changed: true };
}

export async function cancelCampaign({ workspaceId, userId, campaignId }) {
  const loaded = await loadCampaign(workspaceId, campaignId);
  if (!loaded) return null;
  const current = loaded.campaign;

  if (current.status === 'cancelled') return { campaign: campaignSummary(current), changed: false };
  if (current.status === 'completed') {
    throw new ApiError(409, 'CAMPAIGN_COMPLETED', 'This campaign has already finished.');
  }

  const campaign = await setCampaignStatus({
    workspaceId,
    userId,
    campaignId,
    action: 'discovery.campaign_cancel',
    nextStatus: 'cancelled',
    extra: { nextRunAt: null },
  });
  return { campaign, changed: true };
}

async function openRunExists(workspaceId, campaignId) {
  const rows = await getDb()
    .select({ id: discoveryCampaignRuns.id })
    .from(discoveryCampaignRuns)
    .where(
      and(
        eq(discoveryCampaignRuns.workspaceId, workspaceId),
        eq(discoveryCampaignRuns.campaignId, campaignId),
        inArray(discoveryCampaignRuns.status, ACTIVE_RUN_STATUSES),
      ),
    )
    .limit(1);
  return Boolean(rows[0]);
}

export async function runCampaignNow({
  workspaceId,
  userId,
  campaignId,
  enqueue = enqueueDiscoveryRun,
}) {
  const loaded = await loadCampaign(workspaceId, campaignId);
  if (!loaded) return null;
  const campaign = loaded.campaign;

  if (['cancelled', 'completed'].includes(campaign.status)) {
    throw new ApiError(409, 'CAMPAIGN_CLOSED', 'This campaign is closed.');
  }
  assertProviderReady(campaign);

  if (await openRunExists(workspaceId, campaignId)) {
    throw new ApiError(
      409,
      'DISCOVERY_RUN_ACTIVE',
      'A discovery run for this campaign is already queued or running.',
    );
  }

  const rows = await getDb()
    .insert(discoveryCampaignRuns)
    .values({
      workspaceId,
      campaignId,
      trigger: 'manual',
      status: 'queued',
      provider: campaign.provider,
    })
    .returning();
  const run = rows[0];

  try {
    const jobId = await enqueue(run.id, { campaignId });
    if (!jobId) throw new Error('The discovery queue rejected the job');
  } catch {
    const message =
      'The background queue is unavailable. Start the worker and try again.';
    await getDb()
      .update(discoveryCampaignRuns)
      .set({ status: 'failed', finishedAt: new Date(), errorMessage: message })
      .where(
        and(
          eq(discoveryCampaignRuns.workspaceId, workspaceId),
          eq(discoveryCampaignRuns.id, run.id),
        ),
      );
    await getDb()
      .update(discoveryCampaigns)
      .set({ lastError: message, updatedAt: new Date() })
      .where(
        and(
          eq(discoveryCampaigns.workspaceId, workspaceId),
          eq(discoveryCampaigns.id, campaignId),
        ),
      );
    await recordAudit({
      workspaceId,
      actorUserId: userId,
      action: 'discovery.run_failed',
      resourceType: 'discovery_run',
      resourceId: run.id,
      success: false,
      metadata: { reason: 'queue_unavailable' },
    });
    throw new ApiError(503, 'QUEUE_UNAVAILABLE', message);
  }

  await recordAudit({
    workspaceId,
    actorUserId: userId,
    action: 'discovery.campaign_run',
    resourceType: 'discovery_run',
    resourceId: run.id,
    metadata: { campaignId, provider: campaign.provider, trigger: 'manual' },
  });

  return { run: runSummary(run), campaign: campaignSummary(campaign) };
}

// Runs from the worker's cron entry. It never performs a search itself; it
// only creates due run records and enqueues them, keeping the scan bounded.
export async function runDiscoveryScan({ now = new Date(), enqueue = enqueueDiscoveryRun } = {}) {
  const db = getDb();

  const expired = await db
    .update(discoveryCampaigns)
    .set({ status: 'completed', nextRunAt: null, updatedAt: now })
    .where(
      and(
        eq(discoveryCampaigns.status, 'active'),
        lte(discoveryCampaigns.endDate, now),
      ),
    )
    .returning({ id: discoveryCampaigns.id });

  const due = await db
    .select()
    .from(discoveryCampaigns)
    .where(
      and(
        eq(discoveryCampaigns.status, 'active'),
        lte(discoveryCampaigns.nextRunAt, now),
      ),
    )
    .orderBy(asc(discoveryCampaigns.nextRunAt))
    .limit(25);

  let enqueued = 0;
  let failed = 0;
  const skipped = [];

  for (const campaign of due) {
    if (await openRunExists(campaign.workspaceId, campaign.id)) {
      skipped.push(campaign.id);
      continue;
    }

    const nextRunAt = nextRunAtFor(campaign.frequency, now);
    const advanced = await db
      .update(discoveryCampaigns)
      .set({ nextRunAt, updatedAt: now })
      .where(
        and(
          eq(discoveryCampaigns.id, campaign.id),
          eq(discoveryCampaigns.status, 'active'),
          lte(discoveryCampaigns.nextRunAt, now),
        ),
      )
      .returning({ id: discoveryCampaigns.id });
    if (!advanced[0]) continue;

    const rows = await db
      .insert(discoveryCampaignRuns)
      .values({
        workspaceId: campaign.workspaceId,
        campaignId: campaign.id,
        trigger: 'scheduled',
        status: 'queued',
        provider: campaign.provider,
      })
      .returning();
    const run = rows[0];

    try {
      const jobId = await enqueue(run.id, { campaignId: campaign.id });
      if (!jobId) throw new Error('The discovery queue rejected the job');
      enqueued += 1;
      await recordAudit({
        workspaceId: campaign.workspaceId,
        actorType: 'system',
        action: 'discovery.campaign_run',
        resourceType: 'discovery_run',
        resourceId: run.id,
        metadata: { campaignId: campaign.id, trigger: 'scheduled' },
      });
    } catch {
      failed += 1;
      const message = 'The background queue is unavailable. This run was not started.';
      await db
        .update(discoveryCampaignRuns)
        .set({ status: 'failed', finishedAt: now, errorMessage: message })
        .where(eq(discoveryCampaignRuns.id, run.id));
      await db
        .update(discoveryCampaigns)
        .set({ lastError: message, updatedAt: now })
        .where(eq(discoveryCampaigns.id, campaign.id));
      await recordAudit({
        workspaceId: campaign.workspaceId,
        actorType: 'system',
        action: 'discovery.run_failed',
        resourceType: 'discovery_run',
        resourceId: run.id,
        success: false,
        metadata: { reason: 'queue_unavailable' },
      });
    }
  }

  return {
    expired: expired.length,
    due: due.length,
    enqueued,
    failed,
    skipped,
  };
}

async function finishRun(run, status, extra = {}, { campaignError } = {}) {
  const db = getDb();
  await db
    .update(discoveryCampaignRuns)
    .set({
      status,
      finishedAt: new Date(),
      ...extra,
    })
    .where(
      and(
        eq(discoveryCampaignRuns.id, run.id),
        inArray(discoveryCampaignRuns.status, ACTIVE_RUN_STATUSES),
      ),
    );

  const campaignChanges = { lastRunAt: new Date(), updatedAt: new Date() };
  if (campaignError !== undefined) campaignChanges.lastError = campaignError;
  await db
    .update(discoveryCampaigns)
    .set(campaignChanges)
    .where(eq(discoveryCampaigns.id, run.campaignId));
}

async function failRun(run, message, reason) {
  await finishRun(
    run,
    'failed',
    { errorMessage: clip(message, 1_000), failedCount: run.failedCount || 0 },
    { campaignError: clip(message, 1_000) },
  );
  await recordAudit({
    workspaceId: run.workspaceId,
    actorType: 'system',
    action: 'discovery.run_failed',
    resourceType: 'discovery_run',
    resourceId: run.id,
    success: false,
    metadata: { reason: reason || clip(message, 300) },
  });
}

function buildCandidateProspect(campaign, candidate, enrichment) {
  const now = new Date();
  const observations = {
    ...(candidate.observations || {}),
    hasWebsite: Boolean(candidate.website),
    matchesWebsitePresence:
      !campaign.criteria?.websitePresence ||
      campaign.criteria.websitePresence === 'any' ||
      (campaign.criteria.websitePresence === 'with_website' && Boolean(candidate.website)) ||
      (campaign.criteria.websitePresence === 'without_website' && !candidate.website),
  };

  return {
    workspaceId: campaign.workspaceId,
    campaignId: campaign.id,
    provider: candidate.facts?.provider || campaign.provider,
    dedupeKey: candidate.dedupeKey,
    businessName: candidate.businessName,
    website: candidate.website || null,
    phone: candidate.phone || null,
    email: candidate.email || null,
    contactName: candidate.contactName || null,
    address: candidate.address || null,
    city: candidate.city || null,
    state: candidate.state || null,
    country: candidate.country || null,
    industry: candidate.industry || null,
    businessSize: candidate.businessSize || null,
    sourceUrls: candidate.sourceUrls || [],
    discoveryDate: now,
    lastVerifiedAt: now,
    verificationStatus: candidate.verificationStatus || 'unverified',
    facts: candidate.facts || {},
    observations,
    hypotheses: hypothesesFor(enrichment),
    recommendedService:
      enrichment?.recommendedService ||
      (campaign.services?.length === 1 ? campaign.services[0] : null),
    leadScore: enrichment?.leadScore ?? null,
    temperature: enrichment?.temperature || 'unknown',
    confidence: enrichment?.confidence ?? null,
    reason: enrichment?.reason || null,
    pitch: enrichment?.pitch || null,
    callingApproach: enrichment?.callingApproach || null,
    qualificationQuestions: enrichment?.qualificationQuestions || [],
    nextAction:
      enrichment?.nextAction || 'Review the discovered business and verify it before calling.',
    status: 'pending_review',
  };
}

export async function runDiscoveryPipeline(runId, deps = {}) {
  const db = getDb();
  const runRows = await db
    .select()
    .from(discoveryCampaignRuns)
    .where(eq(discoveryCampaignRuns.id, runId))
    .limit(1);
  const initial = runRows[0];
  if (!initial) return { status: 'missing' };
  if (initial.status !== 'queued') {
    return { status: 'skipped', reason: `status:${initial.status}` };
  }

  const claimed = await db
    .update(discoveryCampaignRuns)
    .set({ status: 'running', startedAt: new Date() })
    .where(
      and(
        eq(discoveryCampaignRuns.id, runId),
        eq(discoveryCampaignRuns.status, 'queued'),
      ),
    )
    .returning();
  const run = claimed[0];
  if (!run) return { status: 'skipped', reason: 'claim-lost' };

  const campaignRows = await db
    .select()
    .from(discoveryCampaigns)
    .where(eq(discoveryCampaigns.id, run.campaignId))
    .limit(1);
  const campaign = campaignRows[0];

  if (!campaign) {
    await finishRun(run, 'failed', { errorMessage: 'The campaign no longer exists.' }, {
      campaignError: 'The campaign no longer exists.',
    });
    return { status: 'failed', reason: 'campaign_missing' };
  }

  if (campaign.status === 'cancelled' || (campaign.status === 'completed' && run.trigger === 'scheduled')) {
    await finishRun(run, 'cancelled', { errorMessage: null }, { campaignError: null });
    return { status: 'cancelled' };
  }

  const definition = getDiscoveryProviderDefinition(campaign.provider);
  if (!definition || !isDiscoveryProviderConfigured(campaign.provider)) {
    const message = definition
      ? `${definition.label} is not configured on this server.`
      : 'This campaign uses a provider that is no longer supported.';
    await failRun(run, message, 'provider_not_configured');
    return { status: 'failed', reason: 'provider_not_configured' };
  }

  const dayStart = startOfUtcDay(deps.now || new Date());
  const usedRows = await db
    .select({ value: count() })
    .from(discoveryProspects)
    .where(
      and(
        eq(discoveryProspects.workspaceId, campaign.workspaceId),
        eq(discoveryProspects.campaignId, campaign.id),
        gte(discoveryProspects.createdAt, dayStart),
      ),
    );
  const usedToday = Number(usedRows[0]?.value || 0);
  const remaining = Math.max(0, campaign.dailyLimit - usedToday);

  if (remaining <= 0) {
    await finishRun(
      run,
      'completed',
      {
        provider: campaign.provider,
        usage: {
          provider: campaign.provider,
          dailyLimit: campaign.dailyLimit,
          usedToday,
          reason: 'daily_limit_reached',
        },
      },
      { campaignError: null },
    );
    return { status: 'completed', reason: 'daily_limit', discovered: 0 };
  }

  let readiness = deps.readiness;
  if (!readiness) {
    try {
      readiness = await checkEnrichmentReady(campaign.workspaceId);
    } catch {
      readiness = {
        ready: false,
        reason: 'READINESS_CHECK_FAILED',
        message: 'AI readiness could not be checked.',
      };
    }
  }

  const search = deps.search || searchBusinesses;
  const searchLimit = Math.max(remaining, Math.min(remaining * 2, 50));

  let candidates;
  try {
    candidates = await search({
      provider: campaign.provider,
      criteria: campaign.criteria || {},
      services: campaign.services || [],
      limit: searchLimit,
      fetchImpl: deps.fetchImpl,
      signal: deps.signal,
    });
  } catch (error) {
    if (error?.code === 'DISCOVERY_CANCELLED') {
      await finishRun(run, 'cancelled', { errorMessage: null }, { campaignError: null });
      return { status: 'cancelled' };
    }
    if (RETRYABLE_CODES.has(error?.code)) {
      // Release the claim so the worker retry can run this record again.
      await db
        .update(discoveryCampaignRuns)
        .set({ status: 'queued', startedAt: null, errorMessage: clip(error.message, 1_000) })
        .where(
          and(
            eq(discoveryCampaignRuns.id, run.id),
            eq(discoveryCampaignRuns.status, 'running'),
          ),
        );
      await db
        .update(discoveryCampaigns)
        .set({ lastError: clip(error.message, 1_000), updatedAt: new Date() })
        .where(eq(discoveryCampaigns.id, campaign.id));
      throw error;
    }
    await failRun(
      run,
      error?.message || 'Discovery search failed.',
      error?.code || 'search_failed',
    );
    return { status: 'failed', reason: error?.code || 'search_failed' };
  }

  const list = Array.isArray(candidates) ? candidates : [];
  const prepared = [];
  let failedCount = 0;
  const errors = [];

  for (const candidate of list) {
    if (!candidate || !candidate.businessName) {
      failedCount += 1;
      continue;
    }
    const dedupeKey = prospectDedupeKey(candidate);
    if (!dedupeKey) {
      failedCount += 1;
      continue;
    }
    prepared.push({ ...candidate, dedupeKey });
  }

  const keys = prepared.map((candidate) => candidate.dedupeKey);
  const existingRows =
    keys.length > 0
      ? await db
          .select({ dedupeKey: discoveryProspects.dedupeKey })
          .from(discoveryProspects)
          .where(
            and(
              eq(discoveryProspects.workspaceId, campaign.workspaceId),
              inArray(discoveryProspects.dedupeKey, keys),
            ),
          )
      : [];
  const existing = new Set(existingRows.map((row) => row.dedupeKey));

  let discovered = 0;
  let duplicates = 0;
  let enriched = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let costCents = 0;
  let budgetRemaining = campaign.budgetCents;
  let enrichmentReason = readiness.ready
    ? campaign.budgetCents > 0
      ? null
      : 'BUDGET_ZERO'
    : readiness.reason;
  const enrichmentErrors = [];
  const enrichmentEnabled = campaign.budgetCents > 0 && readiness.ready;

  for (const candidate of prepared) {
    if (discovered >= remaining) break;

    if (existing.has(candidate.dedupeKey)) {
      duplicates += 1;
      continue;
    }

    let enrichment = null;
    if (enrichmentEnabled && budgetRemaining > 0) {
      const generated = await enrichCandidate({
        campaign,
        candidate,
        readiness,
        budgetRemainingCents: budgetRemaining,
        generate: deps.generate,
      });
      if (generated.enrichment) {
        enrichment = generated.enrichment;
        enriched += 1;
        budgetRemaining -= generated.usage?.costCents || 0;
        inputTokens += generated.usage?.inputTokens || 0;
        outputTokens += generated.usage?.outputTokens || 0;
        costCents += generated.usage?.costCents || 0;
      } else if (generated.reason && generated.reason !== 'BUDGET_EXHAUSTED') {
        enrichmentReason = enrichmentReason || generated.reason;
        if (generated.message && enrichmentErrors.length < 5) {
          enrichmentErrors.push(clip(generated.message, 200));
        }
      }
    }

    const values = buildCandidateProspect(campaign, candidate, enrichment);
    if (definition.verification) values.verificationStatus = definition.verification;

    const inserted = await db
      .insert(discoveryProspects)
      .values(values)
      .onConflictDoNothing()
      .returning({ id: discoveryProspects.id });

    if (!inserted[0]) {
      duplicates += 1;
      continue;
    }

    existing.add(candidate.dedupeKey);
    discovered += 1;
  }

  const usage = {
    provider: campaign.provider,
    searchResults: list.length,
    prepared: prepared.length,
    dailyLimit: campaign.dailyLimit,
    usedToday,
    remainingBefore: remaining,
    enrichment: enrichmentEnabled ? 'enabled' : 'disabled',
    enrichmentReason,
    enriched,
    budgetCents: campaign.budgetCents,
    inputTokens,
    outputTokens,
    costCents,
    errors: enrichmentErrors,
  };

  await finishRun(
    run,
    'completed',
    {
      discoveredCount: discovered,
      duplicateCount: duplicates,
      failedCount,
      provider: campaign.provider,
      errorMessage: enrichmentErrors.length > 0 ? clip(enrichmentErrors.join('; '), 1_000) : null,
      usage,
    },
    { campaignError: enrichmentErrors.length > 0 ? clip(enrichmentErrors[0], 1_000) : null },
  );

  await recordAudit({
    workspaceId: campaign.workspaceId,
    actorType: 'system',
    action: 'discovery.run_completed',
    resourceType: 'discovery_run',
    resourceId: run.id,
    metadata: {
      campaignId: campaign.id,
      provider: campaign.provider,
      discovered,
      duplicates,
      failed: failedCount,
      enriched,
    },
  });

  return { status: 'completed', discovered, duplicates, failed: failedCount };
}

export async function listProspects(workspaceId, query) {
  const filters = [eq(discoveryProspects.workspaceId, workspaceId)];
  if (query.status && query.status !== 'all') {
    filters.push(eq(discoveryProspects.status, query.status));
  }
  if (query.temperature) {
    filters.push(eq(discoveryProspects.temperature, query.temperature));
  }
  if (query.campaignId) {
    filters.push(eq(discoveryProspects.campaignId, query.campaignId));
  }
  if (query.search) {
    const like = `%${escapeLike(query.search)}%`;
    filters.push(
      or(
        ilike(discoveryProspects.businessName, like),
        ilike(discoveryProspects.website, like),
        ilike(discoveryProspects.phone, like),
        ilike(discoveryProspects.email, like),
        ilike(discoveryProspects.industry, like),
        ilike(discoveryProspects.city, like),
      ),
    );
  }

  const where = and(...filters);
  const offset = (query.page - 1) * query.pageSize;

  const [rows, totals] = await Promise.all([
    getDb()
      .select({ prospect: discoveryProspects, campaignName: discoveryCampaigns.name })
      .from(discoveryProspects)
      .leftJoin(
        discoveryCampaigns,
        eq(discoveryCampaigns.id, discoveryProspects.campaignId),
      )
      .where(where)
      .orderBy(desc(discoveryProspects.createdAt))
      .limit(query.pageSize)
      .offset(offset),
    getDb().select({ value: count() }).from(discoveryProspects).where(where),
  ]);

  const total = Number(totals[0]?.value || 0);
  return {
    items: rows.map((row) => prospectSummary(row.prospect, { campaignName: row.campaignName })),
    total,
    page: query.page,
    pageSize: query.pageSize,
    pages: Math.max(1, Math.ceil(total / query.pageSize)),
  };
}

export async function getProspect(workspaceId, prospectId) {
  const loaded = await loadProspect(workspaceId, prospectId);
  if (!loaded) return null;

  const db = getDb();
  const [duplicates, linkedLead] = await Promise.all([
    findPossibleDuplicates(workspaceId, {
      companyName: loaded.prospect.businessName,
      email: loaded.prospect.email,
      website: loaded.prospect.website,
    }),
    loaded.prospect.leadId
      ? db
          .select({
            id: leads.id,
            companyName: leads.companyName,
            status: leads.status,
            assignedUserId: leads.assignedUserId,
            assignedName: users.name,
            createdAt: leads.createdAt,
          })
          .from(leads)
          .leftJoin(users, eq(users.id, leads.assignedUserId))
          .where(and(eq(leads.workspaceId, workspaceId), eq(leads.id, loaded.prospect.leadId)))
          .limit(1)
      : Promise.resolve([]),
  ]);

  return {
    prospect: prospectSummary(loaded.prospect, { campaignName: loaded.campaignName }),
    possibleDuplicates: duplicates,
    linkedLead: linkedLead[0] || null,
  };
}

async function decideProspect({ workspaceId, userId, prospectId, status, note, leadId = null, research = undefined }) {
  const changes = {
    status,
    decidedByUserId: userId,
    decidedAt: new Date(),
    decisionNote: note || null,
    updatedAt: new Date(),
  };
  if (leadId !== undefined) changes.leadId = leadId;
  if (research !== undefined) changes.research = research;

  const rows = await getDb()
    .update(discoveryProspects)
    .set(changes)
    .where(
      and(
        eq(discoveryProspects.workspaceId, workspaceId),
        eq(discoveryProspects.id, prospectId),
        eq(discoveryProspects.status, 'pending_review'),
      ),
    )
    .returning();
  return rows[0] || null;
}

function priorityForTemperature(temperature) {
  if (temperature === 'hot') return 'high';
  if (temperature === 'cold') return 'low';
  return 'medium';
}

async function assertLeadInWorkspace(workspaceId, leadId) {
  const rows = await getDb()
    .select({ id: leads.id, companyName: leads.companyName })
    .from(leads)
    .where(and(eq(leads.workspaceId, workspaceId), eq(leads.id, leadId)))
    .limit(1);
  if (!rows[0]) {
    throw new ApiError(404, 'LEAD_NOT_FOUND', 'That lead could not be found.');
  }
  return rows[0];
}

async function approveProspect({ workspaceId, userId, prospect, note, assignedUserId }) {
  const duplicates = await findPossibleDuplicates(workspaceId, {
    companyName: prospect.businessName,
    email: prospect.email,
    website: prospect.website,
  });
  if (duplicates.length > 0) {
    throw new ApiError(
      409,
      'POSSIBLE_DUPLICATE_LEAD',
      'A lead for this business already exists. Mark the prospect as a duplicate, or edit it before approving.',
      {
        matches: duplicates.map((match) => ({
          id: match.id,
          companyName: match.companyName,
          reasons: match.reasons,
        })),
      },
    );
  }

  const claimed = await decideProspect({
    workspaceId,
    userId,
    prospectId: prospect.id,
    status: 'approved',
    note,
  });
  if (!claimed) {
    throw new ApiError(
      409,
      'PROSPECT_DECIDED',
      'This prospect was already reviewed. Reload the queue.',
    );
  }

  let created;
  try {
    created = await createLead({
      workspaceId,
      userId,
      data: {
        companyName: prospect.businessName,
        contactName: prospect.contactName,
        email: prospect.email,
        phone: prospect.phone,
        website: prospect.website,
        industry: prospect.industry,
        location:
          [prospect.city, prospect.state, prospect.country].filter(Boolean).join(', ') || null,
        country: prospect.country,
        source: 'ai_discovery',
        status: 'new',
        priority: priorityForTemperature(prospect.temperature),
        requirementsInitial: prospect.reason || prospect.pitch || null,
        nextAction: prospect.nextAction,
        assignedUserId: assignedUserId || null,
        aiLeadScore: prospect.leadScore,
        aiTemperature: prospect.temperature,
        discoveryProspectId: prospect.id,
        discoveredAt: prospect.discoveryDate,
      },
    });
  } catch (error) {
    await getDb()
      .update(discoveryProspects)
      .set({
        status: 'pending_review',
        decidedByUserId: null,
        decidedAt: null,
        decisionNote: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(discoveryProspects.workspaceId, workspaceId),
          eq(discoveryProspects.id, prospect.id),
        ),
      );
    throw error;
  }

  const lead = created.lead;
  await getDb()
    .update(discoveryProspects)
    .set({ leadId: lead.id, updatedAt: new Date() })
    .where(
      and(
        eq(discoveryProspects.workspaceId, workspaceId),
        eq(discoveryProspects.id, prospect.id),
      ),
    );

  await getDb().insert(leadActivities).values({
    workspaceId,
    leadId: lead.id,
    actorUserId: userId,
    type: 'discovered',
    body: `Created from AI discovery prospect “${prospect.businessName}”.`,
    metadata: {
      prospectId: prospect.id,
      campaignId: prospect.campaignId,
      provider: prospect.provider,
      leadScore: prospect.leadScore,
      temperature: prospect.temperature,
    },
  });

  await recordAudit({
    workspaceId,
    actorUserId: userId,
    action: 'discovery.prospect_approve',
    resourceType: 'discovery_prospect',
    resourceId: prospect.id,
    metadata: { leadId: lead.id, campaignId: prospect.campaignId },
  });

  const fresh = await loadProspect(workspaceId, prospect.id);
  return {
    prospect: prospectSummary(fresh.prospect, { campaignName: fresh.campaignName }),
    lead,
  };
}

async function editProspect({ workspaceId, userId, prospect, values }) {
  if (!values || Object.keys(values).length === 0) {
    throw new ApiError(422, 'VALIDATION_FAILED', 'Change at least one value.');
  }

  const changes = {};
  for (const key of EDITABLE_PROSPECT_FIELDS) {
    if (values[key] !== undefined) changes[key] = values[key];
  }
  if (Object.keys(changes).length === 0) {
    throw new ApiError(422, 'VALIDATION_FAILED', 'Change at least one value.');
  }

  const merged = {
    businessName: changes.businessName ?? prospect.businessName,
    website: changes.website ?? prospect.website,
    phone: changes.phone ?? prospect.phone,
    city: changes.city ?? prospect.city,
  };
  const dedupeKey = prospectDedupeKey(merged);
  if (!dedupeKey) {
    throw new ApiError(422, 'VALIDATION_FAILED', 'Keep a business name so the prospect can be identified.');
  }
  if (dedupeKey !== prospect.dedupeKey) {
    const clash = await getDb()
      .select({ id: discoveryProspects.id })
      .from(discoveryProspects)
      .where(
        and(
          eq(discoveryProspects.workspaceId, workspaceId),
          eq(discoveryProspects.dedupeKey, dedupeKey),
          ne(discoveryProspects.id, prospect.id),
        ),
      )
      .limit(1);
    if (clash[0]) {
      throw new ApiError(
        409,
        'PROSPECT_DUPLICATE',
        'Another prospect already has this website, phone or name. Mark one as a duplicate instead.',
      );
    }
  }
  changes.dedupeKey = dedupeKey;
  changes.updatedAt = new Date();

  const rows = await getDb()
    .update(discoveryProspects)
    .set(changes)
    .where(
      and(
        eq(discoveryProspects.workspaceId, workspaceId),
        eq(discoveryProspects.id, prospect.id),
        eq(discoveryProspects.status, 'pending_review'),
      ),
    )
    .returning();
  if (!rows[0]) {
    throw new ApiError(
      409,
      'PROSPECT_DECIDED',
      'This prospect was already reviewed. Reload the queue.',
    );
  }

  await recordAudit({
    workspaceId,
    actorUserId: userId,
    action: 'discovery.prospect_edit',
    resourceType: 'discovery_prospect',
    resourceId: prospect.id,
    metadata: { fields: Object.keys(changes).filter((key) => key !== 'updatedAt') },
  });

  return rows[0];
}

async function requestProspectResearch({ workspaceId, userId, prospect, note }) {
  const campaignRows = prospect.campaignId
    ? await getDb()
        .select({ name: discoveryCampaigns.name, criteria: discoveryCampaigns.criteria, services: discoveryCampaigns.services })
        .from(discoveryCampaigns)
        .where(
          and(
            eq(discoveryCampaigns.workspaceId, workspaceId),
            eq(discoveryCampaigns.id, prospect.campaignId),
          ),
        )
        .limit(1)
    : [];
  const campaign = campaignRows[0];

  const objective = [
    `Qualify the discovered prospect “${prospect.businessName}” before an outbound call.`,
    campaign?.name ? `Discovery campaign: ${campaign.name}.` : null,
    campaign?.services?.length ? `Services of interest: ${campaign.services.join(', ')}.` : null,
    campaign?.criteria ? `Campaign criteria: ${JSON.stringify(campaign.criteria)}.` : null,
    note ? `Reviewer note: ${note}` : null,
    'Separate verified facts from observations and hypotheses. Do not invent contact details.',
  ]
    .filter(Boolean)
    .join(' ')
    .slice(0, 4_000);

  const job = await createResearchJob({
    workspaceId,
    userId,
    data: {
      subjectType: 'company',
      companyName: prospect.businessName,
      websiteUrl: prospect.website || null,
      industry: prospect.industry || null,
      objective,
    },
  });

  const research = {
    requestedAt: new Date().toISOString(),
    requestedByUserId: userId,
    researchJobId: job.id,
    status: job.status,
  };

  const rows = await getDb()
    .update(discoveryProspects)
    .set({
      research,
      decisionNote: note || prospect.decisionNote || null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(discoveryProspects.workspaceId, workspaceId),
        eq(discoveryProspects.id, prospect.id),
        eq(discoveryProspects.status, 'pending_review'),
      ),
    )
    .returning();
  if (!rows[0]) {
    throw new ApiError(
      409,
      'PROSPECT_DECIDED',
      'This prospect was already reviewed. Reload the queue.',
    );
  }

  await recordAudit({
    workspaceId,
    actorUserId: userId,
    action: 'discovery.prospect_research',
    resourceType: 'discovery_prospect',
    resourceId: prospect.id,
    metadata: { researchJobId: job.id },
  });

  return { prospect: rows[0], researchJob: job };
}

async function markProspectDuplicate({ workspaceId, userId, prospect, note, duplicateLeadId }) {
  let duplicate = null;
  if (duplicateLeadId) {
    duplicate = await assertLeadInWorkspace(workspaceId, duplicateLeadId);
  }

  const updated = await decideProspect({
    workspaceId,
    userId,
    prospectId: prospect.id,
    status: 'duplicate',
    note,
    leadId: duplicate?.id || null,
  });
  if (!updated) {
    throw new ApiError(
      409,
      'PROSPECT_DECIDED',
      'This prospect was already reviewed. Reload the queue.',
    );
  }

  await recordAudit({
    workspaceId,
    actorUserId: userId,
    action: 'discovery.prospect_duplicate',
    resourceType: 'discovery_prospect',
    resourceId: prospect.id,
    metadata: { duplicateLeadId: duplicate?.id || null },
  });

  return updated;
}

export async function reviewProspect({
  workspaceId,
  userId,
  prospectId,
  action,
  note = null,
  assignedUserId = null,
  duplicateLeadId = null,
  values = null,
}) {
  const loaded = await loadProspect(workspaceId, prospectId);
  if (!loaded) return null;
  const prospect = loaded.prospect;

  if (prospect.status !== 'pending_review') {
    throw new ApiError(
      409,
      'PROSPECT_DECIDED',
      'This prospect has already been reviewed.',
    );
  }

  if (action === 'approve') {
    const result = await approveProspect({
      workspaceId,
      userId,
      prospect,
      note,
      assignedUserId,
    });
    return result;
  }

  if (action === 'reject') {
    const decided = await decideProspect({
      workspaceId,
      userId,
      prospectId,
      status: 'rejected',
      note,
    });
    if (!decided) {
      throw new ApiError(409, 'PROSPECT_DECIDED', 'This prospect was already reviewed.');
    }
    await recordAudit({
      workspaceId,
      actorUserId: userId,
      action: 'discovery.prospect_reject',
      resourceType: 'discovery_prospect',
      resourceId: prospectId,
    });
    const fresh = await loadProspect(workspaceId, prospectId);
    return {
      prospect: prospectSummary(fresh.prospect, { campaignName: fresh.campaignName }),
    };
  }

  if (action === 'edit') {
    const updated = await editProspect({ workspaceId, userId, prospect, values });
    return {
      prospect: prospectSummary(updated, { campaignName: loaded.campaignName }),
    };
  }

  if (action === 'request_research') {
    const result = await requestProspectResearch({ workspaceId, userId, prospect, note });
    return {
      prospect: prospectSummary(result.prospect, { campaignName: loaded.campaignName }),
      researchJob: result.researchJob,
    };
  }

  if (action === 'mark_duplicate') {
    const updated = await markProspectDuplicate({
      workspaceId,
      userId,
      prospect,
      note,
      duplicateLeadId,
    });
    return {
      prospect: prospectSummary(updated, { campaignName: loaded.campaignName }),
    };
  }

  throw new ApiError(422, 'VALIDATION_FAILED', 'Choose a valid review action.');
}

export async function getDiscoveryOverview(workspaceId) {
  const db = getDb();
  const [campaignRows, prospectRows, temperatureRows, latestProspect] = await Promise.all([
    db
      .select({ status: discoveryCampaigns.status, value: count() })
      .from(discoveryCampaigns)
      .where(eq(discoveryCampaigns.workspaceId, workspaceId))
      .groupBy(discoveryCampaigns.status),
    db
      .select({ status: discoveryProspects.status, value: count() })
      .from(discoveryProspects)
      .where(eq(discoveryProspects.workspaceId, workspaceId))
      .groupBy(discoveryProspects.status),
    db
      .select({ temperature: discoveryProspects.temperature, value: count() })
      .from(discoveryProspects)
      .where(eq(discoveryProspects.workspaceId, workspaceId))
      .groupBy(discoveryProspects.temperature),
    db
      .select({ createdAt: discoveryProspects.createdAt })
      .from(discoveryProspects)
      .where(eq(discoveryProspects.workspaceId, workspaceId))
      .orderBy(desc(discoveryProspects.createdAt))
      .limit(1),
  ]);

  const campaignByStatus = {};
  let campaignTotal = 0;
  for (const row of campaignRows) {
    const value = Number(row.value || 0);
    campaignByStatus[row.status] = value;
    campaignTotal += value;
  }
  const prospectByStatus = {};
  let prospectTotal = 0;
  for (const row of prospectRows) {
    const value = Number(row.value || 0);
    prospectByStatus[row.status] = value;
    prospectTotal += value;
  }
  const temperatures = Object.fromEntries(
    DISCOVERY_TEMPERATURES.map((key) => [key, 0]),
  );
  for (const row of temperatureRows) {
    temperatures[row.temperature] = Number(row.value || 0);
  }

  return {
    campaigns: {
      total: campaignTotal,
      byStatus: campaignByStatus,
      active: campaignByStatus.active || 0,
      draft: campaignByStatus.draft || 0,
      paused: campaignByStatus.paused || 0,
    },
    prospects: {
      total: prospectTotal,
      byStatus: prospectByStatus,
      pending: prospectByStatus.pending_review || 0,
      approved: prospectByStatus.approved || 0,
      rejected: prospectByStatus.rejected || 0,
      duplicate: prospectByStatus.duplicate || 0,
    },
    temperatures,
    lastDiscoveredAt: latestProspect[0]?.createdAt || null,
  };
}

// Exported for tests and monitoring: a run row is queued before the worker
// touches it, so a missing worker is visible as "queued" rather than unknown.
export async function listCampaignRuns(workspaceId, campaignId, limit = 50) {
  return getDb()
    .select()
    .from(discoveryCampaignRuns)
    .where(
      and(
        eq(discoveryCampaignRuns.workspaceId, workspaceId),
        eq(discoveryCampaignRuns.campaignId, campaignId),
      ),
    )
    .orderBy(desc(discoveryCampaignRuns.startedAt))
    .limit(limit);
}

