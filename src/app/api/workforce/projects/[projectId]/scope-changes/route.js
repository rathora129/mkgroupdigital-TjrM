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
import { createScopeChange } from '@/lib/projects/service';
import { isUuid, scopeChangeCreateSchema } from '@/lib/projects/validation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request, { params }) {
  try {
    assertSameOrigin(request);
    const viewer = await requirePermission('projects.update');
    const { projectId } = await params;
    if (!isUuid(projectId)) {
      throw new ApiError(404, 'NOT_FOUND', 'That project could not be found.');
    }

    const limit = rateLimit(`scope-change-create:${viewer.user.id}`, {
      limit: 30,
      windowMs: 60 * 1000,
    });
    if (!limit.ok) {
      throw new ApiError(
        429,
        'RATE_LIMITED',
        'Too many change requests in a short period. Try again shortly.',
      );
    }

    const body = await readJsonBody(request);
    const data = await validateBody(scopeChangeCreateSchema, body);

    const result = await createScopeChange({
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
