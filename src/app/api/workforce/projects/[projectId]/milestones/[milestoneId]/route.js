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
import { updateMilestone } from '@/lib/projects/service';
import { isUuid, milestoneUpdateSchema } from '@/lib/projects/validation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function PATCH(request, { params }) {
  try {
    assertSameOrigin(request);
    const viewer = await requirePermission('projects.update');
    const { projectId, milestoneId } = await params;
    if (!isUuid(projectId) || !isUuid(milestoneId)) {
      throw new ApiError(404, 'NOT_FOUND', 'That milestone could not be found.');
    }

    const limit = rateLimit(`milestone-update:${viewer.user.id}`, {
      limit: 90,
      windowMs: 60 * 1000,
    });
    if (!limit.ok) {
      throw new ApiError(
        429,
        'RATE_LIMITED',
        'Too many milestone changes in a short period. Try again shortly.',
      );
    }

    const body = await readJsonBody(request);
    const data = await validateBody(milestoneUpdateSchema, body);

    const result = await updateMilestone({
      workspaceId: viewer.membership.workspaceId,
      userId: viewer.user.id,
      projectId,
      milestoneId,
      data,
    });
    if (!result) {
      throw new ApiError(404, 'NOT_FOUND', 'That milestone could not be found.');
    }
    return jsonOk(result);
  } catch (error) {
    return errorResponse(error);
  }
}
