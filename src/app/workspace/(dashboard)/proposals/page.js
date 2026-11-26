import ProposalListView from '@/components/workspace/proposals/ProposalListView';
import { requirePermissionPage } from '@/lib/auth/authorization';
import { hasPermission } from '@/lib/auth/permissions';
import {
  getProposalOverview,
  listProposalOwners,
  listProposals,
} from '@/lib/proposals/service';
import { proposalQuerySchema } from '@/lib/proposals/validation';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Proposals',
};

const DEFAULT_QUERY = {
  page: 1,
  pageSize: 20,
  sort: 'created',
  direction: 'desc',
};

async function parseQuery(params) {
  try {
    return await proposalQuerySchema.validate(params, {
      abortEarly: false,
      stripUnknown: true,
    });
  } catch {
    return { ...DEFAULT_QUERY };
  }
}

export default async function ProposalsPage({ searchParams }) {
  const viewer = await requirePermissionPage('proposals.view');
  const params = (await searchParams) || {};
  const query = await parseQuery(params);
  const workspaceId = viewer.membership.workspaceId;

  const [proposals, overview, owners] = await Promise.all([
    listProposals(workspaceId, viewer.user.id, query),
    getProposalOverview(workspaceId),
    listProposalOwners(workspaceId),
  ]);

  return (
    <ProposalListView
      proposals={proposals}
      overview={overview}
      owners={owners}
      query={query}
      canCreate={hasPermission(viewer.membership.role, 'proposals.create')}
      timezone={viewer.workspace.timezone || 'UTC'}
    />
  );
}
