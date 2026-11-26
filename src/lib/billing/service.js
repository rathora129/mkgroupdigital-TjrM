import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  gte,
  ilike,
  inArray,
  isNull,
  lt,
  or,
  sql,
  sum,
} from 'drizzle-orm';
import { getDb, getDbDriver } from '@/db/client';
import {
  agents,
  clients,
  expenses,
  invoiceLineItems,
  invoices,
  payments,
  projects,
  proposalLineItems,
  proposals,
  proposalVersions,
  serviceEngagements,
  users,
} from '@/db/schema';
import { createAgentRun } from '@/lib/ai/runtime';
import { ApiError } from '@/lib/api-error';
import { recordAudit } from '@/lib/audit';
import { insertWithReference, isUniqueViolation } from '@/lib/business/references';
import { escapeLike, runAtomic, staleError } from '@/lib/clients/helpers';
import { computeInvoiceLines, paymentOutcome, totalsFromStoredLines } from './calc';
import {
  BILLED_INVOICE_STATUSES,
  EXPENSE_CATEGORIES,
  canTransitionInvoice,
  invoiceActions,
  invoiceDisplayStatus,
  isInvoiceDueSoon,
  isInvoiceOverdue,
  isInvoicePayable,
  startOfUtcDay,
} from './transitions';

const DAY_MS = 24 * 60 * 60 * 1000;

function notFound() {
  return new ApiError(404, 'NOT_FOUND', 'That record could not be found.');
}

function monthBounds(date) {
  const value = new Date(date);
  const start = new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), 1),
  );
  const end = new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + 1, 1),
  );
  return { start, end };
}

