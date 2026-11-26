import { ApiError, assertSameOrigin, errorResponse, jsonOk } from '@/lib/api';
import { requirePermission } from '@/lib/auth/authorization';
import { cancelWorkflowRun } from '@/lib/automation/service';
import { isUuid } from '@/lib/integrations/validation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request, { params }) {
  try {
    assertSameOrigin(request);
    const viewer = await requirePermission('automations.manage');
    const { runId } = await params;
    if (!isUuid(runId)) {
      throw new ApiError(404, 'NOT_FOUND', 'That automation run could not be found.');
    }
    const result = await cancelWorkflowRun({
      workspaceId: viewer.membership.workspaceId,
      userId: viewer.user.id,
      runId,
    });
    return jsonOk(result);
  } catch (error) {
    return errorResponse(error);
  }
}
