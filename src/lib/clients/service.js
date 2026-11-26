import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  isNull,
  lt,
  or,
  sql,
  sum,
} from 'drizzle-orm';
import { getDb } from '@/db/client';
import {
  agents,
  clientContacts,
  clientTimelineEntries,
  clients,
  invoices,
  leads,
  opportunities,
  payments,
  projectActivity,
  projects,
  proposalActivity,
  proposals,
  proposalVersions,
  serviceEngagements,
  services,
  supportTickets,
  ticketMessages,
  users,
} from '@/db/schema';
import { createAgentRun } from '@/lib/ai/runtime';
import { ApiError } from '@/lib/api-error';
import { recordAudit } from '@/lib/audit';
import { insertWithReference, isUniqueViolation } from '@/lib/business/references';
import {
  CLIENT_STATUS_TRANSITIONS,
  canTransitionClient,
} from './transitions';
import { escapeLike, staleError } from './helpers';

const OPEN_TICKET_STATUSES = [
  'open',
  'assigned',
  'in_progress',
  'waiting_client',
];

function clientNotFound() {
  return new ApiError(404, 'NOT_FOUND', 'That client could not be found.');
}

const CLIENT_SELECT = {
  id: clients.id,
  reference: clients.reference,
  companyName: clients.companyName,
  primaryContactName: clients.primaryContactName,
  email: clients.email,
  phone: clients.phone,
  website: clients.website,
  industry: clients.industry,
  address: clients.address,
  status: clients.status,
  leadId: clients.leadId,
  ownerUserId: clients.ownerUserId,
  ownerName: users.name,
  ownerEmail: users.email,
  internalNotes: clients.internalNotes,
  createdAt: clients.createdAt,
  updatedAt: clients.updatedAt,
};

const CLIENT_JOINS = (query) =>
  query.leftJoin(users, eq(users.id, clients.ownerUserId));

async function loadClientRow(workspaceId, clientId) {
  const rows = await CLIENT_JOINS(
    getDb().select(CLIENT_SELECT).from(clients),
  )
    .where(and(eq(clients.workspaceId, workspaceId), eq(clients.id, clientId)))
    .limit(1);
  return rows[0] || null;
}

export async function listClientOptions(workspaceId) {
  return getDb()
    .select({
      id: clients.id,
      reference: clients.reference,
      companyName: clients.companyName,
      status: clients.status,
    })
    .from(clients)
    .where(eq(clients.workspaceId, workspaceId))
    .orderBy(asc(clients.companyName))
    .limit(500);
}

export async function listClients(workspaceId, viewerUserId, query) {
  const db = getDb();
  const filters = [eq(clients.workspaceId, workspaceId)];
  if (query.status) filters.push(eq(clients.status, query.status));
  if (query.owner === 'me') filters.push(eq(clients.ownerUserId, viewerUserId));
  else if (query.owner === 'unassigned') filters.push(isNull(clients.ownerUserId));
  else if (query.owner) filters.push(eq(clients.ownerUserId, query.owner));
  if (query.search) {
    const like = `%${escapeLike(query.search)}%`;
    filters.push(
      or(
        ilike(clients.companyName, like),
        ilike(clients.reference, like),
        ilike(clients.primaryContactName, like),
        ilike(clients.email, like),
      ),
    );
  }
  const where = and(...filters);
  const offset = (query.page - 1) * query.pageSize;
  const order =
    query.sort === 'name'
      ? query.direction === 'asc'
        ? asc(clients.companyName)
        : desc(clients.companyName)
      : query.sort === 'updated'
        ? query.direction === 'asc'
          ? asc(clients.updatedAt)
          : desc(clients.updatedAt)
        : query.direction === 'asc'
          ? asc(clients.createdAt)
          : desc(clients.createdAt);

  const [rows, totals] = await Promise.all([
    CLIENT_JOINS(db.select(CLIENT_SELECT).from(clients))
      .where(where)
      .orderBy(order)
      .limit(query.pageSize)
      .offset(offset),
    db.select({ value: count() }).from(clients).where(where),
  ]);

  const total = Number(totals[0]?.value || 0);
  const ids = rows.map((row) => row.id);
  const stats = new Map();
  if (ids.length > 0) {
    const [projectRows, ticketRows, engagementRows] = await Promise.all([
      db
        .select({ clientId: projects.clientId, value: count() })
        .from(projects)
        .where(
          and(
            eq(projects.workspaceId, workspaceId),
            inArray(projects.clientId, ids),
          ),
        )
        .groupBy(projects.clientId),
      db
        .select({ clientId: supportTickets.clientId, value: count() })
        .from(supportTickets)
        .where(
          and(
            eq(supportTickets.workspaceId, workspaceId),
            inArray(supportTickets.clientId, ids),
            inArray(supportTickets.status, OPEN_TICKET_STATUSES),
          ),
        )
        .groupBy(supportTickets.clientId),
      db
        .select({ clientId: serviceEngagements.clientId, value: count() })
        .from(serviceEngagements)
        .where(
          and(
            eq(serviceEngagements.workspaceId, workspaceId),
            inArray(serviceEngagements.clientId, ids),
            eq(serviceEngagements.status, 'active'),
          ),
        )
        .groupBy(serviceEngagements.clientId),
    ]);
    for (const row of projectRows) {
      stats.set(row.clientId, {
        ...(stats.get(row.clientId) || {}),
        projects: Number(row.value || 0),
      });
    }
    for (const row of ticketRows) {
      stats.set(row.clientId, {
        ...(stats.get(row.clientId) || {}),
        openTickets: Number(row.value || 0),
      });
    }
    for (const row of engagementRows) {
      stats.set(row.clientId, {
        ...(stats.get(row.clientId) || {}),
        activeEngagements: Number(row.value || 0),
      });
    }
  }

  return {
    items: rows.map((row) => ({
      ...row,
      projectCount: stats.get(row.id)?.projects || 0,
      openTickets: stats.get(row.id)?.openTickets || 0,
      activeEngagements: stats.get(row.id)?.activeEngagements || 0,
    })),
    total,
    page: query.page,
    pageSize: query.pageSize,
    pages: Math.max(1, Math.ceil(total / query.pageSize)),
  };
}

