import {
  ApiError,
  assertSameOrigin,
  errorResponse,
  jsonOk,
  readJsonBody,
  validateBody,
} from '@/lib/api';
import { requirePermission } from '@/lib/auth/authorization';
import { assignLead } from '@/lib/leads/service';
import { isUuid, leadAssignSchema } from '@/lib/leads/validation';
import { rateLimit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request, { params }) {
  try {
    assertSameOrigin(request);
    const viewer = await requirePermission('leads.assign');
    const { leadId } = await params;
    if (!isUuid(leadId)) {
      throw new ApiError(404, 'NOT_FOUND', 'That lead could not be found.');
    }

    const limit = rateLimit(`lead-assign:${viewer.user.id}`, {
      limit: 60,
      windowMs: 60 * 1000,
    });
    if (!limit.ok) {
      throw new ApiError(
        429,
        'RATE_LIMITED',
        'Too many assignment changes in a short period. Try again shortly.',
      );
    }

    const body = await readJsonBody(request);
    const data = await validateBody(leadAssignSchema, body);

    const result = await assignLead({
      workspaceId: viewer.membership.workspaceId,
      userId: viewer.user.id,
      leadId,
      assignedUserId: data.assignedUserId,
    });
    if (!result) {
      throw new ApiError(404, 'NOT_FOUND', 'That lead could not be found.');
    }

    return jsonOk(result);
  } catch (error) {
    return errorResponse(error);
  }
}
