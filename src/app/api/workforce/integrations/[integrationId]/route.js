import {
  ApiError,
  assertSameOrigin,
  errorResponse,
  jsonOk,
  readJsonBody,
  validateBody,
} from '@/lib/api';
import { requirePermission } from '@/lib/auth/authorization';
import { getIntegration, updateIntegration } from '@/lib/integrations/service';
import { integrationUpdateSchema, isUuid } from '@/lib/integrations/validation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const NOT_FOUND = 'That integration could not be found.';

export async function GET(request, { params }) {
  try {
    const viewer = await requirePermission('integrations.view');
    const { integrationId } = await params;
    if (!isUuid(integrationId)) throw new ApiError(404, 'NOT_FOUND', NOT_FOUND);
    const result = await getIntegration(viewer.membership.workspaceId, integrationId);
    return jsonOk(result);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request, { params }) {
  try {
    assertSameOrigin(request);
    const viewer = await requirePermission('integrations.manage');
    const { integrationId } = await params;
    if (!isUuid(integrationId)) throw new ApiError(404, 'NOT_FOUND', NOT_FOUND);

    const body = await readJsonBody(request);
    const data = await validateBody(integrationUpdateSchema, body);
    const result = await updateIntegration({
      workspaceId: viewer.membership.workspaceId,
      userId: viewer.user.id,
      integrationId,
      values: data,
    });
    return jsonOk(result);
  } catch (error) {
    return errorResponse(error);
  }
}
