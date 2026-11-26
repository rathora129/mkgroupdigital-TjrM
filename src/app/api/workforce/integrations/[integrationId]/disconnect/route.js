import { ApiError, assertSameOrigin, errorResponse, jsonOk } from '@/lib/api';
import { requirePermission } from '@/lib/auth/authorization';
import { disconnectIntegration } from '@/lib/integrations/service';
import { isUuid } from '@/lib/integrations/validation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request, { params }) {
  try {
    assertSameOrigin(request);
    const viewer = await requirePermission('integrations.manage');
    const { integrationId } = await params;
    if (!isUuid(integrationId)) {
      throw new ApiError(404, 'NOT_FOUND', 'That integration could not be found.');
    }
    const result = await disconnectIntegration({
      workspaceId: viewer.membership.workspaceId,
      userId: viewer.user.id,
      integrationId,
    });
    return jsonOk(result);
  } catch (error) {
    return errorResponse(error);
  }
}
