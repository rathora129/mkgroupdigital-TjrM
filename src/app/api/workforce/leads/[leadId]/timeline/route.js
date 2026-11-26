import { ApiError, errorResponse, jsonOk } from '@/lib/api';
import { requirePermission } from '@/lib/auth/authorization';
import { getLeadUnifiedTimeline } from '@/lib/leads/conversion';
import { leadAccessFor } from '@/lib/leads/service';
import { isUuid } from '@/lib/leads/validation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(_request, { params }) {
  try {
    const viewer = await requirePermission('leads.view');
    const { leadId } = await params;
    if (!isUuid(leadId)) {
      throw new ApiError(404, 'NOT_FOUND', 'That lead could not be found.');
    }

    const timeline = await getLeadUnifiedTimeline({
      workspaceId: viewer.membership.workspaceId,
      leadId,
      access: leadAccessFor(viewer),
    });
    if (!timeline) {
      throw new ApiError(404, 'NOT_FOUND', 'That lead could not be found.');
    }
    return jsonOk(timeline);
  } catch (error) {
    return errorResponse(error);
  }
}
