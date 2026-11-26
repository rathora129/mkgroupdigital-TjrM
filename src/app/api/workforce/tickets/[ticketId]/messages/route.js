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
import { addTicketMessage } from '@/lib/clients/tickets';
import { isUuid, ticketMessageSchema } from '@/lib/clients/validation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const NOT_FOUND = 'That ticket could not be found.';

export async function POST(request, { params }) {
  try {
    assertSameOrigin(request);
    const viewer = await requirePermission('tickets.update');
    const { ticketId } = await params;
    if (!isUuid(ticketId)) throw new ApiError(404, 'NOT_FOUND', NOT_FOUND);

    const limit = rateLimit(`ticket-message:${viewer.user.id}`, {
      limit: 90,
      windowMs: 60 * 1000,
    });
    if (!limit.ok) {
      throw new ApiError(
        429,
        'RATE_LIMITED',
        'Too many messages in a short period. Try again shortly.',
      );
    }

    const body = await readJsonBody(request);
    const data = await validateBody(ticketMessageSchema, body);
    const result = await addTicketMessage({
      workspaceId: viewer.membership.workspaceId,
      userId: viewer.user.id,
      ticketId,
      data,
    });
    if (!result) throw new ApiError(404, 'NOT_FOUND', NOT_FOUND);
    return jsonOk(result, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
