import {
  ApiError,
  assertSameOrigin,
  errorResponse,
  jsonOk,
  readJsonBody,
  validateBody,
} from '@/lib/api';
import { requirePermission } from '@/lib/auth/authorization';
import { getProposal, updateProposal } from '@/lib/marketing/website';
import { isUuid, proposalUpdateSchema } from '@/lib/marketing/validation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const NOT_FOUND = 'That website change proposal could not be found.';

export async function GET(request, { params }) {
  try {
    const viewer = await requirePermission('marketing.view');
    const { proposalId } = await params;
    if (!isUuid(proposalId)) throw new ApiError(404, 'NOT_FOUND', NOT_FOUND);
    const result = await getProposal(
      viewer.membership.workspaceId,
      proposalId,
    );
    return jsonOk(result);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request, { params }) {
  try {
    assertSameOrigin(request);
    const viewer = await requirePermission('marketing.manage');
    const { proposalId } = await params;
    if (!isUuid(proposalId)) throw new ApiError(404, 'NOT_FOUND', NOT_FOUND);

    const body = await readJsonBody(request);
    const data = await validateBody(proposalUpdateSchema, body);
    const result = await updateProposal({
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
