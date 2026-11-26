import { ApiError, errorResponse, jsonOk } from '@/lib/api';
import { requirePermission } from '@/lib/auth/authorization';
import { getClientMarketingSummary } from '@/lib/marketing/reporting';
import { isUuid } from '@/lib/marketing/validation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request, { params }) {
  try {
    const viewer = await requirePermission('marketing.view');
    const { clientId } = await params;
    if (!isUuid(clientId)) {
      throw new ApiError(404, 'NOT_FOUND', 'That client could not be found.');
    }
    const summary = await getClientMarketingSummary(
      viewer.membership.workspaceId,
      clientId,
    );
    return jsonOk(summary);
  } catch (error) {
    return errorResponse(error);
  }
}
