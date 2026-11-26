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
  listWorkflowDefinitions,
  listWorkflowRuns,
  startWorkflowRun,
} from '@/lib/automation/service';
import {
  workflowListQuerySchema,
  workflowStartSchema,
} from '@/lib/integrations/validation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request) {
  try {
    const viewer = await requirePermission('automations.view');
    const search = Object.fromEntries(new URL(request.url).searchParams);
    const query = await validateBody(workflowListQuerySchema, search);
    const result = await listWorkflowRuns(viewer.membership.workspaceId, {
      status: query.status || undefined,
      page: query.page,
      pageSize: query.pageSize,
    });
    return jsonOk({ ...result, definitions: listWorkflowDefinitions() });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request) {
  try {
    assertSameOrigin(request);
    const viewer = await requirePermission('automations.manage');

    const limit = rateLimit(`automation-start:${viewer.user.id}`, {
      limit: 20,
      windowMs: 60 * 1000,
    });
    if (!limit.ok) {
      throw new ApiError(
        429,
        'RATE_LIMITED',
        'Too many automation starts in a short period. Try again shortly.',
      );
    }

    const body = await readJsonBody(request);
    const data = await validateBody(workflowStartSchema, body);
    const result = await startWorkflowRun({
      workspaceId: viewer.membership.workspaceId,
      userId: viewer.user.id,
      workflowKey: data.workflowKey,
      clientId: data.clientId,
      projectId: data.projectId,
      input: data.input,
      idempotencyKey: data.idempotencyKey,
    });
    return jsonOk(result, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
