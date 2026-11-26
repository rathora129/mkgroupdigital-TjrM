import { notFound } from 'next/navigation';
import MarketingClientView from '@/components/workspace/marketing/clients/MarketingClientView';
import { requirePermissionPage } from '@/lib/auth/authorization';
import { hasPermission } from '@/lib/auth/permissions';
import { getMarketingProfile } from '@/lib/marketing/service';
import { isUuid } from '@/lib/marketing/validation';

export const dynamic = 'force-dynamic';

export default async function MarketingClientPage({ params }) {
  const viewer = await requirePermissionPage('marketing.view');
  const { clientId } = await params;
  if (!isUuid(clientId)) notFound();

  let detail;
  try {
    detail = await getMarketingProfile(viewer.membership.workspaceId, clientId);
  } catch {
    notFound();
  }

  return (
    <MarketingClientView
      detail={detail}
      canManage={hasPermission(viewer.membership.role, 'marketing.manage')}
    />
  );
}
