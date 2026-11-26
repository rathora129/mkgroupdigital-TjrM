import {
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  or,
  sql,
} from 'drizzle-orm';
import { getDb } from '@/db/client';
import {
  clients,
  marketingWebsitePages,
  marketingWebsiteProposalVersions,
  marketingWebsiteProposals,
  users,
} from '@/db/schema';
import { getRunDetail } from '@/lib/ai/runtime';
import { ApiError } from '@/lib/api-error';
import { recordAudit } from '@/lib/audit';
import { isUniqueViolation } from '@/lib/business/references';
import { runAtomic } from '@/lib/clients/helpers';
import {
  NO_EXTERNAL_EXECUTION_NOTE,
  PROPOSAL_TRANSITIONS,
  canTransition,
} from './constants';
import {
  assertClient,
  assertMembers,
  assertPage,
  assertProposal,
  escapeLike,
  marketingNotFound,
  staleError,
} from './helpers';
import { loadProfile, requestAgentDraft } from './content';

function toIso(value) {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function ensureCurrent(expected, actual, label) {
  if (!expected) return;
  if (toIso(expected) !== toIso(actual)) throw staleError(label);
}

// ---------------------------------------------------------------------------
// Page inventory
// ---------------------------------------------------------------------------

export async function listWebsitePages(workspaceId, query) {
  const filters = [eq(marketingWebsitePages.workspaceId, workspaceId)];
  if (query.clientId) filters.push(eq(marketingWebsitePages.clientId, query.clientId));
  if (query.search) {
    const like = `%${escapeLike(query.search)}%`;
    filters.push(
      or(
        ilike(marketingWebsitePages.pageTitle, like),
        ilike(marketingWebsitePages.pageUrl, like),
        ilike(clients.companyName, like),
      ),
    );
  }
  const where = and(...filters);
  const offset = (query.page - 1) * query.pageSize;

  const [rows, totals] = await Promise.all([
    getDb()
      .select({
        id: marketingWebsitePages.id,
        clientId: marketingWebsitePages.clientId,
        clientName: clients.companyName,
        pageTitle: marketingWebsitePages.pageTitle,
        pageUrl: marketingWebsitePages.pageUrl,
        pageType: marketingWebsitePages.pageType,
        pageObjective: marketingWebsitePages.pageObjective,
        status: marketingWebsitePages.status,
        updatedAt: marketingWebsitePages.updatedAt,
        proposalCount: sql`(
          select count(*) from ${marketingWebsiteProposals}
          where ${marketingWebsiteProposals.pageId} = ${marketingWebsitePages.id}
            and ${marketingWebsiteProposals.workspaceId} = ${workspaceId}
        )`,
      })
      .from(marketingWebsitePages)
      .innerJoin(clients, eq(clients.id, marketingWebsitePages.clientId))
      .where(where)
      .orderBy(asc(clients.companyName), asc(marketingWebsitePages.pageTitle))
      .limit(query.pageSize)
      .offset(offset),
    getDb()
      .select({ value: count() })
      .from(marketingWebsitePages)
      .innerJoin(clients, eq(clients.id, marketingWebsitePages.clientId))
      .where(where),
  ]);

  const total = Number(totals[0]?.value || 0);
  return {
    items: rows.map((row) => ({
      ...row,
      proposalCount: Number(row.proposalCount || 0),
    })),
    total,
    page: query.page,
    pageSize: query.pageSize,
    pages: Math.max(1, Math.ceil(total / query.pageSize)),
  };
}

export async function getWebsitePage(workspaceId, pageId) {
  const rows = await getDb()
    .select({
      page: marketingWebsitePages,
      clientName: clients.companyName,
      clientReference: clients.reference,
    })
    .from(marketingWebsitePages)
    .innerJoin(clients, eq(clients.id, marketingWebsitePages.clientId))
    .where(
      and(
        eq(marketingWebsitePages.workspaceId, workspaceId),
        eq(marketingWebsitePages.id, pageId),
      ),
    )
    .limit(1);
  if (!rows[0]) throw marketingNotFound('website page');

  const proposals = await getDb()
    .select({
      id: marketingWebsiteProposals.id,
      title: marketingWebsiteProposals.title,
      status: marketingWebsiteProposals.status,
      updatedAt: marketingWebsiteProposals.updatedAt,
    })
    .from(marketingWebsiteProposals)
    .where(
      and(
        eq(marketingWebsiteProposals.workspaceId, workspaceId),
        eq(marketingWebsiteProposals.pageId, pageId),
      ),
    )
    .orderBy(desc(marketingWebsiteProposals.updatedAt))
    .limit(50);

  return { ...rows[0], proposals };
}

export async function createWebsitePage({ workspaceId, userId, data }) {
  const client = await assertClient(workspaceId, data.clientId);
  let pageId;
  try {
    const rows = await getDb()
      .insert(marketingWebsitePages)
      .values({
        workspaceId,
        clientId: client.id,
        pageTitle: data.pageTitle,
        pageUrl: data.pageUrl,
        pageType: data.pageType ?? null,
        pageObjective: data.pageObjective ?? null,
        existingContentNotes: data.existingContentNotes ?? null,
        seoTitle: data.seoTitle ?? null,
        metaDescription: data.metaDescription ?? null,
        ctaRecommendations: data.ctaRecommendations ?? null,
        mediaRequirements: data.mediaRequirements ?? null,
        internalLinkRecommendations: data.internalLinkRecommendations ?? null,
        createdByUserId: userId,
        updatedByUserId: userId,
      })
      .returning({ id: marketingWebsitePages.id });
    pageId = rows[0].id;
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ApiError(
        409,
        'PAGE_EXISTS',
        'That page URL is already in this client’s inventory.',
      );
    }
    throw error;
  }

  await recordAudit({
    workspaceId,
    actorUserId: userId,
    action: 'marketing.website_page_create',
    resourceType: 'marketing_website_page',
    resourceId: pageId,
    metadata: { clientId: client.id, pageUrl: data.pageUrl },
  });

  return getWebsitePage(workspaceId, pageId);
}

