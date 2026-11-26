import MarketingDashboardView from '@/components/workspace/marketing/MarketingDashboardView';
import { requirePermissionPage } from '@/lib/auth/authorization';
import { getContentOverview } from '@/lib/marketing/content';
import { getMarketingDashboard, getMetricsOverview } from '@/lib/marketing/reporting';
import { getCampaignsOverview } from '@/lib/marketing/service';
import { getWebsiteOverview } from '@/lib/marketing/website';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Marketing',
};

export default async function MarketingPage() {
  const viewer = await requirePermissionPage('marketing.view');
  const workspaceId = viewer.membership.workspaceId;

  const [dashboard, campaigns, content, website, metrics] = await Promise.all([
    getMarketingDashboard(workspaceId),
    getCampaignsOverview(workspaceId),
    getContentOverview(workspaceId),
    getWebsiteOverview(workspaceId),
    getMetricsOverview(workspaceId),
  ]);

  return (
    <MarketingDashboardView
      dashboard={dashboard}
      overview={{ campaigns, content, website, metrics }}
      timezone={viewer.workspace.timezone || 'UTC'}
    />
  );
}
