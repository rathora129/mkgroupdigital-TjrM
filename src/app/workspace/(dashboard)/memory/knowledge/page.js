import KnowledgeListView from '@/components/workspace/knowledge/KnowledgeListView';
import { requirePermissionPage } from '@/lib/auth/authorization';
import { hasPermission } from '@/lib/auth/permissions';
import { listKnowledge } from '@/lib/knowledge/service';
import { knowledgeQuerySchema } from '@/lib/knowledge/validation';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Knowledge base',
};

async function parseQuery(params) {
  try {
    return await knowledgeQuerySchema.validate(params, {
      abortEarly: false,
      stripUnknown: true,
    });
  } catch {
    return knowledgeQuerySchema.validate({});
  }
}

export default async function KnowledgePage({ searchParams }) {
  const viewer = await requirePermissionPage('knowledge.view');
  const params = (await searchParams) || {};
  const query = await parseQuery(params);
  const result = await listKnowledge(viewer.membership.workspaceId, query);

  return (
    <KnowledgeListView
      result={result}
      query={query}
      canCreate={hasPermission(viewer.membership.role, 'knowledge.create')}
      timezone={viewer.workspace.timezone || 'UTC'}
    />
  );
}
