import { notFound } from 'next/navigation';
import DocumentDetailView from '@/components/workspace/knowledge/DocumentDetailView';
import { requirePermissionPage } from '@/lib/auth/authorization';
import { hasPermission } from '@/lib/auth/permissions';
import { getDocument } from '@/lib/knowledge/documents';
import { isUuid } from '@/lib/knowledge/validation';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Knowledge document',
};

export default async function DocumentPage({ params }) {
  const viewer = await requirePermissionPage('knowledge.view');
  const { documentId } = await params;
  if (!isUuid(documentId)) notFound();

  const detail = await getDocument(
    viewer.membership.workspaceId,
    documentId,
  );
  if (!detail) notFound();

  return (
    <DocumentDetailView
      detail={detail}
      canManage={hasPermission(
        viewer.membership.role,
        'knowledge.manage_documents',
      )}
      timezone={viewer.workspace.timezone || 'UTC'}
    />
  );
}
