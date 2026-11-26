import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  ilike,
  lte,
  lt,
  notInArray,
  or,
  sql,
} from 'drizzle-orm';
import { getDb } from '@/db/client';
import {
  auditLogs,
  clients,
  marketingCampaigns,
  marketingContentItems,
  marketingMetrics,
  marketingProfiles,
  marketingReports,
  marketingWebsiteProposals,
  projects,
  projectTasks,
  users,
} from '@/db/schema';
import { getRunDetail } from '@/lib/ai/runtime';
import { ApiError } from '@/lib/api-error';
import { recordAudit } from '@/lib/audit';
import {
  METRIC_LABELS,
  METRIC_SOURCE_LABELS,
  METRIC_SOURCES,
} from './constants';
import {
  assertCampaign,
  assertClient,
  assertDateOrder,
  assertProject,
  escapeLike,
  marketingNotFound,
} from './helpers';
import { requestAgentDraft } from './content';

const CLOSED_TASK_STATUSES = ['completed', 'cancelled'];
const RATE_METRICS = new Set(['keyword_position', 'conversion_rate']);
const ACTIVE_CAMPAIGN_STATUSES = [
  'planned',
  'draft',
  'awaiting_review',
  'approved',
  'scheduled',
];

// ---------------------------------------------------------------------------
// 2G-H — metrics
// ---------------------------------------------------------------------------

export async function recordMetric({ workspaceId, userId, data }) {
  const client = await assertClient(workspaceId, data.clientId);
  await assertCampaign(workspaceId, data.campaignId, client.id);
  assertDateOrder(data.periodStart, data.periodEnd, 'periodStart');
  if (!METRIC_LABELS[data.metricKey]) {
    throw new ApiError(422, 'INVALID_METRIC', 'Choose a supported metric.');
  }
  if (!METRIC_SOURCES.includes(data.source)) {
    throw new ApiError(422, 'INVALID_SOURCE', 'Choose a valid metric source.');
  }

  const rows = await getDb()
    .insert(marketingMetrics)
    .values({
      workspaceId,
      clientId: client.id,
      campaignId: data.campaignId || null,
      metricKey: data.metricKey,
      value: data.value,
      source: data.source,
      periodStart: data.periodStart,
      periodEnd: data.periodEnd,
      notes: data.notes ?? null,
      recordedByUserId: userId,
    })
    .returning({ id: marketingMetrics.id });

  await recordAudit({
    workspaceId,
    actorUserId: userId,
    action: 'marketing.metric_record',
    resourceType: 'marketing_metric',
    resourceId: rows[0].id,
    metadata: {
      clientId: client.id,
      metricKey: data.metricKey,
      source: data.source,
    },
  });

  return rows[0];
}

export async function listMetrics(workspaceId, query) {
  const filters = [eq(marketingMetrics.workspaceId, workspaceId)];
  if (query.clientId) filters.push(eq(marketingMetrics.clientId, query.clientId));
  if (query.campaignId) {
    filters.push(eq(marketingMetrics.campaignId, query.campaignId));
  }
  if (query.metricKey) filters.push(eq(marketingMetrics.metricKey, query.metricKey));
  if (query.source) filters.push(eq(marketingMetrics.source, query.source));
  if (query.from) filters.push(gte(marketingMetrics.periodStart, query.from));
  if (query.to) filters.push(lte(marketingMetrics.periodEnd, query.to));
  assertDateOrder(query.from, query.to, 'from');
  const where = and(...filters);
  const offset = (query.page - 1) * query.pageSize;

  const [rows, totals] = await Promise.all([
    getDb()
      .select({
        id: marketingMetrics.id,
        clientId: marketingMetrics.clientId,
        clientName: clients.companyName,
        campaignId: marketingMetrics.campaignId,
        campaignName: marketingCampaigns.name,
        metricKey: marketingMetrics.metricKey,
        value: marketingMetrics.value,
        source: marketingMetrics.source,
        periodStart: marketingMetrics.periodStart,
        periodEnd: marketingMetrics.periodEnd,
        notes: marketingMetrics.notes,
        recordedByName: users.name,
        createdAt: marketingMetrics.createdAt,
      })
      .from(marketingMetrics)
      .innerJoin(clients, eq(clients.id, marketingMetrics.clientId))
      .leftJoin(
        marketingCampaigns,
        eq(marketingCampaigns.id, marketingMetrics.campaignId),
      )
      .leftJoin(users, eq(users.id, marketingMetrics.recordedByUserId))
      .where(where)
      .orderBy(desc(marketingMetrics.periodStart))
      .limit(query.pageSize)
      .offset(offset),
    getDb().select({ value: count() }).from(marketingMetrics).where(where),
  ]);

  const total = Number(totals[0]?.value || 0);
  return {
    items: rows.map((row) => ({
      ...row,
      metricLabel: METRIC_LABELS[row.metricKey] || row.metricKey,
      sourceLabel: METRIC_SOURCE_LABELS[row.source] || row.source,
    })),
    total,
    page: query.page,
    pageSize: query.pageSize,
    pages: Math.max(1, Math.ceil(total / query.pageSize)),
  };
}

