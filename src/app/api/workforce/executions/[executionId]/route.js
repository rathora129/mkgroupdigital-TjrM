import { ApiError, errorResponse, jsonOk } from '@/lib/api';
import { requirePermission } from '@/lib/auth/authorization';
import { getExecution } from '@/lib/integrations/execution';
import { isUuid } from '@/lib/integrations/validation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request, { params }) {
  try {
    const viewer = await requirePermission('executions.view');
    const { executionId } = await params;
    if (!isUuid(executionId)) {
      throw new ApiError(404, 'NOT_FOUND', 'That execution request could not be found.');
    }
    const result = await getExecution(viewer.membership.workspaceId, executionId);
    return jsonOk(result);
  } catch (error) {
    return errorResponse(error);
  }
}
