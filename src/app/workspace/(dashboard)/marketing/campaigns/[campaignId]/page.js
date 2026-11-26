import { notFound } from 'next/navigation';
import CampaignDetailView from '@/components/workspace/marketing/campaigns/CampaignDetailView';
import { requirePermissionPage } from '@/lib/auth/authorization';
import { hasPermission } from '@/lib/auth/permissions';
import { getCampaign } from '@/lib/marketing/service';
import { isUuid } from '@/lib/marketing/validation';

export const dynamic = 'force-dynamic';

export default async function CampaignPage({ params }) {
  const viewer = await requirePermissionPage('marketing.view');
  const { campaignId } = await params;
  if (!isUuid(campaignId)) notFound();

  let detail;
  try {
    detail = await getCampaign(viewer.membership.workspaceId, campaignId);
  } catch {
    notFound();
  }

  return (
    <CampaignDetailView
      campaign={detail.campaign}
      timezone={viewer.workspace.timezone || 'UTC'}
      canManage={hasPermission(viewer.membership.role, 'marketing.manage')}
    />
  );
}
