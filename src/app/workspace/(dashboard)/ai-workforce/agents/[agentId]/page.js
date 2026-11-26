import { notFound } from 'next/navigation';
import AgentDetailView from '@/components/workspace/ai/AgentDetailView';
import { requirePermissionPage } from '@/lib/auth/authorization';
import { hasPermission } from '@/lib/auth/permissions';
import { getAgent, getAgentUsage, listRuns } from '@/lib/ai/runtime';
import { listProviderMetadata } from '@/lib/ai/registry';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Agent',
};

export default async function AgentDetailPage({ params }) {
  const viewer = await requirePermissionPage('agents.view');
  const { agentId } = await params;
  const workspaceId = viewer.membership.workspaceId;

  const agent = await getAgent(workspaceId, agentId);
  if (!agent) notFound();

  const [runs, usage, providers] = await Promise.all([
    listRuns(workspaceId, { agentId, pageSize: 10 }),
    getAgentUsage(workspaceId, agentId),
    Promise.resolve(listProviderMetadata()),
  ]);

  const role = viewer.membership.role;

  return (
    <AgentDetailView
      agent={agent}
      providers={providers}
      runs={runs.items}
      usage={usage}
      runtimeConfigured={providers.some((provider) => provider.configured)}
      canManage={hasPermission(role, 'agents.manage')}
      canRun={hasPermission(role, 'agents.run')}
      timezone={viewer.workspace.timezone || 'UTC'}
    />
  );
}