export async function updateWebsitePage({
  workspaceId,
  userId,
  pageId,
  data,
}) {
  const existing = await getWebsitePage(workspaceId, pageId);
  ensureCurrent(data.expectedUpdatedAt, existing.page.updatedAt, 'page');

  await getDb()
    .update(marketingWebsitePages)
    .set({
      pageTitle: data.pageTitle,
      pageType: data.pageType ?? null,
      pageObjective: data.pageObjective ?? null,
      existingContentNotes: data.existingContentNotes ?? null,
      seoTitle: data.seoTitle ?? null,
      metaDescription: data.metaDescription ?? null,
      ctaRecommendations: data.ctaRecommendations ?? null,
      mediaRequirements: data.mediaRequirements ?? null,
      internalLinkRecommendations: data.internalLinkRecommendations ?? null,
      status: data.status || 'active',
      updatedByUserId: userId,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(marketingWebsitePages.workspaceId, workspaceId),
        eq(marketingWebsitePages.id, pageId),
      ),
    );

  await recordAudit({
    workspaceId,
    actorUserId: userId,
    action: 'marketing.website_page_update',
    resourceType: 'marketing_website_page',
    resourceId: pageId,
    metadata: { pageTitle: data.pageTitle, status: data.status || 'active' },
  });

  return getWebsitePage(workspaceId, pageId);
}

// ---------------------------------------------------------------------------
// Change proposals
// ---------------------------------------------------------------------------

const PROPOSAL_SELECT = {
  id: marketingWebsiteProposals.id,
  clientId: marketingWebsiteProposals.clientId,
  clientName: clients.companyName,
  clientReference: clients.reference,
  pageId: marketingWebsiteProposals.pageId,
  pageTitle: marketingWebsitePages.pageTitle,
  pageUrl: marketingWebsitePages.pageUrl,
  title: marketingWebsiteProposals.title,
  status: marketingWebsiteProposals.status,
  latestVersion: marketingWebsiteProposals.latestVersion,
  ownerUserId: marketingWebsiteProposals.ownerUserId,
  ownerName: users.name,
  approvedAt: marketingWebsiteProposals.approvedAt,
  executedAt: marketingWebsiteProposals.executedAt,
  createdAt: marketingWebsiteProposals.createdAt,
  updatedAt: marketingWebsiteProposals.updatedAt,
};

const PROPOSAL_JOINS = (query) =>
  query
    .innerJoin(clients, eq(clients.id, marketingWebsiteProposals.clientId))
    .leftJoin(
      marketingWebsitePages,
      eq(marketingWebsitePages.id, marketingWebsiteProposals.pageId),
    )
    .leftJoin(users, eq(users.id, marketingWebsiteProposals.ownerUserId));

