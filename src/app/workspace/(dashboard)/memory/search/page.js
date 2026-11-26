import KnowledgeSearchView from '@/components/workspace/knowledge/KnowledgeSearchView';
import { requirePermissionPage } from '@/lib/auth/authorization';
import { getKnowledgeScopeOptions } from '@/lib/knowledge/service';
import { searchKnowledge } from '@/lib/knowledge/retrieval';
import { RETRIEVAL_LIMITS } from '@/lib/knowledge/constants';
import { isUuid } from '@/lib/knowledge/validation';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Search knowledge',
};

function pickUuid(value) {
  return isUuid(value) ? value : undefined;
}

export default async function KnowledgeSearchPage({ searchParams }) {
  const viewer = await requirePermissionPage('knowledge.view');
  const params = (await searchParams) || {};

  const rawQuery = String(params.q || '').trim();
  const q = rawQuery.slice(0, 200);
  const category = String(params.category || 'any');
  const query = {
    q,
    category: category === 'any' ? 'any' : category,
    clientId: pickUuid(params.clientId),
    projectId: pickUuid(params.projectId),
  };

  const canSearch = q.length >= 2;
  const [results, scopeOptions] = await Promise.all([
    canSearch
      ? searchKnowledge({
          workspaceId: viewer.membership.workspaceId,
          role: viewer.membership.role,
          query: q,
          categories: category !== 'any' ? [category] : undefined,
          clientId: query.clientId || null,
          projectId: query.projectId || null,
          limit: RETRIEVAL_LIMITS.defaultResults,
        })
      : null,
    getKnowledgeScopeOptions(viewer.membership.workspaceId),
  ]);

  return (
    <KnowledgeSearchView
      query={query}
      results={results}
      scopeOptions={scopeOptions}
    />
  );
}
