import { and, desc, eq, inArray, isNull, ne, or, sql } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { knowledgeChunks, knowledgeEntries } from '@/db/schema';
import { hasPermission } from '@/lib/auth/permissions';
import { CONTEXT_BUDGET, RETRIEVAL_LIMITS } from './constants';
import { escapeLike } from './helpers';
import { clipText, redactSecrets } from './text';

function entryCondition({
  workspaceId,
  categories,
  term,
  clientId,
  projectId,
  inclusiveScope = false,
}) {
  const filters = [
    eq(knowledgeEntries.workspaceId, workspaceId),
    ne(knowledgeEntries.status, 'archived'),
  ];
  if (categories?.length) {
    filters.push(inArray(knowledgeEntries.category, categories));
  }
  if (clientId) {
    filters.push(
      inclusiveScope
        ? or(
            isNull(knowledgeEntries.clientId),
            eq(knowledgeEntries.clientId, clientId),
          )
        : eq(knowledgeEntries.clientId, clientId),
    );
  }
  if (projectId) {
    filters.push(
      inclusiveScope
        ? or(
            isNull(knowledgeEntries.projectId),
            eq(knowledgeEntries.projectId, projectId),
          )
        : eq(knowledgeEntries.projectId, projectId),
    );
  }
  if (term) {
    const like = `%${escapeLike(term)}%`;
    filters.push(
      or(
        sql`to_tsvector('english', coalesce(${knowledgeEntries.title}, '') || ' ' || coalesce(${knowledgeEntries.summary}, '') || ' ' || ${knowledgeEntries.content}) @@ websearch_to_tsquery('english', ${term})`,
        sql`${knowledgeEntries.title} ilike ${like}`,
        sql`${knowledgeEntries.content} ilike ${like}`,
        sql`${knowledgeEntries.tags}::text ilike ${like}`,
      ),
    );
  }
  return and(...filters);
}

function entryRank(term) {
  if (!term) return sql`0`;
  return sql`ts_rank(to_tsvector('english', coalesce(${knowledgeEntries.title}, '') || ' ' || coalesce(${knowledgeEntries.summary}, '') || ' ' || ${knowledgeEntries.content}), websearch_to_tsquery('english', ${term}))`;
}

const ENTRY_FIELDS = {
  id: knowledgeEntries.id,
  title: knowledgeEntries.title,
  summary: knowledgeEntries.summary,
  content: knowledgeEntries.content,
  category: knowledgeEntries.category,
  tags: knowledgeEntries.tags,
  provenance: knowledgeEntries.provenance,
  status: knowledgeEntries.status,
  sourceType: knowledgeEntries.sourceType,
  sourceReference: knowledgeEntries.sourceReference,
  clientId: knowledgeEntries.clientId,
  projectId: knowledgeEntries.projectId,
  version: knowledgeEntries.version,
  updatedAt: knowledgeEntries.updatedAt,
};

function serializeEntry(row, { maxChars = 600 } = {}) {
  return {
    kind: 'entry',
    id: row.id,
    title: row.title,
    summary: row.summary,
    category: row.category,
    tags: Array.isArray(row.tags) ? row.tags : [],
    provenance: row.provenance,
    status: row.status,
    sourceType: row.sourceType,
    sourceReference: row.sourceReference,
    clientId: row.clientId,
    projectId: row.projectId,
    version: row.version,
    updatedAt: row.updatedAt,
    text: clipText(redactSecrets(row.content || ''), maxChars),
    excerpt: clipText(redactSecrets(row.summary || row.content || ''), 240),
    score: Number(row.rank || 0),
  };
}

export function canRetrieve(role) {
  return hasPermission(role, 'knowledge.view');
}

