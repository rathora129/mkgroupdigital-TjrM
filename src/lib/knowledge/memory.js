import {
  and,
  count,
  desc,
  eq,
  ilike,
  inArray,
  isNull,
  ne,
  or,
  sql,
} from 'drizzle-orm';
import { getDb } from '@/db/client';
import {
  agents,
  aiMemories,
  aiMemoryVersions,
  clients,
  knowledgeEntries,
  projects,
  users,
} from '@/db/schema';
import { ApiError } from '@/lib/api-error';
import { recordAudit } from '@/lib/audit';
import { hasPermission } from '@/lib/auth/permissions';
import { CONTEXT_BUDGET } from './constants';
import {
  assertAgentScope,
  assertClientScope,
  assertProjectScope,
  escapeLike,
  isUniqueViolation,
  runAtomic,
  staleError,
} from './helpers';
import { clipText, findSecret, redactSecrets } from './text';

const MEMORY_FIELDS = {
  id: aiMemories.id,
  memoryType: aiMemories.memoryType,
  key: aiMemories.key,
  content: aiMemories.content,
  sourceType: aiMemories.sourceType,
  sourceReference: aiMemories.sourceReference,
  sourceEntryId: aiMemories.sourceEntryId,
  clientId: aiMemories.clientId,
  projectId: aiMemories.projectId,
  agentId: aiMemories.agentId,
  status: aiMemories.status,
  confidence: aiMemories.confidence,
  verified: aiMemories.verified,
  version: aiMemories.version,
  supersedesId: aiMemories.supersedesId,
  expiresAt: aiMemories.expiresAt,
  archivedAt: aiMemories.archivedAt,
  createdAt: aiMemories.createdAt,
  updatedAt: aiMemories.updatedAt,
  createdByUserId: aiMemories.createdByUserId,
};

function notFound() {
  return new ApiError(404, 'NOT_FOUND', 'That memory could not be found.');
}

function duplicateError(memoryId) {
  return new ApiError(
    409,
    'DUPLICATE_MEMORY',
    'An active memory with that key already exists for this type. Update it instead of creating a duplicate.',
    { memoryId },
  );
}

function assertNoSecrets(...values) {
  for (const value of values) {
    if (value && findSecret(value)) {
      throw new ApiError(
        422,
        'SECRET_DETECTED',
        'Memory must never contain passwords, API keys or tokens. Remove the secret before saving.',
      );
    }
  }
}

async function assertScope(workspaceId, data) {
  await assertClientScope(workspaceId, data.clientId);
  await assertProjectScope(workspaceId, data.projectId);
  await assertAgentScope(workspaceId, data.agentId);
  if (data.sourceEntryId) {
    const rows = await getDb()
      .select({ id: knowledgeEntries.id })
      .from(knowledgeEntries)
      .where(
        and(
          eq(knowledgeEntries.workspaceId, workspaceId),
          eq(knowledgeEntries.id, data.sourceEntryId),
        ),
      )
      .limit(1);
    if (!rows[0]) {
      throw new ApiError(
        422,
        'SOURCE_NOT_FOUND',
        'Choose a knowledge entry from this workspace.',
        { sourceEntryId: 'Choose a knowledge entry from this workspace.' },
      );
    }
  }
}

async function findActiveByKey(workspaceId, memoryType, key, excludeId = null) {
  const filters = [
    eq(aiMemories.workspaceId, workspaceId),
    eq(aiMemories.memoryType, memoryType),
    eq(aiMemories.key, key),
    eq(aiMemories.status, 'active'),
  ];
  if (excludeId) filters.push(ne(aiMemories.id, excludeId));
  const rows = await getDb()
    .select({ id: aiMemories.id })
    .from(aiMemories)
    .where(and(...filters))
    .limit(1);
  return rows[0] || null;
}

async function writeMemoryVersion(executor, { memory, userId, changeNote }) {
  await executor.insert(aiMemoryVersions).values({
    workspaceId: memory.workspaceId,
    memoryId: memory.id,
    version: memory.version,
    key: memory.key,
    content: memory.content,
    confidence: memory.confidence,
    verified: memory.verified,
    status: memory.status,
    changedByUserId: userId,
    changeNote: changeNote || null,
  });
}

