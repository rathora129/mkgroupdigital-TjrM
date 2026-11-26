import { ApiError, errorResponse, jsonOk } from '@/lib/api';
import { requirePermission } from '@/lib/auth/authorization';
import { getResearchJob } from '@/lib/research/service';
import { isUuid } from '@/lib/leads/validation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request, { params }) {
  try {
    const viewer = await requirePermission('research.view');
    const { researchId } = await params;
    if (!isUuid(researchId)) {
      throw new ApiError(404, 'NOT_FOUND', 'That research job could not be found.');
    }

    const detail = await getResearchJob(
      viewer.membership.workspaceId,
      researchId,
    );
    if (!detail) {
      throw new ApiError(404, 'NOT_FOUND', 'That research job could not be found.');
    }

    return jsonOk(detail);
  } catch (error) {
    return errorResponse(error);
  }
}
