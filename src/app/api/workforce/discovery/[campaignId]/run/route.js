import { ApiError, assertSameOrigin, errorResponse, jsonOk } from '@/lib/api';
import { requirePermission } from '@/lib/auth/authorization';
import { runCampaignNow } from '@/lib/discovery/service';
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
    if (!rateLimit(`discovery-run:${viewer.user.id}`, { limit: 6, windowMs: 60_000 }).ok) {
      throw new ApiError(
        429,
        'RATE_LIMITED',
        'Too many discovery runs requested. Wait a minute and try again.',
      );
    }

    const result = await runCampaignNow({
      workspaceId: viewer.membership.workspaceId,
      userId: viewer.user.id,
      campaignId,
    });
    if (!result) {
      throw new ApiError(404, 'CAMPAIGN_NOT_FOUND', 'That campaign could not be found.');
    }
    return jsonOk(result, 202);
  } catch (error) {
    return errorResponse(error);
  }
}
