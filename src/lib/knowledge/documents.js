import { and, asc, count, desc, eq, ilike, isNull, sql } from 'drizzle-orm';
import { getDb } from '@/db/client';
import {
  knowledgeChunks,
  knowledgeDocuments,
  knowledgeEntries,
  knowledgeVersions,
  users,
} from '@/db/schema';
import { ApiError } from '@/lib/api-error';
import { recordAudit } from '@/lib/audit';
import {
  DOCUMENT_EXTENSIONS,
  MAX_DOCUMENT_BYTES,
  MAX_KNOWLEDGE_CONTENT_CHARS,
} from './constants';
import {
  assertClientScope,
  assertProjectScope,
  escapeLike,
  isUniqueViolation,
  runAtomic,
} from './helpers';
import {
  checksumOf,
  chunkText,
  contentHash,
  decodeDocumentText,
  detectDocumentFormat,
  findSecret,
  sanitizeFilename,
} from './text';

const DOCUMENT_SELECT = {
  id: knowledgeDocuments.id,
  entryId: knowledgeDocuments.entryId,
  filename: knowledgeDocuments.filename,
  mimeType: knowledgeDocuments.mimeType,
  format: knowledgeDocuments.format,
  byteSize: knowledgeDocuments.byteSize,
  checksum: knowledgeDocuments.checksum,
  status: knowledgeDocuments.status,
  errorMessage: knowledgeDocuments.errorMessage,
  chunkCount: knowledgeDocuments.chunkCount,
  version: knowledgeDocuments.version,
  processedAt: knowledgeDocuments.processedAt,
  createdAt: knowledgeDocuments.createdAt,
  updatedAt: knowledgeDocuments.updatedAt,
};

function documentNotFound() {
  return new ApiError(
    404,
    'NOT_FOUND',
    'That knowledge document could not be found.',
  );
}

