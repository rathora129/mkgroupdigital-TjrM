import {
  ApiError,
  assertSameOrigin,
  errorResponse,
  jsonOk,
  validateBody,
} from '@/lib/api';
import { requirePermission } from '@/lib/auth/authorization';
import { DOCUMENT_REQUEST_LIMIT_BYTES } from '@/lib/knowledge/constants';
import { ingestDocument, listDocuments } from '@/lib/knowledge/documents';
import {
  documentQuerySchema,
  documentUploadSchema,
} from '@/lib/knowledge/validation';
import { rateLimit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function parseTags(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  const text = String(value).trim();
  if (!text) return [];
  if (text.startsWith('[')) {
    try {
      const parsed = JSON.parse(text);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      throw new ApiError(
        422,
        'VALIDATION_FAILED',
        'Please check the highlighted fields and try again.',
        { tags: 'Tags must be a list.' },
      );
    }
  }
  return text
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);
}

export async function GET(request) {
  try {
    const viewer = await requirePermission('knowledge.view');
    const search = Object.fromEntries(new URL(request.url).searchParams);
    const query = await validateBody(documentQuerySchema, search);
    const result = await listDocuments(viewer.membership.workspaceId, query);
    return jsonOk(result);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request) {
  try {
    assertSameOrigin(request);
    const viewer = await requirePermission('knowledge.manage_documents');

    const limit = rateLimit(`knowledge-upload:${viewer.user.id}`, {
      limit: 10,
      windowMs: 60 * 1000,
    });
    if (!limit.ok) {
      throw new ApiError(
        429,
        'RATE_LIMITED',
        'Too many uploads in a short period. Try again shortly.',
      );
    }

    const declaredLength = Number(request.headers.get('content-length') || 0);
    if (declaredLength > DOCUMENT_REQUEST_LIMIT_BYTES) {
      throw new ApiError(
        413,
        'DOCUMENT_TOO_LARGE',
        'Documents must be 1 MB or smaller.',
        { file: 'Choose a file smaller than 1 MB.' },
      );
    }

    let form;
    try {
      form = await request.formData();
    } catch {
      throw new ApiError(
        400,
        'INVALID_UPLOAD',
        'The upload could not be read. Choose a file and try again.',
      );
    }

    const file = form.get('file');
    if (!file || typeof file === 'string' || typeof file.arrayBuffer !== 'function') {
      throw new ApiError(422, 'FILE_REQUIRED', 'Choose a file to upload.', {
        file: 'Choose a file to upload.',
      });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    if (buffer.length > DOCUMENT_REQUEST_LIMIT_BYTES) {
      throw new ApiError(
        413,
        'DOCUMENT_TOO_LARGE',
        'Documents must be 1 MB or smaller.',
        { file: 'Choose a file smaller than 1 MB.' },
      );
    }

    const data = await validateBody(documentUploadSchema, {
      title: form.get('title') || undefined,
      category: form.get('category') || undefined,
      provenance: form.get('provenance') || undefined,
      status: form.get('status') || undefined,
      tags: parseTags(form.get('tags')),
      clientId: form.get('clientId') || undefined,
      projectId: form.get('projectId') || undefined,
      changeNote: form.get('changeNote') || undefined,
    });

    const result = await ingestDocument({
      workspaceId: viewer.membership.workspaceId,
      userId: viewer.user.id,
      file: {
        filename: file.name,
        mimeType: file.type || null,
        buffer,
      },
      data,
    });
    return jsonOk(result, result.duplicate ? 200 : 201);
  } catch (error) {
    return errorResponse(error);
  }
}
