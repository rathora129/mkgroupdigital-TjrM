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
import { createTask, listTasks } from '@/lib/projects/service';
import { isUuid, taskCreateSchema, taskQuerySchema } from '@/lib/projects/validation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request, { params }) {
  try {
    const viewer = await requirePermission('tasks.view');
    const { projectId } = await params;
    if (!isUuid(projectId)) {
      throw new ApiError(404, 'NOT_FOUND', 'That project could not be found.');
    }

    const search = Object.fromEntries(new URL(request.url).searchParams);
    const query = await validateBody(taskQuerySchema, { ...search, projectId });

    const result = await listTasks(
      viewer.membership.workspaceId,
      viewer.user.id,
      query,
    );
    return jsonOk(result);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request, { params }) {
  try {
    assertSameOrigin(request);
    const viewer = await requirePermission('tasks.create');
    const { projectId } = await params;
    if (!isUuid(projectId)) {
      throw new ApiError(404, 'NOT_FOUND', 'That project could not be found.');
    }

    const limit = rateLimit(`task-create:${viewer.user.id}`, {
      limit: 60,
      windowMs: 60 * 1000,
    });
    if (!limit.ok) {
      throw new ApiError(
        429,
        'RATE_LIMITED',
        'Too many tasks created in a short period. Try again shortly.',
      );
    }

    const body = await readJsonBody(request);
    const data = await validateBody(taskCreateSchema, body);

    const result = await createTask({
      workspaceId: viewer.membership.workspaceId,
      userId: viewer.user.id,
      projectId,
      data,
    });
    return jsonOk(result, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
