import {
  ApiError,
  assertSameOrigin,
  errorResponse,
  jsonOk,
  readJsonBody,
  validateBody,
} from '@/lib/api';
import { requirePermission } from '@/lib/auth/authorization';
import { rateLimit } from '@/lib/rate-limit';
import { requestOpportunityAiDraft } from '@/lib/opportunities/service';
import {
  isUuid,
  opportunityAiDraftSchema,
} from '@/lib/opportunities/validation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request, { params }) {
  try {
    assertSameOrigin(request);
    const viewer = await requirePermission('opportunities.update');
    await requirePermission('agents.run');
    const { opportunityId } = await params;
    if (!isUuid(opportunityId)) {
      throw new ApiError(404, 'NOT_FOUND', 'That opportunity could not be found.');
    }

    const limit = rateLimit(`opportunity-ai-draft:${viewer.user.id}`, {
      limit: 10,
      windowMs: 60 * 60 * 1000,
    });
    if (!limit.ok) {
      throw new ApiError(
        429,
        'RATE_LIMITED',
        'Too many AI draft requests in a short period. Try again later.',
      );
    }

    const body = await readJsonBody(request);
    const data = await validateBody(opportunityAiDraftSchema, body);

    const result = await requestOpportunityAiDraft({
      workspaceId: viewer.membership.workspaceId,
      userId: viewer.user.id,
      opportunityId,
      instruction: data.instruction || null,
    });
    if (!result) {
      throw new ApiError(404, 'NOT_FOUND', 'That opportunity could not be found.');
    }

    return jsonOk(result, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
