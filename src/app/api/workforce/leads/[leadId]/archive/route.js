import {
  ApiError,
  assertSameOrigin,
  errorResponse,
  jsonOk,
  readJsonBody,
  validateBody,
} from '@/lib/api';
import { requirePermission } from '@/lib/auth/authorization';
import { setLeadArchived } from '@/lib/leads/service';
import { isUuid, leadArchiveSchema } from '@/lib/leads/validation';
import { rateLimit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request, { params }) {
  try {
    assertSameOrigin(request);
    const viewer = await requirePermission('leads.archive');
    const { leadId } = await params;
    if (!isUuid(leadId)) {
      throw new ApiError(404, 'NOT_FOUND', 'That lead could not be found.');
    }

    const limit = rateLimit(`lead-archive:${viewer.user.id}`, {
      limit: 30,
      windowMs: 60 * 1000,
    });
    if (!limit.ok) {
      throw new ApiError(
        429,
        'RATE_LIMITED',
        'Too many archive changes in a short period. Try again shortly.',
      );
    }

    const body = await readJsonBody(request);
    const data = await validateBody(leadArchiveSchema, body);

    const result = await setLeadArchived({
      workspaceId: viewer.membership.workspaceId,
      userId: viewer.user.id,
      leadId,
      archived: data.archived,
    });
    if (!result) {
      throw new ApiError(404, 'NOT_FOUND', 'That lead could not be found.');
    }

    return jsonOk(result);
  } catch (error) {
    return errorResponse(error);
  }
}
