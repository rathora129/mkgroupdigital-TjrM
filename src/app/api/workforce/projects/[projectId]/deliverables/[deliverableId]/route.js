import {
  ApiError,
  assertSameOrigin,
  errorResponse,
  jsonOk,
  readJsonBody,
  validateBody,
} from '@/lib/api';
import { requirePermission } from '@/lib/auth/authorization';
import { rateLimit } from '@/lib/rate-limit';
import { updateDeliverable } from '@/lib/projects/service';
import { deliverableUpdateSchema, isUuid } from '@/lib/projects/validation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function PATCH(request, { params }) {
  try {
    assertSameOrigin(request);
    const viewer = await requirePermission('projects.update');
    const { projectId, deliverableId } = await params;
    if (!isUuid(projectId) || !isUuid(deliverableId)) {
      throw new ApiError(404, 'NOT_FOUND', 'That deliverable could not be found.');
    }

    const limit = rateLimit(`deliverable-update:${viewer.user.id}`, {
      limit: 90,
      windowMs: 60 * 1000,
    });
    if (!limit.ok) {
      throw new ApiError(
        429,
        'RATE_LIMITED',
        'Too many deliverable changes in a short period. Try again shortly.',
      );
    }

    const body = await readJsonBody(request);
    const data = await validateBody(deliverableUpdateSchema, body);

    const result = await updateDeliverable({
      workspaceId: viewer.membership.workspaceId,
      userId: viewer.user.id,
      projectId,
      deliverableId,
      data,
    });
    if (!result) {
      throw new ApiError(404, 'NOT_FOUND', 'That deliverable could not be found.');
    }
    return jsonOk(result);
  } catch (error) {
    return errorResponse(error);
  }
}
