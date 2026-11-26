import { notFound } from 'next/navigation';
import LeadDetailView from '@/components/workspace/leads/LeadDetailView';
import { requirePermissionPage } from '@/lib/auth/authorization';
import { hasPermission } from '@/lib/auth/permissions';
import {
  getLeadConversionPreview,
  getLeadUnifiedTimeline,
} from '@/lib/leads/conversion';
import { getLead, leadAccessFor } from '@/lib/leads/service';
import { isUuid } from '@/lib/leads/validation';
import { listMembers } from '@/lib/workspace/service';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Lead',
};

export default async function LeadDetailPage({ params }) {
  const viewer = await requirePermissionPage('leads.view');
  const { leadId } = await params;
  if (!isUuid(leadId)) notFound();

  const workspaceId = viewer.membership.workspaceId;
  const role = viewer.membership.role;
  const access = leadAccessFor(viewer);

  const detail = await getLead(workspaceId, leadId, access);
  if (!detail) notFound();

  const canAssign = hasPermission(role, 'leads.assign');
  const canConvert = hasPermission(role, 'leads.convert');
  const [members, conversion, timeline] = await Promise.all([
    canAssign ? listMembers(workspaceId) : [],
    canConvert && !detail.lead.archivedAt
      ? getLeadConversionPreview({ workspaceId, leadId, access })
      : null,
    getLeadUnifiedTimeline({ workspaceId, leadId, access }),
  ]);

  return (
    <LeadDetailView
      detail={detail}
      members={members}
      conversion={conversion}
      timeline={timeline}
      canConvert={canConvert}
      canUpdate={hasPermission(role, 'leads.update')}
      canAssign={canAssign}
      canArchive={hasPermission(role, 'leads.archive')}
      canCreateResearch={hasPermission(role, 'research.create')}
      canViewOpportunities={hasPermission(role, 'opportunities.view')}
      canCreateOpportunities={hasPermission(role, 'opportunities.create')}
      timezone={viewer.workspace.timezone || 'UTC'}
    />
  );
}
