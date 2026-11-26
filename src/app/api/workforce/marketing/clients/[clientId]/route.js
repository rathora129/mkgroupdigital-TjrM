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
import { getMarketingProfile, upsertMarketingProfile } from '@/lib/marketing/service';
import { isUuid, marketingProfileSchema } from '@/lib/marketing/validation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const NOT_FOUND = 'That client could not be found.';

export async function GET(request, { params }) {
  try {
    const viewer = await requirePermission('marketing.view');
    const { clientId } = await params;
    if (!isUuid(clientId)) throw new ApiError(404, 'NOT_FOUND', NOT_FOUND);

    let detail;
    try {
      detail = await getMarketingProfile(viewer.membership.workspaceId, clientId);
    } catch (error) {
      if (error?.code === 'CLIENT_NOT_FOUND') {
        throw new ApiError(404, 'NOT_FOUND', NOT_FOUND);
      }
      throw error;
    }
    return jsonOk(detail);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(request, { params }) {
  try {
    assertSameOrigin(request);
    const viewer = await requirePermission('marketing.manage');
    const { clientId } = await params;
    if (!isUuid(clientId)) throw new ApiError(404, 'NOT_FOUND', NOT_FOUND);

    const limit = rateLimit(`marketing-profile:${viewer.user.id}`, {
      limit: 30,
      windowMs: 60 * 1000,
    });
    if (!limit.ok) {
      throw new ApiError(
        429,
        'RATE_LIMITED',
        'Too many profile updates in a short period. Try again shortly.',
      );
    }

    const body = await readJsonBody(request);
    const data = await validateBody(marketingProfileSchema, {
      ...body,
      clientId,
    });
    const result = await upsertMarketingProfile({
      workspaceId: viewer.membership.workspaceId,
      userId: viewer.user.id,
      data,
    });
    return jsonOk(result);
  } catch (error) {
    return errorResponse(error);
  }
}
