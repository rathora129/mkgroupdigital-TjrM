import ProjectCreateView from '@/components/workspace/projects/ProjectCreateView';
import { requirePermissionPage } from '@/lib/auth/authorization';
import { listAcceptedProposalOptions } from '@/lib/projects/service';
import { listMembers } from '@/lib/workspace/service';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'New project',
};

export default async function NewProjectPage() {
  const viewer = await requirePermissionPage('projects.create');
  const workspaceId = viewer.membership.workspaceId;

  const [options, members] = await Promise.all([
    listAcceptedProposalOptions(workspaceId),
    listMembers(workspaceId),
  ]);

  return (
    <ProjectCreateView
      options={options}
      members={members.map((member) => ({
        userId: member.userId,
        name: member.name,
        email: member.email,
      }))}
    />
  );
}
