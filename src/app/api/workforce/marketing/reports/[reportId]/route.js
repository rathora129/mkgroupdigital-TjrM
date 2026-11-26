import { ApiError, errorResponse, jsonOk } from '@/lib/api';
import { requirePermission } from '@/lib/auth/authorization';
import { getReport } from '@/lib/marketing/reporting';
import { isUuid } from '@/lib/marketing/validation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request, { params }) {
  try {
    const viewer = await requirePermission('marketing.view');
    const { reportId } = await params;
    if (!isUuid(reportId)) {
      throw new ApiError(404, 'NOT_FOUND', 'That marketing report could not be found.');
    }
    const report = await getReport(viewer.membership.workspaceId, reportId);
    return jsonOk({ report });
  } catch (error) {
    return errorResponse(error);
  }
}