function monthLabel(date) {
  return new Date(date).toLocaleString('en-IN', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function formatMinor(cents, currency = 'INR') {
  return `${currency} ${(Number(cents || 0) / 100).toFixed(2)}`;
}

async function nextInvoiceReference(executor, workspaceId) {
  const rows = await executor
    .select({
      value: sql`coalesce(max(cast(substring(${invoices.reference} from 5) as integer)), 0)`,
    })
    .from(invoices)
    .where(eq(invoices.workspaceId, workspaceId));
  return `INV-${String(Number(rows[0]?.value || 0) + 1).padStart(4, '0')}`;
}

async function nextPaymentReference(executor, workspaceId) {
  const rows = await executor
    .select({
      value: sql`coalesce(max(cast(substring(${payments.reference} from 5) as integer)), 0)`,
    })
    .from(payments)
    .where(eq(payments.workspaceId, workspaceId));
  return `PAY-${String(Number(rows[0]?.value || 0) + 1).padStart(4, '0')}`;
}

async function assertClient(workspaceId, clientId) {
  const rows = await getDb()
    .select({
      id: clients.id,
      reference: clients.reference,
      companyName: clients.companyName,
      status: clients.status,
      email: clients.email,
      primaryContactName: clients.primaryContactName,
      phone: clients.phone,
    })
    .from(clients)
    .where(and(eq(clients.workspaceId, workspaceId), eq(clients.id, clientId)))
    .limit(1);
  if (!rows[0]) {
    throw new ApiError(422, 'CLIENT_NOT_FOUND', 'Choose a client from this workspace.', {
      clientId: 'Choose a client record from this workspace.',
    });
  }
  return rows[0];
}

async function assertProject(workspaceId, projectId, clientId = null) {
  if (!projectId) return null;
  const rows = await getDb()
    .select({
      id: projects.id,
      reference: projects.reference,
      name: projects.name,
      clientId: projects.clientId,
    })
    .from(projects)
    .where(and(eq(projects.workspaceId, workspaceId), eq(projects.id, projectId)))
    .limit(1);
  if (!rows[0]) {
    throw new ApiError(422, 'PROJECT_NOT_FOUND', 'Choose a project from this workspace.', {
      projectId: 'Choose a project from this workspace.',
    });
  }
  if (clientId && rows[0].clientId && rows[0].clientId !== clientId) {
    throw new ApiError(
      422,
      'PROJECT_CLIENT_MISMATCH',
      'That project belongs to a different client.',
      { projectId: 'Choose a project for the selected client.' },
    );
  }
  return rows[0];
}

const INVOICE_SELECT = {
  id: invoices.id,
  reference: invoices.reference,
  clientId: invoices.clientId,
  clientName: clients.companyName,
  clientReference: clients.reference,
  proposalId: invoices.proposalId,
  proposalReference: proposals.reference,
  projectId: invoices.projectId,
  projectName: projects.name,
  projectReference: projects.reference,
  engagementId: invoices.engagementId,
  engagementName: serviceEngagements.name,
  source: invoices.source,
  sourceId: invoices.sourceId,
  currency: invoices.currency,
  invoiceDate: invoices.invoiceDate,
  dueDate: invoices.dueDate,
  status: invoices.status,
  subtotalCents: invoices.subtotalCents,
  discountCents: invoices.discountCents,
  taxCents: invoices.taxCents,
  totalCents: invoices.totalCents,
  cgstCents: invoices.cgstCents,
  sgstCents: invoices.sgstCents,
  igstCents: invoices.igstCents,
  amountPaidCents: invoices.amountPaidCents,
  balanceDueCents: invoices.balanceDueCents,
  notes: invoices.notes,
  terms: invoices.terms,
  approvedAt: invoices.approvedAt,
  issuedAt: invoices.issuedAt,
  cancelledAt: invoices.cancelledAt,
  cancellationReason: invoices.cancellationReason,
  createdAt: invoices.createdAt,
  updatedAt: invoices.updatedAt,
};

function invoiceBase(db) {
  return db
    .select(INVOICE_SELECT)
    .from(invoices)
    .leftJoin(clients, eq(clients.id, invoices.clientId))
    .leftJoin(projects, eq(projects.id, invoices.projectId))
    .leftJoin(proposals, eq(proposals.id, invoices.proposalId))
    .leftJoin(serviceEngagements, eq(serviceEngagements.id, invoices.engagementId));
}

function enrichInvoice(row, nowMs = Date.now()) {
  return {
    ...row,
    displayStatus: invoiceDisplayStatus(row, nowMs),
    isOverdue: isInvoiceOverdue(row, nowMs),
    isDueSoon: isInvoiceDueSoon(row, 7, nowMs),
  };
}

async function loadInvoiceRow(workspaceId, invoiceId) {
  const rows = await invoiceBase(getDb())
    .where(and(eq(invoices.workspaceId, workspaceId), eq(invoices.id, invoiceId)))
    .limit(1);
  return rows[0] || null;
}

export async function listInvoices(workspaceId, viewerUserId, query) {
  const db = getDb();
  const now = new Date();
  const startOfDay = new Date(startOfUtcDay(now.getTime()));
  const filters = [eq(invoices.workspaceId, workspaceId)];

  if (query.status === 'overdue') {
    filters.push(
      inArray(invoices.status, ['issued', 'partially_paid']),
      gt(invoices.balanceDueCents, 0),
      lt(invoices.dueDate, startOfDay),
    );
  } else if (query.status) {
    filters.push(eq(invoices.status, query.status));
  }
  if (query.clientId) filters.push(eq(invoices.clientId, query.clientId));
  if (query.source) filters.push(eq(invoices.source, query.source));
  if (query.search) {
    const like = `%${escapeLike(query.search)}%`;
    filters.push(
      or(
        ilike(invoices.reference, like),
        ilike(clients.companyName, like),
        ilike(invoices.notes, like),
      ),
    );
  }

  const where = and(...filters);
  const sortMap = {
    date: invoices.invoiceDate,
    due: invoices.dueDate,
    total: invoices.totalCents,
    created: invoices.createdAt,
  };
  const column = sortMap[query.sort] || invoices.invoiceDate;
  const order = query.direction === 'asc' ? asc(column) : desc(column);
  const offset = (query.page - 1) * query.pageSize;

  const [rows, totals] = await Promise.all([
    invoiceBase(db)
      .where(where)
      .orderBy(order, desc(invoices.createdAt))
      .limit(query.pageSize)
      .offset(offset),
    db
      .select({ value: count() })
      .from(invoices)
      .leftJoin(clients, eq(clients.id, invoices.clientId))
      .where(where),
  ]);

  const total = Number(totals[0]?.value || 0);
  const nowMs = now.getTime();
  return {
    items: rows.map((row) => enrichInvoice(row, nowMs)),
    total,
    page: query.page,
    pageSize: query.pageSize,
    pages: Math.max(1, Math.ceil(total / query.pageSize)),
    viewerUserId,
  };
}

export async function listPayableInvoices(workspaceId) {
  return getDb()
    .select({
      id: invoices.id,
      reference: invoices.reference,
      clientId: invoices.clientId,
      clientName: clients.companyName,
      currency: invoices.currency,
      totalCents: invoices.totalCents,
      balanceDueCents: invoices.balanceDueCents,
      dueDate: invoices.dueDate,
      status: invoices.status,
    })
    .from(invoices)
    .innerJoin(clients, eq(clients.id, invoices.clientId))
    .where(
      and(
        eq(invoices.workspaceId, workspaceId),
        inArray(invoices.status, ['issued', 'partially_paid']),
        gt(invoices.balanceDueCents, 0),
      ),
    )
    .orderBy(asc(invoices.dueDate), asc(invoices.reference))
    .limit(500);
}

export async function getInvoicesOverview(workspaceId, currency = 'INR') {
  const db = getDb();
  const now = new Date();
  const startOfDay = new Date(startOfUtcDay(now.getTime()));
  const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const inCurrency = eq(invoices.currency, currency);

  const [statusRows, outstanding, draftTotal, overdue, dueSoon, paidMonth] =
    await Promise.all([
      db
        .select({ status: invoices.status, value: count() })
        .from(invoices)
        .where(and(eq(invoices.workspaceId, workspaceId), inCurrency))
        .groupBy(invoices.status),
      db
        .select({ value: sum(invoices.balanceDueCents).mapWith(Number) })
        .from(invoices)
        .where(
          and(
            eq(invoices.workspaceId, workspaceId),
            inCurrency,
            inArray(invoices.status, BILLED_INVOICE_STATUSES),
          ),
        ),
      db
        .select({ value: sum(invoices.totalCents).mapWith(Number) })
        .from(invoices)
        .where(
          and(
            eq(invoices.workspaceId, workspaceId),
            inCurrency,
            inArray(invoices.status, ['draft', 'pending_approval', 'approved']),
          ),
        ),
      db
        .select({
          value: sum(invoices.balanceDueCents).mapWith(Number),
          total: count(),
        })
        .from(invoices)
        .where(
          and(
            eq(invoices.workspaceId, workspaceId),
            inCurrency,
            inArray(invoices.status, ['issued', 'partially_paid']),
            gt(invoices.balanceDueCents, 0),
            lt(invoices.dueDate, startOfDay),
          ),
        ),
      db
        .select({ value: sum(invoices.balanceDueCents).mapWith(Number) })
        .from(invoices)
        .where(
          and(
            eq(invoices.workspaceId, workspaceId),
            inCurrency,
            inArray(invoices.status, ['issued', 'partially_paid']),
            gt(invoices.balanceDueCents, 0),
            gte(invoices.dueDate, startOfDay),
            lt(invoices.dueDate, new Date(startOfDay.getTime() + 7 * DAY_MS)),
          ),
        ),
      db
        .select({ value: sum(payments.amountCents).mapWith(Number) })
        .from(payments)
        .innerJoin(invoices, eq(invoices.id, payments.invoiceId))
        .where(
          and(
            eq(payments.workspaceId, workspaceId),
            eq(invoices.currency, currency),
            gte(payments.paymentDate, startOfMonth),
          ),
        ),
    ]);

  const counts = Object.fromEntries(statusRows.map((row) => [row.status, Number(row.value)]));
  return {
    currency,
    counts,
    total: Object.values(counts).reduce((total, value) => total + value, 0),
    outstandingCents: Number(outstanding[0]?.value || 0),
    draftTotalCents: Number(draftTotal[0]?.value || 0),
    overdueCents: Number(overdue[0]?.value || 0),
    overdueCount: Number(overdue[0]?.total || 0),
    dueSoonCents: Number(dueSoon[0]?.value || 0),
    collectedThisMonthCents: Number(paidMonth[0]?.value || 0),
  };
}

export async function getInvoice(workspaceId, invoiceId) {
  const row = await loadInvoiceRow(workspaceId, invoiceId);
  if (!row) return null;

  const [lines, paymentRows] = await Promise.all([
    getDb()
      .select()
      .from(invoiceLineItems)
      .where(
        and(
          eq(invoiceLineItems.workspaceId, workspaceId),
          eq(invoiceLineItems.invoiceId, invoiceId),
        ),
      )
      .orderBy(asc(invoiceLineItems.displayOrder)),
    getDb()
      .select({
        id: payments.id,
        reference: payments.reference,
        paymentDate: payments.paymentDate,
        amountCents: payments.amountCents,
        method: payments.method,
        transactionReference: payments.transactionReference,
        notes: payments.notes,
        recordedByUserId: payments.recordedByUserId,
        recordedByName: users.name,
        createdAt: payments.createdAt,
      })
      .from(payments)
      .leftJoin(users, eq(users.id, payments.recordedByUserId))
      .where(
        and(eq(payments.workspaceId, workspaceId), eq(payments.invoiceId, invoiceId)),
      )
      .orderBy(desc(payments.paymentDate), desc(payments.createdAt)),
  ]);

  const enriched = enrichInvoice(row);
  return {
    invoice: enriched,
    lines,
    payments: paymentRows,
    actions: invoiceActions(row.status),
    canEdit: row.status === 'draft',
    canRecordPayment: isInvoicePayable(row.status) && row.balanceDueCents > 0,
    client: {
      id: row.clientId,
      reference: row.clientReference,
      companyName: row.clientName,
    },
    project: row.projectId
      ? { id: row.projectId, name: row.projectName, reference: row.projectReference }
      : null,
    proposal: row.proposalId
      ? { id: row.proposalId, reference: row.proposalReference }
      : null,
    engagement: row.engagementId
      ? { id: row.engagementId, name: row.engagementName }
      : null,
  };
}

export async function getInvoiceSourceOptions(workspaceId) {
  const db = getDb();
  const [clientRows, projectRows, engagementRows, proposalRows] = await Promise.all([
    db
      .select({
        id: clients.id,
        reference: clients.reference,
        companyName: clients.companyName,
        status: clients.status,
      })
      .from(clients)
      .where(eq(clients.workspaceId, workspaceId))
      .orderBy(asc(clients.companyName))
      .limit(500),
    db
      .select({
        id: projects.id,
        reference: projects.reference,
        name: projects.name,
        clientId: projects.clientId,
      })
      .from(projects)
      .where(eq(projects.workspaceId, workspaceId))
      .orderBy(desc(projects.createdAt))
      .limit(500),
    db
      .select({
        id: serviceEngagements.id,
        name: serviceEngagements.name,
        clientId: serviceEngagements.clientId,
        clientName: clients.companyName,
        status: serviceEngagements.status,
        frequency: serviceEngagements.frequency,
        contractValueCents: serviceEngagements.contractValueCents,
        currency: serviceEngagements.currency,
        projectId: serviceEngagements.projectId,
      })
      .from(serviceEngagements)
      .innerJoin(clients, eq(clients.id, serviceEngagements.clientId))
      .where(eq(serviceEngagements.workspaceId, workspaceId))
      .orderBy(desc(serviceEngagements.createdAt))
      .limit(500),
    db
      .select({
        proposalId: proposals.id,
        versionId: proposalVersions.id,
        reference: proposals.reference,
        title: proposals.title,
        versionNumber: proposalVersions.versionNumber,
        currency: proposalVersions.currency,
        oneTimeTotalCents: proposalVersions.grandTotalCents,
        recurringMonthlyCents: proposalVersions.recurringMonthlyCents,
        respondedAt: proposalVersions.respondedAt,
        clientId: clients.id,
        clientName: clients.companyName,
      })
      .from(proposals)
      .innerJoin(proposalVersions, eq(proposalVersions.id, proposals.currentVersionId))
      .innerJoin(clients, eq(clients.leadId, proposals.leadId))
      .where(
        and(
          eq(proposals.workspaceId, workspaceId),
          eq(proposals.status, 'accepted'),
          eq(proposalVersions.status, 'accepted'),
          sql`not exists (select 1 from ${invoices} i where i.workspace_id = ${workspaceId} and i.source = 'proposal' and i.source_id = ${proposalVersions.id})`,
        ),
      )
      .orderBy(desc(proposalVersions.respondedAt))
      .limit(200),
  ]);

  return {
    clients: clientRows,
    projects: projectRows,
    engagements: engagementRows.filter((row) => row.status === 'active'),
    proposals: proposalRows,
  };
}

async function proposalSnapshot(workspaceId, proposalId) {
  const rows = await getDb()
    .select({
      proposal: proposals,
      version: proposalVersions,
      clientId: clients.id,
      clientName: clients.companyName,
    })
    .from(proposals)
    .innerJoin(proposalVersions, eq(proposalVersions.id, proposals.currentVersionId))
    .leftJoin(clients, eq(clients.leadId, proposals.leadId))
    .where(and(eq(proposals.workspaceId, workspaceId), eq(proposals.id, proposalId)))
    .limit(1);
  const context = rows[0];
  if (!context) {
    throw new ApiError(
      422,
      'PROPOSAL_NOT_FOUND',
      'That proposal does not exist in this workspace.',
      { proposalId: 'Choose a proposal from this workspace.' },
    );
  }
  if (context.proposal.status !== 'accepted' || context.version.status !== 'accepted') {
    throw new ApiError(
      409,
      'PROPOSAL_NOT_ACCEPTED',
      'An invoice can be raised from a proposal only after the client accepts it.',
    );
  }
  if (!context.clientId) {
    throw new ApiError(
      409,
      'CLIENT_REQUIRED',
      'Create a client record for this accepted proposal before invoicing it.',
    );
  }
  const existing = await getDb()
    .select({ id: invoices.id, reference: invoices.reference })
    .from(invoices)
    .where(
      and(
        eq(invoices.workspaceId, workspaceId),
        eq(invoices.source, 'proposal'),
        eq(invoices.sourceId, context.version.id),
      ),
    )
    .limit(1);
  if (existing[0]) {
    throw new ApiError(
      409,
      'INVOICE_EXISTS',
      `This accepted proposal already has invoice ${existing[0].reference}.`,
    );
  }

  const items = await getDb()
    .select()
    .from(proposalLineItems)
    .where(
      and(
        eq(proposalLineItems.workspaceId, workspaceId),
        eq(proposalLineItems.versionId, context.version.id),
        eq(proposalLineItems.kind, 'included'),
      ),
    )
    .orderBy(asc(proposalLineItems.displayOrder));

  const billable = items.filter(
    (item) => !['monthly', 'quarterly', 'annual'].includes(item.billingType),
  );
  if (billable.length === 0) {
    throw new ApiError(
      409,
      'NO_BILLABLE_LINES',
      'The accepted proposal has no one-time lines to invoice.',
    );
  }

  const projectRows = await getDb()
    .select({ id: projects.id })
    .from(projects)
    .where(
      and(
        eq(projects.workspaceId, workspaceId),
        eq(projects.proposalId, context.proposal.id),
      ),
    )
    .limit(1);

  return {
    proposalId: context.proposal.id,
    proposalVersionId: context.version.id,
    sourceId: context.version.id,
    clientId: context.clientId,
    clientName: context.clientName,
    projectId: projectRows[0]?.id || null,
    currency: context.version.currency || 'INR',
    lines: billable.map((item, index) => ({
      description: item.name,
      quantity: item.quantity,
      unitPriceCents: item.unitPriceCents,
      discountType: item.discountType,
      discountValue: item.discountValue,
      taxScheme: item.taxScheme,
      taxRateBps: item.taxRateBps,
      lineSubtotalCents: item.lineSubtotalCents,
      lineDiscountCents: item.lineDiscountCents,
      lineNetCents: item.lineNetCents,
      lineTaxCents: item.lineTaxCents,
      lineTotalCents: item.lineTotalCents,
      displayOrder: index,
    })),
  };
}

async function engagementSnapshot(workspaceId, engagementId, invoiceDate, periodLabel) {
  const rows = await getDb()
    .select({
      engagement: serviceEngagements,
      clientName: clients.companyName,
    })
    .from(serviceEngagements)
    .innerJoin(clients, eq(clients.id, serviceEngagements.clientId))
    .where(
      and(
        eq(serviceEngagements.workspaceId, workspaceId),
        eq(serviceEngagements.id, engagementId),
      ),
    )
    .limit(1);
  const context = rows[0];
  if (!context) {
    throw new ApiError(
      422,
      'ENGAGEMENT_NOT_FOUND',
      'That service engagement does not exist in this workspace.',
      { engagementId: 'Choose an engagement from this workspace.' },
    );
  }
  if (context.engagement.status !== 'active') {
    throw new ApiError(
      409,
      'ENGAGEMENT_NOT_ACTIVE',
      'Only an active service engagement can be invoiced.',
    );
  }
  if (context.engagement.contractValueCents <= 0) {
    throw new ApiError(
      409,
      'NO_BILLABLE_VALUE',
      'Set a contract value on the engagement before invoicing it.',
    );
  }

  const { start, end } = monthBounds(invoiceDate);
  const existing = await getDb()
    .select({ id: invoices.id, reference: invoices.reference })
    .from(invoices)
    .where(
      and(
        eq(invoices.workspaceId, workspaceId),
        eq(invoices.engagementId, engagementId),
        sql`${invoices.status} <> 'cancelled'`,
        gte(invoices.invoiceDate, start),
        lt(invoices.invoiceDate, end),
      ),
    )
    .limit(1);
  if (existing[0]) {
    throw new ApiError(
      409,
      'ENGAGEMENT_INVOICE_EXISTS',
      `This engagement already has invoice ${existing[0].reference} for ${monthLabel(invoiceDate)}.`,
    );
  }

  const label = periodLabel ? ` — ${periodLabel}` : ` — ${monthLabel(invoiceDate)}`;
  const computed = computeInvoiceLines([
    {
      description: `${context.engagement.name}${label}`,
      quantity: 1,
      unitPriceCents: context.engagement.contractValueCents,
      taxScheme: 'none',
      taxRateBps: 0,
    },
  ]);

  return {
    engagementId,
    sourceId: null,
    clientId: context.engagement.clientId,
    clientName: context.clientName,
    projectId: context.engagement.projectId || null,
    currency: context.engagement.currency || 'INR',
    lines: computed.lines.map((line, index) => ({ ...line, displayOrder: index })),
  };
}

async function resolveInvoiceSource(workspaceId, data) {
  if (data.source === 'proposal') {
    const snapshot = await proposalSnapshot(workspaceId, data.proposalId);
    if (data.currency && data.currency !== snapshot.currency) {
      throw new ApiError(
        422,
        'CURRENCY_MISMATCH',
        'The invoice currency must match the accepted proposal.',
        { currency: `Use ${snapshot.currency}.` },
      );
    }
    const project = data.projectId
      ? await assertProject(workspaceId, data.projectId, snapshot.clientId)
      : snapshot.projectId
        ? await assertProject(workspaceId, snapshot.projectId, snapshot.clientId)
        : null;
    return {
      ...snapshot,
      projectId: project?.id || null,
      totals: totalsFromStoredLines(snapshot.lines),
    };
  }

  if (data.source === 'engagement') {
    const snapshot = await engagementSnapshot(
      workspaceId,
      data.engagementId,
      data.invoiceDate,
      data.periodLabel,
    );
    if (data.currency && data.currency !== snapshot.currency) {
      throw new ApiError(
        422,
        'CURRENCY_MISMATCH',
        'The invoice currency must match the engagement.',
        { currency: `Use ${snapshot.currency}.` },
      );
    }
    const project = data.projectId
      ? await assertProject(workspaceId, data.projectId, snapshot.clientId)
      : snapshot.projectId
        ? await assertProject(workspaceId, snapshot.projectId, snapshot.clientId)
        : null;
    return {
      ...snapshot,
      projectId: project?.id || null,
      totals: totalsFromStoredLines(snapshot.lines),
    };
  }

  const client = await assertClient(workspaceId, data.clientId);
  const computed = computeInvoiceLines(data.lines || []);
  if (computed.totals.totalCents <= 0) {
    throw new ApiError(
      422,
      'EMPTY_INVOICE',
      'Add line values so the invoice has a total above zero.',
      { lines: 'At least one line must have a positive total.' },
    );
  }
  const project = data.projectId
    ? await assertProject(workspaceId, data.projectId, client.id)
    : null;
  return {
    proposalId: null,
    proposalVersionId: null,
    engagementId: null,
    sourceId: null,
    clientId: client.id,
    clientName: client.companyName,
    projectId: project?.id || null,
    currency: data.currency || 'INR',
    lines: computed.lines.map((line, index) => ({ ...line, displayOrder: index })),
    totals: computed.totals,
  };
}

async function insertInvoiceWithLines({ workspaceId, userId, data, resolved }) {
  const baseValues = {
    workspaceId,
    clientId: resolved.clientId,
    proposalId: resolved.proposalId || null,
    proposalVersionId: resolved.proposalVersionId || null,
    projectId: resolved.projectId || null,
    engagementId: resolved.engagementId || null,
    source: data.source,
    sourceId: resolved.sourceId || null,
    currency: resolved.currency,
    invoiceDate: data.invoiceDate,
    dueDate: data.dueDate ?? null,
    status: 'draft',
    subtotalCents: resolved.totals.subtotalCents,
    discountCents: resolved.totals.discountCents,
    taxCents: resolved.totals.taxCents,
    totalCents: resolved.totals.totalCents,
    cgstCents: resolved.totals.cgstCents,
    sgstCents: resolved.totals.sgstCents,
    igstCents: resolved.totals.igstCents,
    amountPaidCents: 0,
    balanceDueCents: resolved.totals.totalCents,
    notes: data.notes ?? null,
    terms: data.terms ?? null,
    createdByUserId: userId,
    updatedByUserId: userId,
  };

  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      return await runAtomic(async (executor) => {
        const reference = await nextInvoiceReference(executor, workspaceId);
        const inserted = await executor
          .insert(invoices)
          .values({ ...baseValues, reference })
          .returning();
        const row = inserted[0];
        if (resolved.lines.length > 0) {
          await executor.insert(invoiceLineItems).values(
            resolved.lines.map((line) => ({
              workspaceId,
              invoiceId: row.id,
              description: line.description,
              quantity: line.quantity,
              unitPriceCents: line.unitPriceCents,
              discountType: line.discountType,
              discountValue: line.discountValue,
              taxScheme: line.taxScheme,
              taxRateBps: line.taxRateBps,
              lineSubtotalCents: line.lineSubtotalCents,
              lineDiscountCents: line.lineDiscountCents,
              lineNetCents: line.lineNetCents,
              lineTaxCents: line.lineTaxCents,
              lineTotalCents: line.lineTotalCents,
              displayOrder: line.displayOrder ?? 0,
            })),
          );
        }
        return row;
      });
    } catch (error) {
      if (isUniqueViolation(error) && attempt < 5) continue;
      if (isUniqueViolation(error)) {
        throw new ApiError(
          409,
          'INVOICE_EXISTS',
          'This invoice conflicts with an existing record.',
        );
      }
      throw error;
    }
  }

  throw new ApiError(409, 'REFERENCE_CONFLICT', 'Invoice numbering is busy. Try again.');
}

