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
import { getCampaign, updateCampaign } from '@/lib/marketing/service';
import { campaignUpdateSchema, isUuid } from '@/lib/marketing/validation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const NOT_FOUND = 'That campaign could not be found.';

export async function GET(request, { params }) {
  try {
    const viewer = await requirePermission('marketing.view');
    const { campaignId } = await params;
    if (!isUuid(campaignId)) throw new ApiError(404, 'NOT_FOUND', NOT_FOUND);
    const result = await getCampaign(viewer.membership.workspaceId, campaignId);
    return jsonOk(result);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request, { params }) {
  try {
    assertSameOrigin(request);
    const viewer = await requirePermission('marketing.manage');
    const { campaignId } = await params;
    if (!isUuid(campaignId)) throw new ApiError(404, 'NOT_FOUND', NOT_FOUND);

    const limit = rateLimit(`marketing-campaign-update:${viewer.user.id}`, {
      limit: 60,
      windowMs: 60 * 1000,
    });
    if (!limit.ok) {
      throw new ApiError(
        429,
        'RATE_LIMITED',
        'Too many campaign updates in a short period. Try again shortly.',
      );
    }

    const body = await readJsonBody(request);
    const data = await validateBody(campaignUpdateSchema, body);
    const result = await updateCampaign({
      workspaceId: viewer.membership.workspaceId,
      userId: viewer.user.id,
      campaignId,
      data,
    });
    return jsonOk(result);
  } catch (error) {
    return errorResponse(error);
  }
}
