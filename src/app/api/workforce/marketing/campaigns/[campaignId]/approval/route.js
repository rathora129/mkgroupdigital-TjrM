import {
  ApiError,
  assertSameOrigin,
  errorResponse,
  jsonOk,
  readJsonBody,
  validateBody,
} from '@/lib/api';
import { requirePermission } from '@/lib/auth/authorization';
import { setCampaignClientApproval } from '@/lib/marketing/service';
import { campaignApprovalSchema, isUuid } from '@/lib/marketing/validation';

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
    const data = await validateBody(campaignApprovalSchema, body);
    const result = await setCampaignClientApproval({
      workspaceId: viewer.membership.workspaceId,
      userId: viewer.user.id,
      campaignId,
      clientApprovalStatus: data.clientApprovalStatus,
      note: data.note,
    });
    return jsonOk(result);
  } catch (error) {
    return errorResponse(error);
  }
}
