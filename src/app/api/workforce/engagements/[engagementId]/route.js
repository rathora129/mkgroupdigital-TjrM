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
import {
  getEngagement,
  updateEngagement,
} from '@/lib/clients/engagements';
import {
  engagementUpdateSchema,
  isUuid,
} from '@/lib/clients/validation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const NOT_FOUND = 'That engagement could not be found.';

export async function GET(request, { params }) {
  try {
    const viewer = await requirePermission('clients.view');
    const { engagementId } = await params;
    if (!isUuid(engagementId)) throw new ApiError(404, 'NOT_FOUND', NOT_FOUND);

    const detail = await getEngagement(
      viewer.membership.workspaceId,
      engagementId,
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
    const viewer = await requirePermission('clients.update');
    const { engagementId } = await params;
    if (!isUuid(engagementId)) throw new ApiError(404, 'NOT_FOUND', NOT_FOUND);

    const limit = rateLimit(`engagement-update:${viewer.user.id}`, {
      limit: 60,
      windowMs: 60 * 1000,
    });
    if (!limit.ok) {
      throw new ApiError(
        429,
        'RATE_LIMITED',
        'Too many engagement updates in a short period. Try again shortly.',
      );
    }

    const body = await readJsonBody(request);
    const data = await validateBody(engagementUpdateSchema, body);
    const result = await updateEngagement({
      workspaceId: viewer.membership.workspaceId,
      userId: viewer.user.id,
      engagementId,
      data,
    });
    if (!result) throw new ApiError(404, 'NOT_FOUND', NOT_FOUND);
    return jsonOk(result);
  } catch (error) {
    return errorResponse(error);
  }
}
