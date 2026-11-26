import {
  ApiError,
  assertSameOrigin,
  errorResponse,
  jsonOk,
  readJsonBody,
  validateBody,
} from '@/lib/api';
import { requirePermission } from '@/lib/auth/authorization';
import { getKnowledgeEntry, updateKnowledgeEntry } from '@/lib/knowledge/service';
import {
  isUuid,
  knowledgeEntryUpdateSchema,
} from '@/lib/knowledge/validation';
import { rateLimit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const NOT_FOUND = 'That knowledge entry could not be found.';

export async function GET(request, { params }) {
  try {
    const viewer = await requirePermission('knowledge.view');
    const { entryId } = await params;
    if (!isUuid(entryId)) throw new ApiError(404, 'NOT_FOUND', NOT_FOUND);

    const detail = await getKnowledgeEntry(
      viewer.membership.workspaceId,
      entryId,
    );
    if (!detail) throw new ApiError(404, 'NOT_FOUND', NOT_FOUND);
    return jsonOk(detail);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request, { params }) {
  try {
    assertSameOrigin(request);
    const viewer = await requirePermission('knowledge.update');
    const { entryId } = await params;
    if (!isUuid(entryId)) throw new ApiError(404, 'NOT_FOUND', NOT_FOUND);

    const limit = rateLimit(`knowledge-update:${viewer.user.id}`, {
      limit: 60,
      windowMs: 60 * 1000,
    });
    if (!limit.ok) {
      throw new ApiError(
        429,
        'RATE_LIMITED',
        'Too many knowledge edits in a short period. Try again shortly.',
      );
    }

    const body = await readJsonBody(request);
    const data = await validateBody(knowledgeEntryUpdateSchema, body);
    const result = await updateKnowledgeEntry({
      workspaceId: viewer.membership.workspaceId,
      userId: viewer.user.id,
      entryId,
      data,
    });
    return jsonOk(result);
  } catch (error) {
    return errorResponse(error);
  }
}
