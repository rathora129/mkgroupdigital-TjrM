import { and, asc, desc, eq } from 'drizzle-orm';
import { getDb } from '@/db/client';
import {
  clientTimelineEntries,
  clients,
  invoices,
  leadActivities,
  meetings,
  projectActivity,
  projectStatusHistory,
  projectTasks,
  projects,
  proposals,
  proposalVersions,
  users,
} from '@/db/schema';
import { ApiError } from '@/lib/api-error';
import { recordAudit } from '@/lib/audit';
import { insertWithReference, isUniqueViolation } from '@/lib/business/references';
import { createClient } from '@/lib/clients/service';
import { createProject } from '@/lib/projects/service';
import { getLead } from '@/lib/leads/service';

// Phase 2I — Won-lead conversion.
//
// A lead converts at most once. The client keeps the lead link so the sales
// history stays in place; an existing project created against the lead is
// relinked by createClient rather than rewritten. Imported/reported money is
// copied into a clearly labelled, unverified snapshot and never becomes an
// accepted proposal total or a recorded payment.

function reportedAmounts(lead) {
  return {
    receivedCents: lead.reportedAmountReceivedCents ?? null,
    outstandingCents: lead.reportedOutstandingCents ?? null,
    projectCostCents: lead.reportedProjectCostCents ?? null,
    verified: Boolean(lead.reportedAmountVerified),
  };
}

async function acceptedProposalsFor(workspaceId, leadId) {
  return getDb()
    .select({
      id: proposals.id,
      reference: proposals.reference,
      title: proposals.title,
      versionNumber: proposalVersions.versionNumber,
      currency: proposalVersions.currency,
      grandTotalCents: proposalVersions.grandTotalCents,
    })
    .from(proposals)
    .innerJoin(proposalVersions, eq(proposalVersions.id, proposals.currentVersionId))
    .where(
      and(
        eq(proposals.workspaceId, workspaceId),
        eq(proposals.leadId, leadId),
        eq(proposals.status, 'accepted'),
        eq(proposalVersions.status, 'accepted'),
      ),
    )
    .orderBy(desc(proposals.updatedAt));
}

export async function getLeadConversionPreview({
  workspaceId,
  leadId,
  access = null,
}) {
  const detail = await getLead(workspaceId, leadId, access);
  if (!detail) return null;
  const lead = detail.lead;
  if (lead.archivedAt) {
    throw new ApiError(409, 'LEAD_ARCHIVED', 'Restore this lead before converting it.');
  }

  const [clientRows, projectRows, proposalOptions] = await Promise.all([
    getDb()
      .select({
        id: clients.id,
        reference: clients.reference,
        companyName: clients.companyName,
        status: clients.status,
      })
      .from(clients)
      .where(and(eq(clients.workspaceId, workspaceId), eq(clients.leadId, leadId)))
      .limit(1),
    getDb()
      .select({
        id: projects.id,
        reference: projects.reference,
        name: projects.name,
        status: projects.status,
      })
      .from(projects)
      .where(and(eq(projects.workspaceId, workspaceId), eq(projects.leadId, leadId)))
      .orderBy(asc(projects.createdAt)),
    acceptedProposalsFor(workspaceId, leadId),
  ]);

  const client = clientRows[0] || null;
  return {
    lead: {
      id: lead.id,
      companyName: lead.companyName,
      status: lead.status,
      currency: lead.currency,
      contactName: lead.contactName,
      email: lead.email,
      phone: lead.phone,
      website: lead.website,
      industry: lead.industry,
    },
    client,
    projects: projectRows,
    proposals: proposalOptions,
    reportedAmounts: reportedAmounts(lead),
    eligible: lead.status === 'won' && !client,
    reason: client
      ? 'ALREADY_CONVERTED'
      : lead.status === 'won'
        ? 'READY'
        : 'NOT_WON',
  };
}

async function insertConversionProject({ workspaceId, userId, lead, client, data }) {
  const snapshot = reportedAmounts(lead);
  const row = await insertWithReference({
    table: projects,
    workspaceId,
    prefix: 'PRJ-',
    values: {
      workspaceId,
      clientId: client.id,
      leadId: lead.id,
      name: data.projectName || `${lead.companyName} delivery`,
      status: 'not_started',
      priority: lead.priority || 'medium',
      ownerUserId: lead.assignedUserId || userId,
      startDate: new Date(),
      description: data.projectDescription ?? null,
      currency: lead.currency || 'INR',
      acceptedValueCents: 0,
      commercialSnapshot: {
        source: 'lead_conversion',
        leadId: lead.id,
        clientId: client.id,
        reportedAmounts: snapshot,
        note: 'Converted from a won lead. Reported amounts are what the owner reported; they are not verified payments or accepted proposal totals.',
        lines: [],
        capturedAt: new Date().toISOString(),
      },
      createdByUserId: userId,
      updatedByUserId: userId,
    },
    returning: {
      id: projects.id,
      reference: projects.reference,
      name: projects.name,
      status: projects.status,
    },
  });

  await getDb().insert(projectStatusHistory).values({
    workspaceId,
    projectId: row.id,
    fromStatus: null,
    toStatus: 'not_started',
    note: 'Project created by converting a won lead.',
    actorUserId: userId,
  });
  await getDb().insert(projectActivity).values({
    workspaceId,
    projectId: row.id,
    type: 'created',
    body: `Project created by converting won lead ${lead.companyName}.`,
    actorUserId: userId,
  });

  return row;
}

