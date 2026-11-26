import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  lte,
  or,
  sql,
} from 'drizzle-orm';
import { getDb } from '@/db/client';
import {
  agents,
  clients,
  marketingCampaigns,
  marketingContentItems,
  marketingContentVersions,
  marketingProfiles,
  projects,
  users,
} from '@/db/schema';
import { createAgentRun, getRunDetail } from '@/lib/ai/runtime';
import { ApiError } from '@/lib/api-error';
import { recordAudit } from '@/lib/audit';
import { runAtomic } from '@/lib/clients/helpers';
import {
  CONTENT_TRANSITIONS,
  CONTENT_TYPE_LABELS,
  NO_EXTERNAL_PUBLISHING_NOTE,
  canTransition,
  MARKETING_SERVICE_LABELS,
} from './constants';
import {
  assertCampaign,
  assertClient,
  assertContentItem,
  assertDateOrder,
  assertMembers,
  assertProject,
  escapeLike,
  staleError,
} from './helpers';

const CONTENT_SELECT = {
  id: marketingContentItems.id,
  clientId: marketingContentItems.clientId,
  clientName: clients.companyName,
  clientReference: clients.reference,
  campaignId: marketingContentItems.campaignId,
  campaignName: marketingCampaigns.name,
  projectId: marketingContentItems.projectId,
  projectName: projects.name,
  contentType: marketingContentItems.contentType,
  title: marketingContentItems.title,
  targetAudience: marketingContentItems.targetAudience,
  targetKeyword: marketingContentItems.targetKeyword,
  targetPlatform: marketingContentItems.targetPlatform,
  language: marketingContentItems.language,
  status: marketingContentItems.status,
  latestVersion: marketingContentItems.latestVersion,
  approvedVersion: marketingContentItems.approvedVersion,
  generationSource: marketingContentItems.generationSource,
  agentRunId: marketingContentItems.agentRunId,
  ownerUserId: marketingContentItems.ownerUserId,
  ownerName: users.name,
  scheduledFor: marketingContentItems.scheduledFor,
  dueDate: marketingContentItems.dueDate,
  reviewFeedback: marketingContentItems.reviewFeedback,
  reviewedAt: marketingContentItems.reviewedAt,
  publishedAt: marketingContentItems.publishedAt,
  publishNote: marketingContentItems.publishNote,
  archivedAt: marketingContentItems.archivedAt,
  createdAt: marketingContentItems.createdAt,
  updatedAt: marketingContentItems.updatedAt,
};

const CONTENT_JOINS = (query) =>
  query
    .innerJoin(clients, eq(clients.id, marketingContentItems.clientId))
    .leftJoin(
      marketingCampaigns,
      eq(marketingCampaigns.id, marketingContentItems.campaignId),
    )
    .leftJoin(projects, eq(projects.id, marketingContentItems.projectId))
    .leftJoin(users, eq(users.id, marketingContentItems.ownerUserId));

