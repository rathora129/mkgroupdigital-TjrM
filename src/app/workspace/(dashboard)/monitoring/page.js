import MonitoringView from '@/components/workspace/operations/MonitoringView';
import { requirePermissionPage } from '@/lib/auth/authorization';
import { getOperationsOverview } from '@/lib/integrations/monitoring';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Monitoring',
};

export default async function MonitoringPage() {
  const viewer = await requirePermissionPage('integrations.view');
  const overview = await getOperationsOverview(viewer.membership.workspaceId);

  return (
    <MonitoringView
      overview={overview}
      timezone={viewer.workspace.timezone || 'UTC'}
    />
  );
}
