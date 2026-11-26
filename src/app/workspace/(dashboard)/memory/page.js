import KnowledgeOverviewView from '@/components/workspace/knowledge/KnowledgeOverviewView';
import { requirePermissionPage } from '@/lib/auth/authorization';
import { hasPermission } from '@/lib/auth/permissions';
import { getKnowledgeOverview } from '@/lib/knowledge/service';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Memory & Knowledge',
};

export default async function MemoryPage() {
  const viewer = await requirePermissionPage('knowledge.view');
  const role = viewer.membership.role;
  const overview = await getKnowledgeOverview(viewer.membership.workspaceId);

  return (
    <KnowledgeOverviewView
      overview={overview}
      timezone={viewer.workspace.timezone || 'UTC'}
      canCreate={hasPermission(role, 'knowledge.create')}
      canManageDocuments={hasPermission(role, 'knowledge.manage_documents')}
      canCreateMemories={hasPermission(role, 'memories.create')}
    />
  );
}