export async function getMetricsOverview(workspaceId) {
  const rows = await getDb()
    .select({
      source: marketingMetrics.source,
      value: count(),
    })
    .from(marketingMetrics)
    .where(eq(marketingMetrics.workspaceId, workspaceId))
    .groupBy(marketingMetrics.source);
  const sourceCounts = {};
  let total = 0;
  for (const row of rows) {
    const value = Number(row.value || 0);
    sourceCounts[row.source] = value;
    total += value;
  }
  return { total, sourceCounts };
}

// ---------------------------------------------------------------------------
// 2G-H — reports
// ---------------------------------------------------------------------------

function round(value, digits = 2) {
  if (!Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

async function buildSnapshot(workspaceId, { clientId, periodStart, periodEnd }) {
  const metricRows = await getDb()
    .select({
      metricKey: marketingMetrics.metricKey,
      value: marketingMetrics.value,
      source: marketingMetrics.source,
      campaignId: marketingMetrics.campaignId,
      periodStart: marketingMetrics.periodStart,
      periodEnd: marketingMetrics.periodEnd,
      notes: marketingMetrics.notes,
    })
    .from(marketingMetrics)
    .where(
      and(
        eq(marketingMetrics.workspaceId, workspaceId),
        eq(marketingMetrics.clientId, clientId),
        gte(marketingMetrics.periodStart, periodStart),
        lte(marketingMetrics.periodEnd, periodEnd),
      ),
    )
    .orderBy(asc(marketingMetrics.periodStart));

  const aggregates = {};
  for (const row of metricRows) {
    const bucket = aggregates[row.metricKey] || { sum: 0, values: 0 };
    bucket.sum += Number(row.value || 0);
    bucket.values += 1;
    aggregates[row.metricKey] = bucket;
  }

  const sums = {};
  const averages = {};
  for (const [key, bucket] of Object.entries(aggregates)) {
    sums[key] = round(bucket.sum, 2);
    if (RATE_METRICS.has(key)) {
      averages[key] = round(bucket.sum / Math.max(1, bucket.values), 2);
    }
  }

  const [publishedContent, campaignCounts, executedProposals] = await Promise.all([
    getDb()
      .select({ value: count() })
      .from(marketingContentItems)
      .where(
        and(
          eq(marketingContentItems.workspaceId, workspaceId),
          eq(marketingContentItems.clientId, clientId),
          eq(marketingContentItems.status, 'published'),
          gte(marketingContentItems.publishedAt, periodStart),
          lte(marketingContentItems.publishedAt, periodEnd),
        ),
      ),
    getDb()
      .select({
        status: marketingCampaigns.status,
        value: count(),
      })
      .from(marketingCampaigns)
      .where(
        and(
          eq(marketingCampaigns.workspaceId, workspaceId),
          eq(marketingCampaigns.clientId, clientId),
        ),
      )
      .groupBy(marketingCampaigns.status),
    getDb()
      .select({ value: count() })
      .from(marketingWebsiteProposals)
      .where(
        and(
          eq(marketingWebsiteProposals.workspaceId, workspaceId),
          eq(marketingWebsiteProposals.clientId, clientId),
          eq(marketingWebsiteProposals.status, 'executed'),
          gte(marketingWebsiteProposals.executedAt, periodStart),
          lte(marketingWebsiteProposals.executedAt, periodEnd),
        ),
      ),
  ]);

  const derived = {};
  if (!sums.content_output) {
    derived.content_output = Number(publishedContent[0]?.value || 0);
  }
  const leads = sums.leads || 0;
  const sessions = sums.website_sessions || 0;
  const spend = sums.campaign_spend || 0;
  if (!sums.conversion_rate && sessions > 0) {
    derived.conversion_rate = round((leads / sessions) * 100, 2);
  }
  if (!sums.cost_per_lead && leads > 0) {
    derived.cost_per_lead = round(spend / leads, 2);
  }

  const sources = [...new Set(metricRows.map((row) => row.source))];
  if (Object.keys(derived).length > 0) sources.push('calculated');

  return {
    period: { start: periodStart, end: periodEnd },
    metrics: metricRows.map((row) => ({
      ...row,
      label: METRIC_LABELS[row.metricKey] || row.metricKey,
      sourceLabel: METRIC_SOURCE_LABELS[row.source] || row.source,
    })),
    sums,
    averages,
    derived,
    contentOutputRecorded: Number(
      sums.content_output ?? derived.content_output ?? 0,
    ),
    campaigns: Object.fromEntries(
      campaignCounts.map((row) => [row.status, Number(row.value || 0)]),
    ),
    executedProposals: Number(executedProposals[0]?.value || 0),
    sources,
  };
}

function buildNarrative(client, snapshot) {
  const start = new Date(snapshot.period.start).toISOString().slice(0, 10);
  const end = new Date(snapshot.period.end).toISOString().slice(0, 10);
  const lines = [`${client.companyName}: ${start} to ${end}.`];

  if (snapshot.metrics.length === 0) {
    lines.push(
      'No performance data was recorded for this period. Nothing has been estimated or invented.',
    );
    return lines.join(' ');
  }

  const parts = [];
  for (const [key, value] of Object.entries(snapshot.sums)) {
    if (key === 'campaign_budget' || key === 'campaign_spend') {
      parts.push(`${METRIC_LABELS[key]} ${value}`);
    } else if (RATE_METRICS.has(key)) {
      parts.push(`${METRIC_LABELS[key]} ${snapshot.averages[key]}`);
    } else {
      parts.push(`${METRIC_LABELS[key]} ${value}`);
    }
  }
  for (const [key, value] of Object.entries(snapshot.derived)) {
    parts.push(`${METRIC_LABELS[key]} ${value} (calculated)`);
  }
  lines.push(`Recorded figures: ${parts.join('; ')}.`);
  lines.push(
    `Content output recorded: ${snapshot.contentOutputRecorded}. Website changes executed: ${snapshot.executedProposals}.`,
  );
  lines.push(
    'Each figure keeps its recorded source. Estimates are not presented as verified analytics.',
  );
  return lines.join(' ');
}

export async function createReport({ workspaceId, userId, data }) {
  const client = await assertClient(workspaceId, data.clientId);
  await assertProject(workspaceId, data.projectId, client.id);
  assertDateOrder(data.periodStart, data.periodEnd, 'periodStart');

  const snapshot = await buildSnapshot(workspaceId, {
    clientId: client.id,
    periodStart: data.periodStart,
    periodEnd: data.periodEnd,
  });
  const summary = buildNarrative(client, snapshot);

  const rows = await getDb()
    .insert(marketingReports)
    .values({
      workspaceId,
      clientId: client.id,
      projectId: data.projectId || null,
      title: data.title,
      periodStart: data.periodStart,
      periodEnd: data.periodEnd,
      summary,
      dataSnapshot: snapshot,
      dataSources: snapshot.sources,
      createdByUserId: userId,
    })
    .returning({ id: marketingReports.id });

  await recordAudit({
    workspaceId,
    actorUserId: userId,
    action: 'marketing.report_create',
    resourceType: 'marketing_report',
    resourceId: rows[0].id,
    metadata: {
      clientId: client.id,
      sources: snapshot.sources,
      metricCount: snapshot.metrics.length,
    },
  });

  return getReport(workspaceId, rows[0].id);
}

export async function getReport(workspaceId, reportId) {
  const rows = await getDb()
    .select({
      report: marketingReports,
      clientName: clients.companyName,
      clientReference: clients.reference,
      projectName: projects.name,
      createdByName: users.name,
    })
    .from(marketingReports)
    .innerJoin(clients, eq(clients.id, marketingReports.clientId))
    .leftJoin(projects, eq(projects.id, marketingReports.projectId))
    .leftJoin(users, eq(users.id, marketingReports.createdByUserId))
    .where(
      and(
        eq(marketingReports.workspaceId, workspaceId),
        eq(marketingReports.id, reportId),
      ),
    )
    .limit(1);
  if (!rows[0]) throw marketingNotFound('marketing report');
  return rows[0];
}

export async function listReports(workspaceId, query) {
  const filters = [eq(marketingReports.workspaceId, workspaceId)];
  if (query.clientId) filters.push(eq(marketingReports.clientId, query.clientId));
  if (query.search) {
    const like = `%${escapeLike(query.search)}%`;
    filters.push(
      or(
        ilike(marketingReports.title, like),
        ilike(clients.companyName, like),
      ),
    );
  }
  const where = and(...filters);
  const offset = (query.page - 1) * query.pageSize;

  const [rows, totals] = await Promise.all([
    getDb()
      .select({
        id: marketingReports.id,
        title: marketingReports.title,
        clientId: marketingReports.clientId,
        clientName: clients.companyName,
        projectId: marketingReports.projectId,
        projectName: projects.name,
        periodStart: marketingReports.periodStart,
        periodEnd: marketingReports.periodEnd,
        dataSources: marketingReports.dataSources,
        createdAt: marketingReports.createdAt,
      })
      .from(marketingReports)
      .innerJoin(clients, eq(clients.id, marketingReports.clientId))
      .leftJoin(projects, eq(projects.id, marketingReports.projectId))
      .where(where)
      .orderBy(desc(marketingReports.createdAt))
      .limit(query.pageSize)
      .offset(offset),
    getDb()
      .select({ value: count() })
      .from(marketingReports)
      .innerJoin(clients, eq(clients.id, marketingReports.clientId))
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

export async function requestReportNarrative({
  workspaceId,
  userId,
  reportId,
}) {
  const detail = await getReport(workspaceId, reportId);
  const snapshotJson = JSON.stringify(detail.report.dataSnapshot || {});
  const requested = await requestAgentDraft({
    workspaceId,
    userId,
    input: [
      `Write a short marketing summary for ${detail.clientName}.`,
      'Use only the data below. Do not invent numbers, causes or outcomes.',
      'If the data is empty, say so.',
      `Period: ${detail.report.periodStart} to ${detail.report.periodEnd}`,
      `Data: ${snapshotJson.slice(0, 12_000)}`,
    ].join('\n'),
  });
  if (requested.mode === 'agent') {
    return {
      mode: 'agent',
      run: requested.run,
      message:
        'An AI narrative run was queued. Import its output when the run completes.',
    };
  }
  return {
    mode: 'local',
    reason: requested.reason,
    message:
      'No AI provider is configured. The report keeps its data-derived summary and no AI narrative was invented.',
  };
}

export async function importReportNarrative({
  workspaceId,
  userId,
  reportId,
  runId,
}) {
  const detail = await getReport(workspaceId, reportId);
  if (!runId) {
    throw new ApiError(422, 'RUN_REQUIRED', 'Choose a completed AI run.');
  }
  const runDetail = await getRunDetail(workspaceId, runId);
  if (!runDetail) {
    throw new ApiError(404, 'NOT_FOUND', 'That AI run could not be found.');
  }
  if (runDetail.run.status !== 'completed') {
    throw new ApiError(
      409,
      'RUN_NOT_COMPLETED',
      `That run is ${runDetail.run.status}; only completed runs can be imported.`,
    );
  }
  const text = runDetail.run.output?.text;
  if (!text || !String(text).trim()) {
    throw new ApiError(409, 'RUN_OUTPUT_EMPTY', 'That run has no text output.');
  }

  const snapshot = detail.report.dataSnapshot || {};
  const dataSources = new Set(detail.report.dataSources || []);
  dataSources.add('ai_narrative');
  await getDb()
    .update(marketingReports)
    .set({
      summary: String(text),
      dataSnapshot: {
        ...snapshot,
        aiNarrative: {
          runId,
          provider: runDetail.run.output?.provider || null,
          model: runDetail.run.output?.model || null,
        },
      },
      dataSources: [...dataSources],
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(marketingReports.workspaceId, workspaceId),
        eq(marketingReports.id, reportId),
      ),
    );

  await recordAudit({
    workspaceId,
    actorUserId: userId,
    action: 'marketing.report_create',
    resourceType: 'marketing_report',
    resourceId: reportId,
    metadata: { narrative: 'ai', runId },
  });

  return getReport(workspaceId, reportId);
}

// ---------------------------------------------------------------------------
// 2G-I — agency dashboard and client summary
// ---------------------------------------------------------------------------

export async function getMarketingDashboard(workspaceId) {
  const now = new Date();
  const [
    profileRows,
    campaignRows,
    contentRows,
    proposalRows,
    reportRows,
    openTaskRows,
    overdueTaskRows,
    recentAudit,
  ] = await Promise.all([
    getDb()
      .select({ value: count() })
      .from(marketingProfiles)
      .where(
        and(
          eq(marketingProfiles.workspaceId, workspaceId),
          eq(marketingProfiles.status, 'active'),
        ),
      ),
    getDb()
      .select({
        status: marketingCampaigns.status,
        value: count(),
      })
      .from(marketingCampaigns)
      .where(eq(marketingCampaigns.workspaceId, workspaceId))
      .groupBy(marketingCampaigns.status),
    getDb()
      .select({
        status: marketingContentItems.status,
        value: count(),
      })
      .from(marketingContentItems)
      .where(eq(marketingContentItems.workspaceId, workspaceId))
      .groupBy(marketingContentItems.status),
    getDb()
      .select({
        status: marketingWebsiteProposals.status,
        value: count(),
      })
      .from(marketingWebsiteProposals)
      .where(eq(marketingWebsiteProposals.workspaceId, workspaceId))
      .groupBy(marketingWebsiteProposals.status),
    getDb()
      .select({ value: count() })
      .from(marketingReports)
      .where(eq(marketingReports.workspaceId, workspaceId)),
    getDb()
      .select({ value: count() })
      .from(projectTasks)
      .where(
        and(
          eq(projectTasks.workspaceId, workspaceId),
          sql`${projectTasks.sourceType} is not null`,
          notInArray(projectTasks.status, CLOSED_TASK_STATUSES),
        ),
      ),
    getDb()
      .select({ value: count() })
      .from(projectTasks)
      .where(
        and(
          eq(projectTasks.workspaceId, workspaceId),
          sql`${projectTasks.sourceType} is not null`,
          notInArray(projectTasks.status, CLOSED_TASK_STATUSES),
          lt(projectTasks.dueDate, now),
        ),
      ),
    getDb()
      .select({
        id: auditLogs.id,
        action: auditLogs.action,
        resourceType: auditLogs.resourceType,
        resourceId: auditLogs.resourceId,
        actorName: users.name,
        createdAt: auditLogs.createdAt,
      })
      .from(auditLogs)
      .leftJoin(users, eq(users.id, auditLogs.actorUserId))
      .where(
        and(
          eq(auditLogs.workspaceId, workspaceId),
          ilike(auditLogs.action, 'marketing.%'),
        ),
      )
      .orderBy(desc(auditLogs.createdAt))
      .limit(8),
  ]);

  const campaignStatus = Object.fromEntries(
    campaignRows.map((row) => [row.status, Number(row.value || 0)]),
  );
  const contentStatus = Object.fromEntries(
    contentRows.map((row) => [row.status, Number(row.value || 0)]),
  );
  const proposalStatus = Object.fromEntries(
    proposalRows.map((row) => [row.status, Number(row.value || 0)]),
  );

  const activeCampaigns = ACTIVE_CAMPAIGN_STATUSES.reduce(
    (total, status) => total + (campaignStatus[status] || 0),
    0,
  );

  return {
    activeClients: Number(profileRows[0]?.value || 0),
    activeCampaigns,
    pendingApprovals:
      (proposalStatus.awaiting_review || 0) +
      (contentStatus.in_review || 0),
    contentAwaitingReview: contentStatus.in_review || 0,
    scheduledContent: contentStatus.scheduled || 0,
    openMarketingTasks: Number(openTaskRows[0]?.value || 0),
    websiteProposalsAwaitingReview: proposalStatus.awaiting_review || 0,
    websiteProposalsExecuting: proposalStatus.executing || 0,
    overdueMarketingTasks: Number(overdueTaskRows[0]?.value || 0),
    reports: Number(reportRows[0]?.value || 0),
    recentActivity: recentAudit,
    statusCounts: {
      campaigns: campaignStatus,
      content: contentStatus,
      proposals: proposalStatus,
    },
  };
}

export async function getClientMarketingSummary(workspaceId, clientId) {
  const client = await assertClient(workspaceId, clientId);
  const [profileRows, campaignRows, contentRows, proposalRows, taskRows, reportRows] =
    await Promise.all([
      getDb()
        .select()
        .from(marketingProfiles)
        .where(
          and(
            eq(marketingProfiles.workspaceId, workspaceId),
            eq(marketingProfiles.clientId, clientId),
          ),
        )
        .limit(1),
      getDb()
        .select({
          status: marketingCampaigns.status,
          value: count(),
        })
        .from(marketingCampaigns)
        .where(
          and(
            eq(marketingCampaigns.workspaceId, workspaceId),
            eq(marketingCampaigns.clientId, clientId),
          ),
        )
        .groupBy(marketingCampaigns.status),
      getDb()
        .select({
          status: marketingContentItems.status,
          value: count(),
        })
        .from(marketingContentItems)
        .where(
          and(
            eq(marketingContentItems.workspaceId, workspaceId),
            eq(marketingContentItems.clientId, clientId),
          ),
        )
        .groupBy(marketingContentItems.status),
      getDb()
        .select({
          status: marketingWebsiteProposals.status,
          value: count(),
        })
        .from(marketingWebsiteProposals)
        .where(
          and(
            eq(marketingWebsiteProposals.workspaceId, workspaceId),
            eq(marketingWebsiteProposals.clientId, clientId),
          ),
        )
        .groupBy(marketingWebsiteProposals.status),
      getDb()
        .select({ value: count() })
        .from(projectTasks)
        .innerJoin(projects, eq(projects.id, projectTasks.projectId))
        .where(
          and(
            eq(projectTasks.workspaceId, workspaceId),
            eq(projects.clientId, clientId),
            sql`${projectTasks.sourceType} is not null`,
            notInArray(projectTasks.status, CLOSED_TASK_STATUSES),
          ),
        ),
      getDb()
        .select({ value: count() })
        .from(marketingReports)
        .where(
          and(
            eq(marketingReports.workspaceId, workspaceId),
            eq(marketingReports.clientId, clientId),
          ),
        ),
    ]);

  const toCounts = (rows) =>
    Object.fromEntries(rows.map((row) => [row.status, Number(row.value || 0)]));

  return {
    client,
    profile: profileRows[0] || null,
    statusCounts: {
      campaigns: toCounts(campaignRows),
      content: toCounts(contentRows),
      proposals: toCounts(proposalRows),
    },
    openMarketingTasks: Number(taskRows[0]?.value || 0),
    reports: Number(reportRows[0]?.value || 0),
  };
}
