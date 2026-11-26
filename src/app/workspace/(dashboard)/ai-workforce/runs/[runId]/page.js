import { notFound } from 'next/navigation';
import RunDetailView from '@/components/workspace/ai/RunDetailView';
import { requirePermissionPage } from '@/lib/auth/authorization';
import { hasPermission } from '@/lib/auth/permissions';
import { getRunDetail } from '@/lib/ai/runtime';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Run detail',
};

export default async function RunDetailPage({ params }) {
  const viewer = await requirePermissionPage('agents.view');
  const { runId } = await params;

  const detail = await getRunDetail(viewer.membership.workspaceId, runId);
  if (!detail) notFound();

  return (
    <RunDetailView
      detail={detail}
      canRun={hasPermission(viewer.membership.role, 'agents.run')}
      timezone={viewer.workspace.timezone || 'UTC'}
    />
  );
}