export async function convertLead({
  workspaceId,
  userId,
  leadId,
  data,
  access = null,
}) {
  const detail = await getLead(workspaceId, leadId, access);
  if (!detail) return null;
  const lead = detail.lead;

  if (lead.archivedAt) {
    throw new ApiError(409, 'LEAD_ARCHIVED', 'Restore this lead before converting it.');
  }
  if (lead.status !== 'won') {
    throw new ApiError(
      409,
      'LEAD_NOT_WON',
      'Only a won lead can be converted into a client and project.',
    );
  }

  const [existingClient] = await getDb()
    .select({ id: clients.id, reference: clients.reference })
    .from(clients)
    .where(and(eq(clients.workspaceId, workspaceId), eq(clients.leadId, leadId)))
    .limit(1);
  if (existingClient) {
    throw new ApiError(
      409,
      'LEAD_ALREADY_CONVERTED',
      'This lead already has a client record.',
      { clientId: existingClient.id, reference: existingClient.reference },
    );
  }

  let client;
  try {
    const created = await createClient({
      workspaceId,
      userId,
      data: {
        leadId: lead.id,
        companyName: lead.companyName,
        internalNotes:
          data.clientNotes ||
          `Converted from lead on ${new Date().toISOString().slice(0, 10)}.`,
      },
    });
    client = created.client;
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ApiError(
        409,
        'LEAD_ALREADY_CONVERTED',
        'This lead already has a client record.',
      );
    }
    throw error;
  }

  let project = null;
  if (data.createProject) {
    if (data.proposalId) {
      const created = await createProject({
        workspaceId,
        userId,
        data: {
          proposalId: data.proposalId,
          name: data.projectName || undefined,
          description: data.projectDescription || undefined,
        },
      });
      project = created.project;
    } else {
      project = await insertConversionProject({
        workspaceId,
        userId,
        lead,
        client,
        data,
      });
    }
  }

  const activities = [
    {
      workspaceId,
      leadId,
      actorUserId: userId,
      type: 'converted_to_client',
      body: `Converted to client ${client.reference} (${client.companyName}).`,
      metadata: { clientId: client.id },
    },
  ];
  if (project) {
    activities.push({
      workspaceId,
      leadId,
      actorUserId: userId,
      type: 'converted_to_project',
      body: `Created project ${project.reference} (${project.name}).`,
      metadata: { projectId: project.id },
    });
  }
  await getDb().insert(leadActivities).values(activities);

  await recordAudit({
    workspaceId,
    actorUserId: userId,
    action: 'lead.convert',
    resourceType: 'lead',
    resourceId: leadId,
    metadata: {
      clientId: client.id,
      clientReference: client.reference,
      projectId: project?.id || null,
      projectReference: project?.reference || null,
      proposalId: data.proposalId || null,
      reportedAmounts: reportedAmounts(lead),
    },
  });

  return {
    lead: await getLead(workspaceId, leadId, access),
    client,
    project,
    reportedAmounts: reportedAmounts(lead),
  };
}

export async function getConvertedRecords(workspaceId, leadId) {
  const [clientRows, projectRows] = await Promise.all([
    getDb()
      .select({
        id: clients.id,
        reference: clients.reference,
        companyName: clients.companyName,
        status: clients.status,
        createdAt: clients.createdAt,
      })
      .from(clients)
      .where(and(eq(clients.workspaceId, workspaceId), eq(clients.leadId, leadId)))
      .limit(1),
    getDb()
      .select({
        id: projects.id,
        reference: projects.reference,
        name: projects.name,
        status: projects.status,
        acceptedValueCents: projects.acceptedValueCents,
        currency: projects.currency,
        createdAt: projects.createdAt,
      })
      .from(projects)
      .where(and(eq(projects.workspaceId, workspaceId), eq(projects.leadId, leadId)))
      .orderBy(asc(projects.createdAt)),
  ]);
  return { client: clientRows[0] || null, projects: projectRows };
}

export const TIMELINE_SOURCE_LABELS = {
  lead: 'Lead',
  meeting: 'Meeting',
  task: 'Follow-up',
  client: 'Client',
  project: 'Project',
  finance: 'Finance',
};

