import ServicesView from '@/components/workspace/services/ServicesView';
import { requirePermissionPage } from '@/lib/auth/authorization';
import { hasPermission } from '@/lib/auth/permissions';
import {
  ensureDefaultCatalogue,
  listCatalogue,
} from '@/lib/service-catalogue/service';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Services',
};

export default async function ServicesPage() {
  const viewer = await requirePermissionPage('services.view');
  const workspaceId = viewer.membership.workspaceId;
  const canManage = hasPermission(viewer.membership.role, 'services.manage');

  if (canManage) {
    await ensureDefaultCatalogue(workspaceId, viewer.user.id);
  }

  const catalogue = await listCatalogue(workspaceId, {
    includeArchived: canManage,
  });

  return <ServicesView catalogue={catalogue} canManage={canManage} />;
}
