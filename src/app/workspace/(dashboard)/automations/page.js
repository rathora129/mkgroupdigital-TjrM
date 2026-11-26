import AutomationsView from '@/components/workspace/operations/AutomationsView';
import { requirePermissionPage } from '@/lib/auth/authorization';
import { hasPermission } from '@/lib/auth/permissions';
import { listWorkflowDefinitions, listWorkflowRuns } from '@/lib/automation/service';
import { listClientOptions } from '@/lib/clients/service';
import { listProjects } from '@/lib/projects/service';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Automations',
};

export default async function AutomationsPage() {
  const viewer = await requirePermissionPage('automations.view');
  const workspaceId = viewer.membership.workspaceId;

  const [runs, clients, projects] = await Promise.all([
    listWorkflowRuns(workspaceId, { page: 1, pageSize: 50 }),
    listClientOptions(workspaceId),
    listProjects(workspaceId, viewer.user.id, {
      page: 1,
      pageSize: 100,
      sort: 'created',
      direction: 'desc',
    }),
  ]);

  return (
    <AutomationsView
      runs={runs}
      definitions={listWorkflowDefinitions()}
      clients={clients}
      projects={projects.items.map((project) => ({ id: project.id, name: project.name }))}
      canManage={hasPermission(viewer.membership.role, 'automations.manage')}
      timezone={viewer.workspace.timezone || 'UTC'}
    />
  );
}
