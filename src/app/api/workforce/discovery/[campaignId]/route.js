import {
  ApiError,
  assertSameOrigin,
  errorResponse,
  jsonOk,
  readJsonBody,
  validateBody,
} from '@/lib/api';
import { requirePermission } from '@/lib/auth/authorization';
import { getCampaign, updateCampaign } from '@/lib/discovery/service';
import { discoveryCampaignUpdateSchema } from '@/lib/discovery/validation';
import { isUuid } from '@/lib/leads/validation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request, { params }) {
  try {
    const viewer = await requirePermission('discovery.view');
    const { campaignId } = await params;
    if (!isUuid(campaignId)) {
      throw new ApiError(404, 'CAMPAIGN_NOT_FOUND', 'That campaign could not be found.');
    }

    const detail = await getCampaign(viewer.membership.workspaceId, campaignId);
    if (!detail) {
      throw new ApiError(404, 'CAMPAIGN_NOT_FOUND', 'That campaign could not be found.');
    }
    return jsonOk(detail);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request, { params }) {
  try {
    assertSameOrigin(request);
    const viewer = await requirePermission('discovery.manage');
    const { campaignId } = await params;
    if (!isUuid(campaignId)) {
      throw new ApiError(404, 'CAMPAIGN_NOT_FOUND', 'That campaign could not be found.');
    }

    const body = await readJsonBody(request, { maxBytes: 64 * 1024 });
    const data = await validateBody(discoveryCampaignUpdateSchema, body);

    const campaign = await updateCampaign({
      workspaceId: viewer.membership.workspaceId,
      userId: viewer.user.id,
      campaignId,
      data,
    });
    if (!campaign) {
      throw new ApiError(404, 'CAMPAIGN_NOT_FOUND', 'That campaign could not be found.');
    }
    return jsonOk({ campaign });
  } catch (error) {
    return errorResponse(error);
  }
}