export async function createInvoice({ workspaceId, userId, data }) {
  const resolved = await resolveInvoiceSource(workspaceId, data);
  if (resolved.totals.totalCents <= 0) {
    throw new ApiError(
      422,
      'EMPTY_INVOICE',
      'An invoice must have a total above zero before it can be saved.',
    );
  }

  const row = await insertInvoiceWithLines({ workspaceId, userId, data, resolved });

  await recordAudit({
    workspaceId,
    actorUserId: userId,
    action: 'invoice.create',
    resourceType: 'invoice',
    resourceId: row.id,
    metadata: {
      reference: row.reference,
      source: row.source,
      totalCents: row.totalCents,
      currency: row.currency,
      clientId: row.clientId,
    },
  });

  return getInvoice(workspaceId, row.id);
}

export async function updateDraftInvoice({ workspaceId, userId, invoiceId, data }) {
  const row = await loadInvoiceRow(workspaceId, invoiceId);
  if (!row) return null;
  if (row.status !== 'draft') {
    throw new ApiError(
      409,
      'INVOICE_LOCKED',
      'Only draft invoices can be edited. Issue a correction instead.',
    );
  }

  const expected = new Date(data.expectedUpdatedAt);
  if (Number.isNaN(expected.getTime())) throw staleError('invoice');

  const computed = computeInvoiceLines(data.lines);
  if (computed.totals.totalCents <= 0) {
    throw new ApiError(
      422,
      'EMPTY_INVOICE',
      'An invoice must have a total above zero before it can be saved.',
    );
  }

  await runAtomic(async (executor) => {
    const updated = await executor
      .update(invoices)
      .set({
        invoiceDate: data.invoiceDate,
        dueDate: data.dueDate ?? null,
        currency: data.currency,
        notes: data.notes ?? null,
        terms: data.terms ?? null,
        subtotalCents: computed.totals.subtotalCents,
        discountCents: computed.totals.discountCents,
        taxCents: computed.totals.taxCents,
        totalCents: computed.totals.totalCents,
        cgstCents: computed.totals.cgstCents,
        sgstCents: computed.totals.sgstCents,
        igstCents: computed.totals.igstCents,
        balanceDueCents: computed.totals.totalCents,
        updatedByUserId: userId,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(invoices.workspaceId, workspaceId),
          eq(invoices.id, invoiceId),
          eq(invoices.status, 'draft'),
          gte(invoices.updatedAt, expected),
          lt(invoices.updatedAt, new Date(expected.getTime() + 1)),
        ),
      )
      .returning({ id: invoices.id });
    if (!updated[0]) throw staleError('invoice');

    await executor
      .delete(invoiceLineItems)
      .where(
        and(
          eq(invoiceLineItems.workspaceId, workspaceId),
          eq(invoiceLineItems.invoiceId, invoiceId),
        ),
      );
    await executor.insert(invoiceLineItems).values(
      computed.lines.map((line, index) => ({
        workspaceId,
        invoiceId,
        description: line.description,
        quantity: line.quantity,
        unitPriceCents: line.unitPriceCents,
        discountType: line.discountType,
        discountValue: line.discountValue,
        taxScheme: line.taxScheme,
        taxRateBps: line.taxRateBps,
        lineSubtotalCents: line.lineSubtotalCents,
        lineDiscountCents: line.lineDiscountCents,
        lineNetCents: line.lineNetCents,
        lineTaxCents: line.lineTaxCents,
        lineTotalCents: line.lineTotalCents,
        displayOrder: index,
      })),
    );
  });

  await recordAudit({
    workspaceId,
    actorUserId: userId,
    action: 'invoice.update',
    resourceType: 'invoice',
    resourceId: invoiceId,
    metadata: { totalCents: computed.totals.totalCents },
  });

  return getInvoice(workspaceId, invoiceId);
}

