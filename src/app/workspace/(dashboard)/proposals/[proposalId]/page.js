import { notFound } from 'next/navigation';
import ProposalDetailView from '@/components/workspace/proposals/ProposalDetailView';
import { requirePermissionPage } from '@/lib/auth/authorization';
import { hasPermission } from '@/lib/auth/permissions';
import {
  getProposal,
  listProposalOwners,
} from '@/lib/proposals/service';
import { isUuid } from '@/lib/proposals/validation';
import { getCatalogueOptions } from '@/lib/service-catalogue/service';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Proposal',
};

export default async function ProposalDetailPage({ params }) {
  const viewer = await requirePermissionPage('proposals.view');
  const { proposalId } = await params;
  if (!isUuid(proposalId)) notFound();

  const workspaceId = viewer.membership.workspaceId;
  const role = viewer.membership.role;

  const detail = await getProposal(workspaceId, proposalId);
  if (!detail) notFound();

  const canEdit = hasPermission(role, 'proposals.update');

  const [services, owners] = await Promise.all([
    canEdit ? getCatalogueOptions(workspaceId) : Promise.resolve([]),
    canEdit ? listProposalOwners(workspaceId) : Promise.resolve([]),
  ]);

  return (
    <ProposalDetailView
      key={detail.currentVersion.id}
      detail={detail}
      services={services}
      owners={owners}
      timezone={viewer.workspace.timezone || 'UTC'}
      permissions={{
        canEdit,
        canSubmit: hasPermission(role, 'proposals.submit'),
        canApprove: hasPermission(role, 'proposals.approve'),
        canReject: hasPermission(role, 'proposals.reject'),
        canSend: hasPermission(role, 'proposals.mark_sent'),
        canRespond: hasPermission(role, 'proposals.record_response'),
        canExport: hasPermission(role, 'proposals.export'),
        canNewVersion: hasPermission(role, 'proposals.manage_versions'),
      }}
      canRunAi={canEdit && hasPermission(role, 'agents.run')}
    />
  );
}
