import {
  and,
  asc,
  avg,
  count,
  desc,
  eq,
  ilike,
  inArray,
  isNull,
  lt,
  ne,
  or,
} from 'drizzle-orm';
import { getDb } from '@/db/client';
import {
  users,
  websiteAuditFindings,
  websiteAuditLogs,
  websiteAuditPages,
  websiteAudits,
} from '@/db/schema';
import { ApiError } from '@/lib/api-error';
import { recordAudit } from '@/lib/audit';
import { enqueueWebsiteAudit } from '@/lib/ai/queue';
import { assertClient, assertProject } from '@/lib/marketing/helpers';
import { assertSafeUrl, safeFetch } from '@/lib/net/safe-fetch';
import {
  AuditCancelledError,
  AuditError,
  auditWebsite,
} from './engine';
import {
  AUDIT_CATEGORY_LABELS,
  AUDIT_SEVERITIES,
  AUDIT_STATUSES,
} from './validation';

const TERMINAL = new Set(['completed', 'failed', 'cancelled']);
const OPEN = ['queued', 'running'];
const RETRYABLE_FETCH_CODES = new Set([
  'timeout',
  'dns_failure',
  'decode_failure',
]);
const STALE_RUNNING_MS = 10 * 60 * 1000;

function clip(value, max) {
  const text = String(value ?? '');
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function escapeLike(value) {
  return String(value).replace(/[\\%_]/g, '\\$&');
}

function auditSummary(row) {
  return {
    id: row.id,
    status: row.status,
    requestedUrl: row.requestedUrl,
    normalizedUrl: row.normalizedUrl,
    domain: row.domain,
    maxPages: row.maxPages,
    pagesScanned: row.pagesScanned,
    overallScore: row.overallScore,
    categoryScores: row.categoryScores,
    scoringMethod: row.scoringMethod,
    errorMessage: row.errorMessage,
    cancelRequested: row.cancelRequested,
    clientId: row.clientId,
    projectId: row.projectId,
    auditDate: row.auditDate,
    assignedToUserId: row.assignedToUserId,
    captureMode: row.captureMode,
    checklist: row.checklist,
    notes: row.notes,
    jobId: row.jobId,
    requestedByUserId: row.requestedByUserId,
    requestedByName: row.requestedByName ?? null,
    requestedByEmail: row.requestedByEmail ?? null,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function loadAudit(workspaceId, auditId) {
  const rows = await getDb()
    .select({
      audit: websiteAudits,
      requestedByName: users.name,
      requestedByEmail: users.email,
    })
    .from(websiteAudits)
    .leftJoin(users, eq(users.id, websiteAudits.requestedByUserId))
    .where(
      and(
        eq(websiteAudits.workspaceId, workspaceId),
        eq(websiteAudits.id, auditId),
      ),
    )
    .limit(1);
  return rows[0] || null;
}

async function loadAuditById(auditId) {
  const rows = await getDb()
    .select()
    .from(websiteAudits)
    .where(eq(websiteAudits.id, auditId))
    .limit(1);
  return rows[0] || null;
}

async function writeLog(audit, level, message, metadata = null) {
  try {
    await getDb().insert(websiteAuditLogs).values({
      workspaceId: audit.workspaceId,
      auditId: audit.id,
      level,
      message: clip(message, 500),
      metadata: metadata || null,
    });
  } catch {
    // A log write must never abort an audit.
  }
}

function pageRowsFor(audit, pages) {
  return pages.map((page) => ({
    workspaceId: audit.workspaceId,
    auditId: audit.id,
    url: clip(page.url, 1_000),
    finalUrl: page.finalUrl ? clip(page.finalUrl, 1_000) : null,
    statusCode: page.statusCode ?? null,
    contentType: page.contentType ? clip(page.contentType, 300) : null,
    responseTimeMs: page.responseTimeMs ?? null,
    htmlBytes: page.htmlBytes ?? null,
    redirectCount: page.redirectCount || 0,
    indexable: page.indexable ?? null,
    title: page.title ? clip(page.title, 300) : null,
    metaDescription: page.metaDescription
      ? clip(page.metaDescription, 600)
      : null,
    h1Count: page.h1Count ?? null,
    imagesMissingAlt: page.imagesMissingAlt ?? null,
    internalLinks: page.internalLinks ?? null,
    externalLinks: page.externalLinks ?? null,
    jsonLdBlocks: page.jsonLdBlocks ?? null,
  }));
}

function findingRowsFor(audit, findings) {
  return findings.map((finding) => ({
    workspaceId: audit.workspaceId,
    auditId: audit.id,
    category: finding.category,
    severity: AUDIT_SEVERITIES.includes(finding.severity)
      ? finding.severity
      : 'info',
    code: clip(finding.code, 100),
    title: clip(finding.title, 300),
    description: clip(finding.description, 2_000),
    evidence: finding.evidence ? clip(finding.evidence, 1_000) : null,
    recommendation: clip(finding.recommendation, 1_000),
    sourcePage: finding.sourcePage ? clip(finding.sourcePage, 1_000) : null,
  }));
}

async function persistPages(audit, pages) {
  if (!pages.length) return;
  await getDb().insert(websiteAuditPages).values(pageRowsFor(audit, pages));
}

async function persistFindings(audit, findings) {
  if (!findings.length) return;
  await getDb()
    .insert(websiteAuditFindings)
    .values(findingRowsFor(audit, findings));
}

async function markAudit(audit, status, extra = {}) {
  await getDb()
    .update(websiteAudits)
    .set({ status, updatedAt: new Date(), ...extra })
    .where(
      and(
        eq(websiteAudits.id, audit.id),
        eq(websiteAudits.workspaceId, audit.workspaceId),
        inArray(websiteAudits.status, OPEN),
      ),
    );
}

async function finalizeCancelled(audit, extra = {}) {
  await markAudit(audit, 'cancelled', {
    completedAt: new Date(),
    cancelRequested: true,
    ...extra,
  });
  await writeLog(audit, 'info', 'Audit cancelled.');
  await recordAudit({
    workspaceId: audit.workspaceId,
    actorType: 'system',
    action: 'website_audit.cancelled',
    resourceType: 'website_audit',
    resourceId: audit.id,
    success: false,
  });
}

async function failAudit(audit, message) {
  await markAudit(audit, 'failed', {
    errorMessage: clip(message, 1_000),
    completedAt: new Date(),
  });
  await writeLog(audit, 'error', `Audit failed: ${clip(message, 300)}`);
  await recordAudit({
    workspaceId: audit.workspaceId,
    actorType: 'system',
    action: 'website_audit.failed',
    resourceType: 'website_audit',
    resourceId: audit.id,
    success: false,
    metadata: { reason: clip(message, 300) },
  });
}

export async function createWebsiteAudit({
  workspaceId,
  userId,
  data,
  enqueue = enqueueWebsiteAudit,
}) {
  let url;
  try {
    url = assertSafeUrl(data.url);
  } catch (error) {
    throw new ApiError(
      422,
      'INVALID_AUDIT_URL',
      error?.message || 'That website URL cannot be audited.',
    );
  }

  const client = data.clientId
    ? await assertClient(workspaceId, data.clientId)
    : null;
  const project = data.projectId
    ? await assertProject(workspaceId, data.projectId, client?.id || null)
    : null;

  const captureMode = data.captureMode === 'manual' ? 'manual' : 'engine';
  const auditDate = data.auditDate || new Date();

  // A manual capture records observations and checklists without contacting
  // the website. It is clearly labelled so it is never mistaken for an
  // engine-verified crawl.
  if (captureMode === 'manual') {
    const rows = await getDb()
      .insert(websiteAudits)
      .values({
        workspaceId,
        requestedByUserId: userId,
        requestedUrl: data.url,
        normalizedUrl: url.href,
        domain: url.hostname.toLowerCase(),
        maxPages: data.maxPages ?? 0,
        pagesScanned: 0,
        status: 'completed',
        captureMode: 'manual',
        clientId: client?.id || null,
        projectId: project?.id || null,
        auditDate,
        notes: data.notes ?? null,
        checklist: data.checklist ?? null,
        completedAt: new Date(),
      })
      .returning();
    const audit = rows[0];

    await recordAudit({
      workspaceId,
      actorUserId: userId,
      action: 'website_audit.create',
      resourceType: 'website_audit',
      resourceId: audit.id,
      metadata: {
        domain: audit.domain,
        captureMode: 'manual',
        clientId: client?.id || null,
      },
    });

    return auditSummary(audit);
  }

  const rows = await getDb()
    .insert(websiteAudits)
    .values({
      workspaceId,
      requestedByUserId: userId,
      requestedUrl: data.url,
      normalizedUrl: url.href,
      domain: url.hostname.toLowerCase(),
      maxPages: data.maxPages,
      status: 'queued',
      captureMode: 'engine',
      clientId: client?.id || null,
      projectId: project?.id || null,
      auditDate,
      notes: data.notes ?? null,
      checklist: data.checklist ?? null,
    })
    .returning();
  const audit = rows[0];

  let jobId;
  try {
    jobId = await enqueue(audit.id);
    if (!jobId) throw new Error('The audit queue rejected the job');
    await getDb()
      .update(websiteAudits)
      .set({ jobId })
      .where(
        and(
          eq(websiteAudits.workspaceId, workspaceId),
          eq(websiteAudits.id, audit.id),
        ),
      );
  } catch {
    const message =
      'The background queue is unavailable. Start the worker and try again.';
    await markAudit(audit, 'failed', {
      errorMessage: message,
      completedAt: new Date(),
    });
    await recordAudit({
      workspaceId,
      actorUserId: userId,
      action: 'website_audit.failed',
      resourceType: 'website_audit',
      resourceId: audit.id,
      success: false,
      metadata: { reason: 'queue_unavailable' },
    });
    throw new ApiError(503, 'QUEUE_UNAVAILABLE', message);
  }

  await recordAudit({
    workspaceId,
    actorUserId: userId,
    action: 'website_audit.create',
    resourceType: 'website_audit',
    resourceId: audit.id,
    metadata: {
      domain: audit.domain,
      maxPages: audit.maxPages,
      captureMode: 'engine',
      clientId: client?.id || null,
    },
  });

  return auditSummary({ ...audit, jobId });
}

export async function listWebsiteAudits(workspaceId, query) {
  const filters = [eq(websiteAudits.workspaceId, workspaceId)];
  if (query.status) filters.push(eq(websiteAudits.status, query.status));
  if (query.domain) {
    filters.push(
      ilike(websiteAudits.domain, `%${escapeLike(query.domain)}%`),
    );
  }
  if (query.search) {
    const like = `%${escapeLike(query.search)}%`;
    filters.push(
      or(
        ilike(websiteAudits.requestedUrl, like),
        ilike(websiteAudits.normalizedUrl, like),
        ilike(websiteAudits.domain, like),
      ),
    );
  }

  const where = and(...filters);
  const offset = (query.page - 1) * query.pageSize;

  const [rows, totals] = await Promise.all([
    getDb()
      .select({
        audit: websiteAudits,
        requestedByName: users.name,
        requestedByEmail: users.email,
      })
      .from(websiteAudits)
      .leftJoin(users, eq(users.id, websiteAudits.requestedByUserId))
      .where(where)
      .orderBy(desc(websiteAudits.createdAt))
      .limit(query.pageSize)
      .offset(offset),
    getDb().select({ value: count() }).from(websiteAudits).where(where),
  ]);

  const total = Number(totals[0]?.value || 0);
  return {
    items: rows.map((row) =>
      auditSummary({
        ...row.audit,
        requestedByName: row.requestedByName,
        requestedByEmail: row.requestedByEmail,
      }),
    ),
    total,
    page: query.page,
    pageSize: query.pageSize,
    pages: Math.max(1, Math.ceil(total / query.pageSize)),
  };
}

async function findPreviousAudit(audit) {
  if (!audit.completedAt) return null;
  const rows = await getDb()
    .select()
    .from(websiteAudits)
    .where(
      and(
        eq(websiteAudits.workspaceId, audit.workspaceId),
        eq(websiteAudits.domain, audit.domain),
        eq(websiteAudits.status, 'completed'),
        ne(websiteAudits.id, audit.id),
        lt(websiteAudits.completedAt, audit.completedAt),
      ),
    )
    .orderBy(desc(websiteAudits.completedAt))
    .limit(1);
  return rows[0] || null;
}

export async function getWebsiteAudit(workspaceId, auditId) {
  const loaded = await loadAudit(workspaceId, auditId);
  if (!loaded) return null;

  const db = getDb();
  const [pages, findings, logs, previous] = await Promise.all([
    db
      .select()
      .from(websiteAuditPages)
      .where(
        and(
          eq(websiteAuditPages.workspaceId, workspaceId),
          eq(websiteAuditPages.auditId, auditId),
        ),
      )
      .orderBy(asc(websiteAuditPages.createdAt))
      .limit(20),
    db
      .select()
      .from(websiteAuditFindings)
      .where(
        and(
          eq(websiteAuditFindings.workspaceId, workspaceId),
          eq(websiteAuditFindings.auditId, auditId),
        ),
      )
      .orderBy(asc(websiteAuditFindings.createdAt)),
    db
      .select()
      .from(websiteAuditLogs)
      .where(
        and(
          eq(websiteAuditLogs.workspaceId, workspaceId),
          eq(websiteAuditLogs.auditId, auditId),
        ),
      )
      .orderBy(asc(websiteAuditLogs.createdAt))
      .limit(200),
    findPreviousAudit(loaded.audit),
  ]);

  const severityCounts = Object.fromEntries(
    AUDIT_SEVERITIES.map((severity) => [severity, 0]),
  );
  for (const finding of findings) {
    if (Object.hasOwn(severityCounts, finding.severity)) {
      severityCounts[finding.severity] += 1;
    }
  }

  const comparison =
    previous && typeof loaded.audit.overallScore === 'number'
      ? {
          previousAuditId: previous.id,
          previousCompletedAt: previous.completedAt,
          previousOverallScore: previous.overallScore,
          previousCategoryScores: previous.categoryScores,
          delta:
            typeof previous.overallScore === 'number'
              ? loaded.audit.overallScore - previous.overallScore
              : null,
        }
      : null;

  return {
    audit: auditSummary({
      ...loaded.audit,
      requestedByName: loaded.requestedByName,
      requestedByEmail: loaded.requestedByEmail,
    }),
    pages,
    findings,
    logs,
    comparison,
    severityCounts,
    categoryLabels: AUDIT_CATEGORY_LABELS,
    canCancel: !TERMINAL.has(loaded.audit.status),
  };
}

export async function cancelWebsiteAudit({ workspaceId, userId, auditId }) {
  const loaded = await loadAudit(workspaceId, auditId);
  if (!loaded) return null;
  const audit = loaded.audit;

  if (TERMINAL.has(audit.status)) {
    throw new ApiError(
      409,
      'AUDIT_FINISHED',
      'This audit has already finished.',
    );
  }

  await getDb()
    .update(websiteAudits)
    .set({ cancelRequested: true, updatedAt: new Date() })
    .where(
      and(
        eq(websiteAudits.workspaceId, workspaceId),
        eq(websiteAudits.id, auditId),
      ),
    );

  if (audit.status === 'queued' && !audit.startedAt) {
    await markAudit(audit, 'cancelled', {
      completedAt: new Date(),
      cancelRequested: true,
    });
    await writeLog(audit, 'info', 'Audit cancelled before it started.');
    await recordAudit({
      workspaceId,
      actorUserId: userId,
      action: 'website_audit.cancel',
      resourceType: 'website_audit',
      resourceId: auditId,
      metadata: { phase: 'queued' },
    });
  } else {
    await writeLog(
      audit,
      'info',
      'Cancellation requested; the worker will stop at the next safe point.',
    );
    await recordAudit({
      workspaceId,
      actorUserId: userId,
      action: 'website_audit.cancel',
      resourceType: 'website_audit',
      resourceId: auditId,
      metadata: { phase: audit.status },
    });
  }

  const next = await loadAudit(workspaceId, auditId);
  return auditSummary({
    ...next.audit,
    requestedByName: next.requestedByName,
    requestedByEmail: next.requestedByEmail,
  });
}

export async function getWebsiteAuditOverview(workspaceId) {
  const rows = await getDb()
    .select({ status: websiteAudits.status, value: count() })
    .from(websiteAudits)
    .where(eq(websiteAudits.workspaceId, workspaceId))
    .groupBy(websiteAudits.status);

  const byStatus = Object.fromEntries(
    AUDIT_STATUSES.map((status) => [status, 0]),
  );
  let total = 0;
  for (const row of rows) {
    const value = Number(row.value || 0);
    byStatus[row.status] = value;
    total += value;
  }

  const [scoreRow] = await getDb()
    .select({ value: avg(websiteAudits.overallScore) })
    .from(websiteAudits)
    .where(
      and(
        eq(websiteAudits.workspaceId, workspaceId),
        eq(websiteAudits.status, 'completed'),
      ),
    );

  const [latest] = await getDb()
    .select({ createdAt: websiteAudits.createdAt })
    .from(websiteAudits)
    .where(eq(websiteAudits.workspaceId, workspaceId))
    .orderBy(desc(websiteAudits.createdAt))
    .limit(1);

  return {
    total,
    byStatus,
    active: (byStatus.queued || 0) + (byStatus.running || 0),
    completed: byStatus.completed || 0,
    averageScore:
      scoreRow?.value === null || scoreRow?.value === undefined
        ? null
        : Math.round(Number(scoreRow.value)),
    lastCreatedAt: latest?.createdAt || null,
  };
}

async function claimAudit(audit) {
  const rows = await getDb()
    .update(websiteAudits)
    .set({ status: 'running', startedAt: new Date() })
    .where(
      and(
        eq(websiteAudits.id, audit.id),
        eq(websiteAudits.workspaceId, audit.workspaceId),
        eq(websiteAudits.status, 'queued'),
        isNull(websiteAudits.startedAt),
        eq(websiteAudits.cancelRequested, false),
      ),
    )
    .returning();
  return rows[0] || null;
}

export async function runWebsiteAuditJob(auditId, deps = {}) {
  let audit = await loadAuditById(auditId);
  if (!audit) return { status: 'missing' };

  if (TERMINAL.has(audit.status)) {
    return { status: 'skipped', reason: `status:${audit.status}` };
  }

  if (audit.status === 'running') {
    if (audit.cancelRequested) {
      await finalizeCancelled(audit);
      return { status: 'cancelled' };
    }
    const startedAt = audit.startedAt
      ? new Date(audit.startedAt).getTime()
      : 0;
    if (Date.now() - startedAt < STALE_RUNNING_MS) {
      return { status: 'skipped', reason: 'already-running' };
    }
    await failAudit(
      audit,
      'The audit worker stopped before finishing. Start a new audit.',
    );
    return { status: 'failed', reason: 'stale' };
  }

  if (audit.cancelRequested) {
    await finalizeCancelled(audit);
    return { status: 'cancelled' };
  }

  const claimed = await claimAudit(audit);
  if (!claimed) return { status: 'skipped', reason: 'claim-lost' };
  audit = claimed;

  await writeLog(audit, 'info', 'Audit started.', {
    maxPages: audit.maxPages,
  });

  const isCancelled = async () => {
    const [row] = await getDb()
      .select({ cancelRequested: websiteAudits.cancelRequested })
      .from(websiteAudits)
      .where(eq(websiteAudits.id, audit.id))
      .limit(1);
    return !row || row.cancelRequested;
  };

  try {
    const result = await auditWebsite({
      audit,
      fetchPage: deps.fetchPage || safeFetch,
      delay: deps.delay,
      limits: deps.limits,
      isCancelled,
      onLog: (level, message, metadata) =>
        writeLog(audit, level, message, metadata),
    });

    await persistPages(audit, result.pages);
    await persistFindings(audit, result.findings);

    const completed = await getDb()
      .update(websiteAudits)
      .set({
        status: 'completed',
        pagesScanned: result.pages.length,
        overallScore: result.overallScore,
        categoryScores: result.categoryScores,
        scoringMethod: result.scoringMethod,
        errorMessage: null,
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(websiteAudits.id, audit.id),
          eq(websiteAudits.workspaceId, audit.workspaceId),
          eq(websiteAudits.status, 'running'),
        ),
      )
      .returning({ id: websiteAudits.id });

    if (!completed[0]) {
      return { status: 'skipped', reason: 'already-finalized' };
    }

    await writeLog(
      audit,
      'info',
      `Audit finished with ${result.pages.length} page(s) scanned.`,
      {
        pagesScanned: result.pages.length,
        findings: result.findings.length,
        overallScore: result.overallScore,
      },
    );

    await recordAudit({
      workspaceId: audit.workspaceId,
      actorType: 'system',
      action: 'website_audit.completed',
      resourceType: 'website_audit',
      resourceId: audit.id,
      metadata: {
        domain: audit.domain,
        pages: result.pages.length,
        findings: result.findings.length,
        overallScore: result.overallScore,
      },
    });

    return {
      status: 'completed',
      pages: result.pages.length,
      findings: result.findings.length,
      overallScore: result.overallScore,
    };
  } catch (error) {
    if (error instanceof AuditCancelledError) {
      await persistPages(audit, error.partial.pages);
      await persistFindings(audit, error.partial.findings);
      await finalizeCancelled(audit, {
        pagesScanned: error.partial.pages.length,
      });
      return { status: 'cancelled' };
    }

    if (RETRYABLE_FETCH_CODES.has(error?.code)) {
      await getDb()
        .update(websiteAudits)
        .set({ status: 'queued', startedAt: null, updatedAt: new Date() })
        .where(
          and(
            eq(websiteAudits.id, audit.id),
            eq(websiteAudits.workspaceId, audit.workspaceId),
            eq(websiteAudits.status, 'running'),
          ),
        );
      await writeLog(
        audit,
        'warn',
        `The site did not respond in time (${error.code}); the audit will retry.`,
      );
      throw error;
    }

    const message =
      error instanceof AuditError
        ? error.message
        : error?.code
          ? `The audit failed (${error.code}).`
          : 'The audit failed.';
    await failAudit(audit, message);
    return { status: 'failed', reason: error?.code || 'error' };
  }
}