function toIso(value) {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function ensureCurrent(expected, actual, label = 'content') {
  if (!expected) return;
  if (toIso(expected) !== toIso(actual)) throw staleError(label);
}

export async function listContent(workspaceId, viewerUserId, query) {
  const filters = [eq(marketingContentItems.workspaceId, workspaceId)];
  if (query.status) filters.push(eq(marketingContentItems.status, query.status));
  if (query.clientId) filters.push(eq(marketingContentItems.clientId, query.clientId));
  if (query.campaignId) {
    filters.push(eq(marketingContentItems.campaignId, query.campaignId));
  }
  if (query.contentType) {
    filters.push(eq(marketingContentItems.contentType, query.contentType));
  }
  if (query.platform) {
    filters.push(eq(marketingContentItems.targetPlatform, query.platform));
  }
  if (query.owner === 'me') {
    filters.push(eq(marketingContentItems.ownerUserId, viewerUserId));
  } else if (query.owner) {
    filters.push(eq(marketingContentItems.ownerUserId, query.owner));
  }
  if (query.from) filters.push(gte(marketingContentItems.scheduledFor, query.from));
  if (query.to) filters.push(lte(marketingContentItems.scheduledFor, query.to));
  if (query.from || query.to) {
    filters.push(sql`${marketingContentItems.scheduledFor} is not null`);
  }
  if (query.search) {
    const like = `%${escapeLike(query.search)}%`;
    filters.push(
      or(
        ilike(marketingContentItems.title, like),
        ilike(clients.companyName, like),
        ilike(marketingCampaigns.name, like),
      ),
    );
  }
  assertDateOrder(query.from, query.to, 'from');
  const where = and(...filters);
  const offset = (query.page - 1) * query.pageSize;
  const calendarView = query.view !== 'list';
  const order = calendarView
    ? asc(marketingContentItems.scheduledFor)
    : desc(marketingContentItems.updatedAt);

  const [rows, totals] = await Promise.all([
    CONTENT_JOINS(getDb().select(CONTENT_SELECT).from(marketingContentItems))
      .where(where)
      .orderBy(order)
      .limit(query.pageSize)
      .offset(offset),
    getDb()
      .select({ value: count() })
      .from(marketingContentItems)
      .innerJoin(clients, eq(clients.id, marketingContentItems.clientId))
      .leftJoin(
        marketingCampaigns,
        eq(marketingCampaigns.id, marketingContentItems.campaignId),
      )
      .where(where),
  ]);

  const total = Number(totals[0]?.value || 0);
  return {
    items: rows,
    total,
    page: query.page,
    pageSize: query.pageSize,
    pages: Math.max(1, Math.ceil(total / query.pageSize)),
    view: query.view,
  };
}

export async function getContentOverview(workspaceId) {
  const rows = await getDb()
    .select({
      status: marketingContentItems.status,
      value: count(),
    })
    .from(marketingContentItems)
    .where(eq(marketingContentItems.workspaceId, workspaceId))
    .groupBy(marketingContentItems.status);

  const statusCounts = {};
  let total = 0;
  for (const row of rows) {
    const value = Number(row.value || 0);
    statusCounts[row.status] = value;
    total += value;
  }
  return {
    total,
    statusCounts,
    awaitingReview: statusCounts.in_review || 0,
    scheduled: statusCounts.scheduled || 0,
    approved: statusCounts.approved || 0,
  };
}

export async function getContentItem(workspaceId, contentId) {
  const rows = await CONTENT_JOINS(
    getDb().select(CONTENT_SELECT).from(marketingContentItems),
  )
    .where(
      and(
        eq(marketingContentItems.workspaceId, workspaceId),
        eq(marketingContentItems.id, contentId),
      ),
    )
    .limit(1);
  const item = rows[0];
  if (!item) throw new ApiError(404, 'NOT_FOUND', 'That content item could not be found.');

  const versions = await getDb()
    .select({
      id: marketingContentVersions.id,
      version: marketingContentVersions.version,
      body: marketingContentVersions.body,
      generationSource: marketingContentVersions.generationSource,
      aiMetadata: marketingContentVersions.aiMetadata,
      changeNote: marketingContentVersions.changeNote,
      createdByUserId: marketingContentVersions.createdByUserId,
      createdByName: users.name,
      createdAt: marketingContentVersions.createdAt,
    })
    .from(marketingContentVersions)
    .leftJoin(users, eq(users.id, marketingContentVersions.createdByUserId))
    .where(
      and(
        eq(marketingContentVersions.workspaceId, workspaceId),
        eq(marketingContentVersions.contentItemId, contentId),
      ),
    )
    .orderBy(desc(marketingContentVersions.version))
    .limit(60);

  return {
    item,
    versions,
    latest: versions.find((version) => version.version === item.latestVersion) || null,
    approved: versions.find((version) => version.version === item.approvedVersion) || null,
    publishingNote: NO_EXTERNAL_PUBLISHING_NOTE,
  };
}

async function assertContentLinks(workspaceId, data, clientId) {
  await assertCampaign(workspaceId, data.campaignId, clientId);
  await assertProject(workspaceId, data.projectId, clientId);
  if (data.ownerUserId) await assertMembers(workspaceId, [data.ownerUserId]);
  assertDateOrder(data.scheduledFor, data.dueDate, 'dueDate');
}

export async function createContentItem({ workspaceId, userId, data }) {
  const client = await assertClient(workspaceId, data.clientId);
  await assertContentLinks(workspaceId, data, client.id);

  const contentId = await runAtomic(async (executor) => {
    const rows = await executor
      .insert(marketingContentItems)
      .values({
        workspaceId,
        clientId: client.id,
        campaignId: data.campaignId || null,
        projectId: data.projectId || null,
        contentType: data.contentType,
        title: data.title,
        targetAudience: data.targetAudience ?? null,
        targetKeyword: data.targetKeyword ?? null,
        targetPlatform: data.targetPlatform ?? null,
        language: data.language || 'en',
        status: data.status || 'draft',
        latestVersion: 1,
        generationSource: 'manual',
        ownerUserId: data.ownerUserId || null,
        scheduledFor: data.scheduledFor ?? null,
        dueDate: data.dueDate ?? null,
        createdByUserId: userId,
        updatedByUserId: userId,
      })
      .returning({ id: marketingContentItems.id });

    const id = rows[0].id;
    await executor.insert(marketingContentVersions).values({
      workspaceId,
      contentItemId: id,
      version: 1,
      body: data.body,
      generationSource: 'manual',
      aiMetadata: { generator: 'human', ai: false },
      createdByUserId: userId,
      changeNote: 'Initial draft',
    });
    return id;
  });

  await recordAudit({
    workspaceId,
    actorUserId: userId,
    action: 'marketing.content_create',
    resourceType: 'marketing_content',
    resourceId: contentId,
    metadata: {
      clientId: client.id,
      contentType: data.contentType,
      campaignId: data.campaignId || null,
    },
  });

  return getContentItem(workspaceId, contentId);
}

export async function updateContentMetadata({
  workspaceId,
  userId,
  contentId,
  data,
}) {
  const existing = await assertContentItem(workspaceId, contentId);
  ensureCurrent(data.expectedUpdatedAt, existing.updatedAt);
  await assertContentLinks(workspaceId, data, existing.clientId);

  await getDb()
    .update(marketingContentItems)
    .set({
      campaignId: data.campaignId || null,
      projectId: data.projectId || null,
      title: data.title,
      targetAudience: data.targetAudience ?? null,
      targetKeyword: data.targetKeyword ?? null,
      targetPlatform: data.targetPlatform ?? null,
      language: data.language || 'en',
      ownerUserId: data.ownerUserId || null,
      scheduledFor: data.scheduledFor ?? null,
      dueDate: data.dueDate ?? null,
      updatedByUserId: userId,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(marketingContentItems.workspaceId, workspaceId),
        eq(marketingContentItems.id, contentId),
      ),
    );

  await recordAudit({
    workspaceId,
    actorUserId: userId,
    action: 'marketing.content_update',
    resourceType: 'marketing_content',
    resourceId: contentId,
    metadata: { title: data.title },
  });

  return getContentItem(workspaceId, contentId);
}

async function appendVersion({
  workspaceId,
  userId,
  item,
  body,
  generationSource,
  aiMetadata,
  changeNote,
}) {
  if (item.archivedAt) {
    throw new ApiError(
      409,
      'CONTENT_ARCHIVED',
      'Archived content cannot receive new versions.',
    );
  }
  const next = item.latestVersion + 1;
  await runAtomic(async (executor) => {
    await executor.insert(marketingContentVersions).values({
      workspaceId,
      contentItemId: item.id,
      version: next,
      body,
      generationSource,
      aiMetadata: aiMetadata || null,
      createdByUserId: userId,
      changeNote: changeNote || null,
    });
    const returnsToDraft = !['idea', 'draft'].includes(item.status);
    await executor
      .update(marketingContentItems)
      .set({
        latestVersion: next,
        status: item.status === 'idea' ? 'idea' : 'draft',
        scheduledFor: returnsToDraft ? null : item.scheduledFor,
        publishedAt: returnsToDraft ? null : item.publishedAt,
        publishNote: returnsToDraft ? null : item.publishNote,
        reviewFeedback: null,
        reviewedByUserId: null,
        reviewedAt: null,
        updatedByUserId: userId,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(marketingContentItems.workspaceId, workspaceId),
          eq(marketingContentItems.id, item.id),
        ),
      );
  });
  return next;
}

export async function addContentVersion({
  workspaceId,
  userId,
  contentId,
  data,
}) {
  const item = await assertContentItem(workspaceId, contentId);
  if (Number(data.expectedVersion) !== item.latestVersion) {
    throw staleError('content');
  }
  const version = await appendVersion({
    workspaceId,
    userId,
    item,
    body: data.body,
    generationSource: 'manual',
    aiMetadata: { generator: 'human', ai: false },
    changeNote: data.changeNote,
  });

  await recordAudit({
    workspaceId,
    actorUserId: userId,
    action: 'marketing.content_version',
    resourceType: 'marketing_content',
    resourceId: contentId,
    metadata: { version, generationSource: 'manual' },
  });

  return getContentItem(workspaceId, contentId);
}

function buildGenerationInput(item, profile, client) {
  const services = (profile?.selectedServices || [])
    .map((key) => MARKETING_SERVICE_LABELS[key])
    .filter(Boolean)
    .join(', ');
  return [
    `Client: ${client.companyName}`,
    `Industry: ${profile?.industry || client.industry || 'not recorded'}`,
    `Business description: ${profile?.businessDescription || 'not recorded'}`,
    `Target audience: ${item.targetAudience || profile?.targetAudience || 'not recorded'}`,
    `Selected services: ${services || 'not recorded'}`,
    `Brand voice: ${profile?.brandVoice || 'not recorded'}`,
    `Language: ${item.language || profile?.contentLanguage || 'en'}`,
    `Content type: ${CONTENT_TYPE_LABELS[item.contentType] || item.contentType}`,
    `Title: ${item.title}`,
    `Target keyword: ${item.targetKeyword || 'not specified'}`,
    `Target platform: ${item.targetPlatform || 'not specified'}`,
    'Write the draft. Do not invent facts, prices, statistics, testimonials or offers. Mark anything that needs verification as [VERIFY: ...].',
  ].join('\n');
}

function buildLocalContentDraft(item, profile) {
  const audience =
    item.targetAudience || profile?.targetAudience || '[Add target audience]';
  const keyword = item.targetKeyword || '[Add target keyword]';
  const voice = profile?.brandVoice || '[Add brand voice guidance]';
  return [
    `# ${item.title}`,
    '',
    `> Local template draft. No AI provider was called and nothing was published.`,
    '',
    `**Content type:** ${CONTENT_TYPE_LABELS[item.contentType] || item.contentType}`,
    `**Audience:** ${audience}`,
    `**Target keyword:** ${keyword}`,
    `**Brand voice:** ${voice}`,
    '',
    '## Suggested structure',
    '1. Open with the client problem in plain language.',
    '2. Explain the service or offer using only verified details.',
    '3. Add proof points only where the client has supplied evidence.',
    '4. Close with one clear next step.',
    '',
    '## Draft',
    '[Write the opening paragraph here. Add only facts supplied by the client.]',
    '',
    '- [VERIFY: service scope]',
    '- [VERIFY: pricing or offer details]',
    '- [VERIFY: statistics, testimonials or claims]',
    '',
    '## Review checklist',
    '- Facts, prices and claims confirmed by a human.',
    '- Target keyword used naturally.',
    '- Approved by the client before any external use.',
  ].join('\n');
}

export async function requestAgentDraft({ workspaceId, userId, input }) {
  const rows = await getDb()
    .select({ id: agents.id, name: agents.name, type: agents.type })
    .from(agents)
    .where(
      and(
        eq(agents.workspaceId, workspaceId),
        eq(agents.enabled, true),
        inArray(agents.type, ['seo_analysis', 'documentation_assistant', 'custom']),
      ),
    )
    .orderBy(asc(agents.createdAt))
    .limit(1);
  const agent = rows[0];
  if (!agent) return { mode: 'local', reason: 'NO_AGENT' };

  try {
    const { run, reused } = await createAgentRun({
      workspaceId,
      agentId: agent.id,
      userId,
      input,
    });
    return { mode: 'agent', run, reused, agent };
  } catch (error) {
    const fallbackCodes = new Set([
      'AI_NOT_CONFIGURED',
      'PROVIDER_DISABLED',
      'PROVIDER_UNSUPPORTED',
      'BUDGET_EXCEEDED',
      'AGENT_DISABLED',
    ]);
    if (fallbackCodes.has(error?.code)) {
      return { mode: 'local', reason: error.code };
    }
    throw error;
  }
}

export async function loadProfile(workspaceId, clientId) {
  const rows = await getDb()
    .select()
    .from(marketingProfiles)
    .where(
      and(
        eq(marketingProfiles.workspaceId, workspaceId),
        eq(marketingProfiles.clientId, clientId),
      ),
    )
    .limit(1);
  return rows[0] || null;
}

export async function regenerateContentDraft({
  workspaceId,
  userId,
  contentId,
  expectedVersion,
}) {
  const item = await assertContentItem(workspaceId, contentId);
  if (expectedVersion && Number(expectedVersion) !== item.latestVersion) {
    throw staleError('content');
  }
  const client = await assertClient(workspaceId, item.clientId);
  const profile = await loadProfile(workspaceId, item.clientId);
  const requested = await requestAgentDraft({
    workspaceId,
    userId,
    input: buildGenerationInput(item, profile, client),
  });

  if (requested.mode === 'agent') {
    await recordAudit({
      workspaceId,
      actorUserId: userId,
      action: 'marketing.content_version',
      resourceType: 'marketing_content',
      resourceId: contentId,
      metadata: { mode: 'agent_run', runId: requested.run.id },
    });
    return {
      mode: 'agent',
      run: requested.run,
      message:
        'An AI run was queued. Import its output as a new version when the run completes.',
    };
  }

  const version = await appendVersion({
    workspaceId,
    userId,
    item,
    body: buildLocalContentDraft(item, profile),
    generationSource: 'manual',
    aiMetadata: {
      generator: 'local-template',
      ai: false,
      reason: requested.reason,
    },
    changeNote: 'Local template draft (no AI provider call)',
  });

  await recordAudit({
    workspaceId,
    actorUserId: userId,
    action: 'marketing.content_version',
    resourceType: 'marketing_content',
    resourceId: contentId,
    metadata: {
      version,
      mode: 'local_template',
      reason: requested.reason,
      ai: false,
    },
  });

  return {
    mode: 'local',
    reason: requested.reason,
    version,
    message:
      'A labelled local template draft was created. No AI provider was called.',
    content: await getContentItem(workspaceId, contentId),
  };
}

export async function importAgentRunVersion({
  workspaceId,
  userId,
  contentId,
  runId,
  expectedVersion,
}) {
  const item = await assertContentItem(workspaceId, contentId);
  if (expectedVersion && Number(expectedVersion) !== item.latestVersion) {
    throw staleError('content');
  }
  const detail = await getRunDetail(workspaceId, runId);
  if (!detail) {
    throw new ApiError(404, 'NOT_FOUND', 'That AI run could not be found.');
  }
  if (detail.run.status !== 'completed') {
    throw new ApiError(
      409,
      'RUN_NOT_COMPLETED',
      `That run is ${detail.run.status}; only completed runs can be imported.`,
    );
  }
  const text = detail.run.output?.text;
  if (!text || typeof text !== 'string' || !text.trim()) {
    throw new ApiError(
      409,
      'RUN_OUTPUT_EMPTY',
      'That run has no text output to import.',
    );
  }

  const version = await appendVersion({
    workspaceId,
    userId,
    item,
    body: text,
    generationSource: 'ai',
    aiMetadata: {
      runId,
      agentId: detail.run.agentId,
      provider: detail.run.output?.provider || null,
      model: detail.run.output?.model || null,
      promptTokens: detail.run.promptTokens,
      completionTokens: detail.run.completionTokens,
    },
    changeNote: 'Imported from completed AI run',
  });

  await recordAudit({
    workspaceId,
    actorUserId: userId,
    action: 'marketing.content_version',
    resourceType: 'marketing_content',
    resourceId: contentId,
    metadata: { version, generationSource: 'ai', runId },
  });

  return getContentItem(workspaceId, contentId);
}

export async function contentAction({
  workspaceId,
  userId,
  contentId,
  data,
}) {
  const item = await assertContentItem(workspaceId, contentId);
  ensureCurrent(data.expectedUpdatedAt, item.updatedAt);
  const action = data.action;

  if (action === 'regenerate') {
    return regenerateContentDraft({
      workspaceId,
      userId,
      contentId,
      expectedVersion: item.latestVersion,
    });
  }
  if (action === 'import_agent_run') {
    if (!data.runId) {
      throw new ApiError(422, 'RUN_REQUIRED', 'Choose a completed AI run to import.');
    }
    return importAgentRunVersion({
      workspaceId,
      userId,
      contentId,
      runId: data.runId,
      expectedVersion: item.latestVersion,
    });
  }

  let nextStatus;
  const set = {};
  const metadata = { from: item.status };

  if (action === 'start_draft') {
    if (!canTransition(CONTENT_TRANSITIONS, item.status, 'draft')) {
      throw invalidContentTransition(item.status, 'draft');
    }
    nextStatus = 'draft';
  } else if (action === 'submit') {
    if (!canTransition(CONTENT_TRANSITIONS, item.status, 'in_review')) {
      throw invalidContentTransition(item.status, 'in_review');
    }
    nextStatus = 'in_review';
    set.reviewFeedback = null;
  } else if (action === 'approve') {
    if (item.status !== 'in_review') {
      throw invalidContentTransition(item.status, 'approved');
    }
    nextStatus = 'approved';
    set.approvedVersion = item.latestVersion;
    set.reviewedByUserId = userId;
    set.reviewedAt = new Date();
    set.reviewFeedback = null;
    metadata.approvedVersion = item.latestVersion;
  } else if (action === 'reject') {
    if (item.status !== 'in_review') {
      throw invalidContentTransition(item.status, 'changes_requested');
    }
    if (!data.feedback?.trim()) {
      throw new ApiError(
        422,
        'FEEDBACK_REQUIRED',
        'Explain what needs to change before returning the draft.',
      );
    }
    nextStatus = 'changes_requested';
    set.reviewedByUserId = userId;
    set.reviewedAt = new Date();
    set.reviewFeedback = data.feedback.trim();
    metadata.feedback = data.feedback.trim();
  } else if (action === 'schedule') {
    if (item.status !== 'approved') {
      throw invalidContentTransition(item.status, 'scheduled');
    }
    const scheduledFor = data.scheduledFor || item.scheduledFor;
    if (!scheduledFor) {
      throw new ApiError(422, 'SCHEDULE_REQUIRED', 'Choose when the content is planned.');
    }
    nextStatus = 'scheduled';
    set.scheduledFor = scheduledFor;
    metadata.scheduledFor = scheduledFor;
  } else if (action === 'unschedule') {
    if (item.status !== 'scheduled') {
      throw invalidContentTransition(item.status, 'approved');
    }
    nextStatus = 'approved';
    set.scheduledFor = null;
  } else if (action === 'mark_published') {
    if (item.status !== 'scheduled') {
      throw invalidContentTransition(item.status, 'published');
    }
    if (!data.publishNote?.trim()) {
      throw new ApiError(
        422,
        'PUBLISH_NOTE_REQUIRED',
        'Record the evidence for this internal publication entry.',
      );
    }
    nextStatus = 'published';
    set.publishedAt = new Date();
    set.publishNote = data.publishNote.trim();
    metadata.publishNote = data.publishNote.trim();
    metadata.externalPublish = false;
  } else if (action === 'record_failure') {
    if (item.status !== 'scheduled') {
      throw invalidContentTransition(item.status, 'failed');
    }
    if (!data.publishNote?.trim()) {
      throw new ApiError(
        422,
        'FAILURE_NOTE_REQUIRED',
        'Explain why the planned content did not proceed.',
      );
    }
    nextStatus = 'failed';
    set.publishNote = data.publishNote.trim();
  } else if (action === 'cancel') {
    if (['published', 'cancelled'].includes(item.status)) {
      throw invalidContentTransition(item.status, 'cancelled');
    }
    nextStatus = 'cancelled';
  } else {
    throw new ApiError(422, 'INVALID_ACTION', 'Choose a valid content action.');
  }

  await getDb()
    .update(marketingContentItems)
    .set({
      ...set,
      status: nextStatus,
      updatedByUserId: userId,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(marketingContentItems.workspaceId, workspaceId),
        eq(marketingContentItems.id, contentId),
      ),
    );

  await recordAudit({
    workspaceId,
    actorUserId: userId,
    action:
      action === 'schedule'
        ? 'marketing.content_schedule'
        : 'marketing.content_status',
    resourceType: 'marketing_content',
    resourceId: contentId,
    metadata: { ...metadata, to: nextStatus },
  });

  const result = await getContentItem(workspaceId, contentId);
  return {
    ...result,
    externalAction: false,
    note:
      nextStatus === 'published'
        ? NO_EXTERNAL_PUBLISHING_NOTE
        : undefined,
  };
}

function invalidContentTransition(from, to) {
  return new ApiError(
    409,
    'INVALID_TRANSITION',
    `Content cannot move from ${from} to ${to}.`,
  );
}

export async function listContentForClient(workspaceId, clientId) {
  const rows = await getDb()
    .select({
      id: marketingContentItems.id,
      title: marketingContentItems.title,
      contentType: marketingContentItems.contentType,
      status: marketingContentItems.status,
      scheduledFor: marketingContentItems.scheduledFor,
      updatedAt: marketingContentItems.updatedAt,
    })
    .from(marketingContentItems)
    .where(
      and(
        eq(marketingContentItems.workspaceId, workspaceId),
        eq(marketingContentItems.clientId, clientId),
      ),
    )
    .orderBy(desc(marketingContentItems.updatedAt))
    .limit(20);
  return rows;
}
