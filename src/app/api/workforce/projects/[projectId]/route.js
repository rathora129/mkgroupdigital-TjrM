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
import { getProject, updateProject } from '@/lib/projects/service';
import { isUuid, projectUpdateSchema } from '@/lib/projects/validation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const NOT_FOUND = 'That project could not be found.';

export async function GET(request, { params }) {
  try {
    const viewer = await requirePermission('projects.view');
    const { projectId } = await params;
    if (!isUuid(projectId)) throw new ApiError(404, 'NOT_FOUND', NOT_FOUND);

    const detail = await getProject(viewer.membership.workspaceId, projectId);
    if (!detail) throw new ApiError(404, 'NOT_FOUND', NOT_FOUND);
    return jsonOk(detail);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request, { params }) {
  try {
    assertSameOrigin(request);
    const viewer = await requirePermission('projects.update');
    const { projectId } = await params;
    if (!isUuid(projectId)) throw new ApiError(404, 'NOT_FOUND', NOT_FOUND);

    const limit = rateLimit(`project-update:${viewer.user.id}`, {
      limit: 60,
      windowMs: 60 * 1000,
    });
    if (!limit.ok) {
      throw new ApiError(
        429,
        'RATE_LIMITED',
        'Too many project updates in a short period. Try again shortly.',
      );
    }

    const body = await readJsonBody(request);
    const data = await validateBody(projectUpdateSchema, body);

    const result = await updateProject({
      workspaceId: viewer.membership.workspaceId,
      userId: viewer.user.id,
      projectId,
      data,
    });
    if (!result) throw new ApiError(404, 'NOT_FOUND', NOT_FOUND);
    return jsonOk(result);
  } catch (error) {
    return errorResponse(error);
  }
}
