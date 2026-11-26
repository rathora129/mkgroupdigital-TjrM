import { ApiError, assertSameOrigin, errorResponse, jsonOk } from '@/lib/api';
import { requirePermission } from '@/lib/auth/authorization';
import { cancelExecution } from '@/lib/integrations/execution';
import { isUuid } from '@/lib/integrations/validation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request, { params }) {
  try {
    assertSameOrigin(request);
    const viewer = await requirePermission('executions.view');
    const { executionId } = await params;
    if (!isUuid(executionId)) {
      throw new ApiError(404, 'NOT_FOUND', 'That execution request could not be found.');
    }
    const result = await cancelExecution({
      workspaceId: viewer.membership.workspaceId,
      userId: viewer.user.id,
      actorRole: viewer.membership.role,
      executionId,
    });
    return jsonOk(result);
  } catch (error) {
    return errorResponse(error);
  }
}
