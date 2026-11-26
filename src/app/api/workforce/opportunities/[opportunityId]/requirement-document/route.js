import { ApiError, errorResponse, jsonOk } from '@/lib/api';
import { requirePermission } from '@/lib/auth/authorization';
import { buildRequirementDocument } from '@/lib/opportunities/service';
import { isUuid } from '@/lib/opportunities/validation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request, { params }) {
  try {
    const viewer = await requirePermission('requirements.view');
    const { opportunityId } = await params;
    if (!isUuid(opportunityId)) {
      throw new ApiError(404, 'NOT_FOUND', 'That opportunity could not be found.');
    }

    const document = await buildRequirementDocument(
      viewer.membership.workspaceId,
      opportunityId,
    );
    if (!document) {
      throw new ApiError(404, 'NOT_FOUND', 'That opportunity could not be found.');
    }

    return jsonOk(document);
  } catch (error) {
    return errorResponse(error);
  }
}
