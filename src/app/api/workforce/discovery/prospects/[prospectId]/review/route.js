import {
  ApiError,
  assertSameOrigin,
  errorResponse,
  jsonOk,
  readJsonBody,
  validateBody,
} from '@/lib/api';
import { requirePermission } from '@/lib/auth/authorization';
import { reviewProspect } from '@/lib/discovery/service';
import {
  discoveryProspectEditSchema,
  discoveryReviewSchema,
} from '@/lib/discovery/validation';
import { isUuid } from '@/lib/leads/validation';
import { rateLimit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request, { params }) {
  try {
    assertSameOrigin(request);
    const viewer = await requirePermission('discovery.review');
    const { prospectId } = await params;
    if (!isUuid(prospectId)) {
      throw new ApiError(404, 'PROSPECT_NOT_FOUND', 'That prospect could not be found.');
    }
    if (
      !rateLimit(`discovery-review:${viewer.user.id}`, {
        limit: 60,
        windowMs: 60_000,
      }).ok
    ) {
      throw new ApiError(
        429,
        'RATE_LIMITED',
        'Too many review actions. Wait a minute and try again.',
      );
    }

    const body = await readJsonBody(request, { maxBytes: 64 * 1024 });
    const data = await validateBody(discoveryReviewSchema, body);

    let values = null;
    if (data.action === 'edit') {
      values = await validateBody(discoveryProspectEditSchema, body.values || {});
    }

    const result = await reviewProspect({
      workspaceId: viewer.membership.workspaceId,
      userId: viewer.user.id,
      prospectId,
      action: data.action,
      note: data.note ?? null,
      assignedUserId: data.assignedUserId ?? null,
      duplicateLeadId: data.duplicateLeadId ?? null,
      values,
    });
    if (!result) {
      throw new ApiError(404, 'PROSPECT_NOT_FOUND', 'That prospect could not be found.');
    }
    return jsonOk(result);
  } catch (error) {
    return errorResponse(error);
  }
}
