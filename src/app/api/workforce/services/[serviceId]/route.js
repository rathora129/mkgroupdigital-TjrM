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
import { updateService } from '@/lib/service-catalogue/service';
import {
  isUuid,
  serviceUpdateSchema,
} from '@/lib/service-catalogue/validation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function PATCH(request, { params }) {
  try {
    assertSameOrigin(request);
    const viewer = await requirePermission('services.manage');
    const { serviceId } = await params;
    if (!isUuid(serviceId)) {
      throw new ApiError(404, 'NOT_FOUND', 'That service could not be found.');
    }

    const limit = rateLimit(`service-update:${viewer.user.id}`, {
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
    const data = await validateBody(serviceUpdateSchema, body);

    const service = await updateService({
      workspaceId: viewer.membership.workspaceId,
      userId: viewer.user.id,
      serviceId,
      data,
    });
    if (!service) {
      throw new ApiError(404, 'NOT_FOUND', 'That service could not be found.');
    }

    return jsonOk({ service });
  } catch (error) {
    return errorResponse(error);
  }
}
