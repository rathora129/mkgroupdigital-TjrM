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
import { createContact } from '@/lib/clients/service';
import { contactCreateSchema, isUuid } from '@/lib/clients/validation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const NOT_FOUND = 'That client could not be found.';

export async function POST(request, { params }) {
  try {
    assertSameOrigin(request);
    const viewer = await requirePermission('clients.update');
    const { clientId } = await params;
    if (!isUuid(clientId)) throw new ApiError(404, 'NOT_FOUND', NOT_FOUND);

    const limit = rateLimit(`client-contact:${viewer.user.id}`, {
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
    const data = await validateBody(contactCreateSchema, body);
    const result = await createContact({
      workspaceId: viewer.membership.workspaceId,
      userId: viewer.user.id,
      clientId,
      data,
    });
    return jsonOk(result, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