async function applyTransition({
  workspaceId,
  userId,
  invoiceId,
  from,
  to,
  patch = {},
}) {
  const updated = await getDb()
    .update(invoices)
    .set({ status: to, ...patch, updatedByUserId: userId, updatedAt: new Date() })
    .where(
      and(
        eq(invoices.workspaceId, workspaceId),
        eq(invoices.id, invoiceId),
        eq(invoices.status, from),
      ),
    )
    .returning({ id: invoices.id });

  if (!updated[0]) {
    throw new ApiError(
      409,
      'INVALID_STATE',
      `This invoice can no longer move from ${from} to ${to}.`,
      { allowed: invoiceActions(from) },
    );
  }
}

export async function submitInvoice({ workspaceId, userId, invoiceId }) {
  const row = await loadInvoiceRow(workspaceId, invoiceId);
  if (!row) return null;
  if (!canTransitionInvoice(row.status, 'pending_approval')) {
    throw new ApiError(409, 'INVALID_STATE', 'Only a draft invoice can be submitted.');
  }
  if (row.totalCents <= 0) {
    throw new ApiError(409, 'EMPTY_INVOICE', 'Add positive line items before submitting.');
  }

  await applyTransition({
    workspaceId,
    userId,
    invoiceId,
    from: 'draft',
    to: 'pending_approval',
  });

  await recordAudit({
    workspaceId,
    actorUserId: userId,
    action: 'invoice.submit',
    resourceType: 'invoice',
    resourceId: invoiceId,
    metadata: { reference: row.reference, totalCents: row.totalCents },
  });

  return getInvoice(workspaceId, invoiceId);
}

