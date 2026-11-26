import { notFound } from 'next/navigation';
import MemoryDetailView from '@/components/workspace/knowledge/MemoryDetailView';
import { requirePermissionPage } from '@/lib/auth/authorization';
import { hasPermission } from '@/lib/auth/permissions';
import { getMemory, listMemoryVersions } from '@/lib/knowledge/memory';
import { isUuid } from '@/lib/knowledge/validation';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'AI memory',
};

export default async function MemoryPage({ params }) {
  const viewer = await requirePermissionPage('memories.view');
  const { memoryId } = await params;
  if (!isUuid(memoryId)) notFound();

  const workspaceId = viewer.membership.workspaceId;
  const detail = await getMemory(workspaceId, memoryId);
  if (!detail) notFound();

  const versions = await listMemoryVersions(workspaceId, memoryId, {
    page: 1,
    pageSize: 50,
  });

  return (
    <MemoryDetailView
      detail={detail}
      versions={versions}
      scopeOptions={{ clients: [], projects: [], agents: [] }}
      canUpdate={hasPermission(viewer.membership.role, 'memories.update')}
      timezone={viewer.workspace.timezone || 'UTC'}
    />
  );
}
