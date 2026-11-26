import {
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  isNull,
  ne,
  or,
  sql,
} from 'drizzle-orm';
import { getDb } from '@/db/client';
import {
  aiMemories,
  clients,
  knowledgeChunks,
  knowledgeDocuments,
  knowledgeEntries,
  knowledgeVersions,
  projects,
  users,
} from '@/db/schema';
import { ApiError } from '@/lib/api-error';
import { recordAudit } from '@/lib/audit';
import {
  assertClientScope,
  assertProjectScope,
  escapeLike,
  isUniqueViolation,
  runAtomic,
  staleError,
} from './helpers';
import { contentHash, findSecret } from './text';

const CREATOR = { id: users.id, name: users.name, email: users.email };

const ENTRY_SELECT = {
  id: knowledgeEntries.id,
  category: knowledgeEntries.category,
  title: knowledgeEntries.title,
  summary: knowledgeEntries.summary,
  content: knowledgeEntries.content,
  tags: knowledgeEntries.tags,
  sourceType: knowledgeEntries.sourceType,
  sourceReference: knowledgeEntries.sourceReference,
  provenance: knowledgeEntries.provenance,
  status: knowledgeEntries.status,
  clientId: knowledgeEntries.clientId,
  projectId: knowledgeEntries.projectId,
  version: knowledgeEntries.version,
  createdAt: knowledgeEntries.createdAt,
  updatedAt: knowledgeEntries.updatedAt,
  publishedAt: knowledgeEntries.publishedAt,
  archivedAt: knowledgeEntries.archivedAt,
  createdByUserId: knowledgeEntries.createdByUserId,
};

function notFound() {
  return new ApiError(
    404,
    'NOT_FOUND',
    'That knowledge entry could not be found.',
  );
}

function duplicateError(entryId) {
  return new ApiError(
    409,
    'DUPLICATE_KNOWLEDGE',
    'An identical knowledge entry already exists in this workspace.',
    { entryId },
  );
}

function assertNoSecrets(...values) {
  for (const value of values) {
    if (value && findSecret(value)) {
      throw new ApiError(
        422,
        'SECRET_DETECTED',
        'This content looks like it contains a password, key or token. Remove secrets before saving knowledge or memory.',
      );
    }
  }
}

async function findByHash(workspaceId, hash) {
  const rows = await getDb()
    .select({ id: knowledgeEntries.id })
    .from(knowledgeEntries)
    .where(
      and(
        eq(knowledgeEntries.workspaceId, workspaceId),
        eq(knowledgeEntries.contentHash, hash),
        isNull(knowledgeEntries.archivedAt),
      ),
    )
    .limit(1);
  return rows[0] || null;
}

function buildKnowledgeFilters(workspaceId, query) {
  const filters = [eq(knowledgeEntries.workspaceId, workspaceId)];

  if (query.category && query.category !== 'any') {
    filters.push(eq(knowledgeEntries.category, query.category));
  }
  if (query.status === 'active') {
    filters.push(ne(knowledgeEntries.status, 'archived'));
  } else if (query.status && query.status !== 'any') {
    filters.push(eq(knowledgeEntries.status, query.status));
  }
  if (query.clientId) filters.push(eq(knowledgeEntries.clientId, query.clientId));
  if (query.projectId) {
    filters.push(eq(knowledgeEntries.projectId, query.projectId));
  }

  const term = String(query.q || '').trim();
  if (term) {
    const like = `%${escapeLike(term)}%`;
    filters.push(
      or(
        ilike(knowledgeEntries.title, like),
        ilike(knowledgeEntries.summary, like),
        ilike(knowledgeEntries.content, like),
        sql`${knowledgeEntries.tags}::text ilike ${like}`,
        sql`to_tsvector('english', coalesce(${knowledgeEntries.title}, '') || ' ' || coalesce(${knowledgeEntries.summary}, '') || ' ' || ${knowledgeEntries.content}) @@ websearch_to_tsquery('english', ${term})`,
      ),
    );
  }

  return filters;
}

