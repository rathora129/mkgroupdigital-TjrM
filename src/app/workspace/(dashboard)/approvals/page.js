import ApprovalsView from '@/components/workspace/ai/ApprovalsView';
import { requirePermissionPage } from '@/lib/auth/authorization';
import { listApprovals } from '@/lib/ai/runtime';
import { listProviderMetadata } from '@/lib/ai/registry';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Approvals',
};

export default async function ApprovalsPage() {
  const viewer = await requirePermissionPage('approvals.review');
  const workspaceId = viewer.membership.workspaceId;

  const [pending, approved, rejected, cancelled] = await Promise.all([
    listApprovals(workspaceId, { status: 'pending', pageSize: 50 }),
    listApprovals(workspaceId, { status: 'approved', pageSize: 10 }),
    listApprovals(workspaceId, { status: 'rejected', pageSize: 10 }),
    listApprovals(workspaceId, { status: 'cancelled', pageSize: 10 }),
  ]);

  const history = [...approved.items, ...rejected.items, ...cancelled.items]
    .sort((a, b) => {
      const left = a.decidedAt ? new Date(a.decidedAt).getTime() : 0;
      const right = b.decidedAt ? new Date(b.decidedAt).getTime() : 0;
      return right - left;
    })
    .slice(0, 15);

  const runtimeConfigured = listProviderMetadata().some(
    (provider) => provider.configured,
  );

  return (
    <ApprovalsView
      pending={pending.items}
      history={history}
      runtimeConfigured={runtimeConfigured}
      timezone={viewer.workspace.timezone || 'UTC'}
    />
  );
}