export async function getClientsOverview(workspaceId) {
  const db = getDb();
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const in30 = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  const [
    statusRows,
    newThisMonth,
    activeEngagements,
    renewals,
    openTickets,
    overdueTickets,
  ] = await Promise.all([
    db
      .select({ status: clients.status, value: count() })
      .from(clients)
      .where(eq(clients.workspaceId, workspaceId))
      .groupBy(clients.status),
    db
      .select({ value: count() })
      .from(clients)
      .where(
        and(
          eq(clients.workspaceId, workspaceId),
          gte(clients.createdAt, monthStart),
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
    db
      .select({ value: count() })
      .from(serviceEngagements)
      .where(
        and(
          eq(serviceEngagements.workspaceId, workspaceId),
          eq(serviceEngagements.status, 'active'),
          gte(serviceEngagements.renewalDate, now),
          lt(serviceEngagements.renewalDate, in30),
        ),
      ),
    db
      .select({ value: count() })
      .from(supportTickets)
      .where(
        and(
          eq(supportTickets.workspaceId, workspaceId),
          inArray(supportTickets.status, OPEN_TICKET_STATUSES),
        ),
      ),
    db
      .select({ value: count() })
      .from(supportTickets)
      .where(
        and(
          eq(supportTickets.workspaceId, workspaceId),
          inArray(supportTickets.status, OPEN_TICKET_STATUSES),
          lt(supportTickets.dueDate, now),
        ),
      ),
  ]);

  const statusCounts = {};
  for (const row of statusRows) statusCounts[row.status] = Number(row.value || 0);

  return {
    total: Object.values(statusCounts).reduce((total, value) => total + value, 0),
    active: statusCounts.active || 0,
    inactive: statusCounts.inactive || 0,
    archived: statusCounts.archived || 0,
    newThisMonth: Number(newThisMonth[0]?.value || 0),
    activeEngagements: Number(activeEngagements[0]?.value || 0),
    upcomingRenewals: Number(renewals[0]?.value || 0),
    openTickets: Number(openTickets[0]?.value || 0),
    overdueTickets: Number(overdueTickets[0]?.value || 0),
  };
}

export async function createClient({ workspaceId, userId, data }) {
  let lead = null;
  if (data.leadId) {
    const rows = await getDb()
      .select({
        id: leads.id,
        companyName: leads.companyName,
        contactName: leads.contactName,
        email: leads.email,
        phone: leads.phone,
        website: leads.website,
        industry: leads.industry,
        ownerUserId: leads.assignedUserId,
      })
      .from(leads)
      .where(and(eq(leads.workspaceId, workspaceId), eq(leads.id, data.leadId)))
      .limit(1);
    lead = rows[0];
    if (!lead) {
      throw new ApiError(
        422,
        'LEAD_NOT_FOUND',
        'Choose a lead that belongs to this workspace.',
        { leadId: 'Choose a lead from this workspace.' },
      );
    }
  }

  let row;
  try {
    row = await insertWithReference({
      table: clients,
      workspaceId,
      prefix: 'CLI-',
      values: {
        workspaceId,
        leadId: lead?.id ?? null,
        companyName: lead?.companyName || data.companyName,
        primaryContactName:
          data.primaryContactName ?? lead?.contactName ?? null,
        email: data.email ?? lead?.email ?? null,
        phone: data.phone ?? lead?.phone ?? null,
        website: data.website ?? lead?.website ?? null,
        industry: data.industry ?? lead?.industry ?? null,
        address: data.address ?? null,
        ownerUserId: data.ownerUserId ?? lead?.ownerUserId ?? userId,
        status: 'active',
        internalNotes: data.internalNotes ?? null,
        createdByUserId: userId,
        updatedByUserId: userId,
      },
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ApiError(
        409,
        'CLIENT_EXISTS',
        'A client already exists for this lead.',
      );
    }
    throw error;
  }

  if (lead?.id) {
    // Existing delivery records created before the client record keep their
    // history and are linked by lead, never merged or rewritten.
    await getDb()
      .update(projects)
      .set({ clientId: row.id })
      .where(
        and(
          eq(projects.workspaceId, workspaceId),
          eq(projects.leadId, lead.id),
          isNull(projects.clientId),
        ),
      );
  }

  await recordAudit({
    workspaceId,
    actorUserId: userId,
    action: 'client.create',
    resourceType: 'client',
    resourceId: row.id,
    metadata: { reference: row.reference, leadId: lead?.id ?? null },
  });

  return getClient(workspaceId, row.id);
}

export async function updateClient({ workspaceId, userId, clientId, data }) {
  const existing = await loadClientRow(workspaceId, clientId);
  if (!existing) return null;

  const expected = new Date(data.expectedUpdatedAt);
  if (Number.isNaN(expected.getTime())) throw staleError('client');

  if (data.status && data.status !== existing.status) {
    if (!canTransitionClient(existing.status, data.status)) {
      throw new ApiError(
        409,
        'INVALID_STATE',
        `A client cannot move from ${existing.status} to ${data.status}.`,
        { allowed: CLIENT_STATUS_TRANSITIONS[existing.status] || [] },
      );
    }
  }
  if (data.ownerUserId) {
    const rows = await getDb()
      .select({ userId: users.id })
      .from(users)
      .where(eq(users.id, data.ownerUserId))
      .limit(1);
    if (!rows[0]) {
      throw new ApiError(422, 'OWNER_NOT_FOUND', 'Choose a workspace member.');
    }
  }

  const patch = {
    companyName: data.companyName,
    primaryContactName: data.primaryContactName ?? null,
    email: data.email ?? null,
    phone: data.phone ?? null,
    website: data.website ?? null,
    industry: data.industry ?? null,
    address: data.address ?? null,
    internalNotes: data.internalNotes ?? null,
    updatedByUserId: userId,
    updatedAt: new Date(),
  };
  if (data.ownerUserId !== undefined) patch.ownerUserId = data.ownerUserId;
  if (data.status !== undefined) patch.status = data.status;

  const updated = await getDb()
    .update(clients)
    .set(patch)
    .where(
      and(
        eq(clients.workspaceId, workspaceId),
        eq(clients.id, clientId),
        gte(clients.updatedAt, expected),
        lt(clients.updatedAt, new Date(expected.getTime() + 1)),
      ),
    )
    .returning({ id: clients.id });
  if (!updated[0]) throw staleError('client');

  await recordAudit({
    workspaceId,
    actorUserId: userId,
    action: 'client.update',
    resourceType: 'client',
    resourceId: clientId,
    metadata: { fields: Object.keys(patch) },
  });

  return getClient(workspaceId, clientId);
}

export async function changeClientStatus({
  workspaceId,
  userId,
  clientId,
  status,
  note = null,
}) {
  const client = await loadClientRow(workspaceId, clientId);
  if (!client) return null;
  if (client.status === status) return getClient(workspaceId, clientId);
  if (!canTransitionClient(client.status, status)) {
    throw new ApiError(
      409,
      'INVALID_STATE',
      `A client cannot move from ${client.status} to ${status}.`,
      { allowed: CLIENT_STATUS_TRANSITIONS[client.status] || [] },
    );
  }

  await getDb()
    .update(clients)
    .set({ status, updatedByUserId: userId, updatedAt: new Date() })
    .where(
      and(eq(clients.workspaceId, workspaceId), eq(clients.id, clientId)),
    );

  if (note) {
    await getDb().insert(clientTimelineEntries).values({
      workspaceId,
      clientId,
      type: 'note',
      title: `Status changed to ${status}`,
      body: note,
      actorUserId: userId,
      metadata: { from: client.status, to: status },
    });
  }

  await recordAudit({
    workspaceId,
    actorUserId: userId,
    action: 'client.status',
    resourceType: 'client',
    resourceId: clientId,
    metadata: { from: client.status, to: status },
  });

  return getClient(workspaceId, clientId);
}

export async function createContact({ workspaceId, userId, clientId, data }) {
  const client = await loadClientRow(workspaceId, clientId);
  if (!client) throw clientNotFound();

  const rows = await getDb()
    .insert(clientContacts)
    .values({
      workspaceId,
      clientId,
      name: data.name,
      title: data.title ?? null,
      email: data.email ?? null,
      phone: data.phone ?? null,
      isPrimary: Boolean(data.isPrimary),
      notes: data.notes ?? null,
      createdByUserId: userId,
    })
    .returning({ id: clientContacts.id });

  if (data.isPrimary) {
    await getDb()
      .update(clientContacts)
      .set({ isPrimary: false })
      .where(
        and(
          eq(clientContacts.workspaceId, workspaceId),
          eq(clientContacts.clientId, clientId),
          eq(clientContacts.isPrimary, true),
        ),
      );
    await getDb()
      .update(clientContacts)
      .set({ isPrimary: true })
      .where(eq(clientContacts.id, rows[0].id));
  }

  await recordAudit({
    workspaceId,
    actorUserId: userId,
    action: 'client.contact_create',
    resourceType: 'client',
    resourceId: clientId,
    metadata: { contactId: rows[0].id },
  });

  return getClient(workspaceId, clientId);
}

export async function updateContact({
  workspaceId,
  userId,
  clientId,
  contactId,
  data,
}) {
  const client = await loadClientRow(workspaceId, clientId);
  if (!client) throw clientNotFound();

  const existing = await getDb()
    .select()
    .from(clientContacts)
    .where(
      and(
        eq(clientContacts.workspaceId, workspaceId),
        eq(clientContacts.clientId, clientId),
        eq(clientContacts.id, contactId),
      ),
    )
    .limit(1);
  if (!existing[0]) {
    throw new ApiError(404, 'NOT_FOUND', 'That contact could not be found.');
  }

  await getDb()
    .update(clientContacts)
    .set({
      name: data.name,
      title: data.title ?? null,
      email: data.email ?? null,
      phone: data.phone ?? null,
      notes: data.notes ?? null,
      isPrimary: Boolean(data.isPrimary),
      updatedAt: new Date(),
    })
    .where(eq(clientContacts.id, contactId));

  if (data.isPrimary) {
    await getDb()
      .update(clientContacts)
      .set({ isPrimary: false })
      .where(
        and(
          eq(clientContacts.workspaceId, workspaceId),
          eq(clientContacts.clientId, clientId),
          eq(clientContacts.isPrimary, true),
        ),
      );
    await getDb()
      .update(clientContacts)
      .set({ isPrimary: true })
      .where(eq(clientContacts.id, contactId));
  }

  await recordAudit({
    workspaceId,
    actorUserId: userId,
    action: 'client.contact_update',
    resourceType: 'client',
    resourceId: clientId,
    metadata: { contactId },
  });

  return getClient(workspaceId, clientId);
}

export async function addTimelineEntry({ workspaceId, userId, clientId, data }) {
  const client = await loadClientRow(workspaceId, clientId);
  if (!client) throw clientNotFound();

  const rows = await getDb()
    .insert(clientTimelineEntries)
    .values({
      workspaceId,
      clientId,
      type: data.type || 'note',
      title: data.title,
      body: data.body ?? null,
      occurredAt: data.occurredAt ?? new Date(),
      actorUserId: userId,
    })
    .returning({ id: clientTimelineEntries.id });

  await recordAudit({
    workspaceId,
    actorUserId: userId,
    action: 'client.timeline_entry',
    resourceType: 'client',
    resourceId: clientId,
    metadata: { entryId: rows[0].id, type: data.type || 'note' },
  });

  return getClientTimeline(workspaceId, clientId);
}

export async function getClientTimeline(workspaceId, clientId) {
  const client = await loadClientRow(workspaceId, clientId);
  if (!client) return null;

  const projectFilter = client.leadId
    ? or(eq(projects.clientId, clientId), eq(projects.leadId, client.leadId))
    : eq(projects.clientId, clientId);

  const [
    manualRows,
    projectRows,
    ticketRows,
    proposalRows,
    invoiceRows,
    paymentRows,
  ] = await Promise.all([
    getDb()
      .select({
        id: clientTimelineEntries.id,
        type: clientTimelineEntries.type,
        title: clientTimelineEntries.title,
        body: clientTimelineEntries.body,
        occurredAt: clientTimelineEntries.occurredAt,
        actorName: users.name,
      })
      .from(clientTimelineEntries)
      .leftJoin(users, eq(users.id, clientTimelineEntries.actorUserId))
      .where(
        and(
          eq(clientTimelineEntries.workspaceId, workspaceId),
          eq(clientTimelineEntries.clientId, clientId),
        ),
      )
      .orderBy(desc(clientTimelineEntries.occurredAt))
      .limit(100),
    getDb()
      .select({
        id: projectActivity.id,
        type: projectActivity.type,
        body: projectActivity.body,
        occurredAt: projectActivity.createdAt,
        actorName: users.name,
        projectReference: projects.reference,
      })
      .from(projectActivity)
      .innerJoin(projects, eq(projects.id, projectActivity.projectId))
      .leftJoin(users, eq(users.id, projectActivity.actorUserId))
      .where(and(eq(projectActivity.workspaceId, workspaceId), projectFilter))
      .orderBy(desc(projectActivity.createdAt))
      .limit(60),
    getDb()
      .select({
        id: supportTickets.id,
        reference: supportTickets.reference,
        subject: supportTickets.subject,
        status: supportTickets.status,
        occurredAt: supportTickets.createdAt,
        resolvedAt: supportTickets.resolvedAt,
      })
      .from(supportTickets)
      .where(
        and(
          eq(supportTickets.workspaceId, workspaceId),
          eq(supportTickets.clientId, clientId),
        ),
      )
      .orderBy(desc(supportTickets.createdAt))
      .limit(60),
    client.leadId
      ? getDb()
          .select({
            id: proposalActivity.id,
            type: proposalActivity.type,
            body: proposalActivity.body,
            occurredAt: proposalActivity.createdAt,
            actorName: users.name,
            proposalReference: proposals.reference,
          })
          .from(proposalActivity)
          .innerJoin(proposals, eq(proposals.id, proposalActivity.proposalId))
          .leftJoin(users, eq(users.id, proposalActivity.actorUserId))
          .where(
            and(
              eq(proposalActivity.workspaceId, workspaceId),
              eq(proposals.leadId, client.leadId),
            ),
          )
          .orderBy(desc(proposalActivity.createdAt))
          .limit(60)
      : Promise.resolve([]),
    getDb()
      .select({
        id: invoices.id,
        reference: invoices.reference,
        status: invoices.status,
        totalCents: invoices.totalCents,
        currency: invoices.currency,
        issuedAt: invoices.issuedAt,
        createdAt: invoices.createdAt,
      })
      .from(invoices)
      .where(
        and(
          eq(invoices.workspaceId, workspaceId),
          eq(invoices.clientId, clientId),
        ),
      )
      .orderBy(desc(invoices.createdAt))
      .limit(60),
    getDb()
      .select({
        id: payments.id,
        reference: payments.reference,
        amountCents: payments.amountCents,
        currency: invoices.currency,
        paymentDate: payments.paymentDate,
        invoiceReference: invoices.reference,
      })
      .from(payments)
      .innerJoin(invoices, eq(invoices.id, payments.invoiceId))
      .where(
        and(eq(payments.workspaceId, workspaceId), eq(payments.clientId, clientId)),
      )
      .orderBy(desc(payments.paymentDate))
      .limit(60),
  ]);

  const events = [];
  for (const row of manualRows) {
    events.push({
      id: `manual-${row.id}`,
      source: 'manual',
      type: row.type,
      title: row.title,
      body: row.body,
      occurredAt: row.occurredAt,
      actorName: row.actorName,
    });
  }
  for (const row of projectRows) {
    events.push({
      id: `project-${row.id}`,
      source: 'project',
      type: row.type,
      title: row.projectReference,
      body: row.body,
      occurredAt: row.occurredAt,
      actorName: row.actorName,
    });
  }
  for (const row of ticketRows) {
    events.push({
      id: `ticket-${row.id}`,
      source: 'support',
      type: 'ticket',
      title: `${row.reference} · ${row.subject}`,
      body: `Support ticket is ${row.status}.`,
      occurredAt: row.occurredAt,
      ticketId: row.id,
    });
    if (row.resolvedAt) {
      events.push({
        id: `ticket-resolved-${row.id}`,
        source: 'support',
        type: 'ticket_resolved',
        title: `${row.reference} resolved`,
        body: null,
        occurredAt: row.resolvedAt,
        ticketId: row.id,
      });
    }
  }
  for (const row of proposalRows) {
    events.push({
      id: `proposal-${row.id}`,
      source: 'proposal',
      type: row.type,
      title: row.proposalReference,
      body: row.body,
      occurredAt: row.occurredAt,
      actorName: row.actorName,
    });
  }
  for (const row of invoiceRows) {
    if (!row.issuedAt) continue;
    events.push({
      id: `invoice-${row.id}`,
      source: 'billing',
      type: 'invoice_issued',
      title: `Invoice ${row.reference} issued`,
      body: `Total ${(row.totalCents / 100).toFixed(2)} ${row.currency}.`,
      occurredAt: row.issuedAt,
      invoiceId: row.id,
    });
  }
  for (const row of paymentRows) {
    events.push({
      id: `payment-${row.id}`,
      source: 'billing',
      type: 'payment_recorded',
      title: `Payment ${row.reference} for ${row.invoiceReference}`,
      body: `Recorded ${(row.amountCents / 100).toFixed(2)} ${row.currency}.`,
      occurredAt: row.paymentDate,
      invoiceId: null,
    });
  }

  events.sort(
    (left, right) =>
      new Date(right.occurredAt).getTime() - new Date(left.occurredAt).getTime(),
  );

  return { client, events: events.slice(0, 200) };
}

export async function getClient(workspaceId, clientId) {
  const client = await loadClientRow(workspaceId, clientId);
  if (!client) return null;

  const projectFilter = client.leadId
    ? or(eq(projects.clientId, clientId), eq(projects.leadId, client.leadId))
    : eq(projects.clientId, clientId);

  const [
    contactRows,
    leadRows,
    projectRows,
    proposalRows,
    engagementRows,
    ticketRows,
    invoiceSummary,
    paymentSummary,
    recentInvoices,
    recentPayments,
    timeline,
  ] = await Promise.all([
    getDb()
      .select()
      .from(clientContacts)
      .where(
        and(
          eq(clientContacts.workspaceId, workspaceId),
          eq(clientContacts.clientId, clientId),
        ),
      )
      .orderBy(desc(clientContacts.isPrimary), asc(clientContacts.createdAt)),
    client.leadId
      ? getDb()
          .select({
            id: leads.id,
            companyName: leads.companyName,
            contactName: leads.contactName,
            email: leads.email,
            phone: leads.phone,
            status: leads.status,
            createdAt: leads.createdAt,
          })
          .from(leads)
          .where(and(eq(leads.workspaceId, workspaceId), eq(leads.id, client.leadId)))
          .limit(1)
      : Promise.resolve([]),
    getDb()
      .select({
        id: projects.id,
        clientId: projects.clientId,
        reference: projects.reference,
        name: projects.name,
        status: projects.status,
        priority: projects.priority,
        acceptedValueCents: projects.acceptedValueCents,
        currency: projects.currency,
        startDate: projects.startDate,
        expectedCompletionDate: projects.expectedCompletionDate,
        actualCompletionDate: projects.actualCompletionDate,
        ownerName: users.name,
      })
      .from(projects)
      .leftJoin(users, eq(users.id, projects.ownerUserId))
      .where(and(eq(projects.workspaceId, workspaceId), projectFilter))
      .orderBy(desc(projects.createdAt)),
    client.leadId
      ? getDb()
          .select({
            id: proposals.id,
            reference: proposals.reference,
            title: proposals.title,
            status: proposals.status,
            currency: proposalVersions.currency,
            grandTotalCents: proposalVersions.grandTotalCents,
            recurringMonthlyCents: proposalVersions.recurringMonthlyCents,
            versionNumber: proposalVersions.versionNumber,
            respondedAt: proposalVersions.respondedAt,
            createdAt: proposals.createdAt,
          })
          .from(proposals)
          .leftJoin(
            proposalVersions,
            eq(proposalVersions.id, proposals.currentVersionId),
          )
          .where(and(eq(proposals.workspaceId, workspaceId), eq(proposals.leadId, client.leadId)))
          .orderBy(desc(proposals.createdAt))
      : Promise.resolve([]),
    getDb()
      .select({
        id: serviceEngagements.id,
        name: serviceEngagements.name,
        status: serviceEngagements.status,
        frequency: serviceEngagements.frequency,
        startDate: serviceEngagements.startDate,
        endDate: serviceEngagements.endDate,
        renewalDate: serviceEngagements.renewalDate,
        contractValueCents: serviceEngagements.contractValueCents,
        currency: serviceEngagements.currency,
        managerName: users.name,
        serviceName: services.name,
        projectId: serviceEngagements.projectId,
        proposalId: serviceEngagements.proposalId,
      })
      .from(serviceEngagements)
      .leftJoin(users, eq(users.id, serviceEngagements.managerUserId))
      .leftJoin(services, eq(services.id, serviceEngagements.serviceId))
      .where(
        and(
          eq(serviceEngagements.workspaceId, workspaceId),
          eq(serviceEngagements.clientId, clientId),
        ),
      )
      .orderBy(desc(serviceEngagements.createdAt)),
    getDb()
      .select({
        id: supportTickets.id,
        reference: supportTickets.reference,
        subject: supportTickets.subject,
        status: supportTickets.status,
        priority: supportTickets.priority,
        category: supportTickets.category,
        dueDate: supportTickets.dueDate,
        resolvedAt: supportTickets.resolvedAt,
        assignedName: users.name,
        createdAt: supportTickets.createdAt,
      })
      .from(supportTickets)
      .leftJoin(users, eq(users.id, supportTickets.assignedUserId))
      .where(
        and(
          eq(supportTickets.workspaceId, workspaceId),
          eq(supportTickets.clientId, clientId),
        ),
      )
      .orderBy(desc(supportTickets.createdAt)),
    getDb()
      .select({
        issuedTotalCents: sum(invoices.totalCents).mapWith(Number),
        paidTotalCents: sum(invoices.amountPaidCents).mapWith(Number),
        outstandingCents: sum(invoices.balanceDueCents).mapWith(Number),
        invoiceCount: count(),
      })
      .from(invoices)
      .where(
        and(
          eq(invoices.workspaceId, workspaceId),
          eq(invoices.clientId, clientId),
          inArray(invoices.status, [
            'issued',
            'partially_paid',
            'paid',
          ]),
        ),
      ),
    getDb()
      .select({
        collectedCents: sum(payments.amountCents).mapWith(Number),
        paymentCount: count(),
      })
      .from(payments)
      .where(
        and(eq(payments.workspaceId, workspaceId), eq(payments.clientId, clientId)),
      ),
    getDb()
      .select({
        id: invoices.id,
        reference: invoices.reference,
        status: invoices.status,
        invoiceDate: invoices.invoiceDate,
        dueDate: invoices.dueDate,
        currency: invoices.currency,
        totalCents: invoices.totalCents,
        amountPaidCents: invoices.amountPaidCents,
        balanceDueCents: invoices.balanceDueCents,
      })
      .from(invoices)
      .where(
        and(eq(invoices.workspaceId, workspaceId), eq(invoices.clientId, clientId)),
      )
      .orderBy(desc(invoices.invoiceDate))
      .limit(10),
    getDb()
      .select({
        id: payments.id,
        reference: payments.reference,
        amountCents: payments.amountCents,
        currency: invoices.currency,
        paymentDate: payments.paymentDate,
        invoiceReference: invoices.reference,
      })
      .from(payments)
      .innerJoin(invoices, eq(invoices.id, payments.invoiceId))
      .where(
        and(eq(payments.workspaceId, workspaceId), eq(payments.clientId, clientId)),
      )
      .orderBy(desc(payments.paymentDate))
      .limit(10),
    getClientTimeline(workspaceId, clientId),
  ]);

  return {
    client,
    lead: leadRows[0] || null,
    contacts: contactRows,
    projects: projectRows,
    proposals: proposalRows,
    engagements: engagementRows,
    tickets: ticketRows,
    billing: {
      invoiceCount: Number(invoiceSummary[0]?.invoiceCount || 0),
      issuedTotalCents: Number(invoiceSummary[0]?.issuedTotalCents || 0),
      paidTotalCents: Number(invoiceSummary[0]?.paidTotalCents || 0),
      outstandingCents: Number(invoiceSummary[0]?.outstandingCents || 0),
      collectedCents: Number(paymentSummary[0]?.collectedCents || 0),
      paymentCount: Number(paymentSummary[0]?.paymentCount || 0),
      recentInvoices,
      recentPayments,
    },
    timeline: timeline?.events || [],
  };
}

export async function requestClientAiBrief({
  workspaceId,
  userId,
  clientId,
  instruction = null,
}) {
  const detail = await getClient(workspaceId, clientId);
  if (!detail) return null;

  const agentRows = await getDb()
    .select({ id: agents.id, name: agents.name, type: agents.type })
    .from(agents)
    .where(
      and(
        eq(agents.workspaceId, workspaceId),
        eq(agents.enabled, true),
        isNull(agents.archivedAt),
        inArray(agents.type, ['customer_support', 'documentation_assistant']),
      ),
    )
    .orderBy(
      sql`case when ${agents.type} = 'customer_support' then 0 else 1 end`,
      asc(agents.name),
    )
    .limit(1);
  const agent = agentRows[0];
  if (!agent) {
    throw new ApiError(
      409,
      'NO_AGENT',
      'No enabled assistant is available for client summaries.',
    );
  }

  const prompt = [
    'You are drafting an internal client brief. Do not send anything to the client.',
    'Only summarise the data below. Never invent commitments, dates, prices or communications.',
    `Client: ${detail.client.companyName} (${detail.client.reference})`,
    `Status: ${detail.client.status}`,
    `Projects: ${detail.projects.length} · active engagements: ${
      detail.engagements.filter((entry) => entry.status === 'active').length
    } · open tickets: ${
      detail.tickets.filter((entry) =>
        ['open', 'assigned', 'in_progress', 'waiting_client'].includes(entry.status),
      ).length
    }`,
    `Outstanding receivables: ${(detail.billing.outstandingCents / 100).toFixed(2)}`,
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
    action: 'client.ai_brief',
    resourceType: 'client',
    resourceId: clientId,
    metadata: { agentId: agent.id, runId: run.id, reused },
  });

  return { run: { id: run.id, status: run.status }, agent, reused };
}

export async function getTicketMessagesForClient(workspaceId, clientId) {
  const rows = await getDb()
    .select({ value: count() })
    .from(ticketMessages)
    .innerJoin(supportTickets, eq(supportTickets.id, ticketMessages.ticketId))
    .where(
      and(
        eq(ticketMessages.workspaceId, workspaceId),
        eq(supportTickets.clientId, clientId),
      ),
    );
  return Number(rows[0]?.value || 0);
}

export async function listClientProjects(workspaceId, clientId) {
  return getDb()
    .select({
      id: projects.id,
      reference: projects.reference,
      name: projects.name,
      status: projects.status,
    })
    .from(projects)
    .where(
      and(eq(projects.workspaceId, workspaceId), eq(projects.clientId, clientId)),
    )
    .orderBy(desc(projects.createdAt));
}

export async function listOpenTicketsForClient(workspaceId, clientId) {
  return getDb()
    .select({
      id: supportTickets.id,
      reference: supportTickets.reference,
      subject: supportTickets.subject,
      status: supportTickets.status,
      priority: supportTickets.priority,
      dueDate: supportTickets.dueDate,
    })
    .from(supportTickets)
    .where(
      and(
        eq(supportTickets.workspaceId, workspaceId),
        eq(supportTickets.clientId, clientId),
        inArray(supportTickets.status, OPEN_TICKET_STATUSES),
      ),
    )
    .orderBy(asc(supportTickets.dueDate));
}

export async function listClientOpportunities(workspaceId, clientId) {
  const client = await loadClientRow(workspaceId, clientId);
  if (!client?.leadId) return [];
  return getDb()
    .select({
      id: opportunities.id,
      title: opportunities.title,
      stage: opportunities.stage,
      expectedValueCents: opportunities.expectedValueCents,
      currency: opportunities.currency,
      updatedAt: opportunities.updatedAt,
    })
    .from(opportunities)
    .where(
      and(
        eq(opportunities.workspaceId, workspaceId),
        eq(opportunities.leadId, client.leadId),
      ),
    )
    .orderBy(desc(opportunities.updatedAt));
}

export { CLIENT_STATUS_TRANSITIONS };
