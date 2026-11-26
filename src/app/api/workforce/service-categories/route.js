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
import { createCategory } from '@/lib/service-catalogue/service';
import { categoryCreateSchema } from '@/lib/service-catalogue/validation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request) {
  try {
    assertSameOrigin(request);
    const viewer = await requirePermission('services.manage');

    const limit = rateLimit(`service-category-create:${viewer.user.id}`, {
      limit: 20,
      windowMs: 60 * 1000,
    });
    if (!limit.ok) {
      throw new ApiError(
        429,
        'RATE_LIMITED',
        'Too many catalogue changes in a short period. Try again shortly.',
      );
    }

    const body = await readJsonBody(request);
    const data = await validateBody(categoryCreateSchema, body);

    const category = await createCategory({
      workspaceId: viewer.membership.workspaceId,
      userId: viewer.user.id,
      data,
    });

    return jsonOk({ category }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
