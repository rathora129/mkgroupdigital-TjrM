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
import { requestProposalAiDraft } from '@/lib/proposals/service';
import {
  isUuid,
  proposalAiDraftSchema,
} from '@/lib/proposals/validation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request, { params }) {
  try {
    assertSameOrigin(request);
    const viewer = await requirePermission('proposals.update');
    await requirePermission('agents.run');
    const { proposalId } = await params;
    if (!isUuid(proposalId)) {
      throw new ApiError(404, 'NOT_FOUND', 'That proposal could not be found.');
    }

    const limit = rateLimit(`proposal-ai-draft:${viewer.user.id}`, {
      limit: 10,
      windowMs: 60 * 60 * 1000,
    });
    if (!limit.ok) {
      throw new ApiError(
        429,
        'RATE_LIMITED',
        'Too many AI draft requests in a short period. Try again later.',
      );
    }

    const body = await readJsonBody(request);
    const data = await validateBody(proposalAiDraftSchema, body);

    const result = await requestProposalAiDraft({
      workspaceId: viewer.membership.workspaceId,
      userId: viewer.user.id,
      proposalId,
      instruction: data.instruction || null,
    });
    if (!result) {
      throw new ApiError(404, 'NOT_FOUND', 'That proposal could not be found.');
    }
    return jsonOk(result, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
