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
import { proposalAction } from '@/lib/marketing/website';
import { isUuid, proposalActionSchema } from '@/lib/marketing/validation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const ACTION_PERMISSION = {
  submit: 'marketing.manage',
  approve: 'marketing.approve',
  reject: 'marketing.approve',
  start_execution: 'marketing.execute',
  record_execution: 'marketing.execute',
  cancel: 'marketing.manage',
  regenerate: 'marketing.manage',
  import_agent_run: 'marketing.manage',
};

export async function POST(request, { params }) {
  try {
    assertSameOrigin(request);
    const viewer = await requirePermission('marketing.view');
    const { proposalId } = await params;
    if (!isUuid(proposalId)) {
      throw new ApiError(
        404,
        'NOT_FOUND',
        'That website change proposal could not be found.',
      );
    }

    const body = await readJsonBody(request);
    const data = await validateBody(proposalActionSchema, body);
    const required = ACTION_PERMISSION[data.action] || 'marketing.manage';
    if (!hasPermission(viewer.membership.role, required)) {
      throw new ApiError(
        403,
        'FORBIDDEN',
        'Your role does not allow this proposal action.',
      );
    }

    const result = await proposalAction({
      workspaceId: viewer.membership.workspaceId,
      userId: viewer.user.id,
      proposalId,
      data,
    });
    return jsonOk(result);
  } catch (error) {
    return errorResponse(error);
  }
}
