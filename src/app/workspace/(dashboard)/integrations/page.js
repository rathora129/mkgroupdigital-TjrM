import IntegrationsView from '@/components/workspace/operations/IntegrationsView';
import { requirePermissionPage } from '@/lib/auth/authorization';
import { hasPermission } from '@/lib/auth/permissions';
import { getIntegrationOverview } from '@/lib/integrations/service';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Integrations',
};

export default async function IntegrationsPage() {
  const viewer = await requirePermissionPage('integrations.view');
  const overview = await getIntegrationOverview(viewer.membership.workspaceId);

  return (
    <IntegrationsView
      overview={overview}
      canManage={hasPermission(viewer.membership.role, 'integrations.manage')}
      timezone={viewer.workspace.timezone || 'UTC'}
    />
  );
}
