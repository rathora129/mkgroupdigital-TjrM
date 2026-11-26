import { ApiError, assertSameOrigin, errorResponse, jsonOk } from '@/lib/api';
import { requirePermission } from '@/lib/auth/authorization';
import { rateLimit } from '@/lib/rate-limit';
import { isUuid } from '@/lib/leads/validation';
import { cancelResearchJob } from '@/lib/research/service';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request, { params }) {
  try {
    assertSameOrigin(request);
    const viewer = await requirePermission('research.create');

    const limit = rateLimit(`research-cancel:${viewer.user.id}`, {
      limit: 60,
      windowMs: 60 * 1000,
    });
    if (!limit.ok) {
      throw new ApiError(
        429,
        'RATE_LIMITED',
        'Too many cancellations in a short period. Try again shortly.',
      );
    }

    const { researchId } = await params;
    if (!isUuid(researchId)) {
      throw new ApiError(404, 'NOT_FOUND', 'That research job could not be found.');
    }

    const job = await cancelResearchJob({
      workspaceId: viewer.membership.workspaceId,
      userId: viewer.user.id,
      researchId,
    });
    if (!job) {
      throw new ApiError(404, 'NOT_FOUND', 'That research job could not be found.');
    }

    return jsonOk({ job });
  } catch (error) {
    return errorResponse(error);
  }
}
