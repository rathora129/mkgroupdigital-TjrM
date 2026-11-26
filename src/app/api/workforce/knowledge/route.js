import {
  ApiError,
  assertSameOrigin,
  errorResponse,
  jsonOk,
  readJsonBody,
  validateBody,
} from '@/lib/api';
import { requirePermission } from '@/lib/auth/authorization';
import { createKnowledgeEntry, listKnowledge } from '@/lib/knowledge/service';
import {
  knowledgeEntryCreateSchema,
  knowledgeQuerySchema,
} from '@/lib/knowledge/validation';
import { rateLimit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request) {
  try {
    const viewer = await requirePermission('knowledge.view');
    const search = Object.fromEntries(new URL(request.url).searchParams);
    const query = await validateBody(knowledgeQuerySchema, search);
    const result = await listKnowledge(viewer.membership.workspaceId, query);
    return jsonOk(result);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request) {
  try {
    assertSameOrigin(request);
    const viewer = await requirePermission('knowledge.create');

    const limit = rateLimit(`knowledge-create:${viewer.user.id}`, {
      limit: 30,
      windowMs: 60 * 1000,
    });
    if (!limit.ok) {
      throw new ApiError(
        429,
        'RATE_LIMITED',
        'Too many knowledge entries saved in a short period. Try again shortly.',
      );
    }

    const body = await readJsonBody(request);
    const data = await validateBody(knowledgeEntryCreateSchema, body);
    const result = await createKnowledgeEntry({
      workspaceId: viewer.membership.workspaceId,
      userId: viewer.user.id,
      data,
    });
    return jsonOk(result, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
