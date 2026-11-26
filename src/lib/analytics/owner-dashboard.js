import { and, count, desc, eq, gte, inArray, isNull, sql } from 'drizzle-orm';
import { getDb } from '@/db/client';
import {
  clients,
  discoveryCampaignRuns,
  discoveryCampaigns,
  discoveryProspects,
  invoices,
  leadActivities,
  leadImportBatches,
  leadImportRows,
  leads,
  meetings,
  payments,
  projectTasks,
  projects,
} from '@/db/schema';
import { BILLED_INVOICE_STATUSES } from '@/lib/billing/transitions';

const DAY = 24 * 60 * 60 * 1000;
const ACTIVE_PROJECT_STATUSES = [
  'not_started',
  'planning',
  'in_progress',
  'client_review',
  'on_hold',
];

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function countMap(rows) {
  const map = {};
  for (const row of rows) map[row.key] = toNumber(row.value);
  return map;
}

// Owner-facing business intelligence. Every figure is read from the workspace
// tables; reported amounts stay labelled as owner-reported and unverified,
// while finance totals come only from issued invoices and recorded payments.
export async function getOwnerDashboard({ workspaceId, now = new Date() }) {
  const db = getDb();
  const since = new Date(now.getTime() - 30 * DAY);
  const activeLead = and(eq(leads.workspaceId, workspaceId), isNull(leads.archivedAt));
  const reportedAny = sql`coalesce(${leads.reportedAmountReceivedCents}, ${leads.reportedOutstandingCents}, ${leads.reportedProjectCostCents}) is not null`;

  const [
    leadStatusRows,
    sourceRows,
    leadCountersRows,
    reportedRows,
    campaignRows,
    prospectRows,
    runRows,
    importRows,
    callRows,
    callOutcomeRows,
    meetingRows,
    projectRows,
    taskRows,
    paymentRows,
    invoiceRows,
    clientRows,
  ] = await Promise.all([
    db
      .select({ key: leads.status, value: count() })
      .from(leads)
      .where(activeLead)
      .groupBy(leads.status),
    db
      .select({
        key: leads.source,
        value: count(),
        won: sql`count(*) filter (where ${leads.status} = 'won')`,
        qualified: sql`count(*) filter (where ${leads.status} in ('qualified', 'contacted', 'follow_up', 'meeting', 'proposal', 'won'))`,
      })
      .from(leads)
      .where(activeLead)
      .groupBy(leads.source),
    db
      .select({
        total: count(),
        newInWindow: sql`count(*) filter (where ${leads.createdAt} >= ${since})`,
        wonInWindow: sql`count(*) filter (where ${leads.status} = 'won' and ${leads.updatedAt} >= ${since})`,
        unassigned: sql`count(*) filter (where ${leads.assignedUserId} is null)`,
        followUpsOverdue: sql`count(*) filter (where ${leads.nextFollowUpAt} < ${now} and ${leads.status} not in ('won', 'lost'))`,
        reportedLeads: sql`count(*) filter (where ${reportedAny})`,
        reportedVerifiedLeads: sql`count(*) filter (where ${reportedAny} and ${leads.reportedAmountVerified})`,
      })
      .from(leads)
      .where(activeLead),
    db
      .select({
        key: leads.currency,
        received: sql`coalesce(sum(${leads.reportedAmountReceivedCents}), 0)`,
        outstanding: sql`coalesce(sum(${leads.reportedOutstandingCents}), 0)`,
        projectCost: sql`coalesce(sum(${leads.reportedProjectCostCents}), 0)`,
        leads: count(),
        verified: sql`count(*) filter (where ${leads.reportedAmountVerified})`,
      })
      .from(leads)
      .where(and(activeLead, sql`${reportedAny}`))
      .groupBy(leads.currency),
    db
      .select({ key: discoveryCampaigns.status, value: count() })
      .from(discoveryCampaigns)
      .where(eq(discoveryCampaigns.workspaceId, workspaceId))
      .groupBy(discoveryCampaigns.status),
    db
      .select({ key: discoveryProspects.status, value: count() })
      .from(discoveryProspects)
      .where(eq(discoveryProspects.workspaceId, workspaceId))
      .groupBy(discoveryProspects.status),
    db
      .select({
        runs: count(),
        discovered: sql`coalesce(sum(${discoveryCampaignRuns.discoveredCount}), 0)`,
        duplicates: sql`coalesce(sum(${discoveryCampaignRuns.duplicateCount}), 0)`,
        failed: sql`coalesce(sum(${discoveryCampaignRuns.failedCount}), 0)`,
      })
      .from(discoveryCampaignRuns)
      .where(
        and(
          eq(discoveryCampaignRuns.workspaceId, workspaceId),
          gte(discoveryCampaignRuns.startedAt, since),
        ),
      ),
    db
      .select({
        batches: sql`count(distinct ${leadImportBatches.id})`,
        lastCommittedAt: sql`max(${leadImportBatches.committedAt})`,
        importedRows: sql`count(*) filter (where ${leadImportRows.status} = 'imported')`,
        duplicateRows: sql`count(*) filter (where ${leadImportRows.status} = 'duplicate')`,
      })
      .from(leadImportBatches)
      .leftJoin(leadImportRows, eq(leadImportRows.batchId, leadImportBatches.id))
      .where(
        and(
          eq(leadImportBatches.workspaceId, workspaceId),
          eq(leadImportBatches.status, 'committed'),
        ),
      ),
    db
      .select({
        calls: count(),
        leadsContacted: sql`count(distinct ${leadActivities.leadId})`,
      })
      .from(leadActivities)
      .where(
        and(
          eq(leadActivities.workspaceId, workspaceId),
          eq(leadActivities.type, 'call_logged'),
          gte(leadActivities.createdAt, since),
        ),
      ),
    db
      .select({
        key: sql`coalesce(${leadActivities.metadata} ->> 'outcome', 'unknown')`,
        value: count(),
      })
      .from(leadActivities)
      .where(
        and(
          eq(leadActivities.workspaceId, workspaceId),
          eq(leadActivities.type, 'call_logged'),
          gte(leadActivities.createdAt, since),
        ),
      )
      .groupBy(sql`coalesce(${leadActivities.metadata} ->> 'outcome', 'unknown')`),
    db
      .select({
        upcoming: sql`count(*) filter (where ${meetings.startsAt} >= ${now} and ${meetings.status} in ('scheduled', 'rescheduled'))`,
        completedInWindow: sql`count(*) filter (where ${meetings.status} = 'completed' and ${meetings.startsAt} >= ${since})`,
      })
      .from(meetings)
      .where(eq(meetings.workspaceId, workspaceId)),
    db
      .select({ key: projects.status, value: count() })
      .from(projects)
      .where(eq(projects.workspaceId, workspaceId))
      .groupBy(projects.status),
    db
      .select({
        openTasks: sql`count(*) filter (where ${projectTasks.status} in ('todo', 'in_progress', 'blocked', 'in_review'))`,
        overdueTasks: sql`count(*) filter (where ${projectTasks.status} in ('todo', 'in_progress', 'blocked', 'in_review') and ${projectTasks.dueDate} < ${now})`,
      })
      .from(projectTasks)
      .where(eq(projectTasks.workspaceId, workspaceId)),
    db
      .select({
        key: invoices.currency,
        value: sql`coalesce(sum(${payments.amountCents}), 0)`,
        count: count(),
      })
      .from(payments)
      .innerJoin(invoices, eq(invoices.id, payments.invoiceId))
      .where(eq(payments.workspaceId, workspaceId))
      .groupBy(invoices.currency),
    db
      .select({
        key: invoices.currency,
        outstanding: sql`coalesce(sum(${invoices.balanceDueCents}), 0)`,
        count: count(),
      })
      .from(invoices)
      .where(
        and(
          eq(invoices.workspaceId, workspaceId),
          inArray(invoices.status, BILLED_INVOICE_STATUSES),
        ),
      )
      .groupBy(invoices.currency),
    db
      .select({
        total: count(),
        inWindow: sql`count(*) filter (where ${clients.createdAt} >= ${since})`,
      })
      .from(clients)
      .where(eq(clients.workspaceId, workspaceId)),
  ]);

  const byStatus = countMap(leadStatusRows);
  const leadTotal = toNumber(leadCountersRows[0]?.total);
  const wonTotal = byStatus.won || 0;
  const qualifiedTotal = (byStatus.qualified || 0) +
    (byStatus.contacted || 0) +
    (byStatus.follow_up || 0) +
    (byStatus.meeting || 0) +
    (byStatus.proposal || 0) +
    wonTotal;

  const sourceStats = sourceRows
    .map((row) => ({
      source: row.key,
      leads: toNumber(row.value),
      qualified: toNumber(row.qualified),
      won: toNumber(row.won),
    }))
    .sort((left, right) => right.leads - left.leads);

  const reportedByCurrency = reportedRows
    .map((row) => {
      const verified = toNumber(row.verified);
      const leadCount = toNumber(row.leads);
      return {
        currency: row.key,
        receivedCents: toNumber(row.received),
        outstandingCents: toNumber(row.outstanding),
        projectCostCents: toNumber(row.projectCost),
        leadCount,
        verifiedLeads: verified,
        unverifiedLeads: leadCount - verified,
      };
    })
    .sort((left, right) => left.currency.localeCompare(right.currency));

  const byStatusProjects = countMap(projectRows);
  const paymentsByCurrency = paymentRows
    .map((row) => ({
      currency: row.key,
      paidCents: toNumber(row.value),
      payments: toNumber(row.count),
    }))
    .sort((left, right) => left.currency.localeCompare(right.currency));
  const outstandingByCurrency = invoiceRows
    .map((row) => ({
      currency: row.key,
      outstandingCents: toNumber(row.outstanding),
      invoices: toNumber(row.count),
    }))
    .sort((left, right) => left.currency.localeCompare(right.currency));

  const campaignsByStatus = countMap(campaignRows);
  const prospectsByStatus = countMap(prospectRows);
  const runs = runRows[0] || {};
  const imports = importRows[0] || {};
  const calls = callRows[0] || {};
  const meetingTotals = meetingRows[0] || {};
  const tasks = taskRows[0] || {};
  const clientTotals = clientRows[0] || {};

  return {
    generatedAt: now,
    windowDays: 30,
    leads: {
      total: leadTotal,
      byStatus,
      bySource: sourceStats,
      qualifiedTotal,
      wonTotal,
      newInWindow: toNumber(leadCountersRows[0]?.newInWindow),
      wonInWindow: toNumber(leadCountersRows[0]?.wonInWindow),
      unassigned: toNumber(leadCountersRows[0]?.unassigned),
      followUpsOverdue: toNumber(leadCountersRows[0]?.followUpsOverdue),
      conversionRate: leadTotal > 0 ? Math.round((wonTotal / leadTotal) * 1_000) / 10 : 0,
      reportedLeadCount: toNumber(leadCountersRows[0]?.reportedLeads),
      reportedVerifiedLeadCount: toNumber(leadCountersRows[0]?.reportedVerifiedLeads),
    },
    discovery: {
      campaignsByStatus,
      prospectsByStatus,
      pendingReview: prospectsByStatus.pending_review || 0,
      runs: toNumber(runs.runs),
      discovered: toNumber(runs.discovered),
      duplicates: toNumber(runs.duplicates),
      failed: toNumber(runs.failed),
    },
    imports: {
      batches: toNumber(imports.batches),
      lastCommittedAt: imports.lastCommittedAt || null,
      importedRows: toNumber(imports.importedRows),
      duplicateRows: toNumber(imports.duplicateRows),
    },
    sales: {
      calls: toNumber(calls.calls),
      leadsContacted: toNumber(calls.leadsContacted),
      byOutcome: countMap(callOutcomeRows),
      meetingsUpcoming: toNumber(meetingTotals.upcoming),
      meetingsCompletedInWindow: toNumber(meetingTotals.completedInWindow),
    },
    delivery: {
      projectsByStatus: byStatusProjects,
      activeProjects: ACTIVE_PROJECT_STATUSES.reduce(
        (sum, status) => sum + (byStatusProjects[status] || 0),
        0,
      ),
      openTasks: toNumber(tasks.openTasks),
      overdueTasks: toNumber(tasks.overdueTasks),
    },
    clients: {
      total: toNumber(clientTotals.total),
      newInWindow: toNumber(clientTotals.inWindow),
    },
    money: {
      reportedByCurrency,
      verifiedPaymentsByCurrency: paymentsByCurrency,
      outstandingInvoicesByCurrency: outstandingByCurrency,
    },
  };
}

export async function getRecentActivity(workspaceId, limit = 8) {
  const rows = await getDb()
    .select({
      id: leadActivities.id,
      type: leadActivities.type,
      body: leadActivities.body,
      leadId: leadActivities.leadId,
      companyName: leads.companyName,
      createdAt: leadActivities.createdAt,
    })
    .from(leadActivities)
    .innerJoin(leads, eq(leads.id, leadActivities.leadId))
    .where(eq(leadActivities.workspaceId, workspaceId))
    .orderBy(desc(leadActivities.createdAt))
    .limit(limit);
  return rows;
}