export async function approveInvoice({ workspaceId, userId, invoiceId }) {
  const row = await loadInvoiceRow(workspaceId, invoiceId);
  if (!row) return null;
  if (!canTransitionInvoice(row.status, 'approved')) {
    throw new ApiError(
      409,
      'INVALID_STATE',
      'Only an invoice pending approval can be approved.',
    );
  }

  await applyTransition({
    workspaceId,
    userId,
    invoiceId,
    from: 'pending_approval',
    to: 'approved',
    patch: { approvedByUserId: userId, approvedAt: new Date() },
  });

  await recordAudit({
    workspaceId,
    actorUserId: userId,
    action: 'invoice.approve',
    resourceType: 'invoice',
    resourceId: invoiceId,
    metadata: { reference: row.reference, totalCents: row.totalCents },
  });

  return getInvoice(workspaceId, invoiceId);
}

export async function issueInvoice({ workspaceId, userId, invoiceId }) {
  const row = await loadInvoiceRow(workspaceId, invoiceId);
  if (!row) return null;
  if (!canTransitionInvoice(row.status, 'issued')) {
    throw new ApiError(409, 'INVALID_STATE', 'Only an approved invoice can be issued.');
  }
  if (row.totalCents <= 0) {
    throw new ApiError(409, 'EMPTY_INVOICE', 'An invoice with no value cannot be issued.');
  }

  await applyTransition({
    workspaceId,
    userId,
    invoiceId,
    from: 'approved',
    to: 'issued',
    patch: { issuedByUserId: userId, issuedAt: new Date() },
  });

  await recordAudit({
    workspaceId,
    actorUserId: userId,
    action: 'invoice.issue',
    resourceType: 'invoice',
    resourceId: invoiceId,
    metadata: { reference: row.reference, totalCents: row.totalCents, currency: row.currency },
  });

  return getInvoice(workspaceId, invoiceId);
}

export async function cancelInvoice({ workspaceId, userId, invoiceId, cancellationReason }) {
  const row = await loadInvoiceRow(workspaceId, invoiceId);
  if (!row) return null;
  if (row.status === 'cancelled') {
    return { ...(await getInvoice(workspaceId, invoiceId)), changed: false };
  }
  if (row.status === 'paid' || row.amountPaidCents > 0) {
    throw new ApiError(
      409,
      'INVOICE_HAS_PAYMENTS',
      'An invoice with recorded payments cannot be cancelled. Issue a credit notice instead.',
    );
  }
  if (!canTransitionInvoice(row.status, 'cancelled')) {
    throw new ApiError(409, 'INVALID_STATE', 'This invoice can no longer be cancelled.');
  }

  await applyTransition({
    workspaceId,
    userId,
    invoiceId,
    from: row.status,
    to: 'cancelled',
    patch: {
      cancelledByUserId: userId,
      cancelledAt: new Date(),
      cancellationReason,
    },
  });

  await recordAudit({
    workspaceId,
    actorUserId: userId,
    action: 'invoice.cancel',
    resourceType: 'invoice',
    resourceId: invoiceId,
    metadata: { reference: row.reference, reason: cancellationReason },
  });

  return getInvoice(workspaceId, invoiceId);
}

function duplicateTransactionError() {
  return new ApiError(
    409,
    'DUPLICATE_TRANSACTION_REFERENCE',
    'A payment with that transaction reference already exists.',
  );
}

