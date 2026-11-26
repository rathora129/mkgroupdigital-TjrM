import {
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  inArray,
  isNull,
  or,
} from 'drizzle-orm';
import { getDb } from '@/db/client';
import {
  leadActivities,
  leads,
  researchFindings,
  researchJobs,
  researchSources,
  users,
} from '@/db/schema';
import { ApiError } from '@/lib/api-error';
import { recordAudit } from '@/lib/audit';
import {
  cancelAgentRun,
  createAgentRun,
  getAgent,
  getProviderSetting,
  getRun,
  listAgents,
} from '@/lib/ai/runtime';
import {
  getProviderDefinition,
  isProviderConfigured,
} from '@/lib/ai/registry';
import { extractMeta, extractText, extractTitle } from '@/lib/audits/html';
import { enqueueResearchJob } from '@/lib/ai/queue';
import { safeFetch } from '@/lib/net/safe-fetch';
import {
  RESEARCH_CATEGORIES,
  RESEARCH_VERIFICATIONS,
} from './validation';

const TERMINAL = new Set(['completed', 'failed', 'cancelled']);

const SUBJECT_AGENT_TYPE = {
  company: 'business_research',
  website: 'business_research',
  industry: 'business_research',
  lead: 'lead_research',
};

const RETRYABLE_FETCH_CODES = new Set([
  'timeout',
  'dns_failure',
  'decode_failure',
]);

