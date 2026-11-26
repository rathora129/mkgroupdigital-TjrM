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
import { decideProposal } from '@/lib/proposals/service';
import {
  approvalDecisionSchema,
  isUuid,
} from '@/lib/proposals/validation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request, { params }) {
  try {
    assertSameOrigin(request);
    const { proposalId } = await params;
    if (!isUuid(proposalId)) {
      throw new ApiError(404, 'NOT_FOUND', 'That proposal could not be found.');
    }

    const body = await readJsonBody(request);
    const data = await validateBody(approvalDecisionSchema, body);

    // Approval and rejection are separate permissions. A role that may review
    // must hold the matching permission for the decision it submits.
    const viewer = await requirePermission(
      data.decision === 'changes_requested'
        ? 'proposals.reject'
        : 'proposals.approve',
    );

    const limit = rateLimit(`proposal-decision:${viewer.user.id}`, {
      limit: 30,
      windowMs: 60 * 1000,
    });
    if (!limit.ok) {
      throw new ApiError(
        429,
        'RATE_LIMITED',
        'Too many decisions in a short period. Try again shortly.',
      );
    }

    const result = await decideProposal({
      workspaceId: viewer.membership.workspaceId,
      userId: viewer.user.id,
      proposalId,
      decision: data.decision,
      notes: data.notes || null,
    });
    if (!result) {
      throw new ApiError(404, 'NOT_FOUND', 'That proposal could not be found.');
    }
    return jsonOk(result);
  } catch (error) {
    return errorResponse(error);
  }
}
