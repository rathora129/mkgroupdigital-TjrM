import { notFound } from 'next/navigation';
import DiscoveryCampaignView from '@/components/workspace/discovery/DiscoveryCampaignView';
import { requirePermissionPage } from '@/lib/auth/authorization';
import { hasPermission } from '@/lib/auth/permissions';
import { getCampaign, listProspects } from '@/lib/discovery/service';
import { isUuid } from '@/lib/leads/validation';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Discovery campaign',
};

export default async function DiscoveryCampaignPage({ params }) {
  const viewer = await requirePermissionPage('discovery.view');
  const { campaignId } = await params;
  if (!isUuid(campaignId)) notFound();

  const workspaceId = viewer.membership.workspaceId;
  const detail = await getCampaign(workspaceId, campaignId);
  if (!detail) notFound();

  const prospects = await listProspects(workspaceId, {
    page: 1,
    pageSize: 20,
    status: 'all',
    campaignId,
  });

  return (
    <DiscoveryCampaignView
      detail={detail}
      prospects={prospects}
      canManage={hasPermission(viewer.membership.role, 'discovery.manage')}
      canReview={hasPermission(viewer.membership.role, 'discovery.review')}
      timezone={viewer.workspace.timezone || 'UTC'}
    />
  );
}