export async function listWebsiteProposals(workspaceId, query) {
  const filters = [eq(marketingWebsiteProposals.workspaceId, workspaceId)];
  if (query.status) filters.push(eq(marketingWebsiteProposals.status, query.status));
  if (query.clientId) {
    filters.push(eq(marketingWebsiteProposals.clientId, query.clientId));
  }
  if (query.pageId) filters.push(eq(marketingWebsiteProposals.pageId, query.pageId));
  if (query.search) {
    const like = `%${escapeLike(query.search)}%`;
    filters.push(
      or(
        ilike(marketingWebsiteProposals.title, like),
        ilike(clients.companyName, like),
        ilike(marketingWebsitePages.pageUrl, like),
      ),
    );
  }
  const where = and(...filters);
  const offset = (query.page - 1) * query.pageSize;

  const [rows, totals] = await Promise.all([
    PROPOSAL_JOINS(
      getDb().select(PROPOSAL_SELECT).from(marketingWebsiteProposals),
    )
      .where(where)
      .orderBy(desc(marketingWebsiteProposals.updatedAt))
      .limit(query.pageSize)
      .offset(offset),
    getDb()
      .select({ value: count() })
      .from(marketingWebsiteProposals)
      .innerJoin(clients, eq(clients.id, marketingWebsiteProposals.clientId))
      .leftJoin(
        marketingWebsitePages,
        eq(marketingWebsitePages.id, marketingWebsiteProposals.pageId),
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
  };
}

export async function getWebsiteOverview(workspaceId) {
  const [pageRows, proposalRows] = await Promise.all([
    getDb()
      .select({ value: count() })
      .from(marketingWebsitePages)
      .where(eq(marketingWebsitePages.workspaceId, workspaceId)),
    getDb()
      .select({
        status: marketingWebsiteProposals.status,
        value: count(),
      })
      .from(marketingWebsiteProposals)
      .where(eq(marketingWebsiteProposals.workspaceId, workspaceId))
      .groupBy(marketingWebsiteProposals.status),
  ]);

  const statusCounts = {};
  let proposalTotal = 0;
  for (const row of proposalRows) {
    const value = Number(row.value || 0);
    statusCounts[row.status] = value;
    proposalTotal += value;
  }
  return {
    pageCount: Number(pageRows[0]?.value || 0),
    proposalTotal,
    statusCounts,
    awaitingReview: statusCounts.awaiting_review || 0,
    executed: statusCounts.executed || 0,
  };
}

export async function getProposal(workspaceId, proposalId) {
  const rows = await PROPOSAL_JOINS(
    getDb()
      .select({
        ...PROPOSAL_SELECT,
        currentContent: marketingWebsiteProposals.currentContent,
        proposedContent: marketingWebsiteProposals.proposedContent,
        reviewNotes: marketingWebsiteProposals.reviewNotes,
        rejectionFeedback: marketingWebsiteProposals.rejectionFeedback,
        approvedByUserId: marketingWebsiteProposals.approvedByUserId,
        executedByUserId: marketingWebsiteProposals.executedByUserId,
        executionEvidence: marketingWebsiteProposals.executionEvidence,
        executionNotes: marketingWebsiteProposals.executionNotes,
        pageObjective: marketingWebsitePages.pageObjective,
        pageExistingNotes: marketingWebsitePages.existingContentNotes,
      })
      .from(marketingWebsiteProposals),
  )
    .where(
      and(
        eq(marketingWebsiteProposals.workspaceId, workspaceId),
        eq(marketingWebsiteProposals.id, proposalId),
      ),
    )
    .limit(1);
  if (!rows[0]) throw marketingNotFound('website change proposal');

  const versions = await getDb()
    .select({
      id: marketingWebsiteProposalVersions.id,
      version: marketingWebsiteProposalVersions.version,
      body: marketingWebsiteProposalVersions.body,
      generationSource: marketingWebsiteProposalVersions.generationSource,
      aiMetadata: marketingWebsiteProposalVersions.aiMetadata,
      changeNote: marketingWebsiteProposalVersions.changeNote,
      createdByName: users.name,
      createdAt: marketingWebsiteProposalVersions.createdAt,
    })
    .from(marketingWebsiteProposalVersions)
    .leftJoin(
      users,
      eq(users.id, marketingWebsiteProposalVersions.createdByUserId),
    )
    .where(
      and(
        eq(marketingWebsiteProposalVersions.workspaceId, workspaceId),
        eq(marketingWebsiteProposalVersions.proposalId, proposalId),
      ),
    )
    .orderBy(desc(marketingWebsiteProposalVersions.version))
    .limit(60);

  return {
    proposal: rows[0],
    versions,
    latest:
      versions.find(
        (version) => version.version === rows[0].latestVersion,
      ) || null,
    executionNote: NO_EXTERNAL_EXECUTION_NOTE,
  };
}

export async function createProposal({ workspaceId, userId, data }) {
  const client = await assertClient(workspaceId, data.clientId);
  const page = await assertPage(workspaceId, data.pageId, client.id);
  if (data.ownerUserId) await assertMembers(workspaceId, [data.ownerUserId]);

  const proposalId = await runAtomic(async (executor) => {
    const rows = await executor
      .insert(marketingWebsiteProposals)
      .values({
        workspaceId,
        clientId: client.id,
        pageId: page?.id || null,
        title: data.title,
        currentContent: data.currentContent ?? page?.existingContentNotes ?? null,
        proposedContent: data.proposedContent,
        status: 'draft',
        latestVersion: 1,
        ownerUserId: data.ownerUserId || null,
        createdByUserId: userId,
        updatedByUserId: userId,
      })
      .returning({ id: marketingWebsiteProposals.id });
    const id = rows[0].id;
    await executor.insert(marketingWebsiteProposalVersions).values({
      workspaceId,
      proposalId: id,
      version: 1,
      body: data.proposedContent,
      generationSource: 'manual',
      aiMetadata: { generator: 'human', ai: false },
      createdByUserId: userId,
      changeNote: 'Initial proposal',
    });
    return id;
  });

  await recordAudit({
    workspaceId,
    actorUserId: userId,
    action: 'marketing.proposal_create',
    resourceType: 'marketing_website_proposal',
    resourceId: proposalId,
    metadata: { clientId: client.id, pageId: page?.id || null },
  });

  return getProposal(workspaceId, proposalId);
}

export async function updateProposal({
  workspaceId,
  userId,
  proposalId,
  data,
}) {
  const existing = await assertProposal(workspaceId, proposalId);
  ensureCurrent(data.expectedUpdatedAt, existing.updatedAt, 'proposal');
  if (data.ownerUserId) await assertMembers(workspaceId, [data.ownerUserId]);

  await getDb()
    .update(marketingWebsiteProposals)
    .set({
      title: data.title,
      ownerUserId: data.ownerUserId || null,
      reviewNotes: data.reviewNotes ?? null,
      updatedByUserId: userId,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(marketingWebsiteProposals.workspaceId, workspaceId),
        eq(marketingWebsiteProposals.id, proposalId),
      ),
    );

  await recordAudit({
    workspaceId,
    actorUserId: userId,
    action: 'marketing.proposal_update',
    resourceType: 'marketing_website_proposal',
    resourceId: proposalId,
    metadata: { title: data.title },
  });

  return getProposal(workspaceId, proposalId);
}

async function appendProposalVersion({
  workspaceId,
  userId,
  proposal,
  body,
  generationSource,
  aiMetadata,
  changeNote,
}) {
  if (['executed', 'cancelled'].includes(proposal.status)) {
    throw new ApiError(
      409,
      'PROPOSAL_CLOSED',
      `A ${proposal.status} proposal cannot receive new versions.`,
    );
  }
  const next = proposal.latestVersion + 1;
  await runAtomic(async (executor) => {
    await executor.insert(marketingWebsiteProposalVersions).values({
      workspaceId,
      proposalId: proposal.id,
      version: next,
      body,
      generationSource,
      aiMetadata: aiMetadata || null,
      createdByUserId: userId,
      changeNote: changeNote || null,
    });
    await executor
      .update(marketingWebsiteProposals)
      .set({
        latestVersion: next,
        proposedContent: body,
        status: 'draft',
        approvedByUserId: null,
        approvedAt: null,
        rejectionFeedback: null,
        updatedByUserId: userId,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(marketingWebsiteProposals.workspaceId, workspaceId),
          eq(marketingWebsiteProposals.id, proposal.id),
        ),
      );
  });
  return next;
}

export async function addProposalVersion({
  workspaceId,
  userId,
  proposalId,
  data,
}) {
  const proposal = await assertProposal(workspaceId, proposalId);
  if (Number(data.expectedVersion) !== proposal.latestVersion) {
    throw staleError('proposal');
  }
  const version = await appendProposalVersion({
    workspaceId,
    userId,
    proposal,
    body: data.body,
    generationSource: 'manual',
    aiMetadata: { generator: 'human', ai: false },
    changeNote: data.changeNote,
  });

  await recordAudit({
    workspaceId,
    actorUserId: userId,
    action: 'marketing.proposal_version',
    resourceType: 'marketing_website_proposal',
    resourceId: proposalId,
    metadata: { version, generationSource: 'manual' },
  });

  return getProposal(workspaceId, proposalId);
}

function buildLocalWebsiteDraft(proposal, page, profile) {
  return [
    `# ${proposal.title}`,
    '',
    '> Local template suggestion. No AI provider was called and no website was changed.',
    '',
    `**Page:** ${page?.pageUrl || '[Choose a page]'}`,
    `**Page objective:** ${page?.pageObjective || proposal.reviewNotes || '[Add page objective]'}`,
    `**Audience:** ${profile?.targetAudience || '[Add target audience]'}`,
    `**Brand voice:** ${profile?.brandVoice || '[Add brand voice]'}`,
    '',
    '## Suggested replacement content',
    '[Write a replacement section that keeps verified facts only.]',
    '',
    '### SEO title',
    page?.seoTitle || '[Draft a title of 50–60 characters]',
    '',
    '### Meta description',
    page?.metaDescription || '[Draft a description of 140–160 characters]',
    '',
    '### Call to action',
    page?.ctaRecommendations || '[Add one clear next step]',
    '',
    '## Verification',
    '- [VERIFY: any statistic, price, offer or testimonial before use]',
    '- [VERIFY: internal links still point to live pages]',
  ].join('\n');
}

export async function proposalAction({
  workspaceId,
  userId,
  proposalId,
  data,
}) {
  const proposal = await assertProposal(workspaceId, proposalId);
  ensureCurrent(data.expectedUpdatedAt, proposal.updatedAt, 'proposal');
  const action = data.action;

  if (action === 'regenerate') {
    const client = await assertClient(workspaceId, proposal.clientId);
    const page = proposal.pageId
      ? (await assertPage(workspaceId, proposal.pageId, proposal.clientId))
      : null;
    const profile = await loadProfile(workspaceId, proposal.clientId);
    const requested = await requestAgentDraft({
      workspaceId,
      userId,
      input: [
        `Client: ${client.companyName}`,
        `Website page: ${page?.pageUrl || 'not linked'}`,
        `Page objective: ${page?.pageObjective || 'not recorded'}`,
        `Existing content: ${proposal.currentContent || 'not recorded'}`,
        `Brand voice: ${profile?.brandVoice || 'not recorded'}`,
        'Suggest replacement website copy. Do not invent facts, prices, statistics or testimonials. Mark anything needing confirmation as [VERIFY: ...].',
      ].join('\n'),
    });

    if (requested.mode === 'agent') {
      return {
        mode: 'agent',
        run: requested.run,
        message:
          'An AI run was queued. Import its output as a new proposal version when it completes.',
      };
    }

    const version = await appendProposalVersion({
      workspaceId,
      userId,
      proposal,
      body: buildLocalWebsiteDraft(proposal, page, profile),
      generationSource: 'manual',
      aiMetadata: {
        generator: 'local-template',
        ai: false,
        reason: requested.reason,
      },
      changeNote: 'Local template suggestion (no AI provider call)',
    });
    await recordAudit({
      workspaceId,
      actorUserId: userId,
      action: 'marketing.proposal_version',
      resourceType: 'marketing_website_proposal',
      resourceId: proposalId,
      metadata: { version, mode: 'local_template', ai: false },
    });
    return {
      mode: 'local',
      reason: requested.reason,
      version,
      message:
        'A labelled local template suggestion was added. No AI provider was called and no website was changed.',
      proposal: await getProposal(workspaceId, proposalId),
    };
  }

  if (action === 'import_agent_run') {
    if (!data.runId) {
      throw new ApiError(422, 'RUN_REQUIRED', 'Choose a completed AI run to import.');
    }
    const detail = await getRunDetail(workspaceId, data.runId);
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
    if (!text || !String(text).trim()) {
      throw new ApiError(409, 'RUN_OUTPUT_EMPTY', 'That run has no text output.');
    }
    const version = await appendProposalVersion({
      workspaceId,
      userId,
      proposal,
      body: String(text),
      generationSource: 'ai',
      aiMetadata: {
        runId: data.runId,
        provider: detail.run.output?.provider || null,
        model: detail.run.output?.model || null,
      },
      changeNote: 'Imported from completed AI run',
    });
    await recordAudit({
      workspaceId,
      actorUserId: userId,
      action: 'marketing.proposal_version',
      resourceType: 'marketing_website_proposal',
      resourceId: proposalId,
      metadata: { version, generationSource: 'ai', runId: data.runId },
    });
    return getProposal(workspaceId, proposalId);
  }

  const set = {};
  let nextStatus;
  if (action === 'submit') {
    if (!canTransition(PROPOSAL_TRANSITIONS, proposal.status, 'awaiting_review')) {
      throw invalidProposalTransition(proposal.status, 'awaiting_review');
    }
    nextStatus = 'awaiting_review';
    set.rejectionFeedback = null;
  } else if (action === 'approve') {
    if (proposal.status !== 'awaiting_review') {
      throw invalidProposalTransition(proposal.status, 'approved');
    }
    nextStatus = 'approved';
    set.approvedByUserId = userId;
    set.approvedAt = new Date();
  } else if (action === 'reject') {
    if (proposal.status !== 'awaiting_review') {
      throw invalidProposalTransition(proposal.status, 'rejected');
    }
    if (!data.feedback?.trim()) {
      throw new ApiError(
        422,
        'FEEDBACK_REQUIRED',
        'Explain what needs to change before rejecting the proposal.',
      );
    }
    nextStatus = 'rejected';
    set.rejectionFeedback = data.feedback.trim();
  } else if (action === 'start_execution') {
    if (proposal.status !== 'approved') {
      throw invalidProposalTransition(proposal.status, 'executing');
    }
    nextStatus = 'executing';
  } else if (action === 'record_execution') {
    if (!['approved', 'executing'].includes(proposal.status)) {
      throw invalidProposalTransition(proposal.status, 'executed');
    }
    if (!data.evidence?.trim()) {
      throw new ApiError(
        422,
        'EVIDENCE_REQUIRED',
        'Record execution evidence before marking the change complete.',
      );
    }
    nextStatus = 'executed';
    set.executedByUserId = userId;
    set.executedAt = new Date();
    set.executionEvidence = data.evidence.trim();
    set.executionNotes = data.notes?.trim() || null;
  } else if (action === 'cancel') {
    if (proposal.status === 'executed') {
      throw invalidProposalTransition(proposal.status, 'cancelled');
    }
    nextStatus = 'cancelled';
  } else {
    throw new ApiError(422, 'INVALID_ACTION', 'Choose a valid proposal action.');
  }

  await getDb()
    .update(marketingWebsiteProposals)
    .set({
      ...set,
      status: nextStatus,
      updatedByUserId: userId,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(marketingWebsiteProposals.workspaceId, workspaceId),
        eq(marketingWebsiteProposals.id, proposalId),
      ),
    );

  await recordAudit({
    workspaceId,
    actorUserId: userId,
    action:
      action === 'approve' || action === 'reject'
        ? 'marketing.proposal_decision'
        : action === 'record_execution'
          ? 'marketing.proposal_execution'
          : 'marketing.proposal_update',
    resourceType: 'marketing_website_proposal',
    resourceId: proposalId,
    metadata: { from: proposal.status, to: nextStatus },
  });

  const result = await getProposal(workspaceId, proposalId);
  return {
    ...result,
    externalAction: false,
    note: nextStatus === 'executed' ? NO_EXTERNAL_EXECUTION_NOTE : undefined,
  };
}

function invalidProposalTransition(from, to) {
  return new ApiError(
    409,
    'INVALID_TRANSITION',
    `The proposal cannot move from ${from} to ${to}.`,
  );
}

export async function listProposalOptions(workspaceId, clientId = null) {
  const filters = [eq(marketingWebsiteProposals.workspaceId, workspaceId)];
  if (clientId) filters.push(eq(marketingWebsiteProposals.clientId, clientId));
  return getDb()
    .select({
      id: marketingWebsiteProposals.id,
      title: marketingWebsiteProposals.title,
      clientId: marketingWebsiteProposals.clientId,
      status: marketingWebsiteProposals.status,
    })
    .from(marketingWebsiteProposals)
    .where(and(...filters))
    .orderBy(asc(marketingWebsiteProposals.title))
    .limit(500);
}
