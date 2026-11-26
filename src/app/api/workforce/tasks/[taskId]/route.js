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
import { getTask, updateTask } from '@/lib/projects/service';
import { isUuid, taskUpdateSchema } from '@/lib/projects/validation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const NOT_FOUND = 'That task could not be found.';

export async function GET(request, { params }) {
  try {
    const viewer = await requirePermission('tasks.view');
    const { taskId } = await params;
    if (!isUuid(taskId)) throw new ApiError(404, 'NOT_FOUND', NOT_FOUND);

    const detail = await getTask(viewer.membership.workspaceId, taskId);
    if (!detail) throw new ApiError(404, 'NOT_FOUND', NOT_FOUND);
    return jsonOk(detail);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request, { params }) {
  try {
    assertSameOrigin(request);
    const viewer = await requirePermission('tasks.update');
    const { taskId } = await params;
    if (!isUuid(taskId)) throw new ApiError(404, 'NOT_FOUND', NOT_FOUND);

    const limit = rateLimit(`task-update:${viewer.user.id}`, {
      limit: 90,
      windowMs: 60 * 1000,
    });
    if (!limit.ok) {
      throw new ApiError(
        429,
        'RATE_LIMITED',
        'Too many task updates in a short period. Try again shortly.',
      );
    }

    const body = await readJsonBody(request);
    const data = await validateBody(taskUpdateSchema, body);

    const result = await updateTask({
      workspaceId: viewer.membership.workspaceId,
      userId: viewer.user.id,
      taskId,
      data,
    });
    if (!result) throw new ApiError(404, 'NOT_FOUND', NOT_FOUND);
    return jsonOk(result);
  } catch (error) {
    return errorResponse(error);
  }
}
