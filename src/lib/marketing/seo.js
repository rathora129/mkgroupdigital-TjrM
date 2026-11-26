import { and, asc, count, desc, eq } from 'drizzle-orm';
import { getDb } from '@/db/client';
import {
  projectTasks,
  users,
  websiteAuditFindings,
  websiteAudits,
} from '@/db/schema';
import { ApiError } from '@/lib/api-error';
import { recordAudit } from '@/lib/audit';
import { isUniqueViolation } from '@/lib/business/references';
import { createTask } from '@/lib/projects/service';
import {
  FINDING_SOURCE_LABELS,
  FINDING_STATUS_LABELS,
} from './constants';
import { assertMembers, assertProject, marketingNotFound, staleError } from './helpers';

const SEVERITY_PRIORITY = {
  critical: 'urgent',
  high: 'high',
  medium: 'medium',
  low: 'low',
  info: 'low',
};

function toIso(value) {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function ensureCurrent(expected, actual) {
  if (!expected) return;
  if (toIso(expected) !== toIso(actual)) throw staleError('finding');
}

function clip(value, max) {
  const text = String(value ?? '');
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

export async function assertAudit(workspaceId, auditId) {
  const rows = await getDb()
    .select({
      id: websiteAudits.id,
      requestedUrl: websiteAudits.requestedUrl,
      normalizedUrl: websiteAudits.normalizedUrl,
      domain: websiteAudits.domain,
      clientId: websiteAudits.clientId,
      projectId: websiteAudits.projectId,
      captureMode: websiteAudits.captureMode,
    })
    .from(websiteAudits)
    .where(
      and(
        eq(websiteAudits.workspaceId, workspaceId),
        eq(websiteAudits.id, auditId),
      ),
    )
    .limit(1);
  const audit = rows[0];
  if (!audit) throw marketingNotFound('website audit');
  return audit;
}

export async function getAuditFinding(workspaceId, findingId) {
  const rows = await getDb()
    .select({
      finding: websiteAuditFindings,
      auditClientId: websiteAudits.clientId,
      auditProjectId: websiteAudits.projectId,
      auditDomain: websiteAudits.domain,
      assignedToName: users.name,
    })
    .from(websiteAuditFindings)
    .innerJoin(websiteAudits, eq(websiteAudits.id, websiteAuditFindings.auditId))
    .leftJoin(users, eq(users.id, websiteAuditFindings.assignedToUserId))
    .where(
      and(
        eq(websiteAuditFindings.workspaceId, workspaceId),
        eq(websiteAuditFindings.id, findingId),
      ),
    )
    .limit(1);
  if (!rows[0]) throw marketingNotFound('audit finding');
  return rows[0];
}

export async function addAuditFinding({ workspaceId, userId, auditId, data }) {
  const audit = await assertAudit(workspaceId, auditId);
  if (data.assignedToUserId) {
    await assertMembers(workspaceId, [data.assignedToUserId]);
  }

  const rows = await getDb()
    .insert(websiteAuditFindings)
    .values({
      workspaceId,
      auditId: audit.id,
      category: data.category,
      severity: data.severity || 'medium',
      code: clip(data.code, 100),
      title: clip(data.title, 300),
      description: clip(data.description, 2_000),
      evidence: data.evidence ? clip(data.evidence, 1_000) : null,
      recommendation: clip(data.recommendation, 1_000),
      sourcePage: data.sourcePage ? clip(data.sourcePage, 1_000) : null,
      sourceType: data.sourceType || 'manual',
      status: 'open',
      assignedToUserId: data.assignedToUserId || null,
    })
    .returning({ id: websiteAuditFindings.id });

  await recordAudit({
    workspaceId,
    actorUserId: userId,
    action: 'marketing.audit_finding',
    resourceType: 'website_audit',
    resourceId: audit.id,
    metadata: {
      findingId: rows[0].id,
      sourceType: data.sourceType || 'manual',
      severity: data.severity || 'medium',
    },
  });

  return getAuditFinding(workspaceId, rows[0].id);
}

export async function updateAuditFinding({
  workspaceId,
  userId,
  findingId,
  data,
}) {
  const loaded = await getAuditFinding(workspaceId, findingId);
  const finding = loaded.finding;
  ensureCurrent(data.expectedUpdatedAt, finding.updatedAt);
  if (data.assignedToUserId) {
    await assertMembers(workspaceId, [data.assignedToUserId]);
  }

  const nextStatus = data.status ?? finding.status;
  if (
    nextStatus === 'resolved' &&
    !data.completionNotes?.trim() &&
    !finding.completionNotes
  ) {
    throw new ApiError(
      422,
      'EVIDENCE_REQUIRED',
      'Record completion notes before marking a finding resolved.',
    );
  }

  const patch = { updatedAt: new Date() };
  if (data.status !== undefined) patch.status = nextStatus;
  if (data.assignedToUserId !== undefined) {
    patch.assignedToUserId = data.assignedToUserId || null;
  }
  if (data.completionNotes !== undefined) {
    patch.completionNotes = data.completionNotes ?? null;
  }
  if (data.sourceType !== undefined) patch.sourceType = data.sourceType;
  if (data.severity !== undefined) patch.severity = data.severity;
  if (data.recommendation !== undefined) {
    patch.recommendation = clip(data.recommendation, 1_000);
  }

  await getDb()
    .update(websiteAuditFindings)
    .set(patch)
    .where(
      and(
        eq(websiteAuditFindings.workspaceId, workspaceId),
        eq(websiteAuditFindings.id, findingId),
      ),
    );

  await recordAudit({
    workspaceId,
    actorUserId: userId,
    action: 'marketing.audit_finding_update',
    resourceType: 'website_audit',
    resourceId: finding.auditId,
    metadata: {
      findingId,
      from: finding.status,
      to: nextStatus,
      sourceType: data.sourceType ?? finding.sourceType,
    },
  });

  return getAuditFinding(workspaceId, findingId);
}

export async function listAuditFindings(workspaceId, auditId, query = {}) {
  await assertAudit(workspaceId, auditId);
  const filters = [
    eq(websiteAuditFindings.workspaceId, workspaceId),
    eq(websiteAuditFindings.auditId, auditId),
  ];
  if (query.status) filters.push(eq(websiteAuditFindings.status, query.status));
  if (query.sourceType) {
    filters.push(eq(websiteAuditFindings.sourceType, query.sourceType));
  }

  const [rows, statusRows, sourceRows] = await Promise.all([
    getDb()
      .select({
        id: websiteAuditFindings.id,
        auditId: websiteAuditFindings.auditId,
        category: websiteAuditFindings.category,
        severity: websiteAuditFindings.severity,
        code: websiteAuditFindings.code,
        title: websiteAuditFindings.title,
        description: websiteAuditFindings.description,
        evidence: websiteAuditFindings.evidence,
        recommendation: websiteAuditFindings.recommendation,
        sourcePage: websiteAuditFindings.sourcePage,
        sourceType: websiteAuditFindings.sourceType,
        status: websiteAuditFindings.status,
        assignedToUserId: websiteAuditFindings.assignedToUserId,
        assignedToName: users.name,
        linkedTaskId: websiteAuditFindings.linkedTaskId,
        linkedTaskTitle: projectTasks.title,
        linkedTaskStatus: projectTasks.status,
        completionNotes: websiteAuditFindings.completionNotes,
        createdAt: websiteAuditFindings.createdAt,
        updatedAt: websiteAuditFindings.updatedAt,
      })
      .from(websiteAuditFindings)
      .leftJoin(users, eq(users.id, websiteAuditFindings.assignedToUserId))
      .leftJoin(projectTasks, eq(projectTasks.id, websiteAuditFindings.linkedTaskId))
      .where(and(...filters))
      .orderBy(asc(websiteAuditFindings.createdAt)),
    getDb()
      .select({ status: websiteAuditFindings.status, value: count() })
      .from(websiteAuditFindings)
      .where(
        and(
          eq(websiteAuditFindings.workspaceId, workspaceId),
          eq(websiteAuditFindings.auditId, auditId),
        ),
      )
      .groupBy(websiteAuditFindings.status),
    getDb()
      .select({ sourceType: websiteAuditFindings.sourceType, value: count() })
      .from(websiteAuditFindings)
      .where(
        and(
          eq(websiteAuditFindings.workspaceId, workspaceId),
          eq(websiteAuditFindings.auditId, auditId),
        ),
      )
      .groupBy(websiteAuditFindings.sourceType),
  ]);

  const statusCounts = Object.fromEntries(
    Object.keys(FINDING_STATUS_LABELS).map((key) => [key, 0]),
  );
  for (const row of statusRows) {
    statusCounts[row.status] = Number(row.value || 0);
  }
  const sourceCounts = Object.fromEntries(
    Object.keys(FINDING_SOURCE_LABELS).map((key) => [key, 0]),
  );
  for (const row of sourceRows) {
    sourceCounts[row.sourceType] = Number(row.value || 0);
  }

  return {
    items: rows.map((row) => ({
      ...row,
      sourceLabel: FINDING_SOURCE_LABELS[row.sourceType] || row.sourceType,
      statusLabel: FINDING_STATUS_LABELS[row.status] || row.status,
    })),
    statusCounts,
    sourceCounts,
  };
}

function taskDescription(finding, audit) {
  return [
    finding.description,
    finding.evidence ? `Evidence: ${finding.evidence}` : null,
    `Recommendation: ${finding.recommendation}`,
    finding.sourcePage ? `Source page: ${finding.sourcePage}` : null,
    `Generated from website audit finding (${FINDING_SOURCE_LABELS[finding.sourceType] || finding.sourceType}) for ${audit.normalizedUrl || audit.domain}.`,
    'Only mark complete once the change is verified — a task record is not proof the website changed.',
  ]
    .filter(Boolean)
    .join('\n\n');
}

export async function convertFindingToTask({
  workspaceId,
  userId,
  findingId,
  data,
}) {
  const loaded = await getAuditFinding(workspaceId, findingId);
  const finding = loaded.finding;
  const audit = {
    clientId: loaded.auditClientId,
    projectId: loaded.auditProjectId,
    domain: loaded.auditDomain,
  };

  const projectId = data.projectId || audit.projectId;
  if (!projectId) {
    throw new ApiError(
      422,
      'PROJECT_REQUIRED',
      'Choose a project for the generated task.',
      { projectId: 'Choose a project for the generated task.' },
    );
  }
  await assertProject(workspaceId, projectId, audit.clientId);

  const existing = await getDb()
    .select({
      id: projectTasks.id,
      status: projectTasks.status,
      title: projectTasks.title,
    })
    .from(projectTasks)
    .where(
      and(
        eq(projectTasks.workspaceId, workspaceId),
        eq(projectTasks.sourceType, 'audit_finding'),
        eq(projectTasks.sourceId, findingId),
      ),
    )
    .limit(1);
  if (existing[0]) {
    throw new ApiError(
      409,
      'TASK_EXISTS',
      'A task was already generated from this finding.',
      { existingTaskId: existing[0].id, status: existing[0].status },
    );
  }

  const priority =
    data.priority || SEVERITY_PRIORITY[finding.severity] || 'medium';
  const acceptance =
    data.acceptanceCriteria ||
    `The recommendation "${clip(finding.title, 120)}" is implemented and verified${
      finding.sourcePage ? ` on ${clip(finding.sourcePage, 160)}` : ''
    }. Record proof in the completion notes.`;

  let created;
  try {
    created = await createTask({
      workspaceId,
      userId,
      projectId,
      data: {
        title: clip(`SEO: ${finding.title}`, 200),
        description: taskDescription(finding, audit),
        status: 'todo',
        priority,
        ownerUserId: data.ownerUserId || finding.assignedToUserId || null,
        dueDate: data.dueDate ?? null,
        estimatedMinutes: 0,
        actualMinutes: 0,
        acceptanceCriteria: acceptance,
        sourceType: 'audit_finding',
        sourceId: findingId,
      },
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ApiError(
        409,
        'TASK_EXISTS',
        'A task was already generated from this finding.',
      );
    }
    throw error;
  }

  const nextStatus = finding.status === 'resolved' ? 'resolved' : 'in_progress';
  await getDb()
    .update(websiteAuditFindings)
    .set({
      linkedTaskId: created.task.id,
      status: nextStatus,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(websiteAuditFindings.workspaceId, workspaceId),
        eq(websiteAuditFindings.id, findingId),
      ),
    );

  await recordAudit({
    workspaceId,
    actorUserId: userId,
    action: 'marketing.task_generated',
    resourceType: 'task',
    resourceId: created.task.id,
    metadata: {
      findingId,
      auditId: finding.auditId,
      projectId,
      priority,
      severity: finding.severity,
    },
  });

  return {
    task: created.task,
    finding: await getAuditFinding(workspaceId, findingId),
  };
}

export async function getMarketingFindingsOverview(workspaceId) {
  const [statusRows, sourceRows, severityRows] = await Promise.all([
    getDb()
      .select({ status: websiteAuditFindings.status, value: count() })
      .from(websiteAuditFindings)
      .where(eq(websiteAuditFindings.workspaceId, workspaceId))
      .groupBy(websiteAuditFindings.status),
    getDb()
      .select({ sourceType: websiteAuditFindings.sourceType, value: count() })
      .from(websiteAuditFindings)
      .where(eq(websiteAuditFindings.workspaceId, workspaceId))
      .groupBy(websiteAuditFindings.sourceType),
    getDb()
      .select({ severity: websiteAuditFindings.severity, value: count() })
      .from(websiteAuditFindings)
      .where(eq(websiteAuditFindings.workspaceId, workspaceId))
      .groupBy(websiteAuditFindings.severity),
  ]);

  const statusCounts = Object.fromEntries(
    Object.keys(FINDING_STATUS_LABELS).map((key) => [key, 0]),
  );
  let total = 0;
  for (const row of statusRows) {
    const value = Number(row.value || 0);
    statusCounts[row.status] = value;
    total += value;
  }
  const sourceCounts = Object.fromEntries(
    Object.keys(FINDING_SOURCE_LABELS).map((key) => [key, 0]),
  );
  for (const row of sourceRows) {
    sourceCounts[row.sourceType] = Number(row.value || 0);
  }
  const severityCounts = Object.fromEntries(
    ['critical', 'high', 'medium', 'low', 'info'].map((key) => [key, 0]),
  );
  for (const row of severityRows) {
    if (Object.hasOwn(severityCounts, row.severity)) {
      severityCounts[row.severity] = Number(row.value || 0);
    }
  }

  return {
    total,
    statusCounts,
    sourceCounts,
    severityCounts,
    openFindings: statusCounts.open + statusCounts.in_progress,
  };
}

export async function listClientAuditFindings(workspaceId, clientId, query = {}) {
  const filters = [
    eq(websiteAuditFindings.workspaceId, workspaceId),
    eq(websiteAudits.clientId, clientId),
  ];
  if (query.status) filters.push(eq(websiteAuditFindings.status, query.status));
  if (query.sourceType) {
    filters.push(eq(websiteAuditFindings.sourceType, query.sourceType));
  }
  const rows = await getDb()
    .select({
      id: websiteAuditFindings.id,
      auditId: websiteAuditFindings.auditId,
      title: websiteAuditFindings.title,
      severity: websiteAuditFindings.severity,
      status: websiteAuditFindings.status,
      sourceType: websiteAuditFindings.sourceType,
      linkedTaskId: websiteAuditFindings.linkedTaskId,
      createdAt: websiteAuditFindings.createdAt,
    })
    .from(websiteAuditFindings)
    .innerJoin(websiteAudits, eq(websiteAudits.id, websiteAuditFindings.auditId))
    .where(and(...filters))
    .orderBy(desc(websiteAuditFindings.createdAt))
    .limit(200);
  return rows;
}
