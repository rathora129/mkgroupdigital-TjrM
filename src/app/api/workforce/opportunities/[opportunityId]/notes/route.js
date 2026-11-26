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
import { addOpportunityNote } from '@/lib/opportunities/service';
import {
  isUuid,
  opportunityNoteSchema,
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

    const limit = rateLimit(`opportunity-note:${viewer.user.id}`, {
      limit: 60,
      windowMs: 60 * 1000,
    });
    if (!limit.ok) {
      throw new ApiError(
        429,
        'RATE_LIMITED',
        'Too many notes in a short period. Try again shortly.',
      );
    }

    const body = await readJsonBody(request);
    const data = await validateBody(opportunityNoteSchema, body);

    const note = await addOpportunityNote({
      workspaceId: viewer.membership.workspaceId,
      userId: viewer.user.id,
      opportunityId,
      body: data.body,
    });
    if (!note) {
      throw new ApiError(
        404,
        'NOT_FOUND',
        'That opportunity could not be found.',
      );
    }

    return jsonOk(note, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
