import {
  ApiError,
  assertSameOrigin,
  errorResponse,
  jsonOk,
  readJsonBody,
  validateBody,
} from '@/lib/api';
import { requirePermission } from '@/lib/auth/authorization';
import { addProposalVersion } from '@/lib/marketing/website';
import { isUuid, proposalVersionSchema } from '@/lib/marketing/validation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request, { params }) {
  try {
    assertSameOrigin(request);
    const viewer = await requirePermission('marketing.manage');
    const { proposalId } = await params;
    if (!isUuid(proposalId)) {
      throw new ApiError(
        404,
        'NOT_FOUND',
        'That website change proposal could not be found.',
      );
    }

    const body = await readJsonBody(request);
    const data = await validateBody(proposalVersionSchema, body);
    const result = await addProposalVersion({
      workspaceId: viewer.membership.workspaceId,
      userId: viewer.user.id,
      proposalId,
      data,
    });
    return jsonOk(result);
  } catch (error) {
    return errorResponse(error);
  }
}
