import {
  ApiError,
  assertSameOrigin,
  errorResponse,
  jsonOk,
} from '@/lib/api';
import { requirePermission } from '@/lib/auth/authorization';
import { getDocument, retryDocument } from '@/lib/knowledge/documents';
import { isUuid } from '@/lib/knowledge/validation';
import { rateLimit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const NOT_FOUND = 'That knowledge document could not be found.';

export async function GET(request, { params }) {
  try {
    const viewer = await requirePermission('knowledge.view');
    const { documentId } = await params;
    if (!isUuid(documentId)) throw new ApiError(404, 'NOT_FOUND', NOT_FOUND);

    const detail = await getDocument(viewer.membership.workspaceId, documentId);
    if (!detail) throw new ApiError(404, 'NOT_FOUND', NOT_FOUND);
    return jsonOk(detail);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request, { params }) {
  try {
    assertSameOrigin(request);
    const viewer = await requirePermission('knowledge.manage_documents');
    const { documentId } = await params;
    if (!isUuid(documentId)) throw new ApiError(404, 'NOT_FOUND', NOT_FOUND);

    const limit = rateLimit(`knowledge-retry:${viewer.user.id}`, {
      limit: 20,
      windowMs: 60 * 1000,
    });
    if (!limit.ok) {
      throw new ApiError(
        429,
        'RATE_LIMITED',
        'Too many processing attempts in a short period. Try again shortly.',
      );
    }

    const result = await retryDocument({
      workspaceId: viewer.membership.workspaceId,
      userId: viewer.user.id,
      documentId,
    });
    return jsonOk(result);
  } catch (error) {
    return errorResponse(error);
  }
}