function clip(value, max) {
  const text = String(value ?? '');
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function jobSummary(row) {
  return {
    id: row.id,
    status: row.status,
    subjectType: row.subjectType,
    leadId: row.leadId,
    agentId: row.agentId,
    runId: row.runId,
    companyName: row.companyName,
    websiteUrl: row.websiteUrl,
    industry: row.industry,
    objective: row.objective,
    errorMessage: row.errorMessage,
    sourceCount: row.sourceCount,
    output: row.output,
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

async function loadJob(workspaceId, researchId) {
  const rows = await getDb()
    .select({
      job: researchJobs,
      requestedByName: users.name,
      requestedByEmail: users.email,
    })
    .from(researchJobs)
    .leftJoin(users, eq(users.id, researchJobs.requestedByUserId))
    .where(
      and(
        eq(researchJobs.workspaceId, workspaceId),
        eq(researchJobs.id, researchId),
      ),
    )
    .limit(1);
  return rows[0] || null;
}

async function loadJobById(researchId) {
  const rows = await getDb()
    .select()
    .from(researchJobs)
    .where(eq(researchJobs.id, researchId))
    .limit(1);
  return rows[0] || null;
}

async function assertLeadInWorkspace(workspaceId, leadId) {
  const rows = await getDb()
    .select({
      id: leads.id,
      companyName: leads.companyName,
      website: leads.website,
      industry: leads.industry,
      contactName: leads.contactName,
      notes: leads.notes,
      status: leads.status,
    })
    .from(leads)
    .where(and(eq(leads.workspaceId, workspaceId), eq(leads.id, leadId)))
    .limit(1);
  if (!rows[0]) {
    throw new ApiError(404, 'LEAD_NOT_FOUND', 'That lead could not be found.');
  }
  return rows[0];
}

async function resolveAgent({ workspaceId, subjectType, agentId }) {
  if (agentId) {
    const agent = await getAgent(workspaceId, agentId);
    if (!agent) {
      throw new ApiError(404, 'AGENT_NOT_FOUND', 'That agent could not be found.');
    }
    if (agent.type !== 'business_research' && agent.type !== 'lead_research') {
      throw new ApiError(
        422,
        'AGENT_TYPE_NOT_SUPPORTED',
        'Research jobs can only use a Business Research or Lead Research agent.',
      );
    }
    if (!agent.enabled) {
      throw new ApiError(
        409,
        'AGENT_DISABLED',
        'This agent is disabled. Enable it before starting research.',
      );
    }
    return agent;
  }

  const preferred = SUBJECT_AGENT_TYPE[subjectType] || 'business_research';
  for (const type of [preferred, 'business_research']) {
    const agents = await listAgents(workspaceId, { type, enabled: true });
    if (agents[0]) return agents[0];
  }

  throw new ApiError(
    409,
    'AGENT_NOT_CONFIGURED',
    'Create and enable a Business Research agent before starting research.',
  );
}

async function assertProviderReadyForAgent(workspaceId, agent) {
  if (agent.approvalRequired) return;

  const definition = getProviderDefinition(agent.provider);
  if (!definition) {
    throw new ApiError(
      409,
      'PROVIDER_UNSUPPORTED',
      'This agent uses a provider that is no longer supported.',
    );
  }
  const setting = await getProviderSetting(workspaceId, agent.provider);
  if (setting && setting.enabled === false) {
    throw new ApiError(
      409,
      'PROVIDER_DISABLED',
      `${definition.label} is disabled for this workspace. Re-enable it in AI settings.`,
    );
  }
  if (!isProviderConfigured(agent.provider)) {
    throw new ApiError(
      409,
      'AI_NOT_CONFIGURED',
      `${definition.label} is not configured on this server. Add ${definition.envKeys.join(' or ')} to enable AI execution.`,
    );
  }
}

export async function createResearchJob({
  workspaceId,
  userId,
  data,
  enqueuePrep = enqueueResearchJob,
}) {
  const lead = data.leadId
    ? await assertLeadInWorkspace(workspaceId, data.leadId)
    : null;

  const agent = await resolveAgent({
    workspaceId,
    subjectType: data.subjectType,
    agentId: data.agentId,
  });
  await assertProviderReadyForAgent(workspaceId, agent);

  const rows = await getDb()
    .insert(researchJobs)
    .values({
      workspaceId,
      requestedByUserId: userId,
      subjectType: data.subjectType,
      leadId: lead?.id || null,
      agentId: agent.id,
      companyName: data.companyName || lead?.companyName || null,
      websiteUrl: data.websiteUrl || lead?.website || null,
      industry: data.industry || lead?.industry || null,
      objective: data.objective,
    })
    .returning();
  const job = rows[0];

  let jobId;
  try {
    jobId = await enqueuePrep(job.id);
    if (!jobId) throw new Error('The research queue rejected the job');
    await getDb()
      .update(researchJobs)
      .set({ jobId })
      .where(
        and(
          eq(researchJobs.workspaceId, workspaceId),
          eq(researchJobs.id, job.id),
        ),
      );
  } catch {
    const message =
      'The background queue is unavailable. Start the worker and try again.';
    await markJobStatus(job, 'failed', {
      errorMessage: message,
      completedAt: new Date(),
    });
    await recordAudit({
      workspaceId,
      actorUserId: userId,
      action: 'research.failed',
      resourceType: 'research_job',
      resourceId: job.id,
      success: false,
      metadata: { reason: 'queue_unavailable' },
    });
    throw new ApiError(503, 'QUEUE_UNAVAILABLE', message);
  }

  await recordAudit({
    workspaceId,
    actorUserId: userId,
    action: 'research.create',
    resourceType: 'research_job',
    resourceId: job.id,
    metadata: {
      subjectType: job.subjectType,
      agentId: agent.id,
      leadId: job.leadId,
    },
  });

  return jobSummary({ ...job, jobId });
}

export async function listResearchJobs(workspaceId, query) {
  const filters = [eq(researchJobs.workspaceId, workspaceId)];
  if (query.status) filters.push(eq(researchJobs.status, query.status));
  if (query.subjectType) {
    filters.push(eq(researchJobs.subjectType, query.subjectType));
  }
  if (query.leadId) filters.push(eq(researchJobs.leadId, query.leadId));
  if (query.search) {
    const like = `%${query.search.replace(/[\\%_]/g, '\\$&')}%`;
    filters.push(
      or(
        ilike(researchJobs.companyName, like),
        ilike(researchJobs.websiteUrl, like),
        ilike(researchJobs.industry, like),
        ilike(researchJobs.objective, like),
      ),
    );
  }

  const where = and(...filters);
  const offset = (query.page - 1) * query.pageSize;

  const [rows, totals] = await Promise.all([
    getDb()
      .select({
        job: researchJobs,
        requestedByName: users.name,
        requestedByEmail: users.email,
      })
      .from(researchJobs)
      .leftJoin(users, eq(users.id, researchJobs.requestedByUserId))
      .where(where)
      .orderBy(desc(researchJobs.createdAt))
      .limit(query.pageSize)
      .offset(offset),
    getDb().select({ value: count() }).from(researchJobs).where(where),
  ]);

  const total = Number(totals[0]?.value || 0);
  return {
    items: rows.map((row) =>
      jobSummary({
        ...row.job,
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

export async function getResearchJob(workspaceId, researchId) {
  const loaded = await loadJob(workspaceId, researchId);
  if (!loaded) return null;

  const db = getDb();
  const [findings, sources, run] = await Promise.all([
    db
      .select()
      .from(researchFindings)
      .where(
        and(
          eq(researchFindings.workspaceId, workspaceId),
          eq(researchFindings.researchId, researchId),
        ),
      )
      .orderBy(asc(researchFindings.createdAt)),
    db
      .select()
      .from(researchSources)
      .where(
        and(
          eq(researchSources.workspaceId, workspaceId),
          eq(researchSources.researchId, researchId),
        ),
      )
      .orderBy(asc(researchSources.retrievedAt)),
    loaded.job.runId ? getRun(workspaceId, loaded.job.runId) : null,
  ]);

  return {
    job: jobSummary({
      ...loaded.job,
      requestedByName: loaded.requestedByName,
      requestedByEmail: loaded.requestedByEmail,
    }),
    findings,
    sources,
    run,
    canCancel: !TERMINAL.has(loaded.job.status),
  };
}

async function gatherSources(job, { fetchPage = safeFetch } = {}) {
  const sources = [];

  if (job.websiteUrl) {
    let response;
    try {
      response = await fetchPage(job.websiteUrl, {
        maxBytes: 400_000,
        maxDecodedBytes: 800_000,
        timeoutMs: 12_000,
        maxRedirects: 2,
      });
    } catch (error) {
      if (RETRYABLE_FETCH_CODES.has(error?.code)) throw error;
      throw new ApiError(
        422,
        'RESEARCH_SOURCE_UNREACHABLE',
        `The website could not be fetched (${error?.code || 'network_error'}).`,
      );
    }

    if (response.status >= 200 && response.status < 300 && response.text) {
      const title = extractTitle(response.text);
      const meta = extractMeta(response.text);
      sources.push({
        url: response.redirects?.length
          ? response.redirects[response.redirects.length - 1]
          : response.url,
        title: title || job.companyName || response.url,
        kind: 'website',
        httpStatus: response.status,
        excerpt: clip(
          [
            meta.description ? `Meta description: ${clip(meta.description, 400)}` : null,
            extractText(response.text, 2_600),
          ]
            .filter(Boolean)
            .join('\n\n'),
          3_000,
        ),
      });
    } else {
      throw new ApiError(
        422,
        'RESEARCH_SOURCE_UNREACHABLE',
        `The website returned HTTP ${response.status}.`,
      );
    }
  }

  if (job.leadId) {
    const leadRows = await getDb()
      .select()
      .from(leads)
      .where(
        and(eq(leads.workspaceId, job.workspaceId), eq(leads.id, job.leadId)),
      )
      .limit(1);
    const lead = leadRows[0];
    if (!lead) {
      throw new ApiError(404, 'LEAD_NOT_FOUND', 'That lead could not be found.');
    }
      sources.push({
        url: `crm:lead:${lead.id}`,
        title: `CRM lead · ${lead.companyName}`,
        kind: 'lead_record',
        httpStatus: null,
        excerpt: clip(
          [
            `Company: ${lead.companyName}`,
            lead.contactName ? `Contact: ${lead.contactName}` : null,
            lead.email ? `Email: ${lead.email}` : null,
            lead.industry ? `Industry: ${lead.industry}` : null,
            lead.location ? `Location: ${lead.location}` : null,
            lead.status ? `Pipeline status: ${lead.status}` : null,
            lead.notes ? `Notes: ${lead.notes}` : null,
          ]
            .filter(Boolean)
            .join('\n'),
          2_000,
        ),
      });
  }

  return sources;
}

function buildPrompt(job, sources) {
  const sourceText = sources
    .map((source, index) => {
      const header = [
        `--- SOURCE ${index + 1} ---`,
        source.kind === 'lead_record'
          ? 'URL: (internal CRM record)'
          : `URL: ${source.url}`,
        source.httpStatus ? `HTTP status: ${source.httpStatus}` : null,
        `Title: ${source.title}`,
      ]
        .filter(Boolean)
        .join('\n');
      return `${header}\nExcerpt:\n${source.excerpt}`;
    })
    .join('\n\n');

  return [
    'Produce a business research brief for an internal team.',
    '',
    `Subject type: ${job.subjectType}`,
    job.companyName ? `Company: ${job.companyName}` : null,
    job.websiteUrl ? `Website: ${job.websiteUrl}` : null,
    job.industry ? `Industry: ${job.industry}` : null,
    `Objective: ${job.objective}`,
    '',
    'Sources supplied by the research worker:',
    sourceText || 'No external sources were supplied.',
    '',
    'Rules:',
    '- Use only the supplied sources and subject details. Never invent facts, figures, certifications or clients.',
    '- Label each finding with exactly one verification value:',
    '  verified = directly observed in a supplied source;',
    '  source_derived = a close, explicit inference from a supplied source;',
    '  ai_analysis = your own reasoning, not stated by a source;',
    '  unverified = could not be checked.',
    '- A finding that is not directly supported by a supplied source must not be labelled verified or source_derived.',
    '- Include the source URL when the finding comes from a supplied source.',
    '- Cover: company overview, website overview, services, industry, business model observations, potential requirements, growth or technology opportunities, risks and suggested next steps.',
    '',
    'Return ONLY a JSON object, with no markdown fences, matching:',
    `{"summary": string, "findings": [{"category": one of ${JSON.stringify(RESEARCH_CATEGORIES)}, "title": string, "detail": string, "verification": one of ${JSON.stringify(RESEARCH_VERIFICATIONS)}, "sourceUrl": string|null}]}`,
    'Provide between 4 and 20 findings. Keep each detail under 900 characters.',
  ]
    .filter((line) => line !== null)
    .join('\n');
}

function extractJsonObject(text) {
  const value = String(text || '').trim();
  if (!value) return null;

  const start = value.indexOf('{');
  const end = value.lastIndexOf('}');
  if (start < 0 || end <= start) return null;

  try {
    return JSON.parse(value.slice(start, end + 1));
  } catch {
    return null;
  }
}

function normalizeSourceUrl(value) {
  if (!value || typeof value !== 'string') return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.href;
  } catch {
    return null;
  }
}

export function parseResearchOutput(text, fetchedUrls = []) {
  const allowedSources = new Set(
    fetchedUrls.map((url) => normalizeSourceUrl(url)).filter(Boolean),
  );
  const parsed = extractJsonObject(text);

  if (!parsed || !Array.isArray(parsed.findings)) {
    const fallback = clip(text, 8_000);
    return {
      summary: null,
      parser: 'text',
      findings:
        fallback && fallback.trim()
          ? [
              {
                category: 'overview',
                title: 'Unstructured research output',
                detail: fallback,
                verification: 'ai_analysis',
                sourceUrl: null,
              },
            ]
          : [],
      referencedSources: [],
    };
  }

  const referencedSources = [];
  const findings = [];

  for (const item of parsed.findings.slice(0, 40)) {
    if (!item || typeof item !== 'object') continue;
    const title = clip(item.title, 200).trim();
    const detail = clip(item.detail, 2_000).trim();
    if (!title || !detail) continue;

    const category = RESEARCH_CATEGORIES.includes(item.category)
      ? item.category
      : 'overview';
    let verification = RESEARCH_VERIFICATIONS.includes(item.verification)
      ? item.verification
      : 'unverified';
    const sourceUrl = normalizeSourceUrl(item.sourceUrl);

    if (
      (verification === 'verified' || verification === 'source_derived') &&
      (!sourceUrl || !allowedSources.has(sourceUrl))
    ) {
      verification = 'ai_analysis';
    }

    if (sourceUrl && !allowedSources.has(sourceUrl)) {
      referencedSources.push(sourceUrl);
    }

    findings.push({ category, title, detail, verification, sourceUrl });
  }

  return {
    summary:
      typeof parsed.summary === 'string' ? clip(parsed.summary, 2_000) : null,
    parser: 'json',
    findings,
    referencedSources: [...new Set(referencedSources)],
  };
}

async function claimJob(job) {
  const rows = await getDb()
    .update(researchJobs)
    .set({ status: 'running', startedAt: new Date() })
    .where(
      and(
        eq(researchJobs.id, job.id),
        eq(researchJobs.workspaceId, job.workspaceId),
        eq(researchJobs.status, 'queued'),
        isNull(researchJobs.startedAt),
        eq(researchJobs.cancelRequested, false),
      ),
    )
    .returning();
  return rows[0] || null;
}

async function markJobStatus(job, status, extra = {}) {
  await getDb()
    .update(researchJobs)
    .set({ status, updatedAt: new Date(), ...extra })
    .where(
      and(
        eq(researchJobs.id, job.id),
        eq(researchJobs.workspaceId, job.workspaceId),
        inArray(researchJobs.status, ['queued', 'running', 'awaiting_approval']),
      ),
    );
}

async function failJob(job, message) {
  await markJobStatus(job, 'failed', {
    errorMessage: clip(message, 1_000),
    completedAt: new Date(),
  });
  await recordAudit({
    workspaceId: job.workspaceId,
    actorType: 'system',
    action: 'research.failed',
    resourceType: 'research_job',
    resourceId: job.id,
    success: false,
    metadata: { reason: clip(message, 300) },
  });
}

export async function prepareResearchJob(researchId, deps = {}) {
  const job = await loadJobById(researchId);
  if (!job) return { status: 'missing' };

  if (job.status !== 'queued') {
    return { status: 'skipped', reason: `status:${job.status}` };
  }
  if (job.cancelRequested) {
    await markJobStatus(job, 'cancelled', { completedAt: new Date() });
    return { status: 'cancelled' };
  }

  const claimed = await claimJob(job);
  if (!claimed) return { status: 'skipped', reason: 'claim-lost' };

  try {
    const sources = await gatherSources(job, deps);

    const stillCancelled = await getDb()
      .select({ cancelRequested: researchJobs.cancelRequested })
      .from(researchJobs)
      .where(eq(researchJobs.id, job.id))
      .limit(1);
    if (!stillCancelled[0] || stillCancelled[0].cancelRequested) {
      await markJobStatus(job, 'cancelled', { completedAt: new Date() });
      return { status: 'cancelled' };
    }

    if (sources.length > 0) {
      await getDb().insert(researchSources).values(
        sources.map((source) => ({
          workspaceId: job.workspaceId,
          researchId: job.id,
          url: source.url,
          title: source.title,
          kind: source.kind,
          httpStatus: source.httpStatus,
          excerpt: source.excerpt,
        })),
      );
    }

    const agent = await resolveAgent({
      workspaceId: job.workspaceId,
      subjectType: job.subjectType,
      agentId: job.agentId,
    });

    const input = buildPrompt(job, sources);
    const { run } = await createAgentRun({
      workspaceId: job.workspaceId,
      agentId: agent.id,
      userId: job.requestedByUserId,
      input,
      idempotencyKey: `research:${job.id}`,
      ...(deps.enqueueRun ? { enqueue: deps.enqueueRun } : {}),
    });

    const status =
      run.status === 'failed'
        ? 'failed'
        : run.status === 'awaiting_approval'
          ? 'awaiting_approval'
          : 'queued';

    await markJobStatus(job, status, {
      agentId: agent.id,
      runId: run.id,
      sourceCount: sources.length,
      errorMessage: run.status === 'failed' ? run.errorMessage : null,
      ...(status === 'failed' ? { completedAt: new Date() } : {}),
    });

    await recordAudit({
      workspaceId: job.workspaceId,
      actorType: 'system',
      action: 'research.started',
      resourceType: 'research_job',
      resourceId: job.id,
      success: status !== 'failed',
      metadata: {
        agentId: agent.id,
        runId: run.id,
        sources: sources.length,
        status,
      },
    });

    return { status: 'started', runId: run.id, jobStatus: status };
  } catch (error) {
    if (RETRYABLE_FETCH_CODES.has(error?.code)) {
      // Release the claim so pg-boss can retry the preparation job.
      await getDb()
        .update(researchJobs)
        .set({ status: 'queued', startedAt: null, updatedAt: new Date() })
        .where(
          and(
            eq(researchJobs.id, job.id),
            eq(researchJobs.workspaceId, job.workspaceId),
            eq(researchJobs.status, 'running'),
          ),
        );
      throw error;
    }

    const message =
      error instanceof ApiError
        ? error.code === 'AI_NOT_CONFIGURED'
          ? `AI_NOT_CONFIGURED: ${error.message}`
          : error.message
        : 'Research preparation failed.';
    await failJob(job, message);
    return { status: 'failed', reason: error?.code || 'error' };
  }
}

export async function finalizeResearchForRun(runId) {
  const rows = await getDb()
    .select()
    .from(researchJobs)
    .where(eq(researchJobs.runId, runId))
    .limit(1);
  const job = rows[0];
  if (!job) return { skipped: true };
  if (TERMINAL.has(job.status)) return { status: job.status, unchanged: true };

  const detail = await getRun(job.workspaceId, runId);
  if (!detail) return { skipped: true };

  const run = detail.run;
  if (run.status === 'awaiting_approval' || run.status === 'queued' || run.status === 'running') {
    await getDb()
      .update(researchJobs)
      .set({ status: run.status, updatedAt: new Date() })
      .where(
        and(
          eq(researchJobs.id, job.id),
          eq(researchJobs.workspaceId, job.workspaceId),
          inArray(researchJobs.status, ['queued', 'running', 'awaiting_approval']),
        ),
      );
    return { status: run.status };
  }

  if (run.status === 'failed' || run.status === 'cancelled') {
    await markJobStatus(job, run.status, {
      errorMessage: run.errorMessage || null,
      completedAt: new Date(),
    });
    await recordAudit({
      workspaceId: job.workspaceId,
      actorType: 'system',
      action: run.status === 'cancelled' ? 'research.cancelled' : 'research.failed',
      resourceType: 'research_job',
      resourceId: job.id,
      success: false,
      metadata: { runId },
    });
    return { status: run.status };
  }

  if (run.status !== 'completed') return { skipped: true, reason: run.status };

  const sourceRows = await getDb()
    .select({ url: researchSources.url })
    .from(researchSources)
    .where(
      and(
        eq(researchSources.workspaceId, job.workspaceId),
        eq(researchSources.researchId, job.id),
      ),
    );

  const parsed = parseResearchOutput(
    run.output?.text || '',
    sourceRows.map((row) => row.url).filter(Boolean),
  );

  const claimed = await getDb()
    .update(researchJobs)
    .set({ status: 'completed', completedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(researchJobs.id, job.id),
        eq(researchJobs.workspaceId, job.workspaceId),
        inArray(researchJobs.status, ['queued', 'running', 'awaiting_approval']),
      ),
    )
    .returning({ id: researchJobs.id });

  if (!claimed[0]) return { status: 'skipped', reason: 'already-finalized' };

  if (parsed.findings.length > 0) {
    await getDb().insert(researchFindings).values(
      parsed.findings.map((finding) => ({
        workspaceId: job.workspaceId,
        researchId: job.id,
        category: finding.category,
        title: finding.title,
        detail: finding.detail,
        verification: finding.verification,
        sourceUrl: finding.sourceUrl,
      })),
    );
  }

  if (parsed.referencedSources.length > 0) {
    const existing = new Set(sourceRows.map((row) => normalizeSourceUrl(row.url)));
    const additions = parsed.referencedSources.filter(
      (url) => !existing.has(url),
    );
    if (additions.length > 0) {
      await getDb().insert(researchSources).values(
        additions.map((url) => ({
          workspaceId: job.workspaceId,
          researchId: job.id,
          url,
          title: 'Referenced by the research agent (not fetched)',
          kind: 'ai_reference',
          httpStatus: null,
          excerpt: null,
        })),
      );
    }
  }

  await getDb()
    .update(researchJobs)
    .set({
      output: {
        summary: parsed.summary,
        findingCount: parsed.findings.length,
        parser: parsed.parser,
      },
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(researchJobs.id, job.id),
        eq(researchJobs.workspaceId, job.workspaceId),
      ),
    );

  if (job.leadId) {
    await getDb().insert(leadActivities).values({
      workspaceId: job.workspaceId,
      leadId: job.leadId,
      actorUserId: null,
      type: 'research_completed',
      body: `Research completed with ${parsed.findings.length} findings.`,
      metadata: { researchId: job.id, runId },
    });
  }

  await recordAudit({
    workspaceId: job.workspaceId,
    actorType: 'system',
    action: 'research.completed',
    resourceType: 'research_job',
    resourceId: job.id,
    metadata: {
      runId,
      findings: parsed.findings.length,
      parser: parsed.parser,
      leadLinked: Boolean(job.leadId),
    },
  });

  return { status: 'completed', findings: parsed.findings.length };
}

export async function cancelResearchJob({ workspaceId, userId, researchId }) {
  const loaded = await loadJob(workspaceId, researchId);
  if (!loaded) return null;
  const job = loaded.job;

  if (TERMINAL.has(job.status)) {
    throw new ApiError(
      409,
      'RESEARCH_FINISHED',
      'This research job has already finished.',
    );
  }

  await getDb()
    .update(researchJobs)
    .set({ cancelRequested: true, updatedAt: new Date() })
    .where(
      and(
        eq(researchJobs.workspaceId, workspaceId),
        eq(researchJobs.id, researchId),
      ),
    );

  if (job.runId) {
    try {
      await cancelAgentRun({ workspaceId, runId: job.runId, userId });
    } catch (error) {
      if (!(error instanceof ApiError) || error.code !== 'RUN_FINISHED') {
        throw error;
      }
    }
    await finalizeResearchForRun(job.runId);
  } else {
    await markJobStatus(job, 'cancelled', { completedAt: new Date() });
  }

  await recordAudit({
    workspaceId,
    actorUserId: userId,
    action: 'research.cancel',
    resourceType: 'research_job',
    resourceId: researchId,
    metadata: { runId: job.runId },
  });

  const next = await loadJob(workspaceId, researchId);
  return jobSummary({
    ...next.job,
    requestedByName: next.requestedByName,
    requestedByEmail: next.requestedByEmail,
  });
}

export async function getResearchOverview(workspaceId) {
  const rows = await getDb()
    .select({ status: researchJobs.status, value: count() })
    .from(researchJobs)
    .where(eq(researchJobs.workspaceId, workspaceId))
    .groupBy(researchJobs.status);

  const byStatus = {};
  let total = 0;
  for (const row of rows) {
    const value = Number(row.value || 0);
    byStatus[row.status] = value;
    total += value;
  }

  const [latest] = await getDb()
    .select({ createdAt: researchJobs.createdAt })
    .from(researchJobs)
    .where(eq(researchJobs.workspaceId, workspaceId))
    .orderBy(desc(researchJobs.createdAt))
    .limit(1);

  return {
    total,
    byStatus,
    active:
      (byStatus.queued || 0) +
      (byStatus.running || 0) +
      (byStatus.awaiting_approval || 0),
    completed: byStatus.completed || 0,
    lastCreatedAt: latest?.createdAt || null,
  };
}