// Lexical retrieval over workspace knowledge entries and document chunks.
// PostgreSQL core full-text search is used first; ILIKE keeps short or
// punctuation-heavy queries useful without any extension.
export async function searchKnowledge({
  workspaceId,
  role,
  query,
  categories,
  clientId = null,
  projectId = null,
  includeChunks = true,
  inclusiveScope = false,
  limit = RETRIEVAL_LIMITS.defaultResults,
}) {
  if (!canRetrieve(role)) {
    return { entries: [], chunks: [], limited: true, reason: 'permission' };
  }

  const term = String(query || '').trim().slice(0, RETRIEVAL_LIMITS.maxQueryChars);
  const db = getDb();
  const conditions = entryCondition({
    workspaceId,
    categories,
    term,
    clientId,
    projectId,
    inclusiveScope,
  });

  const entryRows = await db
    .select({ ...ENTRY_FIELDS, rank: entryRank(term) })
    .from(knowledgeEntries)
    .where(conditions)
    .orderBy(
      ...(term
        ? [sql`${entryRank(term)} desc`, desc(knowledgeEntries.updatedAt)]
        : [desc(knowledgeEntries.updatedAt)]),
    )
    .limit(limit);

  let chunkRows = [];
  if (includeChunks && term) {
    const like = `%${escapeLike(term)}%`;
    const chunkRank = sql`ts_rank(to_tsvector('english', ${knowledgeChunks.content}), websearch_to_tsquery('english', ${term}))`;
    const chunkFilters = [
      eq(knowledgeChunks.workspaceId, workspaceId),
      eq(knowledgeEntries.workspaceId, workspaceId),
      ne(knowledgeEntries.status, 'archived'),
      or(
        sql`to_tsvector('english', ${knowledgeChunks.content}) @@ websearch_to_tsquery('english', ${term})`,
        sql`${knowledgeChunks.content} ilike ${like}`,
      ),
    ];
    if (categories?.length) {
      chunkFilters.push(inArray(knowledgeEntries.category, categories));
    }
    if (clientId) {
      chunkFilters.push(
        inclusiveScope
          ? or(
              isNull(knowledgeEntries.clientId),
              eq(knowledgeEntries.clientId, clientId),
            )
          : eq(knowledgeEntries.clientId, clientId),
      );
    }
    if (projectId) {
      chunkFilters.push(
        inclusiveScope
          ? or(
              isNull(knowledgeEntries.projectId),
              eq(knowledgeEntries.projectId, projectId),
            )
          : eq(knowledgeEntries.projectId, projectId),
      );
    }

    chunkRows = await db
      .select({
        id: knowledgeChunks.id,
        entryId: knowledgeChunks.entryId,
        chunkIndex: knowledgeChunks.chunkIndex,
        heading: knowledgeChunks.heading,
        content: knowledgeChunks.content,
        rank: chunkRank,
        entryTitle: knowledgeEntries.title,
        category: knowledgeEntries.category,
        provenance: knowledgeEntries.provenance,
        sourceReference: knowledgeEntries.sourceReference,
        clientId: knowledgeEntries.clientId,
        projectId: knowledgeEntries.projectId,
        updatedAt: knowledgeEntries.updatedAt,
      })
      .from(knowledgeChunks)
      .innerJoin(
        knowledgeEntries,
        eq(knowledgeEntries.id, knowledgeChunks.entryId),
      )
      .where(and(...chunkFilters))
      .orderBy(sql`${chunkRank} desc`)
      .limit(Math.min(limit, RETRIEVAL_LIMITS.maxChunkResults));
  }

  return {
    entries: entryRows.map((row) =>
      serializeEntry(row, { maxChars: CONTEXT_BUDGET.knowledgeChars }),
    ),
    chunks: chunkRows.map((row) => ({
      kind: 'chunk',
      id: row.id,
      entryId: row.entryId,
      entryTitle: row.entryTitle,
      chunkIndex: row.chunkIndex,
      heading: row.heading,
      category: row.category,
      provenance: row.provenance,
      sourceReference: row.sourceReference,
      clientId: row.clientId,
      projectId: row.projectId,
      updatedAt: row.updatedAt,
      text: clipText(redactSecrets(row.content || ''), 900),
      score: Number(row.rank || 0),
    })),
    limited: false,
  };
}

// Context retrieval is bounded and prefers published entries. When the task
// text has no useful terms, the most recently updated entries in the agent's
// categories are supplied instead, so an agent still knows the service
// catalogue and company profile.
export async function getContextKnowledge({
  workspaceId,
  role,
  agentType,
  categories,
  term,
  clientId = null,
  projectId = null,
}) {
  if (!canRetrieve(role)) {
    return { entries: [], chunks: [], limited: true, reason: 'permission' };
  }

  const search = await searchKnowledge({
    workspaceId,
    role,
    query: term,
    categories,
    clientId,
    projectId,
    includeChunks: Boolean(term),
    inclusiveScope: true,
    limit: CONTEXT_BUDGET.maxKnowledgeEntries,
  });

  const entries = search.entries
    .filter((entry) => entry.status === 'published')
    .slice(0, CONTEXT_BUDGET.maxKnowledgeEntries);

  let publishedOnly = entries;
  if (publishedOnly.length === 0) {
    // Fall back to recent published entries so a run is never context-free
    // when the workspace has a knowledge base.
    const recent = await getDb()
      .select({ ...ENTRY_FIELDS, rank: sql`0` })
      .from(knowledgeEntries)
      .where(
        and(
          eq(knowledgeEntries.workspaceId, workspaceId),
          eq(knowledgeEntries.status, 'published'),
          categories?.length
            ? inArray(knowledgeEntries.category, categories)
            : undefined,
          clientId ? eq(knowledgeEntries.clientId, clientId) : undefined,
          projectId ? eq(knowledgeEntries.projectId, projectId) : undefined,
        ),
      )
      .orderBy(desc(knowledgeEntries.updatedAt))
      .limit(CONTEXT_BUDGET.maxKnowledgeEntries);
    publishedOnly = recent.map((row) =>
      serializeEntry(row, { maxChars: CONTEXT_BUDGET.knowledgeChars }),
    );
  }

  const chunkEntryIds = new Set(publishedOnly.map((entry) => entry.id));
  const chunks = search.chunks
    .filter((chunk) => !chunkEntryIds.has(chunk.entryId))
    .slice(0, CONTEXT_BUDGET.maxKnowledgeChunks);

  return {
    entries: publishedOnly,
    chunks,
    limited: false,
    agentType,
  };
}

export async function countSearchableKnowledge(workspaceId) {
  const rows = await getDb()
    .select({ value: sql`count(*)` })
    .from(knowledgeEntries)
    .where(
      and(
        eq(knowledgeEntries.workspaceId, workspaceId),
        eq(knowledgeEntries.status, 'published'),
      ),
    );
  return Number(rows[0]?.value || 0);
}
