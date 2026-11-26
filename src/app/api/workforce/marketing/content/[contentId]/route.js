import {
  ApiError,
  assertSameOrigin,
  errorResponse,
  jsonOk,
  readJsonBody,
  validateBody,
} from '@/lib/api';
import { requirePermission } from '@/lib/auth/authorization';
import { getContentItem, updateContentMetadata } from '@/lib/marketing/content';
import { contentUpdateSchema, isUuid } from '@/lib/marketing/validation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const NOT_FOUND = 'That content item could not be found.';

export async function GET(request, { params }) {
  try {
    const viewer = await requirePermission('marketing.view');
    const { contentId } = await params;
    if (!isUuid(contentId)) throw new ApiError(404, 'NOT_FOUND', NOT_FOUND);
    const result = await getContentItem(
      viewer.membership.workspaceId,
      contentId,
    );
    return jsonOk(result);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request, { params }) {
  try {
    assertSameOrigin(request);
    const viewer = await requirePermission('marketing.manage');
    const { contentId } = await params;
    if (!isUuid(contentId)) throw new ApiError(404, 'NOT_FOUND', NOT_FOUND);

    const body = await readJsonBody(request);
    const data = await validateBody(contentUpdateSchema, body);
    const result = await updateContentMetadata({
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
