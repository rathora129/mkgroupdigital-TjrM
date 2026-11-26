import {
  ApiError,
  assertSameOrigin,
  errorResponse,
  jsonOk,
  readJsonBody,
  validateBody,
} from '@/lib/api';
import { requirePermission } from '@/lib/auth/authorization';
import { getMemory, updateMemory } from '@/lib/knowledge/memory';
import { isUuid, memoryUpdateSchema } from '@/lib/knowledge/validation';
import { rateLimit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const NOT_FOUND = 'That memory could not be found.';

export async function GET(request, { params }) {
  try {
    const viewer = await requirePermission('memories.view');
    const { memoryId } = await params;
    if (!isUuid(memoryId)) throw new ApiError(404, 'NOT_FOUND', NOT_FOUND);

    const detail = await getMemory(viewer.membership.workspaceId, memoryId);
    if (!detail) throw new ApiError(404, 'NOT_FOUND', NOT_FOUND);
    return jsonOk(detail);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request, { params }) {
  try {
    assertSameOrigin(request);
    const viewer = await requirePermission('memories.update');
    const { memoryId } = await params;
    if (!isUuid(memoryId)) throw new ApiError(404, 'NOT_FOUND', NOT_FOUND);

    const limit = rateLimit(`memory-update:${viewer.user.id}`, {
      limit: 60,
      windowMs: 60 * 1000,
    });
    if (!limit.ok) {
      throw new ApiError(
        429,
        'RATE_LIMITED',
        'Too many memory edits in a short period. Try again shortly.',
      );
    }

    const body = await readJsonBody(request);
    const data = await validateBody(memoryUpdateSchema, body);
    const result = await updateMemory({
      workspaceId: viewer.membership.workspaceId,
      userId: viewer.user.id,
      memoryId,
      data,
    });
    return jsonOk(result);
  } catch (error) {
    return errorResponse(error);
  }
}