export async function recordPayment({ workspaceId, userId, data }) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      const result = await runAtomic(async (executor) => {
        const base = executor
          .select()
          .from(invoices)
          .where(
            and(
              eq(invoices.workspaceId, workspaceId),
              eq(invoices.id, data.invoiceId),
            ),
          );
        const locked =
          getDbDriver() === 'node-postgres' ? await base.for('update') : await base;
        const invoice = locked[0];
        if (!invoice) throw notFound();
        if (!isInvoicePayable(invoice.status)) {
          throw new ApiError(
            409,
            'INVOICE_NOT_PAYABLE',
            'Payments can be recorded only against an issued invoice.',
          );
        }
        if (data.amountCents > invoice.balanceDueCents) {
          throw new ApiError(
            409,
            'OVERPAYMENT',
            'That amount is more than the outstanding balance.',
            { amountCents: `Maximum ${invoice.balanceDueCents} minor units.` },
          );
        }

        if (data.transactionReference) {
          const duplicate = await executor
            .select({ id: payments.id })
            .from(payments)
            .where(
              and(
                eq(payments.workspaceId, workspaceId),
                eq(payments.transactionReference, data.transactionReference),
              ),
            )
            .limit(1);
          if (duplicate[0]) throw duplicateTransactionError();
        }

        const reference = await nextPaymentReference(executor, workspaceId);
        const inserted = await executor
          .insert(payments)
          .values({
            workspaceId,
            reference,
            invoiceId: invoice.id,
            clientId: invoice.clientId,
            paymentDate: data.paymentDate,
            amountCents: data.amountCents,
            method: data.method,
            transactionReference: data.transactionReference ?? null,
            notes: data.notes ?? null,
            recordedByUserId: userId,
          })
          .returning();
        const payment = inserted[0];

        const outcome = paymentOutcome({
          totalCents: invoice.totalCents,
          amountPaidCents: invoice.amountPaidCents,
          amountCents: data.amountCents,
        });

        await executor
          .update(invoices)
          .set({
            amountPaidCents: outcome.amountPaidCents,
            balanceDueCents: outcome.balanceDueCents,
            status: outcome.status,
            updatedByUserId: userId,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(invoices.workspaceId, workspaceId),
              eq(invoices.id, invoice.id),
            ),
          );

        return { payment, invoiceId: invoice.id, totalCents: invoice.totalCents };
      });

      await recordAudit({
        workspaceId,
        actorUserId: userId,
        action: 'payment.record',
        resourceType: 'payment',
        resourceId: result.payment.id,
        metadata: {
          reference: result.payment.reference,
          invoiceId: data.invoiceId,
          amountCents: data.amountCents,
          method: data.method,
        },
      });

      return {
        payment: result.payment,
        ...(await getInvoice(workspaceId, data.invoiceId)),
      };
    } catch (error) {
      if (isUniqueViolation(error)) {
        if (data.transactionReference) throw duplicateTransactionError();
        if (attempt < 5) continue;
        throw new ApiError(409, 'REFERENCE_CONFLICT', 'Payment numbering is busy. Try again.');
      }
      throw error;
    }
  }

  throw new ApiError(409, 'REFERENCE_CONFLICT', 'Payment numbering is busy. Try again.');
}

export async function listPayments(workspaceId, query) {
  const db = getDb();
  const filters = [eq(payments.workspaceId, workspaceId)];
  if (query.clientId) filters.push(eq(payments.clientId, query.clientId));
  if (query.method) filters.push(eq(payments.method, query.method));
  if (query.search) {
    const like = `%${escapeLike(query.search)}%`;
    filters.push(
      or(
        ilike(payments.reference, like),
        ilike(payments.transactionReference, like),
        ilike(invoices.reference, like),
        ilike(clients.companyName, like),
      ),
    );
  }
  const where = and(...filters);
  const offset = (query.page - 1) * query.pageSize;

  const base = () =>
    db
      .select({
        id: payments.id,
        reference: payments.reference,
        invoiceId: payments.invoiceId,
        invoiceReference: invoices.reference,
        clientId: payments.clientId,
        clientName: clients.companyName,
        paymentDate: payments.paymentDate,
        amountCents: payments.amountCents,
        currency: invoices.currency,
        method: payments.method,
        transactionReference: payments.transactionReference,
        notes: payments.notes,
        recordedByUserId: payments.recordedByUserId,
        recordedByName: users.name,
        createdAt: payments.createdAt,
      })
      .from(payments)
      .innerJoin(invoices, eq(invoices.id, payments.invoiceId))
      .innerJoin(clients, eq(clients.id, payments.clientId))
      .leftJoin(users, eq(users.id, payments.recordedByUserId));

  const [rows, totals] = await Promise.all([
    base()
      .where(where)
      .orderBy(desc(payments.paymentDate), desc(payments.createdAt))
      .limit(query.pageSize)
      .offset(offset),
    db
      .select({ value: count() })
      .from(payments)
      .innerJoin(invoices, eq(invoices.id, payments.invoiceId))
      .innerJoin(clients, eq(clients.id, payments.clientId))
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

export async function getPaymentsOverview(workspaceId, currency = 'INR') {
  const db = getDb();
  const now = new Date();
  const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const [all, month, methods] = await Promise.all([
    db
      .select({ value: sum(payments.amountCents).mapWith(Number), total: count() })
      .from(payments)
      .innerJoin(invoices, eq(invoices.id, payments.invoiceId))
      .where(
        and(
          eq(payments.workspaceId, workspaceId),
          eq(invoices.currency, currency),
        ),
      ),
    db
      .select({ value: sum(payments.amountCents).mapWith(Number) })
      .from(payments)
      .innerJoin(invoices, eq(invoices.id, payments.invoiceId))
      .where(
        and(
          eq(payments.workspaceId, workspaceId),
          eq(invoices.currency, currency),
          gte(payments.paymentDate, startOfMonth),
        ),
      ),
    db
      .select({ method: payments.method, value: sum(payments.amountCents).mapWith(Number) })
      .from(payments)
      .innerJoin(invoices, eq(invoices.id, payments.invoiceId))
      .where(
        and(
          eq(payments.workspaceId, workspaceId),
          eq(invoices.currency, currency),
        ),
      )
      .groupBy(payments.method),
  ]);
  return {
    currency,
    collectedCents: Number(all[0]?.value || 0),
    count: Number(all[0]?.total || 0),
    thisMonthCents: Number(month[0]?.value || 0),
    byMethod: methods.map((row) => ({
      method: row.method,
      amountCents: Number(row.value || 0),
    })),
  };
}

async function assertExpenseProject(workspaceId, projectId) {
  if (!projectId) return null;
  const rows = await getDb()
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.workspaceId, workspaceId), eq(projects.id, projectId)))
    .limit(1);
  if (!rows[0]) {
    throw new ApiError(422, 'PROJECT_NOT_FOUND', 'Choose a project from this workspace.');
  }
  return rows[0].id;
}

export async function createExpense({ workspaceId, userId, data }) {
  const projectId = await assertExpenseProject(workspaceId, data.projectId);
  const row = await insertWithReference({
    table: expenses,
    workspaceId,
    prefix: 'EXP-',
    values: {
      workspaceId,
      category: data.category,
      description: data.description,
      amountCents: data.amountCents,
      currency: data.currency,
      expenseDate: data.expenseDate,
      projectId: projectId || null,
      vendor: data.vendor ?? null,
      receiptReference: data.receiptReference ?? null,
      status: 'pending_approval',
      recordedByUserId: userId,
    },
  });

  await recordAudit({
    workspaceId,
    actorUserId: userId,
    action: 'expense.create',
    resourceType: 'expense',
    resourceId: row.id,
    metadata: { reference: row.reference, amountCents: data.amountCents, category: data.category },
  });

  return getExpense(workspaceId, row.id);
}

