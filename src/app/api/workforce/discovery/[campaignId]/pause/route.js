import { ApiError, assertSameOrigin, errorResponse, jsonOk } from '@/lib/api';
import { requirePermission } from '@/lib/auth/authorization';
import { pauseCampaign } from '@/lib/discovery/service';
import { rateLimit } from '@/lib/rate-limit';
import { isUuid } from '@/lib/leads/validation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request, { params }) {
  try {
    assertSameOrigin(request);
    const viewer = await requirePermission('discovery.manage');
    const { campaignId } = await params;
    if (!isUuid(campaignId)) {
      throw new ApiError(404, 'CAMPAIGN_NOT_FOUND', 'That campaign could not be found.');
    }
    if (!rateLimit(`discovery-lifecycle:${viewer.user.id}`, { limit: 30, windowMs: 60_000 }).ok) {
      throw new ApiError(429, 'RATE_LIMITED', 'Too many campaign changes. Try again shortly.');
    }

    const result = await pauseCampaign({
      workspaceId: viewer.membership.workspaceId,
      userId: viewer.user.id,
      campaignId,
    });
    if (!result) {
      throw new ApiError(404, 'CAMPAIGN_NOT_FOUND', 'That campaign could not be found.');
    }
    return jsonOk(result);
  } catch (error) {
    return errorResponse(error);
  }
}
