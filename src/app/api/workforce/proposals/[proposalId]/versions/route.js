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
import { createProposalRevision } from '@/lib/proposals/service';
import {
  isUuid,
  proposalVersionCreateSchema,
} from '@/lib/proposals/validation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request, { params }) {
  try {
    assertSameOrigin(request);
    const viewer = await requirePermission('proposals.manage_versions');
    const { proposalId } = await params;
    if (!isUuid(proposalId)) {
      throw new ApiError(404, 'NOT_FOUND', 'That proposal could not be found.');
    }

    const limit = rateLimit(`proposal-version:${viewer.user.id}`, {
      limit: 20,
      windowMs: 60 * 1000,
    });
    if (!limit.ok) {
      throw new ApiError(
        429,
        'RATE_LIMITED',
        'Too many revisions created in a short period. Try again shortly.',
      );
    }

    const body = await readJsonBody(request);
    const data = await validateBody(proposalVersionCreateSchema, body);

    const result = await createProposalRevision({
      workspaceId: viewer.membership.workspaceId,
      userId: viewer.user.id,
      proposalId,
      changeSummary: data.changeSummary || null,
    });
    if (!result) {
      throw new ApiError(404, 'NOT_FOUND', 'That proposal could not be found.');
    }
    return jsonOk(result, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