function orderFor(sort) {
  if (sort === 'title') return asc(knowledgeEntries.title);
  if (sort === 'updated') return desc(knowledgeEntries.updatedAt);
  return desc(knowledgeEntries.createdAt);
}

export async function listKnowledge(workspaceId, query) {
  const db = getDb();
  const filters = buildKnowledgeFilters(workspaceId, query);
  const offset = (query.page - 1) * query.pageSize;

  const [rows, totalRows] = await Promise.all([
    db
      .select({
        ...ENTRY_SELECT,
        createdByName: CREATOR.name,
        createdByEmail: CREATOR.email,
        clientName: clients.companyName,
        projectName: projects.name,
      })
      .from(knowledgeEntries)
      .leftJoin(users, eq(users.id, knowledgeEntries.createdByUserId))
      .leftJoin(clients, eq(clients.id, knowledgeEntries.clientId))
      .leftJoin(projects, eq(projects.id, knowledgeEntries.projectId))
      .where(and(...filters))
      .orderBy(orderFor(query.sort))
      .limit(query.pageSize)
      .offset(offset),
    db
      .select({ value: count() })
      .from(knowledgeEntries)
      .where(and(...filters)),
  ]);

  const total = Number(totalRows[0]?.value || 0);
  return {
    items: rows.map((row) => ({
      ...row,
      contentPreview: String(row.content || '').slice(0, 240),
    })),
    page: query.page,
    pageSize: query.pageSize,
    total,
    pages: Math.max(1, Math.ceil(total / query.pageSize)),
  };
}

export async function getKnowledgeEntry(workspaceId, entryId) {
  const rows = await getDb()
    .select({
      ...ENTRY_SELECT,
      createdByName: CREATOR.name,
      createdByEmail: CREATOR.email,
      clientName: clients.companyName,
      projectName: projects.name,
    })
    .from(knowledgeEntries)
    .leftJoin(users, eq(users.id, knowledgeEntries.createdByUserId))
    .leftJoin(clients, eq(clients.id, knowledgeEntries.clientId))
    .leftJoin(projects, eq(projects.id, knowledgeEntries.projectId))
    .where(
      and(
        eq(knowledgeEntries.workspaceId, workspaceId),
        eq(knowledgeEntries.id, entryId),
      ),
    )
    .limit(1);
  if (!rows[0]) return null;

  const [chunkRows, versionRows, documentRows, memoryRows] = await Promise.all([
    getDb()
      .select({ value: count() })
      .from(knowledgeChunks)
      .where(
        and(
          eq(knowledgeChunks.workspaceId, workspaceId),
          eq(knowledgeChunks.entryId, entryId),
        ),
      ),
    getDb()
      .select({ value: count() })
      .from(knowledgeVersions)
      .where(
        and(
          eq(knowledgeVersions.workspaceId, workspaceId),
          eq(knowledgeVersions.entryId, entryId),
        ),
      ),
    getDb()
      .select({
        id: knowledgeDocuments.id,
        filename: knowledgeDocuments.filename,
        status: knowledgeDocuments.status,
        byteSize: knowledgeDocuments.byteSize,
        chunkCount: knowledgeDocuments.chunkCount,
        createdAt: knowledgeDocuments.createdAt,
      })
      .from(knowledgeDocuments)
      .where(
        and(
          eq(knowledgeDocuments.workspaceId, workspaceId),
          eq(knowledgeDocuments.entryId, entryId),
        ),
      )
      .orderBy(desc(knowledgeDocuments.createdAt)),
    getDb()
      .select({ value: count() })
      .from(aiMemories)
      .where(
        and(
          eq(aiMemories.workspaceId, workspaceId),
          eq(aiMemories.sourceEntryId, entryId),
        ),
      ),
  ]);

  return {
    entry: rows[0],
    chunkCount: Number(chunkRows[0]?.value || 0),
    versionCount: Number(versionRows[0]?.value || 0),
    linkedMemories: Number(memoryRows[0]?.value || 0),
    documents: documentRows,
  };
}

