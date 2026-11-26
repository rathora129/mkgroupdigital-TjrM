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
import { updateRequirementItem } from '@/lib/opportunities/service';
import {
  isUuid,
  requirementItemUpdateSchema,
} from '@/lib/opportunities/validation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function PATCH(request, { params }) {
  try {
    assertSameOrigin(request);
    const viewer = await requirePermission('requirements.edit');
    const { opportunityId, requirementId } = await params;
    if (!isUuid(opportunityId) || !isUuid(requirementId)) {
      throw new ApiError(404, 'NOT_FOUND', 'That requirement could not be found.');
    }

    const limit = rateLimit(`requirement-update:${viewer.user.id}`, {
      limit: 60,
      windowMs: 60 * 1000,
    });
    if (!limit.ok) {
      throw new ApiError(
        429,
        'RATE_LIMITED',
        'Too many requirement updates in a short period. Try again shortly.',
      );
    }

    const body = await readJsonBody(request);
    const data = await validateBody(requirementItemUpdateSchema, body);

    const result = await updateRequirementItem({
      workspaceId: viewer.membership.workspaceId,
      userId: viewer.user.id,
      opportunityId,
      requirementId,
      data,
    });
    if (!result) {
      throw new ApiError(404, 'NOT_FOUND', 'That requirement could not be found.');
    }

    return jsonOk(result);
  } catch (error) {
    return errorResponse(error);
  }
}
