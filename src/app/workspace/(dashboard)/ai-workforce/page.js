import AiWorkforceView from '@/components/workspace/ai/AiWorkforceView';
import { requirePermissionPage } from '@/lib/auth/authorization';
import { hasPermission } from '@/lib/auth/permissions';
import { getAiOverview, listAgents } from '@/lib/ai/runtime';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'AI workforce',
};

export default async function AiWorkforcePage() {
  const viewer = await requirePermissionPage('agents.view');
  const workspaceId = viewer.membership.workspaceId;

  const [agents, overview] = await Promise.all([
    listAgents(workspaceId),
    getAiOverview(workspaceId),
  ]);

  const role = viewer.membership.role;

  return (
    <AiWorkforceView
      agents={agents}
      overview={overview}
      canManage={hasPermission(role, 'agents.manage')}
      canRun={hasPermission(role, 'agents.run')}
      timezone={viewer.workspace.timezone || 'UTC'}
    />
  );
}
