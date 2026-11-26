import { ApiError, errorResponse, jsonOk } from '@/lib/api';
import { requirePermission } from '@/lib/auth/authorization';
import { isUuid } from '@/lib/leads/validation';
import { getWebsiteAudit } from '@/lib/audits/service';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request, { params }) {
  try {
    const viewer = await requirePermission('audits.view');
    const { auditId } = await params;
    if (!isUuid(auditId)) {
      throw new ApiError(404, 'NOT_FOUND', 'That audit could not be found.');
    }

    const detail = await getWebsiteAudit(
      viewer.membership.workspaceId,
      auditId,
    );
    if (!detail) {
      throw new ApiError(404, 'NOT_FOUND', 'That audit could not be found.');
    }

    return jsonOk(detail);
  } catch (error) {
    return errorResponse(error);
  }
}
