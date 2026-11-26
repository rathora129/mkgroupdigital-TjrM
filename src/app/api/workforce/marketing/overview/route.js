import { errorResponse, jsonOk } from '@/lib/api';
import { requirePermission } from '@/lib/auth/authorization';
import { getContentOverview } from '@/lib/marketing/content';
import { getMetricsOverview } from '@/lib/marketing/reporting';
import { getCampaignsOverview } from '@/lib/marketing/service';
import { getWebsiteOverview } from '@/lib/marketing/website';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  try {
    const viewer = await requirePermission('marketing.view');
    const workspaceId = viewer.membership.workspaceId;
    const [campaigns, content, website, metrics] = await Promise.all([
      getCampaignsOverview(workspaceId),
      getContentOverview(workspaceId),
      getWebsiteOverview(workspaceId),
      getMetricsOverview(workspaceId),
    ]);
    return jsonOk({ campaigns, content, website, metrics });
  } catch (error) {
    return errorResponse(error);
  }
}
