import { notFound } from 'next/navigation';
import KnowledgeDetailView from '@/components/workspace/knowledge/KnowledgeDetailView';
import { requirePermissionPage } from '@/lib/auth/authorization';
import { hasPermission } from '@/lib/auth/permissions';
import {
  getKnowledgeEntry,
  getKnowledgeScopeOptions,
  listKnowledgeVersions,
} from '@/lib/knowledge/service';
import { isUuid } from '@/lib/knowledge/validation';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Knowledge entry',
};

export default async function KnowledgeEntryPage({ params }) {
  const viewer = await requirePermissionPage('knowledge.view');
  const { entryId } = await params;
  if (!isUuid(entryId)) notFound();

  const workspaceId = viewer.membership.workspaceId;
  const detail = await getKnowledgeEntry(workspaceId, entryId);
  if (!detail) notFound();

  const [versions, scopeOptions] = await Promise.all([
    listKnowledgeVersions(workspaceId, entryId, { page: 1, pageSize: 50 }),
    getKnowledgeScopeOptions(workspaceId),
  ]);

  return (
    <KnowledgeDetailView
      detail={detail}
      versions={versions}
      scopeOptions={scopeOptions}
      canUpdate={hasPermission(viewer.membership.role, 'knowledge.update')}
      canArchive={hasPermission(viewer.membership.role, 'knowledge.archive')}
      timezone={viewer.workspace.timezone || 'UTC'}
    />
  );
}
