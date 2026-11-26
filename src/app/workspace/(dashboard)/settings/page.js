import SettingsView from '@/components/workspace/SettingsView';
import { requireMemberPage } from '@/lib/auth/authorization';
import {
  assignableRoles,
  permissionsFor,
} from '@/lib/auth/permissions';
import {
  listInvitations,
  listMembers,
} from '@/lib/workspace/service';
import { toWorkspaceProfile } from '@/lib/workspace/serialization';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Settings',
};

export default async function SettingsPage() {
  const viewer = await requireMemberPage();
  const workspaceId = viewer.membership.workspaceId;
  const role = viewer.membership.role;
  const permissions = permissionsFor(role);
  const canManageInvitations = permissions.includes('members.invite');

  const [members, invitations] = await Promise.all([
    listMembers(workspaceId),
    canManageInvitations
      ? listInvitations(workspaceId)
      : Promise.resolve([]),
  ]);

  return (
    <SettingsView
      workspace={toWorkspaceProfile(viewer.workspace)}
      viewer={{
        id: viewer.user.id,
        email: viewer.user.email || null,
        role,
      }}
      members={members.map((member) => ({
        id: member.id,
        userId: member.userId,
        name: member.name || null,
        email: member.email,
        role: member.role,
        createdAt: member.createdAt,
      }))}
      invitations={invitations.map((invitation) => ({
        id: invitation.id,
        email: invitation.email,
        role: invitation.role,
        status: invitation.status,
        expiresAt: invitation.expiresAt,
        acceptedAt: invitation.acceptedAt,
        createdAt: invitation.createdAt,
      }))}
      permissions={permissions}
      assignableRoles={assignableRoles(role)}
    />
  );
}
