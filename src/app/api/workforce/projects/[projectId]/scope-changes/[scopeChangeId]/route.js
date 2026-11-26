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
import { decideScopeChange } from '@/lib/projects/service';
import { isUuid, scopeChangeDecisionSchema } from '@/lib/projects/validation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function PATCH(request, { params }) {
  try {
    assertSameOrigin(request);
    const viewer = await requirePermission('projects.manage');
    const { projectId, scopeChangeId } = await params;
    if (!isUuid(projectId) || !isUuid(scopeChangeId)) {
      throw new ApiError(404, 'NOT_FOUND', 'That change request could not be found.');
    }

    const limit = rateLimit(`scope-change-decide:${viewer.user.id}`, {
      limit: 60,
      windowMs: 60 * 1000,
    });
    if (!limit.ok) {
      throw new ApiError(
        429,
        'RATE_LIMITED',
        'Too many decisions in a short period. Try again shortly.',
      );
    }

    const body = await readJsonBody(request);
    const data = await validateBody(scopeChangeDecisionSchema, body);

    const result = await decideScopeChange({
      workspaceId: viewer.membership.workspaceId,
      userId: viewer.user.id,
      projectId,
      scopeChangeId,
      status: data.status,
      decisionNotes: data.decisionNotes || null,
    });
    if (!result) {
      throw new ApiError(404, 'NOT_FOUND', 'That change request could not be found.');
    }
    return jsonOk(result);
  } catch (error) {
    return errorResponse(error);
  }
}
