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
import { updateContact } from '@/lib/clients/service';
import { contactUpdateSchema, isUuid } from '@/lib/clients/validation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const NOT_FOUND = 'That contact could not be found.';

export async function PATCH(request, { params }) {
  try {
    assertSameOrigin(request);
    const viewer = await requirePermission('clients.update');
    const { clientId, contactId } = await params;
    if (!isUuid(clientId) || !isUuid(contactId)) {
      throw new ApiError(404, 'NOT_FOUND', NOT_FOUND);
    }

    const limit = rateLimit(`client-contact-update:${viewer.user.id}`, {
      limit: 40,
      windowMs: 60 * 1000,
    });
    if (!limit.ok) {
      throw new ApiError(
        429,
        'RATE_LIMITED',
        'Too many contact changes in a short period. Try again shortly.',
      );
    }

    const body = await readJsonBody(request);
    const data = await validateBody(contactUpdateSchema, body);
    const result = await updateContact({
      workspaceId: viewer.membership.workspaceId,
      userId: viewer.user.id,
      clientId,
      contactId,
      data,
    });
    return jsonOk(result);
  } catch (error) {
    return errorResponse(error);
  }
}
