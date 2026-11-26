import {
  ApiError,
  assertSameOrigin,
  errorResponse,
  jsonOk,
  readJsonBody,
  validateBody,
} from '@/lib/api';
import { requirePermission } from '@/lib/auth/authorization';
import { addContentVersion } from '@/lib/marketing/content';
import { contentVersionSchema, isUuid } from '@/lib/marketing/validation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request, { params }) {
  try {
    assertSameOrigin(request);
    const viewer = await requirePermission('marketing.manage');
    const { contentId } = await params;
    if (!isUuid(contentId)) {
      throw new ApiError(404, 'NOT_FOUND', 'That content item could not be found.');
    }

    const body = await readJsonBody(request);
    const data = await validateBody(contentVersionSchema, body);
    const result = await addContentVersion({
      workspaceId: viewer.membership.workspaceId,
      userId: viewer.user.id,
      contentId,
      data,
    });
    return jsonOk(result);
  } catch (error) {
    return errorResponse(error);
  }
}