export async function getExpense(workspaceId, expenseId) {
  const rows = await getDb()
    .select({
      expense: expenses,
      projectName: projects.name,
      projectReference: projects.reference,
      recordedByName: users.name,
    })
    .from(expenses)
    .leftJoin(projects, eq(projects.id, expenses.projectId))
    .leftJoin(users, eq(users.id, expenses.recordedByUserId))
    .where(and(eq(expenses.workspaceId, workspaceId), eq(expenses.id, expenseId)))
    .limit(1);
  if (!rows[0]) return null;
  return {
    ...rows[0].expense,
    projectName: rows[0].projectName,
    projectReference: rows[0].projectReference,
    recordedByName: rows[0].recordedByName,
  };
}

export async function decideExpense({ workspaceId, userId, expenseId, data }) {
  const rows = await getDb()
    .select()
    .from(expenses)
    .where(and(eq(expenses.workspaceId, workspaceId), eq(expenses.id, expenseId)))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  if (row.status !== 'pending_approval') {
    throw new ApiError(
      409,
      'INVALID_STATE',
      'This expense has already been reviewed.',
    );
  }

  await getDb()
    .update(expenses)
    .set({
      status: data.status,
      reviewedByUserId: userId,
      reviewedAt: new Date(),
      decisionNotes: data.decisionNotes ?? null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(expenses.workspaceId, workspaceId),
        eq(expenses.id, expenseId),
        eq(expenses.status, 'pending_approval'),
      ),
    );

  await recordAudit({
    workspaceId,
    actorUserId: userId,
    action: 'expense.decision',
    resourceType: 'expense',
    resourceId: expenseId,
    metadata: { reference: row.reference, status: data.status, amountCents: row.amountCents },
  });

  return getExpense(workspaceId, expenseId);
}

