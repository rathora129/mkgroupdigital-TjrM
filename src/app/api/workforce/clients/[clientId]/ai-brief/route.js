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
import { requestClientAiBrief } from '@/lib/clients/service';
import { clientAiBriefSchema, isUuid } from '@/lib/clients/validation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const NOT_FOUND = 'That client could not be found.';

export async function POST(request, { params }) {
  try {
    assertSameOrigin(request);
    const viewer = await requirePermission('clients.view');
    await requirePermission('agents.run');
    const { clientId } = await params;
    if (!isUuid(clientId)) throw new ApiError(404, 'NOT_FOUND', NOT_FOUND);

    const limit = rateLimit(`client-ai-brief:${viewer.user.id}`, {
      limit: 10,
      windowMs: 60 * 60 * 1000,
    });
    if (!limit.ok) {
      throw new ApiError(
        429,
        'RATE_LIMITED',
        'Too many AI requests in a short period. Try again later.',
      );
    }

    const body = await readJsonBody(request);
    const data = await validateBody(clientAiBriefSchema, body);
    const result = await requestClientAiBrief({
      workspaceId: viewer.membership.workspaceId,
      userId: viewer.user.id,
      clientId,
      instruction: data.instruction || null,
    });
    if (!result) throw new ApiError(404, 'NOT_FOUND', NOT_FOUND);
    return jsonOk(result, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
