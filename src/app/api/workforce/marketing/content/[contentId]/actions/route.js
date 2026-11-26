import {
  ApiError,
  assertSameOrigin,
  errorResponse,
  jsonOk,
  readJsonBody,
  validateBody,
} from '@/lib/api';
import { requirePermission } from '@/lib/auth/authorization';
import { hasPermission } from '@/lib/auth/permissions';
import { contentAction } from '@/lib/marketing/content';
import { contentActionSchema, isUuid } from '@/lib/marketing/validation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Approving content or recording an external publication are separate
// decisions from editing, so they require their own permission.
const ACTION_PERMISSION = {
  start_draft: 'marketing.manage',
  submit: 'marketing.manage',
  approve: 'marketing.approve',
  reject: 'marketing.approve',
  schedule: 'marketing.manage',
  unschedule: 'marketing.manage',
  mark_published: 'marketing.execute',
  record_failure: 'marketing.execute',
  cancel: 'marketing.manage',
  regenerate: 'marketing.manage',
  import_agent_run: 'marketing.manage',
};

export async function POST(request, { params }) {
  try {
    assertSameOrigin(request);
    const viewer = await requirePermission('marketing.view');
    const { contentId } = await params;
    if (!isUuid(contentId)) {
      throw new ApiError(404, 'NOT_FOUND', 'That content item could not be found.');
    }

    const body = await readJsonBody(request);
    const data = await validateBody(contentActionSchema, body);
    const required = ACTION_PERMISSION[data.action] || 'marketing.manage';
    if (!hasPermission(viewer.membership.role, required)) {
      throw new ApiError(
        403,
        'FORBIDDEN',
        'Your role does not allow this content action.',
      );
    }

    const result = await contentAction({
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
