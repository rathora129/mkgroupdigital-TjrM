import {
  ApiError,
  assertSameOrigin,
  errorResponse,
  jsonOk,
  readJsonBody,
  validateBody,
} from '@/lib/api';
import { requirePermission } from '@/lib/auth/authorization';
import { getProviderDefinition } from '@/lib/ai/registry';
import { updateProviderSetting } from '@/lib/ai/runtime';
import { providerPatchSchema } from '@/lib/ai/validation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function PATCH(request, { params }) {
  try {
    assertSameOrigin(request);
    const viewer = await requirePermission('agents.manage');
    const { provider } = await params;

    if (!getProviderDefinition(provider)) {
      throw new ApiError(404, 'NOT_FOUND', 'That AI provider is not supported.');
    }

    const body = await readJsonBody(request);
    const changes = await validateBody(providerPatchSchema, body);

    const setting = await updateProviderSetting({
      workspaceId: viewer.membership.workspaceId,
      provider,
      userId: viewer.user.id,
      changes,
    });

    return jsonOk({ setting });
  } catch (error) {
    return errorResponse(error);
  }
}
