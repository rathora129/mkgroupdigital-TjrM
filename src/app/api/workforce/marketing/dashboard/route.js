import { errorResponse, jsonOk } from '@/lib/api';
import { requirePermission } from '@/lib/auth/authorization';
import { getMarketingDashboard } from '@/lib/marketing/reporting';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  try {
    const viewer = await requirePermission('marketing.view');
    const dashboard = await getMarketingDashboard(viewer.membership.workspaceId);
    return jsonOk({ dashboard });
  } catch (error) {
    return errorResponse(error);
  }
}
