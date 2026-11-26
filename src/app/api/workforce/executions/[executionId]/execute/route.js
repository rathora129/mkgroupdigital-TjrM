import { ApiError, assertSameOrigin, errorResponse, jsonOk } from '@/lib/api';
import { requirePermission } from '@/lib/auth/authorization';
import { rateLimit } from '@/lib/rate-limit';
import { executeExecution } from '@/lib/integrations/execution';
import { isUuid } from '@/lib/integrations/validation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request, { params }) {
  try {
    assertSameOrigin(request);
    const viewer = await requirePermission('executions.execute');
    const { executionId } = await params;
    if (!isUuid(executionId)) {
      throw new ApiError(404, 'NOT_FOUND', 'That execution request could not be found.');
    }

    const limit = rateLimit(`execution-run:${viewer.user.id}`, {
      limit: 20,
      windowMs: 60 * 1000,
    });
    if (!limit.ok) {
      throw new ApiError(
        429,
        'RATE_LIMITED',
        'Too many execution starts in a short period. Try again shortly.',
      );
    }

    const result = await executeExecution({
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
