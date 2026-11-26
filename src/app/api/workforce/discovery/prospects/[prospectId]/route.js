import { ApiError, errorResponse, jsonOk } from '@/lib/api';
import { requirePermission } from '@/lib/auth/authorization';
import { getProspect } from '@/lib/discovery/service';
import { isUuid } from '@/lib/leads/validation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request, { params }) {
  try {
    const viewer = await requirePermission('discovery.view');
    const { prospectId } = await params;
    if (!isUuid(prospectId)) {
      throw new ApiError(404, 'PROSPECT_NOT_FOUND', 'That prospect could not be found.');
    }

    const detail = await getProspect(viewer.membership.workspaceId, prospectId);
    if (!detail) {
      throw new ApiError(404, 'PROSPECT_NOT_FOUND', 'That prospect could not be found.');
    }
    return jsonOk(detail);
  } catch (error) {
    return errorResponse(error);
  }
}
