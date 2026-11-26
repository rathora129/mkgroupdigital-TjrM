import OpportunitiesView from '@/components/workspace/opportunities/OpportunitiesView';
import { requirePermissionPage } from '@/lib/auth/authorization';
import { hasPermission } from '@/lib/auth/permissions';
import {
  getOpportunityOverview,
  listLeadOptions,
  listOpportunities,
} from '@/lib/opportunities/service';
import { isUuid, opportunityQuerySchema } from '@/lib/opportunities/validation';
import { listMembers } from '@/lib/workspace/service';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Opportunities',
};

const DEFAULT_QUERY = {
  page: 1,
  pageSize: 20,
  scope: 'open',
  sort: 'created',
  direction: 'desc',
};

async function parseQuery(params) {
  try {
    return await opportunityQuerySchema.validate(params, {
      abortEarly: false,
      stripUnknown: true,
    });
  } catch {
    return { ...DEFAULT_QUERY };
  }
}

export default async function OpportunitiesPage({ searchParams }) {
  const viewer = await requirePermissionPage('opportunities.view');
  const params = (await searchParams) || {};
  const query = await parseQuery(params);
  const workspaceId = viewer.membership.workspaceId;
  const role = viewer.membership.role;
  const canAssign = hasPermission(role, 'opportunities.assign');

  const [opportunities, overview, leads, members] = await Promise.all([
    listOpportunities(workspaceId, viewer.user.id, query),
    getOpportunityOverview(workspaceId),
    listLeadOptions(workspaceId),
    canAssign ? listMembers(workspaceId) : Promise.resolve([]),
  ]);

  return (
    <OpportunitiesView
      opportunities={opportunities}
      overview={overview}
      leads={leads}
      members={members}
      query={query}
      canCreate={hasPermission(role, 'opportunities.create')}
      canAssign={canAssign}
      timezone={viewer.workspace.timezone || 'UTC'}
      initialLeadId={isUuid(params.lead) ? params.lead : ''}
    />
  );
}
