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
import {
  createEngagement,
  listEngagements,
} from '@/lib/clients/engagements';
import {
  engagementCreateSchema,
  engagementQuerySchema,
} from '@/lib/clients/validation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request) {
  try {
    const viewer = await requirePermission('clients.view');
    const search = Object.fromEntries(new URL(request.url).searchParams);
    const query = await validateBody(engagementQuerySchema, search);
    const result = await listEngagements(viewer.membership.workspaceId, query);
    return jsonOk(result);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request) {
  try {
    assertSameOrigin(request);
    const viewer = await requirePermission('clients.create');

    const limit = rateLimit(`engagement-create:${viewer.user.id}`, {
      limit: 30,
      windowMs: 60 * 1000,
    });
    if (!limit.ok) {
      throw new ApiError(
        429,
        'RATE_LIMITED',
        'Too many engagements created in a short period. Try again shortly.',
      );
    }

    const body = await readJsonBody(request);
    const data = await validateBody(engagementCreateSchema, body);
    const result = await createEngagement({
      workspaceId: viewer.membership.workspaceId,
      userId: viewer.user.id,
      data,
    });
    return jsonOk(result, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
