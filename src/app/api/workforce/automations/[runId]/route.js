import { ApiError, errorResponse, jsonOk } from '@/lib/api';
import { requirePermission } from '@/lib/auth/authorization';
import { getWorkflowRun } from '@/lib/automation/service';
import { isUuid } from '@/lib/integrations/validation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request, { params }) {
  try {
    const viewer = await requirePermission('automations.view');
    const { runId } = await params;
    if (!isUuid(runId)) {
      throw new ApiError(404, 'NOT_FOUND', 'That automation run could not be found.');
    }
    const result = await getWorkflowRun(viewer.membership.workspaceId, runId);
    return jsonOk(result);
  } catch (error) {
    return errorResponse(error);
  }
}