export async function listMemories(workspaceId, query) {
  const filters = [eq(aiMemories.workspaceId, workspaceId)];
  if (query.memoryType && query.memoryType !== 'any') {
    filters.push(eq(aiMemories.memoryType, query.memoryType));
  }
  if (query.status === 'any') {
    // include every status
  } else {
    filters.push(eq(aiMemories.status, query.status || 'active'));
  }
  if (query.clientId) filters.push(eq(aiMemories.clientId, query.clientId));
  if (query.projectId) filters.push(eq(aiMemories.projectId, query.projectId));

  const term = String(query.q || '').trim();
  if (term) {
    const like = `%${escapeLike(term)}%`;
    filters.push(
      or(
        ilike(aiMemories.key, like),
        ilike(aiMemories.content, like),
        sql`to_tsvector('english', coalesce(${aiMemories.key}, '') || ' ' || ${aiMemories.content}) @@ websearch_to_tsquery('english', ${term})`,
      ),
    );
  }

  const offset = (query.page - 1) * query.pageSize;
  const [rows, totalRows] = await Promise.all([
    getDb()
      .select({
        ...MEMORY_FIELDS,
        createdByName: users.name,
        createdByEmail: users.email,
        clientName: clients.companyName,
        projectName: projects.name,
        agentName: agents.name,
      })
      .from(aiMemories)
      .leftJoin(users, eq(users.id, aiMemories.createdByUserId))
      .leftJoin(clients, eq(clients.id, aiMemories.clientId))
      .leftJoin(projects, eq(projects.id, aiMemories.projectId))
      .leftJoin(agents, eq(agents.id, aiMemories.agentId))
      .where(and(...filters))
      .orderBy(desc(aiMemories.updatedAt))
      .limit(query.pageSize)
      .offset(offset),
    getDb().select({ value: count() }).from(aiMemories).where(and(...filters)),
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

export async function getMemory(workspaceId, memoryId) {
  const rows = await getDb()
    .select({
      ...MEMORY_FIELDS,
      createdByName: users.name,
      createdByEmail: users.email,
      clientName: clients.companyName,
      projectName: projects.name,
      agentName: agents.name,
      sourceEntryTitle: knowledgeEntries.title,
    })
    .from(aiMemories)
    .leftJoin(users, eq(users.id, aiMemories.createdByUserId))
    .leftJoin(clients, eq(clients.id, aiMemories.clientId))
    .leftJoin(projects, eq(projects.id, aiMemories.projectId))
    .leftJoin(agents, eq(agents.id, aiMemories.agentId))
    .leftJoin(
      knowledgeEntries,
      eq(knowledgeEntries.id, aiMemories.sourceEntryId),
    )
    .where(
      and(
        eq(aiMemories.workspaceId, workspaceId),
        eq(aiMemories.id, memoryId),
      ),
    )
    .limit(1);
  const memory = rows[0];
  if (!memory) return null;

  const versionRows = await getDb()
    .select({ value: count() })
    .from(aiMemoryVersions)
    .where(
      and(
        eq(aiMemoryVersions.workspaceId, workspaceId),
        eq(aiMemoryVersions.memoryId, memoryId),
      ),
    );

  return { memory, versionCount: Number(versionRows[0]?.value || 0) };
}

export async function createMemory({ workspaceId, userId, data }) {
  assertNoSecrets(data.key, data.content);
  await assertScope(workspaceId, data);

  const existing = await findActiveByKey(
    workspaceId,
    data.memoryType,
    data.key,
    data.supersedesId || null,
  );
  if (existing) throw duplicateError(existing.id);

  let superseded = null;
  const now = new Date();

  try {
    const created = await runAtomic(async (executor) => {
      if (data.supersedesId) {
        const targetRows = await executor
          .select()
          .from(aiMemories)
          .where(
            and(
              eq(aiMemories.workspaceId, workspaceId),
              eq(aiMemories.id, data.supersedesId),
            ),
          )
          .limit(1);
        const target = targetRows[0];
        if (!target) {
          throw new ApiError(
            422,
            'SUPERSEDED_NOT_FOUND',
            'Choose a memory from this workspace to supersede.',
          );
        }
        const updated = await executor
          .update(aiMemories)
          .set({
            status: 'superseded',
            version: target.version + 1,
            updatedByUserId: userId,
          })
          .where(eq(aiMemories.id, target.id))
          .returning();
        superseded = updated[0];
        await writeMemoryVersion(executor, {
          memory: superseded,
          userId,
          changeNote: 'Superseded by a newer memory',
        });
      }

      const rows = await executor
        .insert(aiMemories)
        .values({
          workspaceId,
          memoryType: data.memoryType,
          key: data.key,
          content: data.content,
          sourceType: data.sourceType || 'manual',
          sourceReference: data.sourceReference,
          sourceEntryId: data.sourceEntryId,
          clientId: data.clientId,
          projectId: data.projectId,
          agentId: data.agentId,
          status: 'active',
          confidence: data.confidence || 'medium',
          verified: Boolean(data.verified),
          version: 1,
          supersedesId: data.supersedesId || null,
          createdByUserId: userId,
          updatedByUserId: userId,
        })
        .returning();
      await writeMemoryVersion(executor, {
        memory: rows[0],
        userId,
        changeNote: data.changeNote || 'Initial version',
      });
      return rows[0];
    });

    await recordAudit({
      workspaceId,
      actorUserId: userId,
      action: 'memory.create',
      resourceType: 'ai_memory',
      resourceId: created.id,
      metadata: {
        memoryType: created.memoryType,
        confidence: created.confidence,
        verified: created.verified,
        supersedesId: created.supersedesId,
      },
    });
    if (superseded) {
      await recordAudit({
        workspaceId,
        actorUserId: userId,
        action: 'memory.supersede',
        resourceType: 'ai_memory',
        resourceId: superseded.id,
        metadata: { supersededBy: created.id },
      });
    }

    return getMemory(workspaceId, created.id);
  } catch (error) {
    if (isUniqueViolation(error)) {
      const duplicate = await findActiveByKey(
        workspaceId,
        data.memoryType,
        data.key,
      );
      throw duplicateError(duplicate?.id);
    }
    throw error;
  }
}

export async function updateMemory({ workspaceId, memoryId, userId, data }) {
  const currentRows = await getDb()
    .select()
    .from(aiMemories)
    .where(
      and(eq(aiMemories.workspaceId, workspaceId), eq(aiMemories.id, memoryId)),
    )
    .limit(1);
  const current = currentRows[0];
  if (!current) throw notFound();
  if (data.expectedVersion && Number(data.expectedVersion) !== current.version) {
    throw staleError('memory');
  }

  const next = {
    key: data.key ?? current.key,
    content: data.content ?? current.content,
    confidence: data.confidence ?? current.confidence,
    verified: data.verified ?? current.verified,
    status: data.status ?? current.status,
    sourceReference:
      data.sourceReference !== undefined
        ? data.sourceReference
        : current.sourceReference,
  };
  assertNoSecrets(next.key, next.content);

  if (next.key !== current.key && next.status === 'active') {
    const duplicate = await findActiveByKey(
      workspaceId,
      current.memoryType,
      next.key,
      current.id,
    );
    if (duplicate) throw duplicateError(duplicate.id);
  }

  const now = new Date();
  let archivedAt = current.archivedAt;
  if (next.status === 'archived' && current.status !== 'archived') {
    archivedAt = now;
  }
  if (next.status === 'active' && current.status !== 'active') {
    archivedAt = null;
  }

  const updated = await runAtomic(async (executor) => {
    const rows = await executor
      .update(aiMemories)
      .set({
        ...next,
        archivedAt,
        version: current.version + 1,
        updatedByUserId: userId,
      })
      .where(
        and(
          eq(aiMemories.id, memoryId),
          eq(aiMemories.workspaceId, workspaceId),
          eq(aiMemories.version, current.version),
        ),
      )
      .returning();
    if (!rows[0]) throw staleError('memory');
    await writeMemoryVersion(executor, {
      memory: rows[0],
      userId,
      changeNote: data.changeNote || 'Updated',
    });
    return rows[0];
  });

  await recordAudit({
    workspaceId,
    actorUserId: userId,
    action: 'memory.update',
    resourceType: 'ai_memory',
    resourceId: memoryId,
    metadata: {
      fields: Object.keys(data).filter(
        (key) => !['changeNote', 'expectedVersion'].includes(key),
      ),
      version: updated.version,
    },
  });
  if (next.status === 'archived' && current.status !== 'archived') {
    await recordAudit({
      workspaceId,
      actorUserId: userId,
      action: 'memory.archive',
      resourceType: 'ai_memory',
      resourceId: memoryId,
      metadata: { version: updated.version },
    });
  }
  if (next.status === 'active' && current.status === 'archived') {
    await recordAudit({
      workspaceId,
      actorUserId: userId,
      action: 'memory.restore',
      resourceType: 'ai_memory',
      resourceId: memoryId,
      metadata: { version: updated.version },
    });
  }

  return getMemory(workspaceId, memoryId);
}

export async function listMemoryVersions(workspaceId, memoryId, query) {
  const filters = and(
    eq(aiMemoryVersions.workspaceId, workspaceId),
    eq(aiMemoryVersions.memoryId, memoryId),
  );
  const offset = (query.page - 1) * query.pageSize;
  const [rows, totalRows] = await Promise.all([
    getDb()
      .select({
        id: aiMemoryVersions.id,
        version: aiMemoryVersions.version,
        key: aiMemoryVersions.key,
        content: aiMemoryVersions.content,
        confidence: aiMemoryVersions.confidence,
        verified: aiMemoryVersions.verified,
        status: aiMemoryVersions.status,
        changeNote: aiMemoryVersions.changeNote,
        createdAt: aiMemoryVersions.createdAt,
        changedByName: users.name,
        changedByEmail: users.email,
      })
      .from(aiMemoryVersions)
      .leftJoin(users, eq(users.id, aiMemoryVersions.changedByUserId))
      .where(filters)
      .orderBy(desc(aiMemoryVersions.version))
      .limit(query.pageSize)
      .offset(offset),
    getDb().select({ value: count() }).from(aiMemoryVersions).where(filters),
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

// Memories supplied to an AI run. Workspace-wide memories are always eligible;
// scoped memories are only eligible for their own client/project/agent.
export async function getMemoriesForContext({
  workspaceId,
  role,
  agentType,
  memoryTypes,
  term,
  clientId = null,
  projectId = null,
  agentId = null,
  limit = CONTEXT_BUDGET.maxMemories,
}) {
  if (!hasPermission(role, 'memories.view')) {
    return { memories: [], limited: true, reason: 'permission' };
  }

  const filters = [
    eq(aiMemories.workspaceId, workspaceId),
    eq(aiMemories.status, 'active'),
    or(isNull(aiMemories.expiresAt), sql`${aiMemories.expiresAt} > now()`),
  ];
  if (memoryTypes?.length) {
    filters.push(inArray(aiMemories.memoryType, memoryTypes));
  }
  const scoped = [];
  if (clientId) scoped.push(eq(aiMemories.clientId, clientId));
  if (projectId) scoped.push(eq(aiMemories.projectId, projectId));
  if (agentId) scoped.push(eq(aiMemories.agentId, agentId));
  if (scoped.length) {
    filters.push(
      or(
        and(
          isNull(aiMemories.clientId),
          isNull(aiMemories.projectId),
          isNull(aiMemories.agentId),
        ),
        or(...scoped),
      ),
    );
  }

  const text = String(term || '').trim();

  const select = async (searchTerm) => {
    const scopedFilters = [...filters];
    let rank = sql`0`;
    let order = [desc(aiMemories.updatedAt)];
    if (searchTerm) {
      const like = `%${escapeLike(searchTerm)}%`;
      scopedFilters.push(
        or(
          ilike(aiMemories.key, like),
          ilike(aiMemories.content, like),
          sql`to_tsvector('english', coalesce(${aiMemories.key}, '') || ' ' || ${aiMemories.content}) @@ websearch_to_tsquery('english', ${searchTerm})`,
        ),
      );
      rank = sql`ts_rank(to_tsvector('english', coalesce(${aiMemories.key}, '') || ' ' || ${aiMemories.content}), websearch_to_tsquery('english', ${searchTerm}))`;
      order = [sql`${rank} desc`, desc(aiMemories.updatedAt)];
    }
    return getDb()
      .select({ ...MEMORY_FIELDS, rank })
      .from(aiMemories)
      .where(and(...scopedFilters))
      .orderBy(...order)
      .limit(limit);
  };

  // A natural-language task rarely shares every word with a memory, so when
  // the lexical pass finds nothing the most recent scoped memories are used
  // instead. Knowledge retrieval uses the same fallback.
  let rows = await select(text);
  if (text && rows.length === 0) {
    rows = await select('');
  }

  const memories = rows.map((row) => ({
    id: row.id,
    memoryType: row.memoryType,
    key: row.key,
    text: clipText(redactSecrets(row.content || ''), 600),
    confidence: row.confidence,
    verified: row.verified,
    sourceReference: row.sourceReference,
    clientId: row.clientId,
    projectId: row.projectId,
    agentId: row.agentId,
    updatedAt: row.updatedAt,
    score: Number(row.rank || 0),
  }));

  return { memories, limited: false, agentType };
}