async function writeVersion(executor, { entry, userId, changeNote }) {
  await executor.insert(knowledgeVersions).values({
    workspaceId: entry.workspaceId,
    entryId: entry.id,
    version: entry.version,
    category: entry.category,
    title: entry.title,
    summary: entry.summary,
    content: entry.content,
    tags: entry.tags || [],
    provenance: entry.provenance,
    status: entry.status,
    changedByUserId: userId,
    changeNote: changeNote || null,
  });
}

export async function createKnowledgeEntry({ workspaceId, userId, data }) {
  assertNoSecrets(data.title, data.summary, data.content);
  await assertClientScope(workspaceId, data.clientId);
  await assertProjectScope(workspaceId, data.projectId);

  const hash = contentHash(data.content);
  const existing = await findByHash(workspaceId, hash);
  if (existing) throw duplicateError(existing.id);

  const now = new Date();
  const status = data.status || 'draft';

  let created;
  try {
    created = await runAtomic(async (executor) => {
      const rows = await executor
        .insert(knowledgeEntries)
        .values({
          workspaceId,
          category: data.category,
          title: data.title,
          summary: data.summary,
          content: data.content,
          tags: data.tags || [],
          sourceType: data.sourceType || 'manual',
          sourceReference: data.sourceReference,
          provenance: data.provenance || 'unverified',
          status,
          clientId: data.clientId,
          projectId: data.projectId,
          version: 1,
          contentHash: hash,
          createdByUserId: userId,
          updatedByUserId: userId,
          publishedAt: status === 'published' ? now : null,
          archivedAt: status === 'archived' ? now : null,
        })
        .returning();
      const entry = rows[0];
      await writeVersion(executor, {
        entry,
        userId,
        changeNote: data.changeNote || 'Initial version',
      });
      return entry;
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      const duplicate = await findByHash(workspaceId, hash);
      throw duplicateError(duplicate?.id);
    }
    throw error;
  }

  await recordAudit({
    workspaceId,
    actorUserId: userId,
    action: 'knowledge.create',
    resourceType: 'knowledge_entry',
    resourceId: created.id,
    metadata: {
      category: created.category,
      status: created.status,
      provenance: created.provenance,
    },
  });
  if (status === 'published') {
    await recordAudit({
      workspaceId,
      actorUserId: userId,
      action: 'knowledge.publish',
      resourceType: 'knowledge_entry',
      resourceId: created.id,
      metadata: { category: created.category },
    });
  }

  return getKnowledgeEntry(workspaceId, created.id);
}

export async function updateKnowledgeEntry({
  workspaceId,
  entryId,
  userId,
  data,
}) {
  const currentRows = await getDb()
    .select()
    .from(knowledgeEntries)
    .where(
      and(
        eq(knowledgeEntries.workspaceId, workspaceId),
        eq(knowledgeEntries.id, entryId),
      ),
    )
    .limit(1);
  const current = currentRows[0];
  if (!current) throw notFound();

  if (data.expectedVersion && Number(data.expectedVersion) !== current.version) {
    throw staleError();
  }

  const next = {
    category: data.category ?? current.category,
    title: data.title ?? current.title,
    summary: data.summary !== undefined ? data.summary : current.summary,
    content: data.content ?? current.content,
    tags: data.tags ?? current.tags ?? [],
    provenance: data.provenance ?? current.provenance,
    status: data.status ?? current.status,
    clientId: data.clientId !== undefined ? data.clientId : current.clientId,
    projectId: data.projectId !== undefined ? data.projectId : current.projectId,
  };

  assertNoSecrets(next.title, next.summary, next.content);
  await assertClientScope(workspaceId, next.clientId);
  await assertProjectScope(workspaceId, next.projectId);

  const contentChanged = next.content !== current.content;
  const hash = contentChanged ? contentHash(next.content) : current.contentHash;
  if (contentChanged) {
    const duplicate = await findByHash(workspaceId, hash);
    if (duplicate && duplicate.id !== current.id) {
      throw duplicateError(duplicate.id);
    }
  }

  const now = new Date();
  const becamePublished =
    next.status === 'published' && current.status !== 'published';
  const becameArchived =
    next.status === 'archived' && current.status !== 'archived';
  const restored = current.status === 'archived' && next.status !== 'archived';

  let publishedAt = current.publishedAt;
  if (!publishedAt && next.status === 'published') publishedAt = now;
  let archivedAt = current.archivedAt;
  if (becameArchived) archivedAt = now;
  if (restored) archivedAt = null;

  const updatedRow = await runAtomic(async (executor) => {
    const rows = await executor
      .update(knowledgeEntries)
      .set({
        ...next,
        contentHash: hash,
        version: current.version + 1,
        publishedAt,
        archivedAt,
        updatedByUserId: userId,
      })
      .where(
        and(
          eq(knowledgeEntries.id, entryId),
          eq(knowledgeEntries.workspaceId, workspaceId),
          eq(knowledgeEntries.version, current.version),
        ),
      )
      .returning();
    if (!rows[0]) throw staleError();
    await writeVersion(executor, {
      entry: rows[0],
      userId,
      changeNote: data.changeNote || 'Updated',
    });
    return rows[0];
  });

  const metadata = {
    fields: Object.keys(data).filter(
      (key) => !['changeNote', 'expectedVersion'].includes(key),
    ),
    version: updatedRow.version,
  };
  await recordAudit({
    workspaceId,
    actorUserId: userId,
    action: 'knowledge.update',
    resourceType: 'knowledge_entry',
    resourceId: entryId,
    metadata,
  });
  if (becamePublished) {
    await recordAudit({
      workspaceId,
      actorUserId: userId,
      action: 'knowledge.publish',
      resourceType: 'knowledge_entry',
      resourceId: entryId,
      metadata: { version: updatedRow.version },
    });
  }
  if (becameArchived) {
    await recordAudit({
      workspaceId,
      actorUserId: userId,
      action: 'knowledge.archive',
      resourceType: 'knowledge_entry',
      resourceId: entryId,
      metadata: { version: updatedRow.version },
    });
  }
  if (restored) {
    await recordAudit({
      workspaceId,
      actorUserId: userId,
      action: 'knowledge.restore',
      resourceType: 'knowledge_entry',
      resourceId: entryId,
      metadata: { version: updatedRow.version, status: updatedRow.status },
    });
  }

  return getKnowledgeEntry(workspaceId, entryId);
}

export async function listKnowledgeVersions(workspaceId, entryId, query) {
  const offset = (query.page - 1) * query.pageSize;
  const filters = and(
    eq(knowledgeVersions.workspaceId, workspaceId),
    eq(knowledgeVersions.entryId, entryId),
  );
  const [rows, totalRows] = await Promise.all([
    getDb()
      .select({
        id: knowledgeVersions.id,
        version: knowledgeVersions.version,
        category: knowledgeVersions.category,
        title: knowledgeVersions.title,
        summary: knowledgeVersions.summary,
        content: knowledgeVersions.content,
        tags: knowledgeVersions.tags,
        provenance: knowledgeVersions.provenance,
        status: knowledgeVersions.status,
        changeNote: knowledgeVersions.changeNote,
        createdAt: knowledgeVersions.createdAt,
        changedByName: users.name,
        changedByEmail: users.email,
      })
      .from(knowledgeVersions)
      .leftJoin(users, eq(users.id, knowledgeVersions.changedByUserId))
      .where(filters)
      .orderBy(desc(knowledgeVersions.version))
      .limit(query.pageSize)
      .offset(offset),
    getDb().select({ value: count() }).from(knowledgeVersions).where(filters),
  ]);

  const total = Number(totalRows[0]?.value || 0);
  return {
    items: rows,
    page: query.page,
    pageSize: query.pageSize,
    total,
    pages: Math.max(1, Math.ceil(total / query.pageSize)),
  };
}

export async function getKnowledgeOverview(workspaceId) {
  const db = getDb();
  const entryCounts = await db
    .select({
      status: knowledgeEntries.status,
      value: count(),
    })
    .from(knowledgeEntries)
    .where(eq(knowledgeEntries.workspaceId, workspaceId))
    .groupBy(knowledgeEntries.status);

  const categoryCounts = await db
    .select({ category: knowledgeEntries.category, value: count() })
    .from(knowledgeEntries)
    .where(
      and(
        eq(knowledgeEntries.workspaceId, workspaceId),
        ne(knowledgeEntries.status, 'archived'),
      ),
    )
    .groupBy(knowledgeEntries.category);

  const [documentCounts, memoryCount, chunkCount, recentEntries, recentDocuments] =
    await Promise.all([
      db
        .select({ status: knowledgeDocuments.status, value: count() })
        .from(knowledgeDocuments)
        .where(eq(knowledgeDocuments.workspaceId, workspaceId))
        .groupBy(knowledgeDocuments.status),
      db
        .select({ value: count() })
        .from(aiMemories)
        .where(
          and(
            eq(aiMemories.workspaceId, workspaceId),
            eq(aiMemories.status, 'active'),
          ),
        ),
      db
        .select({ value: count() })
        .from(knowledgeChunks)
        .where(eq(knowledgeChunks.workspaceId, workspaceId)),
      db
        .select({
          id: knowledgeEntries.id,
          title: knowledgeEntries.title,
          category: knowledgeEntries.category,
          status: knowledgeEntries.status,
          provenance: knowledgeEntries.provenance,
          updatedAt: knowledgeEntries.updatedAt,
        })
        .from(knowledgeEntries)
        .where(eq(knowledgeEntries.workspaceId, workspaceId))
        .orderBy(desc(knowledgeEntries.updatedAt))
        .limit(5),
      db
        .select({
          id: knowledgeDocuments.id,
          filename: knowledgeDocuments.filename,
          status: knowledgeDocuments.status,
          chunkCount: knowledgeDocuments.chunkCount,
          createdAt: knowledgeDocuments.createdAt,
        })
        .from(knowledgeDocuments)
        .where(eq(knowledgeDocuments.workspaceId, workspaceId))
        .orderBy(desc(knowledgeDocuments.createdAt))
        .limit(5),
    ]);

  const byStatus = { draft: 0, published: 0, archived: 0 };
  for (const row of entryCounts) byStatus[row.status] = Number(row.value);
  const documentsByStatus = { processing: 0, processed: 0, failed: 0 };
  for (const row of documentCounts) {
    documentsByStatus[row.status] = Number(row.value);
  }

  return {
    entries: {
      ...byStatus,
      active: byStatus.draft + byStatus.published,
      total: byStatus.draft + byStatus.published + byStatus.archived,
    },
    documents: {
      ...documentsByStatus,
      total:
        documentsByStatus.processing +
        documentsByStatus.processed +
        documentsByStatus.failed,
    },
    categories: categoryCounts.map((row) => ({
      category: row.category,
      value: Number(row.value),
    })),
    activeMemories: Number(memoryCount[0]?.value || 0),
    chunks: Number(chunkCount[0]?.value || 0),
    recentEntries,
    recentDocuments,
  };
}

export async function getKnowledgeScopeOptions(workspaceId) {
  const [clientRows, projectRows] = await Promise.all([
    getDb()
      .select({ id: clients.id, companyName: clients.companyName })
      .from(clients)
      .where(eq(clients.workspaceId, workspaceId))
      .orderBy(asc(clients.companyName)),
    getDb()
      .select({
        id: projects.id,
        name: projects.name,
        clientId: projects.clientId,
      })
      .from(projects)
      .where(eq(projects.workspaceId, workspaceId))
      .orderBy(asc(projects.name)),
  ]);
  return { clients: clientRows, projects: projectRows };
}
