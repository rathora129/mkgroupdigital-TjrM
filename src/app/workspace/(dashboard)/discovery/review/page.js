import DiscoveryReviewView from '@/components/workspace/discovery/DiscoveryReviewView';
import { requirePermissionPage } from '@/lib/auth/authorization';
import { hasPermission } from '@/lib/auth/permissions';
import { listCampaigns, listProspects } from '@/lib/discovery/service';
import { discoveryProspectQuerySchema } from '@/lib/discovery/validation';
import { listMembers } from '@/lib/workspace/service';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Prospect review',
};

const DEFAULT_QUERY = { page: 1, pageSize: 20, status: 'pending_review' };

function cleanParams(params) {
  return Object.fromEntries(
    Object.entries(params).filter(
      ([, value]) => value !== '' && value !== undefined && value !== null,
    ),
  );
}

async function parseQuery(params) {
  try {
    return await discoveryProspectQuerySchema.validate(cleanParams(params), {
      abortEarly: false,
      stripUnknown: true,
    });
  } catch {
    return { ...DEFAULT_QUERY };
  }
}

export default async function DiscoveryReviewPage({ searchParams }) {
  const viewer = await requirePermissionPage('discovery.view');
  const params = (await searchParams) || {};
  const query = await parseQuery(params);
  const workspaceId = viewer.membership.workspaceId;

  const [prospects, campaignList, members] = await Promise.all([
    listProspects(workspaceId, query),
    listCampaigns(workspaceId, { page: 1, pageSize: 50 }),
    listMembers(workspaceId),
  ]);

  return (
    <DiscoveryReviewView
      prospects={prospects}
      query={query}
      members={members}
      campaigns={campaignList.items}
      canReview={hasPermission(viewer.membership.role, 'discovery.review')}
      timezone={viewer.workspace.timezone || 'UTC'}
    />
  );
}
