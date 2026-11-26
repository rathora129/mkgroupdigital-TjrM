import { ApiError, errorResponse, jsonOk } from '@/lib/api';
import { requirePermission } from '@/lib/auth/authorization';
import { getRunDetail } from '@/lib/ai/runtime';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request, { params }) {
  try {
    const viewer = await requirePermission('agents.view');
    const { runId } = await params;

    const detail = await getRunDetail(viewer.membership.workspaceId, runId);
    if (!detail) {
      throw new ApiError(404, 'NOT_FOUND', 'That run could not be found.');
    }

    return jsonOk(detail);
  } catch (error) {
    return errorResponse(error);
  }
}
