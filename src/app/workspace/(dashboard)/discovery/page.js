import DiscoveryView from '@/components/workspace/discovery/DiscoveryView';
import { requirePermissionPage } from '@/lib/auth/authorization';
import { hasPermission } from '@/lib/auth/permissions';
import {
  getDiscoveryOverview,
  getDiscoveryReadiness,
  listCampaigns,
} from '@/lib/discovery/service';
import { discoveryCampaignQuerySchema } from '@/lib/discovery/validation';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'AI discovery',
};

const DEFAULT_QUERY = { page: 1, pageSize: 20 };

function cleanParams(params) {
  return Object.fromEntries(
    Object.entries(params).filter(
      ([, value]) => value !== '' && value !== undefined && value !== null,
    ),
  );
}

async function parseQuery(params) {
  try {
    return await discoveryCampaignQuerySchema.validate(cleanParams(params), {
      abortEarly: false,
      stripUnknown: true,
    });
  } catch {
    return { ...DEFAULT_QUERY };
  }
}

export default async function DiscoveryPage({ searchParams }) {
  const viewer = await requirePermissionPage('discovery.view');
  const params = (await searchParams) || {};
  const query = await parseQuery(params);
  const workspaceId = viewer.membership.workspaceId;
  const canManage = hasPermission(viewer.membership.role, 'discovery.manage');

  const [campaigns, overview, readiness] = await Promise.all([
    listCampaigns(workspaceId, query),
    getDiscoveryOverview(workspaceId),
    getDiscoveryReadiness(workspaceId),
  ]);

  return (
    <DiscoveryView
      campaigns={campaigns}
      overview={overview}
      readiness={readiness}
      query={query}
      canManage={canManage}
      timezone={viewer.workspace.timezone || 'UTC'}
    />
  );
}
