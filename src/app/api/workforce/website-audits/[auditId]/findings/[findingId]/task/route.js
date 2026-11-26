import {
  ApiError,
  assertSameOrigin,
  errorResponse,
  jsonOk,
  readJsonBody,
  validateBody,
} from '@/lib/api';
import { requirePermission } from '@/lib/auth/authorization';
import { hasPermission } from '@/lib/auth/permissions';
import { rateLimit } from '@/lib/rate-limit';
import { convertFindingToTask, getAuditFinding } from '@/lib/marketing/seo';
import { auditTaskSchema, isUuid } from '@/lib/marketing/validation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const NOT_FOUND = 'That audit finding could not be found.';

export async function POST(request, { params }) {
  try {
    assertSameOrigin(request);
    const viewer = await requirePermission('marketing.manage');
    if (!hasPermission(viewer.membership.role, 'tasks.create')) {
      throw new ApiError(
        403,
        'FORBIDDEN',
        'Your role does not allow creating project tasks.',
      );
    }

    const { auditId, findingId } = await params;
    if (!isUuid(auditId) || !isUuid(findingId)) {
      throw new ApiError(404, 'NOT_FOUND', NOT_FOUND);
    }

    const limit = rateLimit(`marketing-finding-task:${viewer.user.id}`, {
      limit: 30,
      windowMs: 60 * 1000,
    });
    if (!limit.ok) {
      throw new ApiError(
        429,
        'RATE_LIMITED',
        'Too many tasks generated in a short period. Try again shortly.',
      );
    }

    const loaded = await getAuditFinding(viewer.membership.workspaceId, findingId);
    if (loaded.finding.auditId !== auditId) {
      throw new ApiError(404, 'NOT_FOUND', NOT_FOUND);
    }

    const body = await readJsonBody(request);
    const data = await validateBody(auditTaskSchema, body);
    const result = await convertFindingToTask({
      workspaceId: viewer.membership.workspaceId,
      userId: viewer.user.id,
      findingId,
      data,
    });
    return jsonOk(result, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
