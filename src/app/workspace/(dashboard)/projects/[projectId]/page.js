import { notFound } from 'next/navigation';
import ProjectDetailView from '@/components/workspace/projects/ProjectDetailView';
import { requirePermissionPage } from '@/lib/auth/authorization';
import { hasPermission } from '@/lib/auth/permissions';
import { getProject } from '@/lib/projects/service';
import { isUuid } from '@/lib/projects/validation';
import { listMembers } from '@/lib/workspace/service';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Project',
};

export default async function ProjectDetailPage({ params, searchParams }) {
  const viewer = await requirePermissionPage('projects.view');
  const { projectId } = await params;
  if (!isUuid(projectId)) notFound();

  const workspaceId = viewer.membership.workspaceId;
  const role = viewer.membership.role;

  const detail = await getProject(workspaceId, projectId);
  if (!detail) notFound();

  const members = await listMembers(workspaceId);
  const canEdit = hasPermission(role, 'projects.update');
  const search = (await searchParams) || {};

  if (!canEdit && detail.project) {
    detail.project.internalNotes = null;
  }

  return (
    <ProjectDetailView
      detail={detail}
      members={members.map((member) => ({
        userId: member.userId,
        name: member.name,
        email: member.email,
      }))}
      timezone={viewer.workspace.timezone || 'UTC'}
      permissions={{
        canEdit,
        canManage: hasPermission(role, 'projects.manage'),
      }}
      canRunAi={canEdit && hasPermission(role, 'agents.run')}
      initialTab={typeof search.tab === 'string' ? search.tab : 'overview'}
      initialTaskId={
        typeof search.task === 'string' && isUuid(search.task) ? search.task : null
      }
    />
  );
}
