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
import { getOpportunity, updateOpportunity } from '@/lib/opportunities/service';
import {
  isUuid,
  opportunityUpdateSchema,
} from '@/lib/opportunities/validation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request, { params }) {
  try {
    const viewer = await requirePermission('opportunities.view');
    const { opportunityId } = await params;
    if (!isUuid(opportunityId)) {
      throw new ApiError(
        404,
        'NOT_FOUND',
        'That opportunity could not be found.',
      );
    }

    const detail = await getOpportunity(
      viewer.membership.workspaceId,
      opportunityId,
    );
    if (!detail) {
      throw new ApiError(
        404,
        'NOT_FOUND',
        'That opportunity could not be found.',
      );
    }
    return jsonOk(detail);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request, { params }) {
  try {
    assertSameOrigin(request);
    const viewer = await requirePermission('opportunities.update');
    const { opportunityId } = await params;
    if (!isUuid(opportunityId)) {
      throw new ApiError(
        404,
        'NOT_FOUND',
        'That opportunity could not be found.',
      );
    }

    const limit = rateLimit(`opportunity-update:${viewer.user.id}`, {
      limit: 60,
      windowMs: 60 * 1000,
    });
    if (!limit.ok) {
      throw new ApiError(
        429,
        'RATE_LIMITED',
        'Too many updates in a short period. Try again shortly.',
      );
    }

    const body = await readJsonBody(request);
    const data = await validateBody(opportunityUpdateSchema, body);

    const result = await updateOpportunity({
      workspaceId: viewer.membership.workspaceId,
      userId: viewer.user.id,
      opportunityId,
      data,
    });
    if (!result) {
      throw new ApiError(
        404,
        'NOT_FOUND',
        'That opportunity could not be found.',
      );
    }

    return jsonOk(result);
  } catch (error) {
    return errorResponse(error);
  }
}
