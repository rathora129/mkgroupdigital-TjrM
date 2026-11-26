import { notFound } from 'next/navigation';
import ClientDetailView from '@/components/workspace/clients/ClientDetailView';
import { requirePermissionPage } from '@/lib/auth/authorization';
import { hasPermission } from '@/lib/auth/permissions';
import { getClient } from '@/lib/clients/service';
import { listEngagementLinkOptions } from '@/lib/clients/engagements';
import { isUuid } from '@/lib/clients/validation';
import { listMembers } from '@/lib/workspace/service';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Client',
};

export default async function ClientDetailPage({ params }) {
  const viewer = await requirePermissionPage('clients.view');
  const { clientId } = await params;
  if (!isUuid(clientId)) notFound();

  const workspaceId = viewer.membership.workspaceId;
  const role = viewer.membership.role;

  const detail = await getClient(workspaceId, clientId);
  if (!detail) notFound();

  const [members, linkOptions] = await Promise.all([
    listMembers(workspaceId),
    listEngagementLinkOptions(workspaceId),
  ]);

  const canEdit = hasPermission(role, 'clients.update');
  if (!canEdit) {
    // Internal notes never leave the server for read-only roles.
    detail.client.internalNotes = null;
  }

  return (
    <ClientDetailView
      detail={detail}
      members={members.map((member) => ({
        userId: member.userId,
        name: member.name,
        email: member.email,
      }))}
      services={linkOptions.services}
      timezone={viewer.workspace.timezone || 'UTC'}
      permissions={{ canEdit, canManage: hasPermission(role, 'clients.manage') }}
      canRunAi={canEdit && hasPermission(role, 'agents.run')}
      canCreateTicket={hasPermission(role, 'tickets.create')}
    />
  );
}
