import { notFound } from 'next/navigation';
import ProposalDetailView from '@/components/workspace/marketing/website/ProposalDetailView';
import { requirePermissionPage } from '@/lib/auth/authorization';
import { hasPermission } from '@/lib/auth/permissions';
import { getProposal } from '@/lib/marketing/website';
import { isUuid } from '@/lib/marketing/validation';

export const dynamic = 'force-dynamic';

export default async function ProposalPage({ params }) {
  const viewer = await requirePermissionPage('marketing.view');
  const { proposalId } = await params;
  if (!isUuid(proposalId)) notFound();

  let detail;
  try {
    detail = await getProposal(viewer.membership.workspaceId, proposalId);
  } catch {
    notFound();
  }

  const role = viewer.membership.role;
  return (
    <ProposalDetailView
      detail={detail}
      timezone={viewer.workspace.timezone || 'UTC'}
      canManage={hasPermission(role, 'marketing.manage')}
      canApprove={hasPermission(role, 'marketing.approve')}
      canExecute={hasPermission(role, 'marketing.execute')}
    />
  );
}
