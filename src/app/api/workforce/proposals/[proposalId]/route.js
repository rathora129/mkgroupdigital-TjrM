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
import { getProposal, updateProposalDetails } from '@/lib/proposals/service';
import {
  isUuid,
  proposalUpdateSchema,
} from '@/lib/proposals/validation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const NOT_FOUND = 'That proposal could not be found.';

export async function GET(request, { params }) {
  try {
    const viewer = await requirePermission('proposals.view');
    const { proposalId } = await params;
    if (!isUuid(proposalId)) throw new ApiError(404, 'NOT_FOUND', NOT_FOUND);

    const detail = await getProposal(viewer.membership.workspaceId, proposalId);
    if (!detail) throw new ApiError(404, 'NOT_FOUND', NOT_FOUND);
    return jsonOk(detail);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request, { params }) {
  try {
    assertSameOrigin(request);
    const viewer = await requirePermission('proposals.update');
    const { proposalId } = await params;
    if (!isUuid(proposalId)) throw new ApiError(404, 'NOT_FOUND', NOT_FOUND);

    const limit = rateLimit(`proposal-update:${viewer.user.id}`, {
      limit: 60,
      windowMs: 60 * 1000,
    });
    if (!limit.ok) {
      throw new ApiError(
        429,
        'RATE_LIMITED',
        'Too many updates in a short period. Try again shortly.',
      );
    }

    const body = await readJsonBody(request);
    const data = await validateBody(proposalUpdateSchema, body);

    const result = await updateProposalDetails({
      workspaceId: viewer.membership.workspaceId,
      userId: viewer.user.id,
      proposalId,
      data,
    });
    if (!result) throw new ApiError(404, 'NOT_FOUND', NOT_FOUND);
    return jsonOk(result);
  } catch (error) {
    return errorResponse(error);
  }
}
