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
import { changeOpportunityStage } from '@/lib/opportunities/service';
import {
  isUuid,
  opportunityStageSchema,
} from '@/lib/opportunities/validation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request, { params }) {
  try {
    assertSameOrigin(request);
    const viewer = await requirePermission('opportunities.update');
    const { opportunityId } = await params;
    if (!isUuid(opportunityId)) {
      throw new ApiError(
        404,
        'NOT_FOUND',
        'That opportunity could not be found.',
      );
    }

    const limit = rateLimit(`opportunity-stage:${viewer.user.id}`, {
      limit: 60,
      windowMs: 60 * 1000,
    });
    if (!limit.ok) {
      throw new ApiError(
        429,
        'RATE_LIMITED',
        'Too many stage changes in a short period. Try again shortly.',
      );
    }

    const body = await readJsonBody(request);
    const data = await validateBody(opportunityStageSchema, body);

    if (data.stage === 'won' || data.stage === 'lost') {
      await requirePermission('opportunities.close');
    }

    const result = await changeOpportunityStage({
      workspaceId: viewer.membership.workspaceId,
      userId: viewer.user.id,
      opportunityId,
      stage: data.stage,
      note: data.note || null,
      lostReason: data.lostReason || null,
    });
    if (!result) {
      throw new ApiError(
        404,
        'NOT_FOUND',
        'That opportunity could not be found.',
      );
    }

    return jsonOk(result);
  } catch (error) {
    return errorResponse(error);
  }
}
