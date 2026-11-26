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
  ne,
  or,
  sql,
} from 'drizzle-orm';
import { getDb, getDbDriver } from '@/db/client';
import {
  agents,
  clients,
  leadActivities,
  leads,
  opportunities,
  projectActivity,
  projectDeliverables,
  projectMembers,
  projectMilestones,
  projectScopeChanges,
  projectStatusHistory,
  projectTasks,
  projects,
  proposalDeliverables,
  proposalLineItems,
  proposalMilestones,
  proposalVersions,
  proposals,
  taskCollaborators,
  taskComments,
  taskDependencies,
  users,
  workspaceMemberships,
} from '@/db/schema';
import { createAgentRun } from '@/lib/ai/runtime';
import { ApiError } from '@/lib/api-error';
import { recordAudit } from '@/lib/audit';
import { insertWithReference, isUniqueViolation } from '@/lib/business/references';
import { addDaysFrom, isBeforeToday, overlapsToday, startOfDay } from '@/lib/business/dates';
import {
  PROJECT_STATUS_LABELS,
  TASK_STATUS_LABELS,
  allowedNextProjectStatuses,
  canTransitionProject,
  canTransitionTask,
  isProjectClosed,
} from './transitions';

const OPEN_TASK_STATUSES = ['todo', 'in_progress', 'blocked', 'in_review'];

async function runAtomic(build) {
  const db = getDb();
  if (getDbDriver() === 'node-postgres') return db.transaction(build);
  return build(db);
}

function notFound() {
  return new ApiError(404, 'NOT_FOUND', 'That project could not be found.');
}

function staleError() {
  return new ApiError(
    409,
    'STALE_PROJECT',
    'This record changed while you were editing it. Reload and try again.',
  );
}

function escapeLike(value) {
  return String(value).replace(/[\\%_]/g, '\\$&');
}

async function insertProjectActivity({
  workspaceId,
  projectId,
  taskId = null,
  userId,
  type,
  body = null,
  metadata = null,
}) {
  await getDb().insert(projectActivity).values({
    workspaceId,
    projectId,
    taskId,
    actorUserId: userId || null,
    type,
    body,
    metadata,
  });
}

async function memberIdsInWorkspace(workspaceId) {
  const rows = await getDb()
    .select({ userId: workspaceMemberships.userId })
    .from(workspaceMemberships)
    .where(eq(workspaceMemberships.workspaceId, workspaceId));
  return new Set(rows.map((row) => row.userId));
}

async function assertMembers(workspaceId, ids) {
  const unique = [...new Set((ids || []).filter(Boolean))];
  if (unique.length === 0) return [];
  const set = await memberIdsInWorkspace(workspaceId);
  const missing = unique.filter((id) => !set.has(id));
  if (missing.length > 0) {
    throw new ApiError(
      422,
      'ASSIGNEE_NOT_MEMBER',
      'Choose people who belong to this workspace.',
      { memberUserIds: 'One or more selected people are not workspace members.' },
    );
  }
  return unique;
}

async function loadProjectRow(workspaceId, projectId) {
  const rows = await getDb()
    .select()
    .from(projects)
    .where(and(eq(projects.workspaceId, workspaceId), eq(projects.id, projectId)))
    .limit(1);
  return rows[0] || null;
}

const PROJECT_SELECT = {
  id: projects.id,
  workspaceId: projects.workspaceId,
  reference: projects.reference,
  name: projects.name,
  status: projects.status,
  priority: projects.priority,
  ownerUserId: projects.ownerUserId,
  ownerName: users.name,
  ownerEmail: users.email,
  clientId: projects.clientId,
  clientReference: clients.reference,
  companyName: clients.companyName,
  leadId: projects.leadId,
  opportunityId: projects.opportunityId,
  opportunityTitle: opportunities.title,
  proposalId: projects.proposalId,
  proposalVersionId: projects.proposalVersionId,
  proposalReference: proposals.reference,
  proposalTitle: proposals.title,
  proposalVersionNumber: proposalVersions.versionNumber,
  currency: projects.currency,
  acceptedValueCents: projects.acceptedValueCents,
  recurringMonthlyCents: projects.recurringMonthlyCents,
  recurringQuarterlyCents: projects.recurringQuarterlyCents,
  recurringAnnualCents: projects.recurringAnnualCents,
  startDate: projects.startDate,
  expectedCompletionDate: projects.expectedCompletionDate,
  actualCompletionDate: projects.actualCompletionDate,
  description: projects.description,
  internalNotes: projects.internalNotes,
  createdAt: projects.createdAt,
  updatedAt: projects.updatedAt,
};

const PROJECT_JOINS = (query) =>
  query
    .leftJoin(users, eq(users.id, projects.ownerUserId))
    .leftJoin(clients, eq(clients.id, projects.clientId))
    .leftJoin(opportunities, eq(opportunities.id, projects.opportunityId))
    .leftJoin(proposals, eq(proposals.id, projects.proposalId))
    .leftJoin(proposalVersions, eq(proposalVersions.id, projects.proposalVersionId));

async function snapshotForAcceptedVersion(workspaceId, version) {
  const items = await getDb()
    .select()
    .from(proposalLineItems)
    .where(
      and(
        eq(proposalLineItems.workspaceId, workspaceId),
        eq(proposalLineItems.versionId, version.id),
      ),
    )
    .orderBy(asc(proposalLineItems.displayOrder));

  const [deliverables, milestones] = await Promise.all([
    getDb()
      .select()
      .from(proposalDeliverables)
      .where(
        and(
          eq(proposalDeliverables.workspaceId, workspaceId),
          eq(proposalDeliverables.versionId, version.id),
        ),
      )
      .orderBy(asc(proposalDeliverables.displayOrder)),
    getDb()
      .select()
      .from(proposalMilestones)
      .where(
        and(
          eq(proposalMilestones.workspaceId, workspaceId),
          eq(proposalMilestones.versionId, version.id),
        ),
      )
      .orderBy(asc(proposalMilestones.displayOrder)),
  ]);

  return { items, deliverables, milestones };
}

export async function listAcceptedProposalOptions(workspaceId) {
  const rows = await getDb()
    .select({
      proposalId: proposals.id,
      versionId: proposalVersions.id,
      reference: proposals.reference,
      title: proposals.title,
      versionNumber: proposalVersions.versionNumber,
      currency: proposalVersions.currency,
      acceptedValueCents: proposalVersions.grandTotalCents,
      recurringMonthlyCents: proposalVersions.recurringMonthlyCents,
      companyName: leads.companyName,
      opportunityTitle: opportunities.title,
      respondedAt: proposalVersions.respondedAt,
    })
    .from(proposals)
    .innerJoin(proposalVersions, eq(proposalVersions.id, proposals.currentVersionId))
    .innerJoin(leads, eq(leads.id, proposals.leadId))
    .innerJoin(opportunities, eq(opportunities.id, proposals.opportunityId))
    .where(
      and(
        eq(proposals.workspaceId, workspaceId),
        eq(proposals.status, 'accepted'),
        eq(proposalVersions.status, 'accepted'),
        sql`not exists (select 1 from ${projects} p where p.proposal_id = ${proposals.id})`,
      ),
    )
    .orderBy(desc(proposalVersions.respondedAt))
    .limit(200);
  return rows;
}

