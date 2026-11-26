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
} from 'drizzle-orm';
import { getDb } from '@/db/client';
import {
  agents,
  clients,
  projects,
  supportTickets,
  ticketMessages,
  users,
} from '@/db/schema';
import { createAgentRun } from '@/lib/ai/runtime';
import { ApiError } from '@/lib/api-error';
import { recordAudit } from '@/lib/audit';
import { insertWithReference } from '@/lib/business/references';
import { assertMembers, escapeLike, staleError } from './helpers';
import {
  TICKET_STATUS_TRANSITIONS,
  canTransitionTicket,
} from './transitions';

const OPEN_TICKET_STATUSES = ['open', 'assigned', 'in_progress', 'waiting_client'];

function ticketNotFound() {
  return new ApiError(404, 'NOT_FOUND', 'That ticket could not be found.');
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

async function assertProject(workspaceId, projectId) {
  if (!projectId) return null;
  const rows = await getDb()
    .select({ id: projects.id })
    .from(projects)
    .where(
      and(eq(projects.workspaceId, workspaceId), eq(projects.id, projectId)),
    )
    .limit(1);
  if (!rows[0]) {
    throw new ApiError(422, 'PROJECT_NOT_FOUND', 'Choose a project from this workspace.');
  }
  return rows[0];
}

async function assertAssignee(workspaceId, userId) {
  if (!userId) return;
  const ids = await assertMembers(workspaceId, [userId]);
  if (ids.length === 0) {
    throw new ApiError(422, 'ASSIGNEE_NOT_MEMBER', 'Choose a workspace member.');
  }
}

const TICKET_SELECT = {
  id: supportTickets.id,
  reference: supportTickets.reference,
  subject: supportTickets.subject,
  description: supportTickets.description,
  category: supportTickets.category,
  priority: supportTickets.priority,
  status: supportTickets.status,
  dueDate: supportTickets.dueDate,
  resolvedAt: supportTickets.resolvedAt,
  resolutionNotes: supportTickets.resolutionNotes,
  clientId: supportTickets.clientId,
  companyName: clients.companyName,
  clientReference: clients.reference,
  projectId: supportTickets.projectId,
  projectReference: projects.reference,
  assignedUserId: supportTickets.assignedUserId,
  assigneeName: users.name,
  createdAt: supportTickets.createdAt,
  updatedAt: supportTickets.updatedAt,
};

function baseQuery() {
  return getDb()
    .select(TICKET_SELECT)
    .from(supportTickets)
    .innerJoin(clients, eq(clients.id, supportTickets.clientId))
    .leftJoin(projects, eq(projects.id, supportTickets.projectId))
    .leftJoin(users, eq(users.id, supportTickets.assignedUserId));
}

async function loadTicketRow(workspaceId, ticketId) {
  const rows = await baseQuery()
    .where(
      and(
        eq(supportTickets.workspaceId, workspaceId),
        eq(supportTickets.id, ticketId),
      ),
    )
    .limit(1);
  return rows[0] || null;
}

function enrichTicket(row, nowMs) {
  if (!row) return row;
  const due = row.dueDate ? new Date(row.dueDate).getTime() : null;
  const startOfDay = nowMs - (nowMs % 86_400_000);
  const open = OPEN_TICKET_STATUSES.includes(row.status);
  return {
    ...row,
    isOpen: open,
    isOverdue: Boolean(open && due !== null && due < startOfDay),
    isDueToday: Boolean(
      open &&
        due !== null &&
        due >= startOfDay &&
        due < startOfDay + 86_400_000,
    ),
  };
}

export async function listTickets(workspaceId, viewerUserId, query) {
  const db = getDb();
  const filters = [eq(supportTickets.workspaceId, workspaceId)];
  if (query.clientId) filters.push(eq(supportTickets.clientId, query.clientId));
  if (query.status) filters.push(eq(supportTickets.status, query.status));
  if (query.priority) filters.push(eq(supportTickets.priority, query.priority));
  if (query.assignee === 'me') {
    filters.push(eq(supportTickets.assignedUserId, viewerUserId));
  } else if (query.assignee === 'unassigned') {
    filters.push(isNull(supportTickets.assignedUserId));
  } else if (query.assignee) {
    filters.push(eq(supportTickets.assignedUserId, query.assignee));
  }

  const now = new Date();
  const startOfDay = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const startOfTomorrow = new Date(startOfDay.getTime() + 86_400_000);
  if (query.due === 'overdue') {
    filters.push(
      inArray(supportTickets.status, OPEN_TICKET_STATUSES),
      lt(supportTickets.dueDate, startOfDay),
    );
  } else if (query.due === 'today') {
    filters.push(
      inArray(supportTickets.status, OPEN_TICKET_STATUSES),
      gte(supportTickets.dueDate, startOfDay),
      lt(supportTickets.dueDate, startOfTomorrow),
    );
  }

  if (query.search) {
    const like = `%${escapeLike(query.search)}%`;
    filters.push(
      or(
        ilike(supportTickets.subject, like),
        ilike(supportTickets.reference, like),
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
        sql`case when ${supportTickets.status} in ('open','assigned','in_progress','waiting_client') then 0 else 1 end`,
        asc(supportTickets.dueDate),
        desc(supportTickets.createdAt),
      )
      .limit(query.pageSize)
      .offset(offset),
    db
      .select({ value: count() })
      .from(supportTickets)
      .innerJoin(clients, eq(clients.id, supportTickets.clientId))
      .where(where),
  ]);

  const total = Number(totals[0]?.value || 0);
  const nowMs = now.getTime();
  return {
    items: rows.map((row) => enrichTicket(row, nowMs)),
    total,
    page: query.page,
    pageSize: query.pageSize,
    pages: Math.max(1, Math.ceil(total / query.pageSize)),
  };
}

export async function getTicketsOverview(workspaceId) {
  const db = getDb();
  const now = new Date();
  const startOfDay = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const startOfTomorrow = new Date(startOfDay.getTime() + 86_400_000);

  const [statusRows, overdue, dueToday, unassigned] = await Promise.all([
    db
      .select({ status: supportTickets.status, value: count() })
      .from(supportTickets)
      .where(eq(supportTickets.workspaceId, workspaceId))
      .groupBy(supportTickets.status),
    db
      .select({ value: count() })
      .from(supportTickets)
      .where(
        and(
          eq(supportTickets.workspaceId, workspaceId),
          inArray(supportTickets.status, OPEN_TICKET_STATUSES),
          lt(supportTickets.dueDate, startOfDay),
        ),
      ),
    db
      .select({ value: count() })
      .from(supportTickets)
      .where(
        and(
          eq(supportTickets.workspaceId, workspaceId),
          inArray(supportTickets.status, OPEN_TICKET_STATUSES),
          gte(supportTickets.dueDate, startOfDay),
          lt(supportTickets.dueDate, startOfTomorrow),
        ),
      ),
    db
      .select({ value: count() })
      .from(supportTickets)
      .where(
        and(
          eq(supportTickets.workspaceId, workspaceId),
          inArray(supportTickets.status, OPEN_TICKET_STATUSES),
          isNull(supportTickets.assignedUserId),
        ),
      ),
  ]);

  const counts = {};
  for (const row of statusRows) counts[row.status] = Number(row.value || 0);

  return {
    total: Object.values(counts).reduce((sum, value) => sum + value, 0),
    open: counts.open || 0,
    assigned: counts.assigned || 0,
    inProgress: counts.in_progress || 0,
    waitingClient: counts.waiting_client || 0,
    resolved: counts.resolved || 0,
    closed: counts.closed || 0,
    openTotal: OPEN_TICKET_STATUSES.reduce(
      (sum, status) => sum + (counts[status] || 0),
      0,
    ),
    overdue: Number(overdue[0]?.value || 0),
    dueToday: Number(dueToday[0]?.value || 0),
    unassigned: Number(unassigned[0]?.value || 0),
  };
}

export async function getTicket(workspaceId, ticketId) {
  const row = await loadTicketRow(workspaceId, ticketId);
  if (!row) return null;

  const messages = await getDb()
    .select({
      id: ticketMessages.id,
      body: ticketMessages.body,
      visibility: ticketMessages.visibility,
      createdAt: ticketMessages.createdAt,
      authorUserId: ticketMessages.authorUserId,
      authorName: users.name,
    })
    .from(ticketMessages)
    .leftJoin(users, eq(users.id, ticketMessages.authorUserId))
    .where(
      and(
        eq(ticketMessages.workspaceId, workspaceId),
        eq(ticketMessages.ticketId, ticketId),
      ),
    )
    .orderBy(asc(ticketMessages.createdAt));

  return {
    ticket: enrichTicket(row, Date.now()),
    messages,
    permissionsHints: {
      canTransitionTo: [...(TICKET_STATUS_TRANSITIONS[row.status] || [])],
    },
  };
}

export async function createTicket({ workspaceId, userId, data }) {
  await assertClient(workspaceId, data.clientId);
  await assertProject(workspaceId, data.projectId);
  await assertAssignee(workspaceId, data.assignedUserId);

  const row = await insertWithReference({
    table: supportTickets,
    workspaceId,
    prefix: 'TKT-',
    values: {
      workspaceId,
      clientId: data.clientId,
      projectId: data.projectId ?? null,
      subject: data.subject,
      description: data.description ?? null,
      category: data.category || 'general',
      priority: data.priority || 'medium',
      assignedUserId: data.assignedUserId ?? null,
      status: data.assignedUserId ? 'assigned' : 'open',
      dueDate: data.dueDate ?? null,
      createdByUserId: userId,
      updatedByUserId: userId,
    },
  });

  await recordAudit({
    workspaceId,
    actorUserId: userId,
    action: 'ticket.create',
    resourceType: 'ticket',
    resourceId: row.id,
    metadata: { reference: row.reference, clientId: data.clientId },
  });

  return getTicket(workspaceId, row.id);
}

export async function updateTicket({
  workspaceId,
  userId,
  ticketId,
  data,
}) {
  const existing = await loadTicketRow(workspaceId, ticketId);
  if (!existing) return null;

  const expected = new Date(data.expectedUpdatedAt);
  if (Number.isNaN(expected.getTime())) throw staleError('ticket');

  await assertAssignee(workspaceId, data.assignedUserId);
  if (data.projectId) await assertProject(workspaceId, data.projectId);

  // Assigning an unassigned open ticket moves it into the assigned state; the
  // remaining transitions stay explicit through the status endpoint.
  let nextStatus = existing.status;
  if (
    data.assignedUserId &&
    existing.status === 'open'
  ) {
    nextStatus = 'assigned';
  }

  const updated = await getDb()
    .update(supportTickets)
    .set({
      subject: data.subject,
      description: data.description ?? null,
      category: data.category || 'general',
      priority: data.priority || 'medium',
      assignedUserId: data.assignedUserId ?? null,
      projectId: data.projectId ?? null,
      dueDate: data.dueDate ?? null,
      status: nextStatus,
      updatedByUserId: userId,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(supportTickets.workspaceId, workspaceId),
        eq(supportTickets.id, ticketId),
        gte(supportTickets.updatedAt, expected),
        lt(supportTickets.updatedAt, new Date(expected.getTime() + 1)),
      ),
    )
    .returning({ id: supportTickets.id });
  if (!updated[0]) throw staleError('ticket');

  await recordAudit({
    workspaceId,
    actorUserId: userId,
    action: 'ticket.update',
    resourceType: 'ticket',
    resourceId: ticketId,
    metadata: { fields: Object.keys(data) },
  });

  return getTicket(workspaceId, ticketId);
}

export async function changeTicketStatus({
  workspaceId,
  userId,
  ticketId,
  status,
  resolutionNotes = null,
}) {
  const existing = await loadTicketRow(workspaceId, ticketId);
  if (!existing) return null;
  if (existing.status === status) return getTicket(workspaceId, ticketId);
  if (!canTransitionTicket(existing.status, status)) {
    throw new ApiError(
      409,
      'INVALID_STATE',
      `A ticket cannot move from ${existing.status} to ${status}.`,
      { allowed: TICKET_STATUS_TRANSITIONS[existing.status] || [] },
    );
  }

  const patch = {
    status,
    updatedByUserId: userId,
    updatedAt: new Date(),
  };
  if (status === 'resolved' || status === 'closed') {
    patch.resolvedAt = existing.resolvedAt || new Date();
    if (resolutionNotes) patch.resolutionNotes = resolutionNotes;
  } else if (existing.resolvedAt) {
    // Reopening clears the resolution timestamp so overdue/aging views stay true.
    patch.resolvedAt = null;
  }

  await getDb()
    .update(supportTickets)
    .set(patch)
    .where(
      and(
        eq(supportTickets.workspaceId, workspaceId),
        eq(supportTickets.id, ticketId),
      ),
    );

  await recordAudit({
    workspaceId,
    actorUserId: userId,
    action: 'ticket.status',
    resourceType: 'ticket',
    resourceId: ticketId,
    metadata: { from: existing.status, to: status },
  });

  return getTicket(workspaceId, ticketId);
}

export async function addTicketMessage({
  workspaceId,
  userId,
  ticketId,
  data,
}) {
  const ticket = await loadTicketRow(workspaceId, ticketId);
  if (!ticket) return null;

  const rows = await getDb()
    .insert(ticketMessages)
    .values({
      workspaceId,
      ticketId,
      authorUserId: userId,
      body: data.body,
      visibility: data.visibility || 'internal',
    })
    .returning({ id: ticketMessages.id });

  await recordAudit({
    workspaceId,
    actorUserId: userId,
    action: 'ticket.message',
    resourceType: 'ticket',
    resourceId: ticketId,
    metadata: { messageId: rows[0].id, visibility: data.visibility || 'internal' },
  });

  return getTicket(workspaceId, ticketId);
}

export async function requestTicketAiDraft({
  workspaceId,
  userId,
  ticketId,
  instruction = null,
}) {
  const detail = await getTicket(workspaceId, ticketId);
  if (!detail) return null;

  const agentRows = await getDb()
    .select({ id: agents.id, name: agents.name, type: agents.type })
    .from(agents)
    .where(
      and(
        eq(agents.workspaceId, workspaceId),
        eq(agents.enabled, true),
        isNull(agents.archivedAt),
        eq(agents.type, 'customer_support'),
      ),
    )
    .orderBy(asc(agents.name))
    .limit(1);
  const agent = agentRows[0];
  if (!agent) {
    throw new ApiError(
      409,
      'NO_AGENT',
      'No enabled support assistant is available.',
    );
  }

  const prompt = [
    'You are drafting a reply for an internal agent to review. Do not send it.',
    'Never promise dates, prices or outcomes, and never invent details.',
    `Ticket: ${detail.ticket.reference} · ${detail.ticket.subject}`,
    `Category: ${detail.ticket.category} · Priority: ${detail.ticket.priority} · Status: ${detail.ticket.status}`,
    detail.ticket.description ? `Description: ${detail.ticket.description}` : null,
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
    action: 'ticket.ai_draft',
    resourceType: 'ticket',
    resourceId: ticketId,
    metadata: { agentId: agent.id, runId: run.id, reused },
  });

  return { run: { id: run.id, status: run.status }, agent, reused };
}

export { OPEN_TICKET_STATUSES };
