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
import { requestTicketAiDraft } from '@/lib/clients/tickets';
import { isUuid, ticketAiDraftSchema } from '@/lib/clients/validation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const NOT_FOUND = 'That ticket could not be found.';

export async function POST(request, { params }) {
  try {
    assertSameOrigin(request);
    const viewer = await requirePermission('tickets.update');
    await requirePermission('agents.run');
    const { ticketId } = await params;
    if (!isUuid(ticketId)) throw new ApiError(404, 'NOT_FOUND', NOT_FOUND);

    const limit = rateLimit(`ticket-ai-draft:${viewer.user.id}`, {
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
    const data = await validateBody(ticketAiDraftSchema, body);
    const result = await requestTicketAiDraft({
      workspaceId: viewer.membership.workspaceId,
      userId: viewer.user.id,
      ticketId,
      instruction: data.instruction || null,
    });
    if (!result) throw new ApiError(404, 'NOT_FOUND', NOT_FOUND);
    return jsonOk(result, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
