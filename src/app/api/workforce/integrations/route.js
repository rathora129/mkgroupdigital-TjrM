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
  listIntegrations,
  registerIntegration,
} from '@/lib/integrations/service';
import {
  integrationCreateSchema,
  integrationListQuerySchema,
} from '@/lib/integrations/validation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request) {
  try {
    const viewer = await requirePermission('integrations.view');
    const search = Object.fromEntries(new URL(request.url).searchParams);
    const query = await validateBody(integrationListQuerySchema, search);
    const result = await listIntegrations(viewer.membership.workspaceId, {
      kind: query.kind || undefined,
      status: query.status || undefined,
    });
    return jsonOk(result);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request) {
  try {
    assertSameOrigin(request);
    const viewer = await requirePermission('integrations.manage');

    const limit = rateLimit(`integration-register:${viewer.user.id}`, {
      limit: 30,
      windowMs: 60 * 1000,
    });
    if (!limit.ok) {
      throw new ApiError(
        429,
        'RATE_LIMITED',
        'Too many integration changes in a short period. Try again shortly.',
      );
    }

    const body = await readJsonBody(request);
    const data = await validateBody(integrationCreateSchema, body);
    const result = await registerIntegration({
      workspaceId: viewer.membership.workspaceId,
      userId: viewer.user.id,
      kind: data.kind,
      provider: data.provider,
      name: data.name || null,
    });
    return jsonOk(result, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
