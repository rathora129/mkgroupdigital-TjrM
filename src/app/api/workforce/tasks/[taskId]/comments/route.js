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
import { addTaskComment } from '@/lib/projects/service';
import { isUuid, taskCommentSchema } from '@/lib/projects/validation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request, { params }) {
  try {
    assertSameOrigin(request);
    const viewer = await requirePermission('tasks.update');
    const { taskId } = await params;
    if (!isUuid(taskId)) {
      throw new ApiError(404, 'NOT_FOUND', 'That task could not be found.');
    }

    const limit = rateLimit(`task-comment:${viewer.user.id}`, {
      limit: 60,
      windowMs: 60 * 1000,
    });
    if (!limit.ok) {
      throw new ApiError(
        429,
        'RATE_LIMITED',
        'Too many comments in a short period. Try again shortly.',
      );
    }

    const body = await readJsonBody(request);
    const data = await validateBody(taskCommentSchema, body);

    const result = await addTaskComment({
      workspaceId: viewer.membership.workspaceId,
      userId: viewer.user.id,
      taskId,
      body: data.body,
    });
    if (!result) {
      throw new ApiError(404, 'NOT_FOUND', 'That task could not be found.');
    }
    return jsonOk(result, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