// A single, read-only view across the records a lead touches. It never rewrites
// history; it merges the append-only activity tables so the client and project
// story stays visible after conversion.
export async function getLeadUnifiedTimeline({
  workspaceId,
  leadId,
  access = null,
  limit = 100,
}) {
  let detail;
  try {
    detail = await getLead(workspaceId, leadId, access);
  } catch (error) {
    if (error instanceof ApiError && (error.status === 403 || error.status === 404)) {
      return null;
    }
    throw error;
  }
  if (!detail) return null;

  const [clientRows, projectRows] = await Promise.all([
    getDb()
      .select({ id: clients.id })
      .from(clients)
      .where(and(eq(clients.workspaceId, workspaceId), eq(clients.leadId, leadId)))
      .limit(1),
    getDb()
      .select({ id: projects.id, name: projects.name })
      .from(projects)
      .where(and(eq(projects.workspaceId, workspaceId), eq(projects.leadId, leadId))),
  ]);
  const clientId = clientRows[0]?.id || null;
  const projectIds = projectRows.map((row) => row.id);

  const items = [];

  for (const activity of detail.activities) {
    items.push({
      id: `lead:${activity.id}`,
      source: 'lead',
      type: activity.type,
      title: activity.type,
      body: activity.body,
      actorName: activity.actorName || activity.actorEmail || null,
      at: activity.createdAt,
      href: null,
    });
  }

  const meetingRows = await getDb()
    .select({
      id: meetings.id,
      title: meetings.title,
      status: meetings.status,
      startsAt: meetings.startsAt,
      createdByName: users.name,
      createdAt: meetings.createdAt,
    })
    .from(meetings)
    .leftJoin(users, eq(users.id, meetings.createdByUserId))
    .where(and(eq(meetings.workspaceId, workspaceId), eq(meetings.leadId, leadId)));
  for (const meeting of meetingRows) {
    items.push({
      id: `meeting:${meeting.id}`,
      source: 'meeting',
      type: 'meeting',
      title: `Meeting ${meeting.status.replace('_', ' ')}: ${meeting.title}`,
      body: meeting.startsAt ? `Scheduled for ${meeting.startsAt.toISOString()}` : null,
      actorName: meeting.createdByName,
      at: meeting.createdAt,
      href: `/workspace/meetings?search=${encodeURIComponent(meeting.title)}`,
    });
  }

  const followUps = await getDb()
    .select({
      id: projectTasks.id,
      title: projectTasks.title,
      status: projectTasks.status,
      dueDate: projectTasks.dueDate,
      createdAt: projectTasks.createdAt,
      ownerName: users.name,
    })
    .from(projectTasks)
    .leftJoin(users, eq(users.id, projectTasks.ownerUserId))
    .where(
      and(
        eq(projectTasks.workspaceId, workspaceId),
        eq(projectTasks.leadId, leadId),
        eq(projectTasks.taskType, 'follow_up'),
      ),
    );
  for (const task of followUps) {
    items.push({
      id: `task:${task.id}`,
      source: 'task',
      type: 'follow_up',
      title: `Follow-up ${task.status.replace('_', ' ')}: ${task.title}`,
      body: task.dueDate ? `Due ${task.dueDate.toISOString()}` : null,
      actorName: task.ownerName,
      at: task.createdAt,
      href: '/workspace/tasks',
    });
  }

  if (clientId) {
    const clientTimeline = await getDb()
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
      );
    for (const entry of clientTimeline) {
      items.push({
        id: `client:${entry.id}`,
        source: 'client',
        type: entry.type,
        title: entry.title,
        body: entry.body,
        actorName: entry.actorName,
        at: entry.occurredAt,
        href: `/workspace/clients/${clientId}`,
      });
    }

    const invoiceRows = await getDb()
      .select({
        id: invoices.id,
        reference: invoices.reference,
        status: invoices.status,
        totalCents: invoices.totalCents,
        currency: invoices.currency,
        createdAt: invoices.createdAt,
      })
      .from(invoices)
      .where(
        and(eq(invoices.workspaceId, workspaceId), eq(invoices.clientId, clientId)),
      );
    for (const invoice of invoiceRows) {
      items.push({
        id: `finance:${invoice.id}`,
        source: 'finance',
        type: 'invoice',
        title: `Invoice ${invoice.reference} · ${invoice.status.replace('_', ' ')}`,
        body: `${invoice.currency} ${(invoice.totalCents / 100).toFixed(2)}`,
        actorName: null,
        at: invoice.createdAt,
        href: `/workspace/clients/${clientId}`,
      });
    }
  }

  for (const project of projectRows) {
    const activityRows = await getDb()
      .select({
        id: projectActivity.id,
        type: projectActivity.type,
        body: projectActivity.body,
        createdAt: projectActivity.createdAt,
        actorName: users.name,
      })
      .from(projectActivity)
      .leftJoin(users, eq(users.id, projectActivity.actorUserId))
      .where(eq(projectActivity.projectId, project.id));
    for (const activity of activityRows) {
      items.push({
        id: `project:${activity.id}`,
        source: 'project',
        type: activity.type,
        title: `${project.name}: ${activity.type}`,
        body: activity.body,
        actorName: activity.actorName,
        at: activity.createdAt,
        href: `/workspace/projects/${project.id}`,
      });
    }
  }

  items.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  return {
    items: items.slice(0, limit),
    total: items.length,
    client: clientId,
    projects: projectRows,
  };
}
