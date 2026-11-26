import { ApiError, assertSameOrigin, errorResponse, jsonOk } from '@/lib/api';
import { requirePermission } from '@/lib/auth/authorization';
import { submitExecution } from '@/lib/integrations/execution';
import { isUuid } from '@/lib/integrations/validation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request, { params }) {
  try {
    assertSameOrigin(request);
    const viewer = await requirePermission('executions.request');
    const { executionId } = await params;
    if (!isUuid(executionId)) {
      throw new ApiError(404, 'NOT_FOUND', 'That execution request could not be found.');
    }
    const result = await submitExecution({
      workspaceId: viewer.membership.workspaceId,
      userId: viewer.user.id,
      executionId,
    });
    return jsonOk(result);
  } catch (error) {
    return errorResponse(error);
  }
}
