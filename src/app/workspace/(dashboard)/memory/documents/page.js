import DocumentsView from '@/components/workspace/knowledge/DocumentsView';
import { requirePermissionPage } from '@/lib/auth/authorization';
import { hasPermission } from '@/lib/auth/permissions';
import { listDocuments } from '@/lib/knowledge/documents';
import { getKnowledgeScopeOptions } from '@/lib/knowledge/service';
import { documentQuerySchema } from '@/lib/knowledge/validation';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Knowledge documents',
};

async function parseQuery(params) {
  try {
    return await documentQuerySchema.validate(params, {
      abortEarly: false,
      stripUnknown: true,
    });
  } catch {
    return documentQuerySchema.validate({});
  }
}

export default async function DocumentsPage({ searchParams }) {
  const viewer = await requirePermissionPage('knowledge.view');
  const params = (await searchParams) || {};
  const query = await parseQuery(params);
  const workspaceId = viewer.membership.workspaceId;

  const [result, scopeOptions] = await Promise.all([
    listDocuments(workspaceId, query),
    getKnowledgeScopeOptions(workspaceId),
  ]);

  return (
    <DocumentsView
      result={result}
      query={query}
      scopeOptions={scopeOptions}
      canManage={hasPermission(
        viewer.membership.role,
        'knowledge.manage_documents',
      )}
      timezone={viewer.workspace.timezone || 'UTC'}
    />
  );
}