export async function createProject({ workspaceId, userId, data }) {
  const rows = await getDb()
    .select({
      proposal: proposals,
      version: proposalVersions,
      companyName: leads.companyName,
      opportunityTitle: opportunities.title,
    })
    .from(proposals)
    .innerJoin(proposalVersions, eq(proposalVersions.id, proposals.currentVersionId))
    .innerJoin(leads, eq(leads.id, proposals.leadId))
    .innerJoin(opportunities, eq(opportunities.id, proposals.opportunityId))
    .where(
      and(
        eq(proposals.workspaceId, workspaceId),
        eq(proposals.id, data.proposalId),
      ),
    )
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

  const { proposal, version } = context;
  if (proposal.status !== 'accepted' || version.status !== 'accepted') {
    throw new ApiError(
      409,
      'PROPOSAL_NOT_ACCEPTED',
      'A project can be created only from a proposal the client has accepted.',
    );
  }

  const existing = await getDb()
    .select({ id: projects.id })
    .from(projects)
    .where(
      and(eq(projects.workspaceId, workspaceId), eq(projects.proposalId, proposal.id)),
    )
    .limit(1);
  if (existing[0]) {
    throw new ApiError(
      409,
      'PROJECT_EXISTS',
      'This accepted proposal already has a project.',
      { proposalId: 'Open the existing project instead.' },
    );
  }

  const ownerUserId =
    data.ownerUserId === undefined ? proposal.salesOwnerUserId ?? userId : data.ownerUserId;
  const members = await assertMembers(workspaceId, [
    ...(ownerUserId ? [ownerUserId] : []),
    ...(data.memberUserIds || []),
  ]);

  const snapshot = await snapshotForAcceptedVersion(workspaceId, version);

  let projectRow;
  try {
    projectRow = await insertWithReference({
      table: projects,
      workspaceId,
      prefix: 'PRJ-',
      values: {
        workspaceId,
        leadId: proposal.leadId,
        opportunityId: proposal.opportunityId,
        proposalId: proposal.id,
        proposalVersionId: version.id,
        name: data.name || `${proposal.title} delivery`,
        status: 'not_started',
        priority: data.priority || 'medium',
        ownerUserId: ownerUserId || null,
        startDate: data.startDate ?? null,
        expectedCompletionDate: data.expectedCompletionDate ?? null,
        description: data.description ?? null,
        internalNotes: data.internalNotes ?? null,
        currency: version.currency || 'INR',
        acceptedValueCents: version.grandTotalCents,
        recurringMonthlyCents: version.recurringMonthlyCents,
        recurringQuarterlyCents: version.recurringQuarterlyCents,
        recurringAnnualCents: version.recurringAnnualCents,
        commercialSnapshot: {
          proposalId: proposal.id,
          proposalReference: proposal.reference,
          proposalTitle: proposal.title,
          versionId: version.id,
          versionNumber: version.versionNumber,
          acceptedAt: version.respondedAt,
          currency: version.currency,
          oneTimeTotalCents: version.grandTotalCents,
          recurringMonthlyCents: version.recurringMonthlyCents,
          recurringQuarterlyCents: version.recurringQuarterlyCents,
          recurringAnnualCents: version.recurringAnnualCents,
          optionalTotalCents: version.optionalTotalCents,
          capturedAt: new Date().toISOString(),
          lines: snapshot.items.map((item) => ({
            name: item.name,
            quantity: item.quantity,
            unit: item.unit,
            unitPriceCents: item.unitPriceCents,
            billingType: item.billingType,
            kind: item.kind,
            regulated: item.regulated,
            reviewProfession: item.reviewProfession,
            lineTotalCents: item.lineTotalCents,
          })),
        },
        createdByUserId: userId,
        updatedByUserId: userId,
      },
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ApiError(
        409,
        'PROJECT_EXISTS',
        'This accepted proposal already has a project.',
      );
    }
    throw error;
  }

  try {
    await runAtomic(async (executor) => {
      const memberRows = [
        ...(ownerUserId
          ? [{ workspaceId, projectId: projectRow.id, userId: ownerUserId, role: 'lead' }]
          : []),
        ...members
          .filter((id) => id !== ownerUserId)
          .map((id) => ({
            workspaceId,
            projectId: projectRow.id,
            userId: id,
            role: 'member',
          })),
      ];
      if (memberRows.length > 0) {
        await executor.insert(projectMembers).values(memberRows);
      }

      if (snapshot.deliverables.length > 0) {
        await executor.insert(projectDeliverables).values(
          snapshot.deliverables.map((entry, index) => ({
            workspaceId,
            projectId: projectRow.id,
            proposalDeliverableId: entry.id,
            title: entry.title,
            description: entry.description,
            ownerUserId: ownerUserId || null,
            displayOrder: index,
          })),
        );
      }

      if (snapshot.milestones.length > 0) {
        await executor.insert(projectMilestones).values(
          snapshot.milestones.map((entry, index) => ({
            workspaceId,
            projectId: projectRow.id,
            proposalMilestoneId: entry.id,
            title: entry.title,
            description: entry.description,
            ownerUserId: ownerUserId || null,
            displayOrder: index,
          })),
        );
      }

      await executor.insert(projectStatusHistory).values({
        workspaceId,
        projectId: projectRow.id,
        fromStatus: null,
        toStatus: 'not_started',
        note: 'Project created from accepted proposal.',
        actorUserId: userId,
      });
    });
  } catch (error) {
    await getDb().delete(projects).where(eq(projects.id, projectRow.id));
    throw error;
  }

  await insertProjectActivity({
    workspaceId,
    projectId: projectRow.id,
    userId,
    type: 'created',
    body: `Project created from accepted proposal ${proposal.reference} (version ${version.versionNumber}).`,
  });

  await recordAudit({
    workspaceId,
    actorUserId: userId,
    action: 'project.create',
    resourceType: 'project',
    resourceId: projectRow.id,
    metadata: {
      reference: projectRow.reference,
      proposalId: proposal.id,
      proposalVersionId: version.id,
      acceptedValueCents: version.grandTotalCents,
    },
  });

  return getProject(workspaceId, projectRow.id);
}

export async function getProject(workspaceId, projectId) {
  const baseRows = await PROJECT_JOINS(
    getDb().select(PROJECT_SELECT).from(projects),
  )
    .where(and(eq(projects.workspaceId, workspaceId), eq(projects.id, projectId)))
    .limit(1);
  const project = baseRows[0];
  if (!project) return null;

  const [snapshotRows, memberRows, historyRows, taskRows, milestoneRows, deliverableRows, scopeRows, activityRows, commentRows, collaboratorRows, dependencyRows] =
    await Promise.all([
      getDb()
        .select({ commercialSnapshot: projects.commercialSnapshot })
        .from(projects)
        .where(eq(projects.id, projectId))
        .limit(1),
      getDb()
        .select({
          userId: projectMembers.userId,
          role: projectMembers.role,
          name: users.name,
          email: users.email,
        })
        .from(projectMembers)
        .innerJoin(users, eq(users.id, projectMembers.userId))
        .where(
          and(
            eq(projectMembers.workspaceId, workspaceId),
            eq(projectMembers.projectId, projectId),
          ),
        )
        .orderBy(asc(projectMembers.createdAt)),
      getDb()
        .select({
          id: projectStatusHistory.id,
          fromStatus: projectStatusHistory.fromStatus,
          toStatus: projectStatusHistory.toStatus,
          note: projectStatusHistory.note,
          actorUserId: projectStatusHistory.actorUserId,
          actorName: users.name,
          createdAt: projectStatusHistory.createdAt,
        })
        .from(projectStatusHistory)
        .leftJoin(users, eq(users.id, projectStatusHistory.actorUserId))
        .where(
          and(
            eq(projectStatusHistory.workspaceId, workspaceId),
            eq(projectStatusHistory.projectId, projectId),
          ),
        )
        .orderBy(desc(projectStatusHistory.createdAt)),
      getDb()
        .select({
          id: projectTasks.id,
          title: projectTasks.title,
          description: projectTasks.description,
          status: projectTasks.status,
          priority: projectTasks.priority,
          ownerUserId: projectTasks.ownerUserId,
          ownerName: users.name,
          startDate: projectTasks.startDate,
          dueDate: projectTasks.dueDate,
          estimatedMinutes: projectTasks.estimatedMinutes,
          actualMinutes: projectTasks.actualMinutes,
          completedAt: projectTasks.completedAt,
          updatedAt: projectTasks.updatedAt,
          createdAt: projectTasks.createdAt,
        })
        .from(projectTasks)
        .leftJoin(users, eq(users.id, projectTasks.ownerUserId))
        .where(
          and(
            eq(projectTasks.workspaceId, workspaceId),
            eq(projectTasks.projectId, projectId),
          ),
        )
        .orderBy(asc(projectTasks.createdAt)),
      getDb()
        .select({
          id: projectMilestones.id,
          title: projectMilestones.title,
          description: projectMilestones.description,
          targetDate: projectMilestones.targetDate,
          completionDate: projectMilestones.completionDate,
          ownerUserId: projectMilestones.ownerUserId,
          ownerName: users.name,
          reviewStatus: projectMilestones.reviewStatus,
          clientApprovalStatus: projectMilestones.clientApprovalStatus,
          evidenceNotes: projectMilestones.evidenceNotes,
          displayOrder: projectMilestones.displayOrder,
          proposalMilestoneId: projectMilestones.proposalMilestoneId,
          updatedAt: projectMilestones.updatedAt,
        })
        .from(projectMilestones)
        .leftJoin(users, eq(users.id, projectMilestones.ownerUserId))
        .where(
          and(
            eq(projectMilestones.workspaceId, workspaceId),
            eq(projectMilestones.projectId, projectId),
          ),
        )
        .orderBy(asc(projectMilestones.displayOrder)),
      getDb()
        .select({
          id: projectDeliverables.id,
          title: projectDeliverables.title,
          description: projectDeliverables.description,
          targetDate: projectDeliverables.targetDate,
          completionDate: projectDeliverables.completionDate,
          ownerUserId: projectDeliverables.ownerUserId,
          ownerName: users.name,
          reviewStatus: projectDeliverables.reviewStatus,
          clientApprovalStatus: projectDeliverables.clientApprovalStatus,
          evidenceNotes: projectDeliverables.evidenceNotes,
          displayOrder: projectDeliverables.displayOrder,
          proposalDeliverableId: projectDeliverables.proposalDeliverableId,
          updatedAt: projectDeliverables.updatedAt,
        })
        .from(projectDeliverables)
        .leftJoin(users, eq(users.id, projectDeliverables.ownerUserId))
        .where(
          and(
            eq(projectDeliverables.workspaceId, workspaceId),
            eq(projectDeliverables.projectId, projectId),
          ),
        )
        .orderBy(asc(projectDeliverables.displayOrder)),
      getDb()
        .select({
          id: projectScopeChanges.id,
          title: projectScopeChanges.title,
          description: projectScopeChanges.description,
          impactNotes: projectScopeChanges.impactNotes,
          status: projectScopeChanges.status,
          requestedByUserId: projectScopeChanges.requestedByUserId,
          decidedByUserId: projectScopeChanges.decidedByUserId,
          decidedAt: projectScopeChanges.decidedAt,
          decisionNotes: projectScopeChanges.decisionNotes,
          createdAt: projectScopeChanges.createdAt,
        })
        .from(projectScopeChanges)
        .where(
          and(
            eq(projectScopeChanges.workspaceId, workspaceId),
            eq(projectScopeChanges.projectId, projectId),
          ),
        )
        .orderBy(desc(projectScopeChanges.createdAt)),
      getDb()
        .select({
          id: projectActivity.id,
          type: projectActivity.type,
          body: projectActivity.body,
          metadata: projectActivity.metadata,
          taskId: projectActivity.taskId,
          actorUserId: projectActivity.actorUserId,
          actorName: users.name,
          createdAt: projectActivity.createdAt,
        })
        .from(projectActivity)
        .leftJoin(users, eq(users.id, projectActivity.actorUserId))
        .where(
          and(
            eq(projectActivity.workspaceId, workspaceId),
            eq(projectActivity.projectId, projectId),
          ),
        )
        .orderBy(desc(projectActivity.createdAt))
        .limit(100),
      getDb()
        .select({
          taskId: taskComments.taskId,
          value: count(),
        })
        .from(taskComments)
        .where(eq(taskComments.workspaceId, workspaceId))
        .groupBy(taskComments.taskId),
      getDb()
        .select({ taskId: taskCollaborators.taskId, userId: taskCollaborators.userId })
        .from(taskCollaborators)
        .where(eq(taskCollaborators.workspaceId, workspaceId)),
      getDb()
        .select({
          taskId: taskDependencies.taskId,
          dependsOnTaskId: taskDependencies.dependsOnTaskId,
        })
        .from(taskDependencies)
        .where(eq(taskDependencies.workspaceId, workspaceId)),
    ]);

  const commentMap = new Map(commentRows.map((row) => [row.taskId, Number(row.value)]));
  const collaboratorMap = new Map();
  for (const row of collaboratorRows) {
    if (!collaboratorMap.has(row.taskId)) collaboratorMap.set(row.taskId, []);
    collaboratorMap.get(row.taskId).push(row.userId);
  }
  const dependencyMap = new Map();
  for (const row of dependencyRows) {
    if (!dependencyMap.has(row.taskId)) dependencyMap.set(row.taskId, []);
    dependencyMap.get(row.taskId).push(row.dependsOnTaskId);
  }

  const tasks = taskRows.map((task) => ({
    ...task,
    isOverdue:
      isBeforeToday(task.dueDate) &&
      task.status !== 'completed' &&
      task.status !== 'cancelled',
    commentCount: commentMap.get(task.id) || 0,
    collaboratorUserIds: collaboratorMap.get(task.id) || [],
    dependsOnTaskIds: dependencyMap.get(task.id) || [],
  }));

  const taskSummary = {
    total: tasks.length,
    open: tasks.filter((task) => OPEN_TASK_STATUSES.includes(task.status)).length,
    completed: tasks.filter((task) => task.status === 'completed').length,
    overdue: tasks.filter((task) => task.isOverdue).length,
    dueToday: tasks.filter(
      (task) => overlapsToday(task.dueDate) && OPEN_TASK_STATUSES.includes(task.status),
    ).length,
  };

  return {
    project,
    commercialSnapshot: snapshotRows[0]?.commercialSnapshot || null,
    members: memberRows,
    statusHistory: historyRows,
    tasks,
    milestones: milestoneRows,
    deliverables: deliverableRows,
    scopeChanges: scopeRows.map((entry) => ({
      ...entry,
      requestedByName: memberRows.find((m) => m.userId === entry.requestedByUserId)?.name || null,
      decidedByName: memberRows.find((m) => m.userId === entry.decidedByUserId)?.name || null,
    })),
    activity: activityRows,
    taskSummary,
    permissionsHints: {
      canChangeStatusTo: allowedNextProjectStatuses(project.status),
    },
  };
}

export async function updateProject({ workspaceId, userId, projectId, data }) {
  const project = await loadProjectRow(workspaceId, projectId);
  if (!project) return null;

  const expected = new Date(data.expectedUpdatedAt);
  if (Number.isNaN(expected.getTime())) throw staleError();

  if (data.ownerUserId !== undefined) {
    await assertMembers(workspaceId, [data.ownerUserId]);
  }
  const members =
    data.memberUserIds !== undefined
      ? await assertMembers(workspaceId, data.memberUserIds)
      : null;

  if (data.clientId) {
    const clientRows = await getDb()
      .select({ id: clients.id })
      .from(clients)
      .where(
        and(eq(clients.workspaceId, workspaceId), eq(clients.id, data.clientId)),
      )
      .limit(1);
    if (!clientRows[0]) {
      throw new ApiError(
        422,
        'CLIENT_NOT_FOUND',
        'Choose a client that belongs to this workspace.',
        { clientId: 'Choose a client record from this workspace.' },
      );
    }
  }

  const patch = {
    name: data.name,
    ownerUserId: data.ownerUserId ?? null,
    priority: data.priority,
    startDate: data.startDate ?? null,
    expectedCompletionDate: data.expectedCompletionDate ?? null,
    description: data.description ?? null,
    internalNotes: data.internalNotes ?? null,
    updatedByUserId: userId,
    updatedAt: new Date(),
  };
  if (data.clientId !== undefined) patch.clientId = data.clientId;
  if (data.ownerUserId === undefined) delete patch.ownerUserId;
  if (data.priority === undefined) delete patch.priority;

  await runAtomic(async (executor) => {
    const updated = await executor
      .update(projects)
      .set(patch)
      .where(
        and(
          eq(projects.workspaceId, workspaceId),
          eq(projects.id, projectId),
          gte(projects.updatedAt, expected),
          lt(projects.updatedAt, new Date(expected.getTime() + 1)),
        ),
      )
      .returning({ id: projects.id });
    if (!updated[0]) throw staleError();

    if (members) {
      await executor
        .delete(projectMembers)
        .where(
          and(
            eq(projectMembers.workspaceId, workspaceId),
            eq(projectMembers.projectId, projectId),
          ),
        );
      const ownerId = data.ownerUserId ?? project.ownerUserId;
      const rows = [
        ...(ownerId
          ? [{ workspaceId, projectId, userId: ownerId, role: 'lead' }]
          : []),
        ...members
          .filter((id) => id !== ownerId)
          .map((id) => ({ workspaceId, projectId, userId: id, role: 'member' })),
      ];
      if (rows.length > 0) await executor.insert(projectMembers).values(rows);
    }
  });

  await insertProjectActivity({
    workspaceId,
    projectId,
    userId,
    type: 'updated',
    body: 'Project details updated.',
    metadata: { fields: Object.keys(patch) },
  });

  await recordAudit({
    workspaceId,
    actorUserId: userId,
    action: 'project.update',
    resourceType: 'project',
    resourceId: projectId,
    metadata: { fields: Object.keys(patch) },
  });

  return getProject(workspaceId, projectId);
}

export async function changeProjectStatus({
  workspaceId,
  userId,
  projectId,
  status,
  note = null,
}) {
  const project = await loadProjectRow(workspaceId, projectId);
  if (!project) return null;

  if (project.status === status) {
    return { ...(await getProject(workspaceId, projectId)), changed: false };
  }
  if (!canTransitionProject(project.status, status)) {
    throw new ApiError(
      409,
      'INVALID_STATE',
      `A project cannot move from ${PROJECT_STATUS_LABELS[project.status]} to ${PROJECT_STATUS_LABELS[status] || status}.`,
      {
        allowed: allowedNextProjectStatuses(project.status),
      },
    );
  }

  const patch = {
    status,
    updatedByUserId: userId,
    updatedAt: new Date(),
  };
  if (status === 'completed') patch.actualCompletionDate = new Date();

  const updated = await getDb()
    .update(projects)
    .set(patch)
    .where(
      and(
        eq(projects.workspaceId, workspaceId),
        eq(projects.id, projectId),
        eq(projects.status, project.status),
      ),
    )
    .returning({ id: projects.id });
  if (!updated[0]) {
    throw new ApiError(
      409,
      'INVALID_STATE',
      'This project changed while you updated it. Reload and try again.',
    );
  }

  await getDb().insert(projectStatusHistory).values({
    workspaceId,
    projectId,
    fromStatus: project.status,
    toStatus: status,
    note: note ?? null,
    actorUserId: userId,
  });

  await insertProjectActivity({
    workspaceId,
    projectId,
    userId,
    type: 'status_changed',
    body: `Status changed from ${PROJECT_STATUS_LABELS[project.status]} to ${PROJECT_STATUS_LABELS[status]}.`,
    metadata: note ? { note } : null,
  });

  await recordAudit({
    workspaceId,
    actorUserId: userId,
    action: 'project.status_change',
    resourceType: 'project',
    resourceId: projectId,
    metadata: { from: project.status, to: status },
  });

  return { ...(await getProject(workspaceId, projectId)), changed: true };
}

function projectFilters(workspaceId, query, viewerUserId) {
  const filters = [eq(projects.workspaceId, workspaceId)];
  if (query.status) filters.push(eq(projects.status, query.status));

  if (query.owner === 'me') filters.push(eq(projects.ownerUserId, viewerUserId));
  else if (query.owner === 'unassigned') filters.push(isNull(projects.ownerUserId));
  else if (query.owner) filters.push(eq(projects.ownerUserId, query.owner));

  if (query.risk === 'at_risk') {
    filters.push(
      and(
        inArray(projects.status, [
          'planning',
          'in_progress',
          'client_review',
          'on_hold',
        ]),
        sql`${projects.expectedCompletionDate} < ${startOfDay()}`,
      ),
    );
  } else if (query.risk === 'due_soon') {
    filters.push(
      and(
        inArray(projects.status, ['planning', 'in_progress', 'client_review']),
        sql`${projects.expectedCompletionDate} >= ${startOfDay()}`,
        sql`${projects.expectedCompletionDate} < ${addDaysFrom(startOfDay(), 14)}`,
      ),
    );
  }

  if (query.search) {
    const like = `%${escapeLike(query.search)}%`;
    filters.push(
      or(
        ilike(projects.name, like),
        ilike(projects.reference, like),
        ilike(clients.companyName, like),
        ilike(proposals.reference, like),
        ilike(proposals.title, like),
      ),
    );
  }

  return and(...filters);
}

function projectOrder(sort, direction) {
  const dir = direction === 'asc' ? asc : desc;
  if (sort === 'updated') return dir(projects.updatedAt);
  if (sort === 'completion') return sql`${projects.expectedCompletionDate} ${sql.raw(direction === 'asc' ? 'asc' : 'desc')} nulls last`;
  if (sort === 'priority') {
    return sql`case ${projects.priority} when 'urgent' then 0 when 'high' then 1 when 'medium' then 2 else 3 end ${sql.raw(direction === 'asc' ? 'asc' : 'desc')}`;
  }
  return dir(projects.createdAt);
}

export async function listProjects(workspaceId, viewerUserId, query) {
  const db = getDb();
  const where = projectFilters(workspaceId, query, viewerUserId);
  const offset = (query.page - 1) * query.pageSize;

  const [rows, totals] = await Promise.all([
    PROJECT_JOINS(db.select(PROJECT_SELECT).from(projects))
      .where(where)
      .orderBy(projectOrder(query.sort, query.direction))
      .limit(query.pageSize)
      .offset(offset),
    db
      .select({ value: count() })
      .from(projects)
      .leftJoin(clients, eq(clients.id, projects.clientId))
      .leftJoin(proposals, eq(proposals.id, projects.proposalId))
      .where(where),
  ]);

  const total = Number(totals[0]?.value || 0);
  const ids = rows.map((row) => row.id);

  let taskRows = [];
  if (ids.length > 0) {
    taskRows = await db
      .select({
        projectId: projectTasks.projectId,
        status: projectTasks.status,
        dueDate: projectTasks.dueDate,
      })
      .from(projectTasks)
      .where(
        and(
          eq(projectTasks.workspaceId, workspaceId),
          inArray(projectTasks.projectId, ids),
        ),
      );
  }

  const stats = new Map();
  for (const row of taskRows) {
    const entry = stats.get(row.projectId) || { open: 0, overdue: 0 };
    if (OPEN_TASK_STATUSES.includes(row.status)) {
      entry.open += 1;
      if (isBeforeToday(row.dueDate)) entry.overdue += 1;
    }
    stats.set(row.projectId, entry);
  }

  return {
    items: rows.map((row) => ({
      ...row,
      openTasks: stats.get(row.id)?.open || 0,
      overdueTasks: stats.get(row.id)?.overdue || 0,
      isAtRisk:
        !isProjectClosed(row.status) &&
        Boolean(row.expectedCompletionDate) &&
        isBeforeToday(row.expectedCompletionDate),
    })),
    total,
    page: query.page,
    pageSize: query.pageSize,
    pages: Math.max(1, Math.ceil(total / query.pageSize)),
  };
}

export async function getProjectsOverview(workspaceId) {
  const db = getDb();
  const today = startOfDay();

  const [grouped, overdueTasks, dueToday, upcomingMilestones, workload, closedRows] =
    await Promise.all([
      db
        .select({ status: projects.status, value: count() })
        .from(projects)
        .where(eq(projects.workspaceId, workspaceId))
        .groupBy(projects.status),
      db
        .select({ value: count() })
        .from(projectTasks)
        .where(
          and(
            eq(projectTasks.workspaceId, workspaceId),
            inArray(projectTasks.status, OPEN_TASK_STATUSES),
            sql`${projectTasks.dueDate} < ${today}`,
          ),
        ),
      db
        .select({ value: count() })
        .from(projectTasks)
        .where(
          and(
            eq(projectTasks.workspaceId, workspaceId),
            inArray(projectTasks.status, OPEN_TASK_STATUSES),
            sql`${projectTasks.dueDate} >= ${today}`,
            sql`${projectTasks.dueDate} < ${addDaysFrom(today, 1)}`,
          ),
        ),
      db
        .select({ value: count() })
        .from(projectMilestones)
        .where(
          and(
            eq(projectMilestones.workspaceId, workspaceId),
            ne(projectMilestones.reviewStatus, 'approved'),
            sql`${projectMilestones.targetDate} >= ${today}`,
            sql`${projectMilestones.targetDate} < ${addDaysFrom(today, 14)}`,
          ),
        ),
      db
        .select({
          ownerUserId: projectTasks.ownerUserId,
          name: users.name,
          email: users.email,
          value: count(),
        })
        .from(projectTasks)
        .leftJoin(users, eq(users.id, projectTasks.ownerUserId))
        .where(
          and(
            eq(projectTasks.workspaceId, workspaceId),
            inArray(projectTasks.status, OPEN_TASK_STATUSES),
          ),
        )
        .groupBy(projectTasks.ownerUserId, users.name, users.email),
      db
        .select({ value: count() })
        .from(projects)
        .where(
          and(
            eq(projects.workspaceId, workspaceId),
            eq(projects.status, 'completed'),
          ),
        ),
    ]);

  const statusCounts = {};
  for (const row of grouped) statusCounts[row.status] = Number(row.value || 0);

  const active =
    (statusCounts.planning || 0) +
    (statusCounts.in_progress || 0) +
    (statusCounts.client_review || 0);

  return {
    total: Object.values(statusCounts).reduce((sum, value) => sum + value, 0),
    active,
    notStarted: statusCounts.not_started || 0,
    planning: statusCounts.planning || 0,
    inProgress: statusCounts.in_progress || 0,
    clientReview: statusCounts.client_review || 0,
    onHold: statusCounts.on_hold || 0,
    blocked: statusCounts.on_hold || 0,
    completed: statusCounts.completed || 0,
    closedCompleted: Number(closedRows[0]?.value || 0),
    cancelled: statusCounts.cancelled || 0,
    overdueTasks: Number(overdueTasks[0]?.value || 0),
    dueToday: Number(dueToday[0]?.value || 0),
    upcomingMilestones: Number(upcomingMilestones[0]?.value || 0),
    workload: workload
      .map((row) => ({
        ownerUserId: row.ownerUserId,
        name: row.name || row.email || 'Unassigned',
        openTasks: Number(row.value || 0),
      }))
      .sort((left, right) => right.openTasks - left.openTasks),
  };
}

async function validateTaskLinks(workspaceId, projectId, ids) {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return [];
  const rows = await getDb()
    .select({ id: projectTasks.id })
    .from(projectTasks)
    .where(
      and(
        eq(projectTasks.workspaceId, workspaceId),
        eq(projectTasks.projectId, projectId),
        inArray(projectTasks.id, unique),
      ),
    );
  if (rows.length !== unique.length) {
    throw new ApiError(
      422,
      'TASK_LINK_INVALID',
      'Dependencies must be tasks in the same project.',
    );
  }
  return unique;
}

export async function createTask({ workspaceId, userId, projectId, data }) {
  const project = await loadProjectRow(workspaceId, projectId);
  if (!project) throw notFound();
  if (isProjectClosed(project.status)) {
    throw new ApiError(
      409,
      'PROJECT_CLOSED',
      'Tasks cannot be added to a completed or cancelled project.',
    );
  }

  const collaborators = await assertMembers(workspaceId, data.collaboratorUserIds || []);
  if (data.ownerUserId) await assertMembers(workspaceId, [data.ownerUserId]);
  const dependencies = await validateTaskLinks(
    workspaceId,
    projectId,
    data.dependsOnTaskIds || [],
  );

  const taskRow = await runAtomic(async (executor) => {
    const rows = await executor
      .insert(projectTasks)
      .values({
        workspaceId,
        projectId,
        title: data.title,
        description: data.description ?? null,
        status: data.status || 'todo',
        priority: data.priority || 'medium',
        ownerUserId: data.ownerUserId || null,
        startDate: data.startDate ?? null,
        dueDate: data.dueDate ?? null,
        estimatedMinutes: data.estimatedMinutes ?? 0,
        actualMinutes: data.actualMinutes ?? 0,
        acceptanceCriteria: data.acceptanceCriteria ?? null,
        completionEvidence: data.completionEvidence ?? null,
        sourceType: data.sourceType ?? null,
        sourceId: data.sourceId ?? null,
        createdByUserId: userId,
        updatedByUserId: userId,
      })
      .returning({ id: projectTasks.id });

    const taskId = rows[0].id;
    if (collaborators.length > 0) {
      await executor.insert(taskCollaborators).values(
        collaborators.map((memberId) => ({ workspaceId, taskId, userId: memberId })),
      );
    }
    if (dependencies.length > 0) {
      await executor.insert(taskDependencies).values(
        dependencies.map((dependsOnTaskId) => ({
          workspaceId,
          taskId,
          dependsOnTaskId,
        })),
      );
    }
    return taskId;
  });

  await insertProjectActivity({
    workspaceId,
    projectId,
    taskId: taskRow,
    userId,
    type: 'task_created',
    body: `Task added: ${data.title}.`,
  });

  await recordAudit({
    workspaceId,
    actorUserId: userId,
    action: 'task.create',
    resourceType: 'task',
    resourceId: taskRow,
    metadata: { projectId, title: data.title },
  });

  return getTask(workspaceId, taskRow);
}

export async function getTask(workspaceId, taskId) {
  const rows = await getDb()
    .select({
      id: projectTasks.id,
      workspaceId: projectTasks.workspaceId,
      projectId: projectTasks.projectId,
      projectName: projects.name,
      projectReference: projects.reference,
      projectStatus: projects.status,
      leadId: projectTasks.leadId,
      clientId: projectTasks.clientId,
      taskType: projectTasks.taskType,
      dueTime: projectTasks.dueTime,
      timezone: projectTasks.timezone,
      title: projectTasks.title,
      description: projectTasks.description,
      status: projectTasks.status,
      priority: projectTasks.priority,
      ownerUserId: projectTasks.ownerUserId,
      ownerName: users.name,
      startDate: projectTasks.startDate,
      dueDate: projectTasks.dueDate,
      estimatedMinutes: projectTasks.estimatedMinutes,
      actualMinutes: projectTasks.actualMinutes,
      acceptanceCriteria: projectTasks.acceptanceCriteria,
      completionEvidence: projectTasks.completionEvidence,
      sourceType: projectTasks.sourceType,
      sourceId: projectTasks.sourceId,
      completedAt: projectTasks.completedAt,
      createdAt: projectTasks.createdAt,
      updatedAt: projectTasks.updatedAt,
    })
    .from(projectTasks)
    .leftJoin(projects, eq(projects.id, projectTasks.projectId))
    .leftJoin(users, eq(users.id, projectTasks.ownerUserId))
    .where(
      and(eq(projectTasks.workspaceId, workspaceId), eq(projectTasks.id, taskId)),
    )
    .limit(1);

  const task = rows[0];
  if (!task) return null;

  const [collaborators, dependencies, comments] = await Promise.all([
    getDb()
      .select({
        userId: taskCollaborators.userId,
        name: users.name,
        email: users.email,
      })
      .from(taskCollaborators)
      .innerJoin(users, eq(users.id, taskCollaborators.userId))
      .where(
        and(
          eq(taskCollaborators.workspaceId, workspaceId),
          eq(taskCollaborators.taskId, taskId),
        ),
      ),
    getDb()
      .select({
        id: projectTasks.id,
        title: projectTasks.title,
        status: projectTasks.status,
      })
      .from(taskDependencies)
      .innerJoin(projectTasks, eq(projectTasks.id, taskDependencies.dependsOnTaskId))
      .where(
        and(
          eq(taskDependencies.workspaceId, workspaceId),
          eq(taskDependencies.taskId, taskId),
        ),
      ),
    getDb()
      .select({
        id: taskComments.id,
        body: taskComments.body,
        authorUserId: taskComments.authorUserId,
        authorName: users.name,
        createdAt: taskComments.createdAt,
      })
      .from(taskComments)
      .leftJoin(users, eq(users.id, taskComments.authorUserId))
      .where(
        and(
          eq(taskComments.workspaceId, workspaceId),
          eq(taskComments.taskId, taskId),
        ),
      )
      .orderBy(desc(taskComments.createdAt)),
  ]);

  return {
    task: {
      ...task,
      isOverdue:
        isBeforeToday(task.dueDate) &&
        task.status !== 'completed' &&
        task.status !== 'cancelled',
    },
    collaborators,
    dependencies,
    comments,
  };
}

export async function updateTask({ workspaceId, userId, taskId, data }) {
  const existing = await getTask(workspaceId, taskId);
  if (!existing) return null;
  const task = existing.task;

  if (isProjectClosed(task.projectStatus)) {
    throw new ApiError(
      409,
      'PROJECT_CLOSED',
      'Tasks in a completed or cancelled project cannot be changed.',
    );
  }

  const expected = new Date(data.expectedUpdatedAt);
  if (Number.isNaN(expected.getTime())) throw staleError();

  const nextStatus = data.status ?? task.status;
  if (nextStatus !== task.status && !canTransitionTask(task.status, nextStatus)) {
    throw new ApiError(
      409,
      'INVALID_STATE',
      `A task cannot move from ${TASK_STATUS_LABELS[task.status]} to ${TASK_STATUS_LABELS[nextStatus] || nextStatus}.`,
      { allowed: [] },
    );
  }

  if (data.ownerUserId) await assertMembers(workspaceId, [data.ownerUserId]);
  const collaborators =
    data.collaboratorUserIds !== undefined
      ? await assertMembers(workspaceId, data.collaboratorUserIds)
      : null;
  if (!task.projectId && data.dependsOnTaskIds?.length) {
    throw new ApiError(
      422,
      'INVALID_DEPENDENCY',
      'Follow-up tasks cannot depend on project tasks.',
    );
  }
  const dependencies =
    data.dependsOnTaskIds !== undefined && task.projectId
      ? await validateTaskLinks(
          workspaceId,
          task.projectId,
          data.dependsOnTaskIds.filter((id) => id !== taskId),
        )
      : null;

  const patch = {
    title: data.title ?? task.title,
    description: data.description ?? null,
    priority: data.priority ?? task.priority,
    status: nextStatus,
    ownerUserId: data.ownerUserId !== undefined ? data.ownerUserId || null : task.ownerUserId,
    startDate: data.startDate !== undefined ? data.startDate ?? null : task.startDate,
    dueDate: data.dueDate !== undefined ? data.dueDate ?? null : task.dueDate,
    estimatedMinutes:
      data.estimatedMinutes !== undefined ? data.estimatedMinutes : task.estimatedMinutes,
    actualMinutes:
      data.actualMinutes !== undefined ? data.actualMinutes : task.actualMinutes,
    updatedByUserId: userId,
    updatedAt: new Date(),
  };
  if (nextStatus === 'completed') patch.completedAt = new Date();
  if (data.status === undefined) delete patch.status;
  if (data.title === undefined) delete patch.title;
  if (data.description === undefined) delete patch.description;
  if (data.priority === undefined) delete patch.priority;
  if (data.acceptanceCriteria !== undefined) {
    patch.acceptanceCriteria = data.acceptanceCriteria ?? null;
  }
  if (data.completionEvidence !== undefined) {
    patch.completionEvidence = data.completionEvidence ?? null;
  }

  await runAtomic(async (executor) => {
    const updated = await executor
      .update(projectTasks)
      .set(patch)
      .where(
        and(
          eq(projectTasks.workspaceId, workspaceId),
          eq(projectTasks.id, taskId),
          gte(projectTasks.updatedAt, expected),
          lt(projectTasks.updatedAt, new Date(expected.getTime() + 1)),
        ),
      )
      .returning({ id: projectTasks.id });
    if (!updated[0]) throw staleError();

    if (collaborators) {
      await executor
        .delete(taskCollaborators)
        .where(
          and(
            eq(taskCollaborators.workspaceId, workspaceId),
            eq(taskCollaborators.taskId, taskId),
          ),
        );
      if (collaborators.length > 0) {
        await executor.insert(taskCollaborators).values(
          collaborators.map((memberId) => ({ workspaceId, taskId, userId: memberId })),
        );
      }
    }

    if (dependencies) {
      await executor
        .delete(taskDependencies)
        .where(
          and(
            eq(taskDependencies.workspaceId, workspaceId),
            eq(taskDependencies.taskId, taskId),
          ),
        );
      if (dependencies.length > 0) {
        await executor.insert(taskDependencies).values(
          dependencies.map((dependsOnTaskId) => ({
            workspaceId,
            taskId,
            dependsOnTaskId,
          })),
        );
      }
    }
  });

  const statusChanged = data.status && data.status !== task.status;
  if (task.projectId) {
    await insertProjectActivity({
      workspaceId,
      projectId: task.projectId,
      taskId,
      userId,
      type: statusChanged ? 'task_status' : 'task_updated',
      body: statusChanged
        ? `Task "${patch.title}" moved to ${TASK_STATUS_LABELS[nextStatus]}.`
        : `Task "${patch.title}" updated.`,
    });
  } else if (task.leadId) {
    // A sales follow-up has no project, so its history belongs to the lead.
    await getDb().insert(leadActivities).values({
      workspaceId,
      leadId: task.leadId,
      actorUserId: userId,
      type:
        nextStatus === 'completed' ? 'follow_up_completed' : 'follow_up_updated',
      body:
        nextStatus === 'completed'
          ? `Follow-up completed: ${patch.title}.`
          : `Follow-up "${patch.title}" updated to ${TASK_STATUS_LABELS[nextStatus]}.`,
      metadata: { taskId, status: nextStatus },
    });
  }

  await recordAudit({
    workspaceId,
    actorUserId: userId,
    action: statusChanged ? 'task.status_change' : 'task.update',
    resourceType: 'task',
    resourceId: taskId,
    metadata: {
      projectId: task.projectId,
      ...(statusChanged ? { from: task.status, to: nextStatus } : { fields: Object.keys(patch) }),
    },
  });

  return getTask(workspaceId, taskId);
}

function taskFilters(workspaceId, query, viewerUserId) {
  const filters = [eq(projectTasks.workspaceId, workspaceId)];
  if (query.projectId) filters.push(eq(projectTasks.projectId, query.projectId));
  if (query.status) filters.push(eq(projectTasks.status, query.status));
  if (query.priority) filters.push(eq(projectTasks.priority, query.priority));

  if (query.owner === 'me') filters.push(eq(projectTasks.ownerUserId, viewerUserId));
  else if (query.owner === 'unassigned') filters.push(isNull(projectTasks.ownerUserId));
  else if (query.owner) filters.push(eq(projectTasks.ownerUserId, query.owner));

  const today = startOfDay();
  if (query.due === 'overdue') {
    filters.push(
      and(
        inArray(projectTasks.status, OPEN_TASK_STATUSES),
        sql`${projectTasks.dueDate} < ${today}`,
      ),
    );
  } else if (query.due === 'today') {
    filters.push(
      and(
        inArray(projectTasks.status, OPEN_TASK_STATUSES),
        sql`${projectTasks.dueDate} >= ${today}`,
        sql`${projectTasks.dueDate} < ${addDaysFrom(today, 1)}`,
      ),
    );
  } else if (query.due === 'week') {
    filters.push(
      and(
        inArray(projectTasks.status, OPEN_TASK_STATUSES),
        sql`${projectTasks.dueDate} >= ${today}`,
        sql`${projectTasks.dueDate} < ${addDaysFrom(today, 7)}`,
      ),
    );
  }

  if (query.search) {
    const like = `%${escapeLike(query.search)}%`;
    filters.push(
      or(
        ilike(projectTasks.title, like),
        ilike(projectTasks.description, like),
        ilike(projects.name, like),
        ilike(projects.reference, like),
      ),
    );
  }

  return and(...filters);
}

function taskOrder(sort, direction) {
  const dir = direction === 'asc' ? asc : desc;
  if (sort === 'updated') return dir(projectTasks.updatedAt);
  if (sort === 'due') return sql`${projectTasks.dueDate} ${sql.raw(direction === 'asc' ? 'asc' : 'desc')} nulls last`;
  if (sort === 'priority') {
    return sql`case ${projectTasks.priority} when 'urgent' then 0 when 'high' then 1 when 'medium' then 2 else 3 end ${sql.raw(direction === 'asc' ? 'asc' : 'desc')}`;
  }
  return dir(projectTasks.createdAt);
}

export async function listTasks(workspaceId, viewerUserId, query) {
  const db = getDb();
  const where = taskFilters(workspaceId, query, viewerUserId);
  const offset = (query.page - 1) * query.pageSize;

  const [rows, totals] = await Promise.all([
    db
      .select({
        id: projectTasks.id,
        title: projectTasks.title,
        status: projectTasks.status,
        priority: projectTasks.priority,
        ownerUserId: projectTasks.ownerUserId,
        ownerName: users.name,
        startDate: projectTasks.startDate,
        dueDate: projectTasks.dueDate,
        estimatedMinutes: projectTasks.estimatedMinutes,
        actualMinutes: projectTasks.actualMinutes,
        updatedAt: projectTasks.updatedAt,
        projectId: projects.id,
        projectName: projects.name,
        projectReference: projects.reference,
        projectStatus: projects.status,
        leadId: projectTasks.leadId,
        leadCompanyName: leads.companyName,
        taskType: projectTasks.taskType,
        dueTime: projectTasks.dueTime,
        timezone: projectTasks.timezone,
        clientName: clients.companyName,
      })
      .from(projectTasks)
      .leftJoin(projects, eq(projects.id, projectTasks.projectId))
      .leftJoin(clients, eq(clients.id, projects.clientId))
      .leftJoin(leads, eq(leads.id, projectTasks.leadId))
      .leftJoin(users, eq(users.id, projectTasks.ownerUserId))
      .where(where)
      .orderBy(taskOrder(query.sort, query.direction))
      .limit(query.pageSize)
      .offset(offset),
    db
      .select({ value: count() })
      .from(projectTasks)
      .leftJoin(projects, eq(projects.id, projectTasks.projectId))
      .where(where),
  ]);

  const total = Number(totals[0]?.value || 0);
  return {
    items: rows.map((row) => ({
      ...row,
      isOverdue:
        isBeforeToday(row.dueDate) &&
        row.status !== 'completed' &&
        row.status !== 'cancelled',
    })),
    total,
    page: query.page,
    pageSize: query.pageSize,
    pages: Math.max(1, Math.ceil(total / query.pageSize)),
  };
}

export async function addTaskComment({ workspaceId, userId, taskId, body }) {
  const task = await getDb()
    .select({
      id: projectTasks.id,
      projectId: projectTasks.projectId,
      projectStatus: projects.status,
      title: projectTasks.title,
    })
    .from(projectTasks)
    .leftJoin(projects, eq(projects.id, projectTasks.projectId))
    .where(
      and(eq(projectTasks.workspaceId, workspaceId), eq(projectTasks.id, taskId)),
    )
    .limit(1);
  if (!task[0]) return null;

  await getDb().insert(taskComments).values({
    workspaceId,
    taskId,
    authorUserId: userId,
    body,
  });

  if (task[0].projectId) {
    await insertProjectActivity({
      workspaceId,
      projectId: task[0].projectId,
      taskId,
      userId,
      type: 'task_comment',
      body: `Comment added to "${task[0].title}".`,
    });
  }

  await recordAudit({
    workspaceId,
    actorUserId: userId,
    action: 'task.comment',
    resourceType: 'task',
    resourceId: taskId,
    metadata: { projectId: task[0].projectId },
  });

  return getTask(workspaceId, taskId);
}

async function loadTrackable(workspaceId, projectId) {
  const project = await loadProjectRow(workspaceId, projectId);
  if (!project) throw notFound();
  return project;
}

export async function createMilestone({ workspaceId, userId, projectId, data }) {
  const project = await loadTrackable(workspaceId, projectId);
  if (isProjectClosed(project.status)) {
    throw new ApiError(409, 'PROJECT_CLOSED', 'A closed project cannot gain milestones.');
  }

  const rows = await getDb()
    .insert(projectMilestones)
    .values({
      workspaceId,
      projectId,
      title: data.title,
      description: data.description ?? null,
      targetDate: data.targetDate ?? null,
      completionDate: data.completionDate ?? null,
      ownerUserId: data.ownerUserId || null,
      reviewStatus: data.reviewStatus || 'pending',
      clientApprovalStatus: data.clientApprovalStatus || 'not_requested',
      evidenceNotes: data.evidenceNotes ?? null,
      displayOrder: await nextOrder(projectMilestones, workspaceId, projectId),
    })
    .returning({ id: projectMilestones.id });

  await insertProjectActivity({
    workspaceId,
    projectId,
    userId,
    type: 'milestone_created',
    body: `Milestone added: ${data.title}.`,
  });

  await recordAudit({
    workspaceId,
    actorUserId: userId,
    action: 'project.milestone_update',
    resourceType: 'project',
    resourceId: projectId,
    metadata: { milestoneId: rows[0].id, created: true },
  });

  return getProject(workspaceId, projectId);
}

async function nextOrder(table, workspaceId, projectId) {
  const rows = await getDb()
    .select({ value: sql`coalesce(max(${table.displayOrder}), -1)` })
    .from(table)
    .where(and(eq(table.workspaceId, workspaceId), eq(table.projectId, projectId)));
  return Number(rows[0]?.value ?? -1) + 1;
}

export async function updateMilestone({
  workspaceId,
  userId,
  projectId,
  milestoneId,
  data,
}) {
  const project = await loadTrackable(workspaceId, projectId);
  if (isProjectClosed(project.status)) {
    throw new ApiError(409, 'PROJECT_CLOSED', 'A closed project cannot be changed.');
  }

  const existing = await getDb()
    .select()
    .from(projectMilestones)
    .where(
      and(
        eq(projectMilestones.workspaceId, workspaceId),
        eq(projectMilestones.projectId, projectId),
        eq(projectMilestones.id, milestoneId),
      ),
    )
    .limit(1);
  if (!existing[0]) {
    throw new ApiError(404, 'NOT_FOUND', 'That milestone could not be found.');
  }

  await getDb()
    .update(projectMilestones)
    .set({
      title: data.title ?? existing[0].title,
      description: data.description ?? null,
      targetDate: data.targetDate ?? null,
      completionDate: data.completionDate ?? null,
      ownerUserId: data.ownerUserId || null,
      reviewStatus: data.reviewStatus ?? existing[0].reviewStatus,
      clientApprovalStatus:
        data.clientApprovalStatus ?? existing[0].clientApprovalStatus,
      evidenceNotes: data.evidenceNotes ?? null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(projectMilestones.workspaceId, workspaceId),
        eq(projectMilestones.id, milestoneId),
      ),
    );

  await insertProjectActivity({
    workspaceId,
    projectId,
    userId,
    type: 'milestone_updated',
    body: `Milestone updated: ${data.title ?? existing[0].title}.`,
  });

  await recordAudit({
    workspaceId,
    actorUserId: userId,
    action: 'project.milestone_update',
    resourceType: 'project',
    resourceId: projectId,
    metadata: { milestoneId },
  });

  return getProject(workspaceId, projectId);
}

export async function createDeliverable({ workspaceId, userId, projectId, data }) {
  const project = await loadTrackable(workspaceId, projectId);
  if (isProjectClosed(project.status)) {
    throw new ApiError(409, 'PROJECT_CLOSED', 'A closed project cannot gain deliverables.');
  }

  const rows = await getDb()
    .insert(projectDeliverables)
    .values({
      workspaceId,
      projectId,
      title: data.title,
      description: data.description ?? null,
      targetDate: data.targetDate ?? null,
      completionDate: data.completionDate ?? null,
      ownerUserId: data.ownerUserId || null,
      reviewStatus: data.reviewStatus || 'pending',
      clientApprovalStatus: data.clientApprovalStatus || 'not_requested',
      evidenceNotes: data.evidenceNotes ?? null,
      displayOrder: await nextOrder(projectDeliverables, workspaceId, projectId),
    })
    .returning({ id: projectDeliverables.id });

  await insertProjectActivity({
    workspaceId,
    projectId,
    userId,
    type: 'deliverable_created',
    body: `Deliverable added: ${data.title}.`,
  });

  await recordAudit({
    workspaceId,
    actorUserId: userId,
    action: 'project.deliverable_update',
    resourceType: 'project',
    resourceId: projectId,
    metadata: { deliverableId: rows[0].id, created: true },
  });

  return getProject(workspaceId, projectId);
}

export async function updateDeliverable({
  workspaceId,
  userId,
  projectId,
  deliverableId,
  data,
}) {
  const project = await loadTrackable(workspaceId, projectId);
  if (isProjectClosed(project.status)) {
    throw new ApiError(409, 'PROJECT_CLOSED', 'A closed project cannot be changed.');
  }

  const existing = await getDb()
    .select()
    .from(projectDeliverables)
    .where(
      and(
        eq(projectDeliverables.workspaceId, workspaceId),
        eq(projectDeliverables.projectId, projectId),
        eq(projectDeliverables.id, deliverableId),
      ),
    )
    .limit(1);
  if (!existing[0]) {
    throw new ApiError(404, 'NOT_FOUND', 'That deliverable could not be found.');
  }

  await getDb()
    .update(projectDeliverables)
    .set({
      title: data.title ?? existing[0].title,
      description: data.description ?? null,
      targetDate: data.targetDate ?? null,
      completionDate: data.completionDate ?? null,
      ownerUserId: data.ownerUserId || null,
      reviewStatus: data.reviewStatus ?? existing[0].reviewStatus,
      clientApprovalStatus:
        data.clientApprovalStatus ?? existing[0].clientApprovalStatus,
      evidenceNotes: data.evidenceNotes ?? null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(projectDeliverables.workspaceId, workspaceId),
        eq(projectDeliverables.id, deliverableId),
      ),
    );

  await insertProjectActivity({
    workspaceId,
    projectId,
    userId,
    type: 'deliverable_updated',
    body: `Deliverable updated: ${data.title ?? existing[0].title}.`,
  });

  await recordAudit({
    workspaceId,
    actorUserId: userId,
    action: 'project.deliverable_update',
    resourceType: 'project',
    resourceId: projectId,
    metadata: { deliverableId },
  });

  return getProject(workspaceId, projectId);
}

export async function createScopeChange({ workspaceId, userId, projectId, data }) {
  await loadTrackable(workspaceId, projectId);

  const rows = await getDb()
    .insert(projectScopeChanges)
    .values({
      workspaceId,
      projectId,
      title: data.title,
      description: data.description ?? null,
      impactNotes: data.impactNotes ?? null,
      status: 'requested',
      requestedByUserId: userId,
    })
    .returning({ id: projectScopeChanges.id });

  await insertProjectActivity({
    workspaceId,
    projectId,
    userId,
    type: 'scope_requested',
    body: `Scope-change request recorded: ${data.title}. The accepted proposal is unchanged.`,
  });

  await recordAudit({
    workspaceId,
    actorUserId: userId,
    action: 'project.scope_change',
    resourceType: 'project',
    resourceId: projectId,
    metadata: { scopeChangeId: rows[0].id },
  });

  return getProject(workspaceId, projectId);
}

export async function decideScopeChange({
  workspaceId,
  userId,
  projectId,
  scopeChangeId,
  status,
  decisionNotes = null,
}) {
  await loadTrackable(workspaceId, projectId);

  const existing = await getDb()
    .select()
    .from(projectScopeChanges)
    .where(
      and(
        eq(projectScopeChanges.workspaceId, workspaceId),
        eq(projectScopeChanges.projectId, projectId),
        eq(projectScopeChanges.id, scopeChangeId),
      ),
    )
    .limit(1);
  if (!existing[0]) {
    throw new ApiError(404, 'NOT_FOUND', 'That scope-change request could not be found.');
  }
  if (existing[0].status !== 'requested') {
    throw new ApiError(409, 'INVALID_STATE', 'This scope-change request was already decided.');
  }

  await getDb()
    .update(projectScopeChanges)
    .set({
      status,
      decidedByUserId: userId,
      decidedAt: new Date(),
      decisionNotes: decisionNotes ?? null,
      updatedAt: new Date(),
    })
    .where(eq(projectScopeChanges.id, scopeChangeId));

  await insertProjectActivity({
    workspaceId,
    projectId,
    userId,
    type: 'scope_decided',
    body: `Scope-change request "${existing[0].title}" was ${status}. The accepted proposal was not modified.`,
    metadata: decisionNotes ? { decisionNotes } : null,
  });

  await recordAudit({
    workspaceId,
    actorUserId: userId,
    action: 'project.scope_decision',
    resourceType: 'project',
    resourceId: projectId,
    metadata: { scopeChangeId, status },
  });

  return getProject(workspaceId, projectId);
}

export async function requestProjectAiDraft({
  workspaceId,
  userId,
  projectId,
  instruction = null,
}) {
  const detail = await getProject(workspaceId, projectId);
  if (!detail) return null;

  const agentRows = await getDb()
    .select({ id: agents.id, name: agents.name, type: agents.type })
    .from(agents)
    .where(
      and(
        eq(agents.workspaceId, workspaceId),
        eq(agents.enabled, true),
        isNull(agents.archivedAt),
        inArray(agents.type, ['project_assistant', 'documentation_assistant']),
      ),
    )
    .orderBy(
      sql`case when ${agents.type} = 'project_assistant' then 0 else 1 end`,
      asc(agents.name),
    )
    .limit(1);

  const agent = agentRows[0];
  if (!agent) {
    throw new ApiError(
      409,
      'AI_AGENT_REQUIRED',
      'Add an enabled Project Assistant or Documentation Assistant agent in AI Workforce before requesting an AI draft.',
    );
  }

  const { project, tasks, milestones } = detail;
  const prompt = [
    'Prepare an internal delivery note for this project from the saved records below.',
    'Label everything as an AI-generated draft for a human to review.',
    'Do not change project status, approve deliverables, modify the accepted scope or mark work complete.',
    'Do not promise dates, prices or commitments that are not already recorded.',
    instruction ? `Additional instruction: ${instruction}` : null,
    '',
    `Project: ${project.reference} ${project.name}`,
    `Status: ${PROJECT_STATUS_LABELS[project.status] || project.status}`,
    `Client: ${project.companyName || 'Not recorded'}`,
    `Accepted proposal: ${project.proposalReference || 'Not recorded'} (version ${project.proposalVersionNumber || '—'})`,
    `Description: ${project.description || 'Not recorded'}`,
    `Tasks (${tasks.length}): ${tasks.slice(0, 40).map((task) => `${task.title} [${task.status}]`).join('; ') || 'none'}`,
    `Milestones (${milestones.length}): ${milestones.slice(0, 20).map((entry) => `${entry.title} [${entry.reviewStatus}]`).join('; ') || 'none'}`,
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
    action: 'project.ai_draft',
    resourceType: 'project',
    resourceId: projectId,
    metadata: { agentId: agent.id, runId: run.id, reused },
  });

  return { run: { id: run.id, status: run.status }, agent, reused };
}
