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
import { getTicket, updateTicket } from '@/lib/clients/tickets';
import { isUuid, ticketUpdateSchema } from '@/lib/clients/validation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const NOT_FOUND = 'That ticket could not be found.';

export async function GET(request, { params }) {
  try {
    const viewer = await requirePermission('tickets.view');
    const { ticketId } = await params;
    if (!isUuid(ticketId)) throw new ApiError(404, 'NOT_FOUND', NOT_FOUND);

    const detail = await getTicket(viewer.membership.workspaceId, ticketId);
    if (!detail) throw new ApiError(404, 'NOT_FOUND', NOT_FOUND);
    return jsonOk(detail);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request, { params }) {
  try {
    assertSameOrigin(request);
    const viewer = await requirePermission('tickets.update');
    const { ticketId } = await params;
    if (!isUuid(ticketId)) throw new ApiError(404, 'NOT_FOUND', NOT_FOUND);

    const limit = rateLimit(`ticket-update:${viewer.user.id}`, {
      limit: 90,
      windowMs: 60 * 1000,
    });
    if (!limit.ok) {
      throw new ApiError(
        429,
        'RATE_LIMITED',
        'Too many ticket updates in a short period. Try again shortly.',
      );
    }

    const body = await readJsonBody(request);
    const data = await validateBody(ticketUpdateSchema, body);
    const result = await updateTicket({
      workspaceId: viewer.membership.workspaceId,
      userId: viewer.user.id,
      ticketId,
      data,
    });
    if (!result) throw new ApiError(404, 'NOT_FOUND', NOT_FOUND);
    return jsonOk(result);
  } catch (error) {
    return errorResponse(error);
  }
}
