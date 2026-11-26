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
import { createService, listCatalogue } from '@/lib/service-catalogue/service';
import { serviceCreateSchema } from '@/lib/service-catalogue/validation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request) {
  try {
    const viewer = await requirePermission('services.view');
    const search = new URL(request.url).searchParams;
    const includeArchived = search.get('archived') === 'all';
    const catalogue = await listCatalogue(viewer.membership.workspaceId, {
      includeArchived,
    });
    return jsonOk(catalogue);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request) {
  try {
    assertSameOrigin(request);
    const viewer = await requirePermission('services.manage');

    const limit = rateLimit(`service-create:${viewer.user.id}`, {
      limit: 30,
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
    const data = await validateBody(serviceCreateSchema, body);

    const service = await createService({
      workspaceId: viewer.membership.workspaceId,
      userId: viewer.user.id,
      data,
    });

    return jsonOk({ service }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
