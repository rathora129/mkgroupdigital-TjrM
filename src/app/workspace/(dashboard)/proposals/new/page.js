import ProposalCreateForm from '@/components/workspace/proposals/ProposalCreateForm';
import { requirePermissionPage } from '@/lib/auth/authorization';
import {
  listProposalOpportunityOptions,
  listProposalOwners,
} from '@/lib/proposals/service';
import { isUuid } from '@/lib/proposals/validation';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'New proposal',
};

export default async function NewProposalPage({ searchParams }) {
  const viewer = await requirePermissionPage('proposals.create');
  const params = (await searchParams) || {};
  const workspaceId = viewer.membership.workspaceId;

  const [opportunities, owners] = await Promise.all([
    listProposalOpportunityOptions(workspaceId),
    listProposalOwners(workspaceId),
  ]);

  return (
    <ProposalCreateForm
      opportunities={opportunities}
      owners={owners}
      initialOpportunityId={isUuid(params.opportunityId) ? params.opportunityId : ''}
    />
  );
}
