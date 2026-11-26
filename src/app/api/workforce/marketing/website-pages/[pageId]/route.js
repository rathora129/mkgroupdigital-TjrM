import {
  ApiError,
  assertSameOrigin,
  errorResponse,
  jsonOk,
  readJsonBody,
  validateBody,
} from '@/lib/api';
import { requirePermission } from '@/lib/auth/authorization';
import { getWebsitePage, updateWebsitePage } from '@/lib/marketing/website';
import { isUuid, websitePageUpdateSchema } from '@/lib/marketing/validation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const NOT_FOUND = 'That website page could not be found.';

export async function GET(request, { params }) {
  try {
    const viewer = await requirePermission('marketing.view');
    const { pageId } = await params;
    if (!isUuid(pageId)) throw new ApiError(404, 'NOT_FOUND', NOT_FOUND);
    const result = await getWebsitePage(viewer.membership.workspaceId, pageId);
    return jsonOk(result);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request, { params }) {
  try {
    assertSameOrigin(request);
    const viewer = await requirePermission('marketing.manage');
    const { pageId } = await params;
    if (!isUuid(pageId)) throw new ApiError(404, 'NOT_FOUND', NOT_FOUND);

    const body = await readJsonBody(request);
    const data = await validateBody(websitePageUpdateSchema, body);
    const result = await updateWebsitePage({
      workspaceId: viewer.membership.workspaceId,
      userId: viewer.user.id,
      pageId,
      data,
    });
    return jsonOk(result);
  } catch (error) {
    return errorResponse(error);
  }
}
