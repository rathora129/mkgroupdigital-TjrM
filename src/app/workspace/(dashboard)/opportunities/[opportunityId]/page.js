import { notFound } from 'next/navigation';
import OpportunityDetailView from '@/components/workspace/opportunities/OpportunityDetailView';
import { requirePermissionPage } from '@/lib/auth/authorization';
import { hasPermission } from '@/lib/auth/permissions';
import {
  buildRequirementDocument,
  getOpportunity,
} from '@/lib/opportunities/service';
import { isUuid } from '@/lib/opportunities/validation';
import { listProposalsForOpportunity } from '@/lib/proposals/service';
import { getCatalogueOptions } from '@/lib/service-catalogue/service';
import { listMembers } from '@/lib/workspace/service';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Opportunity',
};

export default async function OpportunityDetailPage({ params }) {
  const viewer = await requirePermissionPage('opportunities.view');
  const { opportunityId } = await params;
  if (!isUuid(opportunityId)) notFound();

  const workspaceId = viewer.membership.workspaceId;
  const role = viewer.membership.role;

  const detail = await getOpportunity(workspaceId, opportunityId);
  if (!detail) notFound();

  const canViewRequirements = hasPermission(role, 'requirements.view');
  const canEditRequirements = hasPermission(role, 'requirements.edit');
  const canAssign = hasPermission(role, 'opportunities.assign');
  const canViewProposals = hasPermission(role, 'proposals.view');

  const [document, members, services, proposals] = await Promise.all([
    canViewRequirements
      ? buildRequirementDocument(workspaceId, opportunityId)
      : Promise.resolve(null),
    canAssign ? listMembers(workspaceId) : Promise.resolve([]),
    canEditRequirements ? getCatalogueOptions(workspaceId) : Promise.resolve([]),
    canViewProposals
      ? listProposalsForOpportunity(workspaceId, opportunityId)
      : Promise.resolve([]),
  ]);

  if (!canViewRequirements) {
    detail.discovery = null;
    detail.requirementItems = [];
  }

  return (
    <OpportunityDetailView
      detail={detail}
      document={document}
      members={members}
      services={services}
      timezone={viewer.workspace.timezone || 'UTC'}
      canEdit={hasPermission(role, 'opportunities.update')}
      canAssign={canAssign}
      canClose={hasPermission(role, 'opportunities.close')}
      canEditRequirements={canEditRequirements}
      canViewRequirements={canViewRequirements}
      canRunAi={
        hasPermission(role, 'opportunities.update') &&
        hasPermission(role, 'agents.run')
      }
      proposals={proposals}
      canViewProposals={canViewProposals}
      canCreateProposal={hasPermission(role, 'proposals.create')}
      canExportProposal={hasPermission(role, 'proposals.export')}
    />
  );
}