export async function listExpenses(workspaceId, query) {
  const db = getDb();
  const filters = [eq(expenses.workspaceId, workspaceId)];
  if (query.status) filters.push(eq(expenses.status, query.status));
  if (query.category) filters.push(eq(expenses.category, query.category));
  if (query.projectId) filters.push(eq(expenses.projectId, query.projectId));
  if (query.search) {
    const like = `%${escapeLike(query.search)}%`;
    filters.push(
      or(
        ilike(expenses.reference, like),
        ilike(expenses.description, like),
        ilike(expenses.vendor, like),
      ),
    );
  }
  const where = and(...filters);
  const offset = (query.page - 1) * query.pageSize;

  const [rows, totals] = await Promise.all([
    db
      .select({
        id: expenses.id,
        reference: expenses.reference,
        category: expenses.category,
        description: expenses.description,
        amountCents: expenses.amountCents,
        currency: expenses.currency,
        expenseDate: expenses.expenseDate,
        projectId: expenses.projectId,
        projectName: projects.name,
        vendor: expenses.vendor,
        receiptReference: expenses.receiptReference,
        status: expenses.status,
        recordedByName: users.name,
        reviewedAt: expenses.reviewedAt,
        decisionNotes: expenses.decisionNotes,
        createdAt: expenses.createdAt,
      })
      .from(expenses)
      .leftJoin(projects, eq(projects.id, expenses.projectId))
      .leftJoin(users, eq(users.id, expenses.recordedByUserId))
      .where(where)
      .orderBy(desc(expenses.expenseDate), desc(expenses.createdAt))
      .limit(query.pageSize)
      .offset(offset),
    db.select({ value: count() }).from(expenses).where(where),
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

export async function getExpensesOverview(workspaceId, currency = 'INR') {
  const db = getDb();
  const now = new Date();
  const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const inCurrency = eq(expenses.currency, currency);
  const [statusRows, approvedMonth, categories] = await Promise.all([
    db
      .select({ status: expenses.status, value: count() })
      .from(expenses)
      .where(and(eq(expenses.workspaceId, workspaceId), inCurrency))
      .groupBy(expenses.status),
    db
      .select({ value: sum(expenses.amountCents).mapWith(Number) })
      .from(expenses)
      .where(
        and(
          eq(expenses.workspaceId, workspaceId),
          inCurrency,
          eq(expenses.status, 'approved'),
          gte(expenses.expenseDate, startOfMonth),
        ),
      ),
    db
      .select({ category: expenses.category, value: sum(expenses.amountCents).mapWith(Number) })
      .from(expenses)
      .where(
        and(
          eq(expenses.workspaceId, workspaceId),
          inCurrency,
          eq(expenses.status, 'approved'),
        ),
      )
      .groupBy(expenses.category),
  ]);

  const counts = Object.fromEntries(statusRows.map((row) => [row.status, Number(row.value)]));
  return {
    currency,
    counts,
    total: Object.values(counts).reduce((total, value) => total + value, 0),
    approvedThisMonthCents: Number(approvedMonth[0]?.value || 0),
    byCategory: categories.map((row) => ({
      category: row.category,
      amountCents: Number(row.value || 0),
    })),
    categories: EXPENSE_CATEGORIES,
  };
}

function bump(map, currency, field, value) {
  const key = currency || 'INR';
  if (!map.has(key)) {
    map.set(key, {
      currency: key,
      pipelineCents: 0,
      pipelineCount: 0,
      approvedOneTimeCents: 0,
      approvedRecurringMonthlyCents: 0,
      approvedCount: 0,
      invoicedCents: 0,
      invoiceCount: 0,
      collectedCents: 0,
      paymentCount: 0,
      outstandingCents: 0,
      overdueCents: 0,
      overdueCount: 0,
      approvedExpenseCents: 0,
    });
  }
  const row = map.get(key);
  row[field] += Number(value || 0);
}

export async function getFinanceOverview(workspaceId) {
  const db = getDb();
  const now = new Date();
  const startOfDay = new Date(startOfUtcDay(now.getTime()));

  const [
    pipelineRows,
    approvedRows,
    invoicedRows,
    collectedRows,
    outstandingRows,
    overdueRows,
    expenseRows,
    statusRows,
    recentInvoiceRows,
    recentPaymentRows,
  ] = await Promise.all([
    db
      .select({
        currency: proposalVersions.currency,
        value: sum(proposalVersions.grandTotalCents).mapWith(Number),
        total: count(),
      })
      .from(proposals)
      .innerJoin(proposalVersions, eq(proposalVersions.id, proposals.currentVersionId))
      .where(
        and(
          eq(proposals.workspaceId, workspaceId),
          inArray(proposals.status, ['draft', 'internal_review', 'approved', 'sent']),
        ),
      )
      .groupBy(proposalVersions.currency),
    db
      .select({
        currency: proposalVersions.currency,
        oneTime: sum(proposalVersions.grandTotalCents).mapWith(Number),
        recurring: sum(proposalVersions.recurringMonthlyCents).mapWith(Number),
        total: count(),
      })
      .from(proposals)
      .innerJoin(proposalVersions, eq(proposalVersions.id, proposals.currentVersionId))
      .where(
        and(
          eq(proposals.workspaceId, workspaceId),
          eq(proposals.status, 'accepted'),
          eq(proposalVersions.status, 'accepted'),
        ),
      )
      .groupBy(proposalVersions.currency),
    db
      .select({
        currency: invoices.currency,
        value: sum(invoices.totalCents).mapWith(Number),
        total: count(),
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
        currency: invoices.currency,
        value: sum(payments.amountCents).mapWith(Number),
        total: count(),
      })
      .from(payments)
      .innerJoin(invoices, eq(invoices.id, payments.invoiceId))
      .where(eq(payments.workspaceId, workspaceId))
      .groupBy(invoices.currency),
    db
      .select({
        currency: invoices.currency,
        value: sum(invoices.balanceDueCents).mapWith(Number),
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
        currency: invoices.currency,
        value: sum(invoices.balanceDueCents).mapWith(Number),
        total: count(),
      })
      .from(invoices)
      .where(
        and(
          eq(invoices.workspaceId, workspaceId),
          inArray(invoices.status, ['issued', 'partially_paid']),
          gt(invoices.balanceDueCents, 0),
          lt(invoices.dueDate, startOfDay),
        ),
      )
      .groupBy(invoices.currency),
    db
      .select({
        currency: expenses.currency,
        value: sum(expenses.amountCents).mapWith(Number),
      })
      .from(expenses)
      .where(
        and(eq(expenses.workspaceId, workspaceId), eq(expenses.status, 'approved')),
      )
      .groupBy(expenses.currency),
    db
      .select({ status: invoices.status, value: count() })
      .from(invoices)
      .where(eq(invoices.workspaceId, workspaceId))
      .groupBy(invoices.status),
    invoiceBase(db)
      .where(eq(invoices.workspaceId, workspaceId))
      .orderBy(desc(invoices.invoiceDate), desc(invoices.createdAt))
      .limit(6),
    db
      .select({
        id: payments.id,
        reference: payments.reference,
        amountCents: payments.amountCents,
        currency: invoices.currency,
        paymentDate: payments.paymentDate,
        method: payments.method,
        invoiceReference: invoices.reference,
        clientName: clients.companyName,
      })
      .from(payments)
      .innerJoin(invoices, eq(invoices.id, payments.invoiceId))
      .innerJoin(clients, eq(clients.id, payments.clientId))
      .where(eq(payments.workspaceId, workspaceId))
      .orderBy(desc(payments.paymentDate))
      .limit(6),
  ]);

  const currencies = new Map();
  for (const row of pipelineRows) {
    bump(currencies, row.currency, 'pipelineCents', row.value);
    bump(currencies, row.currency, 'pipelineCount', row.total);
  }
  for (const row of approvedRows) {
    bump(currencies, row.currency, 'approvedOneTimeCents', row.oneTime);
    bump(currencies, row.currency, 'approvedRecurringMonthlyCents', row.recurring);
    bump(currencies, row.currency, 'approvedCount', row.total);
  }
  for (const row of invoicedRows) {
    bump(currencies, row.currency, 'invoicedCents', row.value);
    bump(currencies, row.currency, 'invoiceCount', row.total);
  }
  for (const row of collectedRows) {
    bump(currencies, row.currency, 'collectedCents', row.value);
    bump(currencies, row.currency, 'paymentCount', row.total);
  }
  for (const row of outstandingRows) {
    bump(currencies, row.currency, 'outstandingCents', row.value);
  }
  for (const row of overdueRows) {
    bump(currencies, row.currency, 'overdueCents', row.value);
    bump(currencies, row.currency, 'overdueCount', row.total);
  }
  for (const row of expenseRows) {
    bump(currencies, row.currency, 'approvedExpenseCents', row.value);
  }

  const byCurrency = [...currencies.values()].sort((a, b) =>
    a.currency.localeCompare(b.currency),
  );
  const primary =
    byCurrency.find((row) => row.currency === 'INR') || byCurrency[0] || {
      currency: 'INR',
      pipelineCents: 0,
      pipelineCount: 0,
      approvedOneTimeCents: 0,
      approvedRecurringMonthlyCents: 0,
      approvedCount: 0,
      invoicedCents: 0,
      invoiceCount: 0,
      collectedCents: 0,
      paymentCount: 0,
      outstandingCents: 0,
      overdueCents: 0,
      overdueCount: 0,
      approvedExpenseCents: 0,
    };

  const statusCounts = Object.fromEntries(
    statusRows.map((row) => [row.status, Number(row.value)]),
  );

  const nowMs = now.getTime();
  return {
    asOf: now.toISOString(),
    currency: primary.currency,
    totals: primary,
    byCurrency,
    statusCounts,
    pipelineProposals: Number(primary.pipelineCount || 0),
    recentInvoices: recentInvoiceRows.map((row) => enrichInvoice(row, nowMs)),
    recentPayments: recentPaymentRows,
  };
}

export async function requestFinanceAiSummary({ workspaceId, userId, instruction = null }) {
  const overview = await getFinanceOverview(workspaceId);

  const agentRows = await getDb()
    .select({ id: agents.id, name: agents.name, type: agents.type })
    .from(agents)
    .where(
      and(
        eq(agents.workspaceId, workspaceId),
        eq(agents.enabled, true),
        isNull(agents.archivedAt),
        eq(agents.type, 'accounting_assistant'),
      ),
    )
    .orderBy(asc(agents.name))
    .limit(1);
  const agent = agentRows[0];
  if (!agent) {
    throw new ApiError(
      409,
      'NO_AGENT',
      'No enabled accounting assistant is available for finance summaries.',
    );
  }

  const totals = overview.totals;
  const prompt = [
    'You are drafting an internal finance summary. You cannot record payments, change totals, approve invoices, file returns or make tax decisions.',
    'Only summarise the figures below. Never invent amounts, due dates or receipts.',
    `Currency: ${totals.currency}`,
    `Proposal pipeline (not revenue): ${formatMinor(totals.pipelineCents, totals.currency)} across ${totals.pipelineCount} proposals`,
    `Accepted commercial value (one-time): ${formatMinor(totals.approvedOneTimeCents, totals.currency)} across ${totals.approvedCount} proposals`,
    `Accepted recurring value per month: ${formatMinor(totals.approvedRecurringMonthlyCents, totals.currency)}`,
    `Invoiced (issued or paid): ${formatMinor(totals.invoicedCents, totals.currency)} across ${totals.invoiceCount} invoices`,
    `Collected: ${formatMinor(totals.collectedCents, totals.currency)} across ${totals.paymentCount} payments`,
    `Outstanding receivables: ${formatMinor(totals.outstandingCents, totals.currency)}`,
    `Overdue receivables: ${formatMinor(totals.overdueCents, totals.currency)} across ${totals.overdueCount} invoices`,
    `Approved expenses: ${formatMinor(totals.approvedExpenseCents, totals.currency)}`,
    instruction ? `Focus: ${instruction}` : null,
  ]
    .filter(Boolean)
    .join('\n')
    .slice(0, 12_000);

  const { run, reused } = await createAgentRun({
    workspaceId,
    agentId: agent.id,
    userId,
    input: prompt,
  });

  await recordAudit({
    workspaceId,
    actorUserId: userId,
    action: 'finance.ai_summary',
    resourceType: 'invoice',
    metadata: { agentId: agent.id, runId: run.id, reused },
  });

  return { run: { id: run.id, status: run.status }, agent, reused };
}