function titleFromContent(text, filename) {
  const heading = text.match(/^#{1,6}\s+(.+)$/m);
  if (heading) return heading[1].trim().slice(0, 200);
  const firstLine = text.split('\n').find((line) => line.trim());
  if (firstLine && firstLine.trim().length >= 3 && firstLine.length <= 120) {
    return firstLine.trim();
  }
  return filename.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').slice(0, 200);
}

function validateUpload({ filename, mimeType, buffer }) {
  const safeName = sanitizeFilename(filename);
  const format = detectDocumentFormat(safeName);
  if (!format) {
    throw new ApiError(
      422,
      'UNSUPPORTED_FORMAT',
      `That file type cannot be processed safely. Supported formats: ${DOCUMENT_EXTENSIONS.join(', ')}.`,
      { file: 'Unsupported file type.' },
    );
  }

  const size = buffer?.length || 0;
  if (size === 0) {
    throw new ApiError(422, 'EMPTY_DOCUMENT', 'That file is empty.', {
      file: 'That file is empty.',
    });
  }
  if (size > MAX_DOCUMENT_BYTES) {
    throw new ApiError(
      413,
      'DOCUMENT_TOO_LARGE',
      'Documents must be 1 MB or smaller.',
      { file: 'Choose a file smaller than 1 MB.' },
    );
  }

  const mime = String(mimeType || '').toLowerCase();
  const acceptableMime =
    !mime ||
    mime === 'application/octet-stream' ||
    mime.startsWith('text/') ||
    ['application/json', 'application/csv', 'application/x-json'].includes(mime);
  if (!acceptableMime) {
    throw new ApiError(
      422,
      'UNSUPPORTED_FORMAT',
      'That file type cannot be processed safely. Upload a plain-text, markdown, CSV or JSON file.',
      { file: 'Unsupported file type.' },
    );
  }

  return { safeName, format, size };
}

async function nextDocumentVersion(workspaceId, filename) {
  const rows = await getDb()
    .select({
      value: sql`coalesce(max(${knowledgeDocuments.version}), 0)`,
    })
    .from(knowledgeDocuments)
    .where(
      and(
        eq(knowledgeDocuments.workspaceId, workspaceId),
        eq(knowledgeDocuments.filename, filename),
      ),
    );
  return Number(rows[0]?.value || 0) + 1;
}

async function chunksForEntry(workspaceId, entryId) {
  const rows = await getDb()
    .select({ value: count() })
    .from(knowledgeChunks)
    .where(
      and(
        eq(knowledgeChunks.workspaceId, workspaceId),
        eq(knowledgeChunks.entryId, entryId),
      ),
    );
  return Number(rows[0]?.value || 0);
}

export async function ingestDocument({ workspaceId, userId, file, data }) {
  const { safeName, format, size } = validateUpload({
    filename: file?.filename,
    mimeType: file?.mimeType,
    buffer: file?.buffer,
  });

  const checksum = checksumOf(file.buffer);
  const existingRows = await getDb()
    .select({ ...DOCUMENT_SELECT })
    .from(knowledgeDocuments)
    .where(
      and(
        eq(knowledgeDocuments.workspaceId, workspaceId),
        eq(knowledgeDocuments.checksum, checksum),
      ),
    )
    .limit(1);
  if (existingRows[0]) {
    const existing = existingRows[0];
    const entry = existing.entryId
      ? (
          await getDb()
            .select({
              id: knowledgeEntries.id,
              title: knowledgeEntries.title,
              status: knowledgeEntries.status,
            })
            .from(knowledgeEntries)
            .where(eq(knowledgeEntries.id, existing.entryId))
            .limit(1)
        )[0] || null
      : null;
    return { document: existing, entry, duplicate: true };
  }

  const text = decodeDocumentText(file.buffer);
  if (findSecret(text)) {
    throw new ApiError(
      422,
      'SECRET_DETECTED',
      'That document appears to contain a password, key or token. Remove secrets before uploading it as workspace knowledge.',
      { file: 'Remove secrets before uploading.' },
    );
  }

  await assertClientScope(workspaceId, data.clientId);
  await assertProjectScope(workspaceId, data.projectId);

  const clipped = text.slice(0, MAX_KNOWLEDGE_CONTENT_CHARS);
  const hash = contentHash(clipped);
  const version = await nextDocumentVersion(workspaceId, safeName);

  const inserted = await getDb()
    .insert(knowledgeDocuments)
    .values({
      workspaceId,
      filename: safeName,
      mimeType: file.mimeType || format.mimeTypes[0],
      format: format.format,
      byteSize: size,
      checksum,
      status: 'processing',
      rawText: text,
      version,
      uploadedByUserId: userId,
    })
    .returning({ ...DOCUMENT_SELECT });
  const document = inserted[0];

  await recordAudit({
    workspaceId,
    actorUserId: userId,
    action: 'knowledge.document_upload',
    resourceType: 'knowledge_document',
    resourceId: document.id,
    metadata: {
      filename: safeName,
      format: format.format,
      byteSize: size,
      version,
    },
  });

  try {
    const existingEntryRows = await getDb()
      .select({ id: knowledgeEntries.id, title: knowledgeEntries.title })
      .from(knowledgeEntries)
      .where(
        and(
          eq(knowledgeEntries.workspaceId, workspaceId),
          eq(knowledgeEntries.contentHash, hash),
          isNull(knowledgeEntries.archivedAt),
        ),
      )
      .limit(1);

    if (existingEntryRows[0]) {
      const entry = existingEntryRows[0];
      const chunkCount = await chunksForEntry(workspaceId, entry.id);
      const processed = await getDb()
        .update(knowledgeDocuments)
        .set({
          status: 'processed',
          entryId: entry.id,
          chunkCount,
          processedAt: new Date(),
          errorMessage: null,
        })
        .where(eq(knowledgeDocuments.id, document.id))
        .returning({ ...DOCUMENT_SELECT });
      await recordAudit({
        workspaceId,
        actorUserId: userId,
        action: 'knowledge.document_processed',
        resourceType: 'knowledge_document',
        resourceId: document.id,
        metadata: { entryId: entry.id, chunkCount, duplicateKnowledge: true },
      });
      return {
        document: processed[0],
        entry,
        duplicate: false,
        duplicateKnowledge: true,
      };
    }

    const chunks = chunkText(clipped);
    if (chunks.length === 0) {
      throw new ApiError(
        422,
        'EMPTY_DOCUMENT',
        'No readable text was found in that file.',
      );
    }

    const result = await runAtomic(async (executor) => {
      const entryRows = await executor
        .insert(knowledgeEntries)
        .values({
          workspaceId,
          category: data.category,
          title: (data.title || titleFromContent(text, safeName)).slice(0, 200),
          summary: null,
          content: clipped,
          tags: data.tags || [],
          sourceType: 'document',
          sourceReference: safeName,
          provenance: data.provenance,
          status: data.status,
          clientId: data.clientId,
          projectId: data.projectId,
          version: 1,
          contentHash: hash,
          createdByUserId: userId,
          updatedByUserId: userId,
          publishedAt: data.status === 'published' ? new Date() : null,
          archivedAt: data.status === 'archived' ? new Date() : null,
        })
        .returning();
      const entry = entryRows[0];

      await executor.insert(knowledgeChunks).values(
        chunks.map((chunk) => ({
          workspaceId,
          entryId: entry.id,
          documentId: document.id,
          chunkIndex: chunk.index,
          heading: chunk.heading,
          content: chunk.content,
          charCount: chunk.charCount,
          tokenEstimate: chunk.tokenEstimate,
          contentHash: contentHash(chunk.content),
        })),
      );

      await executor.insert(knowledgeVersions).values({
        workspaceId,
        entryId: entry.id,
        version: 1,
        category: entry.category,
        title: entry.title,
        summary: null,
        content: entry.content,
        tags: entry.tags || [],
        provenance: entry.provenance,
        status: entry.status,
        changedByUserId: userId,
        changeNote: `Created from uploaded document ${safeName}`,
      });

      const processedRows = await executor
        .update(knowledgeDocuments)
        .set({
          status: 'processed',
          entryId: entry.id,
          chunkCount: chunks.length,
          processedAt: new Date(),
          errorMessage: null,
        })
        .where(eq(knowledgeDocuments.id, document.id))
        .returning({ ...DOCUMENT_SELECT });

      return { entry, document: processedRows[0], chunkCount: chunks.length };
    });

    await recordAudit({
      workspaceId,
      actorUserId: userId,
      action: 'knowledge.document_processed',
      resourceType: 'knowledge_document',
      resourceId: document.id,
      metadata: {
        entryId: result.entry.id,
        chunkCount: result.chunkCount,
      },
    });

    return { document: result.document, entry: result.entry, duplicate: false };
  } catch (error) {
    const message =
      error instanceof ApiError
        ? error.message
        : 'The document could not be processed.';
    await getDb()
      .update(knowledgeDocuments)
      .set({ status: 'failed', errorMessage: message.slice(0, 500) })
      .where(eq(knowledgeDocuments.id, document.id));
    await recordAudit({
      workspaceId,
      actorUserId: userId,
      action: 'knowledge.document_failed',
      resourceType: 'knowledge_document',
      resourceId: document.id,
      success: false,
      metadata: { filename: safeName, reason: message.slice(0, 200) },
    });

    if (error instanceof ApiError) throw error;
    if (isUniqueViolation(error)) {
      throw new ApiError(
        409,
        'DUPLICATE_KNOWLEDGE',
        'An identical knowledge entry already exists in this workspace.',
      );
    }
    throw new ApiError(
      422,
      'PROCESSING_FAILED',
      'The document was stored but could not be indexed. You can retry processing.',
      { documentId: document.id },
    );
  }
}

export async function listDocuments(workspaceId, query) {
  const filters = [eq(knowledgeDocuments.workspaceId, workspaceId)];
  if (query.status && query.status !== 'any') {
    filters.push(eq(knowledgeDocuments.status, query.status));
  }
  const term = String(query.q || '').trim();
  if (term) {
    filters.push(ilike(knowledgeDocuments.filename, `%${escapeLike(term)}%`));
  }
  const offset = (query.page - 1) * query.pageSize;

  const [rows, totalRows] = await Promise.all([
    getDb()
      .select({
        ...DOCUMENT_SELECT,
        uploadedByName: users.name,
        uploadedByEmail: users.email,
        entryTitle: knowledgeEntries.title,
      })
      .from(knowledgeDocuments)
      .leftJoin(users, eq(users.id, knowledgeDocuments.uploadedByUserId))
      .leftJoin(
        knowledgeEntries,
        eq(knowledgeEntries.id, knowledgeDocuments.entryId),
      )
      .where(and(...filters))
      .orderBy(desc(knowledgeDocuments.createdAt))
      .limit(query.pageSize)
      .offset(offset),
    getDb()
      .select({ value: count() })
      .from(knowledgeDocuments)
      .where(and(...filters)),
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

export async function getDocument(workspaceId, documentId) {
  const rows = await getDb()
    .select({
      ...DOCUMENT_SELECT,
      uploadedByName: users.name,
      uploadedByEmail: users.email,
    })
    .from(knowledgeDocuments)
    .leftJoin(users, eq(users.id, knowledgeDocuments.uploadedByUserId))
    .where(
      and(
        eq(knowledgeDocuments.workspaceId, workspaceId),
        eq(knowledgeDocuments.id, documentId),
      ),
    )
    .limit(1);
  const document = rows[0];
  if (!document) return null;

  const [entryRows, chunkRows] = await Promise.all([
    document.entryId
      ? getDb()
          .select({
            id: knowledgeEntries.id,
            title: knowledgeEntries.title,
            category: knowledgeEntries.category,
            status: knowledgeEntries.status,
            provenance: knowledgeEntries.provenance,
          })
          .from(knowledgeEntries)
          .where(eq(knowledgeEntries.id, document.entryId))
          .limit(1)
      : [],
    getDb()
      .select({
        id: knowledgeChunks.id,
        chunkIndex: knowledgeChunks.chunkIndex,
        heading: knowledgeChunks.heading,
        content: knowledgeChunks.content,
        charCount: knowledgeChunks.charCount,
        tokenEstimate: knowledgeChunks.tokenEstimate,
      })
      .from(knowledgeChunks)
      .where(
        and(
          eq(knowledgeChunks.workspaceId, workspaceId),
          eq(knowledgeChunks.documentId, document.id),
        ),
      )
      .orderBy(asc(knowledgeChunks.chunkIndex))
      .limit(100),
  ]);

  return { document, entry: entryRows[0] || null, chunks: chunkRows };
}

export async function retryDocument({ workspaceId, documentId, userId }) {
  const rows = await getDb()
    .select()
    .from(knowledgeDocuments)
    .where(
      and(
        eq(knowledgeDocuments.workspaceId, workspaceId),
        eq(knowledgeDocuments.id, documentId),
      ),
    )
    .limit(1);
  const document = rows[0];
  if (!document) throw documentNotFound();
  if (document.status === 'processed') {
    const detail = await getDocument(workspaceId, documentId);
    return { ...detail, skipped: true };
  }
  if (!document.rawText) {
    throw new ApiError(
      422,
      'NO_SOURCE_TEXT',
      'The original text was not retained for this document, so it cannot be reprocessed. Upload it again.',
    );
  }

  const clipped = document.rawText.slice(0, MAX_KNOWLEDGE_CONTENT_CHARS);
  const chunks = chunkText(clipped);
  if (chunks.length === 0) {
    throw new ApiError(
      422,
      'EMPTY_DOCUMENT',
      'No readable text was found in that file.',
    );
  }
  const hash = contentHash(clipped);

  try {
    await runAtomic(async (executor) => {
      let entryId = document.entryId;
      if (!entryId) {
        const existing = await executor
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
        entryId = existing[0]?.id || null;
      }

      if (!entryId) {
        const entryRows = await executor
          .insert(knowledgeEntries)
          .values({
            workspaceId,
            category: 'reference',
            title: titleFromContent(clipped, document.filename),
            content: clipped,
            tags: [],
            sourceType: 'document',
            sourceReference: document.filename,
            provenance: 'source_derived',
            status: 'draft',
            version: 1,
            contentHash: hash,
            createdByUserId: userId,
            updatedByUserId: userId,
          })
          .returning();
        entryId = entryRows[0].id;
        const entry = entryRows[0];
        await executor.insert(knowledgeVersions).values({
          workspaceId,
          entryId,
          version: 1,
          category: entry.category,
          title: entry.title,
          summary: null,
          content: entry.content,
          tags: [],
          provenance: entry.provenance,
          status: entry.status,
          changedByUserId: userId,
          changeNote: `Reprocessed from ${document.filename}`,
        });
      }

      await executor
        .delete(knowledgeChunks)
        .where(
          and(
            eq(knowledgeChunks.workspaceId, workspaceId),
            eq(knowledgeChunks.entryId, entryId),
            eq(knowledgeChunks.documentId, document.id),
          ),
        );

      await executor.insert(knowledgeChunks).values(
        chunks.map((chunk) => ({
          workspaceId,
          entryId,
          documentId: document.id,
          chunkIndex: chunk.index,
          heading: chunk.heading,
          content: chunk.content,
          charCount: chunk.charCount,
          tokenEstimate: chunk.tokenEstimate,
          contentHash: contentHash(chunk.content),
        })),
      );

      await executor
        .update(knowledgeDocuments)
        .set({
          status: 'processed',
          entryId,
          chunkCount: chunks.length,
          processedAt: new Date(),
          errorMessage: null,
        })
        .where(eq(knowledgeDocuments.id, document.id));
    });
  } catch (error) {
    const message =
      error instanceof ApiError
        ? error.message
        : 'The document could not be processed.';
    await getDb()
      .update(knowledgeDocuments)
      .set({ status: 'failed', errorMessage: message.slice(0, 500) })
      .where(eq(knowledgeDocuments.id, document.id));
    throw error instanceof ApiError
      ? error
      : new ApiError(422, 'PROCESSING_FAILED', 'The document could not be indexed.');
  }

  await recordAudit({
    workspaceId,
    actorUserId: userId,
    action: 'knowledge.document_retry',
    resourceType: 'knowledge_document',
    resourceId: document.id,
    metadata: { chunkCount: chunks.length },
  });

  const detail = await getDocument(workspaceId, documentId);
  return { ...detail, skipped: false };
}
