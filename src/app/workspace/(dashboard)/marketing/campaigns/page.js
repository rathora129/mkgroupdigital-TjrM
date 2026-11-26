import CampaignListView from '@/components/workspace/marketing/campaigns/CampaignListView';
import { requirePermissionPage } from '@/lib/auth/authorization';
import { hasPermission } from '@/lib/auth/permissions';
import { listClientOptions } from '@/lib/marketing/helpers';
import { listCampaigns } from '@/lib/marketing/service';
import { campaignQuerySchema } from '@/lib/marketing/validation';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Marketing campaigns',
};

const DEFAULT_QUERY = { page: 1, pageSize: 20 };

async function parseQuery(params) {
  try {
    return await campaignQuerySchema.validate(params, {
      abortEarly: false,
      stripUnknown: true,
    });
  } catch {
    return { ...DEFAULT_QUERY };
  }
}

export default async function CampaignsPage({ searchParams }) {
  const viewer = await requirePermissionPage('marketing.view');
  const params = (await searchParams) || {};
  const query = await parseQuery(params);
  const workspaceId = viewer.membership.workspaceId;

  const [campaigns, clients] = await Promise.all([
    listCampaigns(workspaceId, query),
    listClientOptions(workspaceId),
  ]);

  return (
    <CampaignListView
      campaigns={campaigns}
      query={query}
      clients={clients}
      canManage={hasPermission(viewer.membership.role, 'marketing.manage')}
      timezone={viewer.workspace.timezone || 'UTC'}
    />
  );
}
