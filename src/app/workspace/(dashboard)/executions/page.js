import ExecutionsView from '@/components/workspace/operations/ExecutionsView';
import { requirePermissionPage } from '@/lib/auth/authorization';
import { hasPermission } from '@/lib/auth/permissions';
import { listClientOptions } from '@/lib/clients/service';
import { listExecutions } from '@/lib/integrations/execution';
import { listIntegrations } from '@/lib/integrations/service';
import { listProjects } from '@/lib/projects/service';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Executions',
};

export default async function ExecutionsPage() {
  const viewer = await requirePermissionPage('executions.view');
  const workspaceId = viewer.membership.workspaceId;
  const role = viewer.membership.role;

  const [executions, clients, projects, integrations] = await Promise.all([
    listExecutions(workspaceId, { page: 1, pageSize: 50 }),
    listClientOptions(workspaceId),
    listProjects(workspaceId, viewer.user.id, {
      page: 1,
      pageSize: 100,
      sort: 'created',
      direction: 'desc',
    }),
    listIntegrations(workspaceId),
  ]);

  return (
    <ExecutionsView
      executions={executions}
      clients={clients}
      projects={projects.items.map((project) => ({ id: project.id, name: project.name }))}
      integrations={integrations.integrations
        .filter((row) => row.id && row.configured)
        .map((row) => ({ id: row.id, name: row.name, provider: row.provider }))}
      capabilities={{
        canRequest: hasPermission(role, 'executions.request'),
        canApprove: hasPermission(role, 'executions.approve'),
        canExecute: hasPermission(role, 'executions.execute'),
      }}
      timezone={viewer.workspace.timezone || 'UTC'}
    />
  );
}
