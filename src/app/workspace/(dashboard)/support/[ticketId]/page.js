import { notFound } from 'next/navigation';
import TicketDetailView from '@/components/workspace/clients/TicketDetailView';
import { requirePermissionPage } from '@/lib/auth/authorization';
import { hasPermission } from '@/lib/auth/permissions';
import { getTicket } from '@/lib/clients/tickets';
import { listEngagementLinkOptions } from '@/lib/clients/engagements';
import { isUuid } from '@/lib/clients/validation';
import { listMembers } from '@/lib/workspace/service';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Support ticket',
};

export default async function TicketDetailPage({ params }) {
  const viewer = await requirePermissionPage('tickets.view');
  const { ticketId } = await params;
  if (!isUuid(ticketId)) notFound();

  const workspaceId = viewer.membership.workspaceId;
  const role = viewer.membership.role;

  const detail = await getTicket(workspaceId, ticketId);
  if (!detail) notFound();

  const [members, linkOptions] = await Promise.all([
    listMembers(workspaceId),
    listEngagementLinkOptions(workspaceId),
  ]);

  return (
    <TicketDetailView
      detail={detail}
      members={members.map((member) => ({
        userId: member.userId,
        name: member.name,
        email: member.email,
      }))}
      projects={linkOptions.projects}
      timezone={viewer.workspace.timezone || 'UTC'}
      permissions={{ canEdit: hasPermission(role, 'tickets.update') }}
      canRunAi={hasPermission(role, 'tickets.update') && hasPermission(role, 'agents.run')}
    />
  );
}
