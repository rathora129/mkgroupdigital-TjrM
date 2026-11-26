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
import { createContentItem, listContent } from '@/lib/marketing/content';
import { contentCreateSchema, contentQuerySchema } from '@/lib/marketing/validation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request) {
  try {
    const viewer = await requirePermission('marketing.view');
    const search = Object.fromEntries(new URL(request.url).searchParams);
    const query = await validateBody(contentQuerySchema, search);
    const result = await listContent(
      viewer.membership.workspaceId,
      viewer.user.id,
      query,
    );
    return jsonOk(result);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request) {
  try {
    assertSameOrigin(request);
    const viewer = await requirePermission('marketing.manage');

    const limit = rateLimit(`marketing-content-create:${viewer.user.id}`, {
      limit: 60,
      windowMs: 60 * 1000,
    });
    if (!limit.ok) {
      throw new ApiError(
        429,
        'RATE_LIMITED',
        'Too many content items created in a short period. Try again shortly.',
      );
    }

    const body = await readJsonBody(request);
    const data = await validateBody(contentCreateSchema, body);
    const result = await createContentItem({
      workspaceId: viewer.membership.workspaceId,
      userId: viewer.user.id,
      data,
    });
    return jsonOk(result, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
