import {
  ApiError,
  assertSameOrigin,
  errorResponse,
  jsonOk,
} from '@/lib/api';
import { requirePermission } from '@/lib/auth/authorization';
import { rateLimit } from '@/lib/rate-limit';
import { submitProposal } from '@/lib/proposals/service';
import { isUuid } from '@/lib/proposals/validation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request, { params }) {
  try {
    assertSameOrigin(request);
    const viewer = await requirePermission('proposals.submit');
    const { proposalId } = await params;
    if (!isUuid(proposalId)) {
      throw new ApiError(404, 'NOT_FOUND', 'That proposal could not be found.');
    }

    const limit = rateLimit(`proposal-submit:${viewer.user.id}`, {
      limit: 30,
      windowMs: 60 * 1000,
    });
    if (!limit.ok) {
      throw new ApiError(
        429,
        'RATE_LIMITED',
        'Too many submissions in a short period. Try again shortly.',
      );
    }

    const result = await submitProposal({
      workspaceId: viewer.membership.workspaceId,
      userId: viewer.user.id,
      proposalId,
    });
    if (!result) {
      throw new ApiError(404, 'NOT_FOUND', 'That proposal could not be found.');
    }
    return jsonOk(result);
  } catch (error) {
    return errorResponse(error);
  }
}
