import {
  ApiError,
  assertSameOrigin,
  errorResponse,
  jsonOk,
  readJsonBody,
  validateBody,
} from '@/lib/api';
import { requirePermission } from '@/lib/auth/authorization';
import { leadAccessFor } from '@/lib/leads/service';
import { isUuid } from '@/lib/leads/validation';
import { rateLimit } from '@/lib/rate-limit';
import { createLeadFollowUpTask } from '@/lib/sales/service';
import { followUpTaskSchema } from '@/lib/sales/validation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request, { params }) {
  try {
    assertSameOrigin(request);
    const viewer = await requirePermission('tasks.create');
    const { leadId } = await params;
    if (!isUuid(leadId)) {
      throw new ApiError(404, 'NOT_FOUND', 'That lead could not be found.');
    }

    const limit = rateLimit(`lead-follow-up:${viewer.user.id}`, {
      limit: 60,
      windowMs: 60_000,
    });
    if (!limit.ok) {
      throw new ApiError(
        429,
        'RATE_LIMITED',
        'Too many follow-up changes in a short period. Try again shortly.',
      );
    }

    const body = await readJsonBody(request, { maxBytes: 32 * 1024 });
    const data = await validateBody(followUpTaskSchema, body);

    const result = await createLeadFollowUpTask({
      workspaceId: viewer.membership.workspaceId,
      userId: viewer.user.id,
      leadId,
      data,
      access: leadAccessFor(viewer),
    });
    if (!result) {
      throw new ApiError(404, 'NOT_FOUND', 'That lead could not be found.');
    }
    return jsonOk(result);
  } catch (error) {
    return errorResponse(error);
  }
}
