import { errorResponse, jsonOk, validateBody } from '@/lib/api';
import { requirePermission } from '@/lib/auth/authorization';
import { searchKnowledge } from '@/lib/knowledge/retrieval';
import { knowledgeSearchSchema } from '@/lib/knowledge/validation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request) {
  try {
    const viewer = await requirePermission('knowledge.view');
    const search = Object.fromEntries(new URL(request.url).searchParams);
    const query = await validateBody(knowledgeSearchSchema, search);
    const result = await searchKnowledge({
      workspaceId: viewer.membership.workspaceId,
      role: viewer.membership.role,
      query: query.q,
      categories:
        query.category && query.category !== 'any' ? [query.category] : undefined,
      clientId: query.clientId || null,
      projectId: query.projectId || null,
      includeChunks: query.includeChunks,
      limit: query.limit,
    });
    return jsonOk({ ...result, query: query.q });
  } catch (error) {
    return errorResponse(error);
  }
}
