import {
  ApiError,
  assertSameOrigin,
  errorResponse,
  jsonOk,
  readJsonBody,
  validateBody,
} from '@/lib/api';
import { requirePermission } from '@/lib/auth/authorization';
import { changeCampaignStatus } from '@/lib/marketing/service';
import { campaignStatusSchema, isUuid } from '@/lib/marketing/validation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request, { params }) {
  try {
    assertSameOrigin(request);
    const viewer = await requirePermission('marketing.manage');
    const { campaignId } = await params;
    if (!isUuid(campaignId)) {
      throw new ApiError(404, 'NOT_FOUND', 'That campaign could not be found.');
    }

    const body = await readJsonBody(request);
    const data = await validateBody(campaignStatusSchema, body);
    const result = await changeCampaignStatus({
      workspaceId: viewer.membership.workspaceId,
      userId: viewer.user.id,
      campaignId,
      status: data.status,
      note: data.note,
    });
    return jsonOk(result);
  } catch (error) {
    return errorResponse(error);
  }
}
