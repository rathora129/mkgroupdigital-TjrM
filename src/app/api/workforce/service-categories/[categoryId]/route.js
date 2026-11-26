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
import { updateCategory } from '@/lib/service-catalogue/service';
import {
  categoryUpdateSchema,
  isUuid,
} from '@/lib/service-catalogue/validation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function PATCH(request, { params }) {
  try {
    assertSameOrigin(request);
    const viewer = await requirePermission('services.manage');
    const { categoryId } = await params;
    if (!isUuid(categoryId)) {
      throw new ApiError(404, 'NOT_FOUND', 'That category could not be found.');
    }

    const limit = rateLimit(`service-category-update:${viewer.user.id}`, {
      limit: 60,
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
    const data = await validateBody(categoryUpdateSchema, body);

    const category = await updateCategory({
      workspaceId: viewer.membership.workspaceId,
      userId: viewer.user.id,
      categoryId,
      data,
    });
    if (!category) {
      throw new ApiError(404, 'NOT_FOUND', 'That category could not be found.');
    }

    return jsonOk({ category });
  } catch (error) {
    return errorResponse(error);
  }
}
