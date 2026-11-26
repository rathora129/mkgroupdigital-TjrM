import {
  ApiError,
  assertSameOrigin,
  errorResponse,
  jsonOk,
  readJsonBody,
  validateBody,
} from '@/lib/api';
import { requirePermission } from '@/lib/auth/authorization';
import { decideExecution } from '@/lib/integrations/execution';
import { executionDecisionSchema, isUuid } from '@/lib/integrations/validation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request, { params }) {
  try {
    assertSameOrigin(request);
    const viewer = await requirePermission('executions.approve');
    const { executionId } = await params;
    if (!isUuid(executionId)) {
      throw new ApiError(404, 'NOT_FOUND', 'That execution request could not be found.');
    }

    const body = await readJsonBody(request);
    const data = await validateBody(executionDecisionSchema, body);
    const result = await decideExecution({
      workspaceId: viewer.membership.workspaceId,
      userId: viewer.user.id,
      actorRole: viewer.membership.role,
      executionId,
      decision: data.decision,
      note: data.note,
    });
    return jsonOk(result);
  } catch (error) {
    return errorResponse(error);
  }
}
