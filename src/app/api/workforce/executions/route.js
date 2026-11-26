import {
  ApiError,
  assertSameOrigin,
  errorResponse,
  jsonOk,
  readJsonBody,
  validateBody,
} from '@/lib/api';
import { requirePermission } from '@/lib/auth/authorization';
import { rateLimit } from '@/lib/rate-limit';
import {
  createExecutionRequest,
  listExecutions,
} from '@/lib/integrations/execution';
import {
  executionCreateSchema,
  executionListQuerySchema,
} from '@/lib/integrations/validation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request) {
  try {
    const viewer = await requirePermission('executions.view');
    const search = Object.fromEntries(new URL(request.url).searchParams);
    const query = await validateBody(executionListQuerySchema, search);
    const result = await listExecutions(viewer.membership.workspaceId, {
      status: query.status || undefined,
      clientId: query.clientId || undefined,
      page: query.page,
      pageSize: query.pageSize,
    });
    return jsonOk(result);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request) {
  try {
    assertSameOrigin(request);
    const viewer = await requirePermission('executions.request');

    const limit = rateLimit(`execution-create:${viewer.user.id}`, {
      limit: 30,
      windowMs: 60 * 1000,
    });
    if (!limit.ok) {
      throw new ApiError(
        429,
        'RATE_LIMITED',
        'Too many execution requests in a short period. Try again shortly.',
      );
    }

    const body = await readJsonBody(request);
    const data = await validateBody(executionCreateSchema, body);
    const result = await createExecutionRequest({
      workspaceId: viewer.membership.workspaceId,
      userId: viewer.user.id,
      input: data,
    });
    return jsonOk(result, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
