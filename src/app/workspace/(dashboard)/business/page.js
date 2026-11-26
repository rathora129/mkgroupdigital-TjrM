import BusinessDashboardView from '@/components/workspace/analytics/BusinessDashboardView';
import {
  getOwnerDashboard,
  getRecentActivity,
} from '@/lib/analytics/owner-dashboard';
import { requirePermissionPage } from '@/lib/auth/authorization';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Business intelligence',
};

export default async function BusinessIntelligencePage() {
  const viewer = await requirePermissionPage('dashboard.view');
  const workspaceId = viewer.membership.workspaceId;

  const [data, recentActivity] = await Promise.all([
    getOwnerDashboard({ workspaceId }),
    getRecentActivity(workspaceId, 8),
  ]);

  return (
    <BusinessDashboardView
      data={data}
      recentActivity={recentActivity}
      timezone={viewer.workspace.timezone || 'UTC'}
    />
  );
}
