import {
  ApiError,
  assertSameOrigin,
  errorResponse,
  jsonOk,
  readJsonBody,
  validateBody,
} from '@/lib/api';
import { requirePermission } from '@/lib/auth/authorization';
import { isUuid } from '@/lib/leads/validation';
import {
  getMeeting,
  meetingAccessFor,
  updateMeetingStatus,
} from '@/lib/meetings/service';
import { meetingUpdateSchema } from '@/lib/sales/validation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request, { params }) {
  try {
    const viewer = await requirePermission('meetings.view');
    const { meetingId } = await params;
    if (!isUuid(meetingId)) {
      throw new ApiError(404, 'NOT_FOUND', 'That meeting could not be found.');
    }
    const detail = await getMeeting(
      viewer.membership.workspaceId,
      meetingId,
      meetingAccessFor(viewer),
    );
    if (!detail) {
      throw new ApiError(404, 'NOT_FOUND', 'That meeting could not be found.');
    }
    return jsonOk(detail);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request, { params }) {
  try {
    assertSameOrigin(request);
    const viewer = await requirePermission('meetings.manage');
    const { meetingId } = await params;
    if (!isUuid(meetingId)) {
      throw new ApiError(404, 'NOT_FOUND', 'That meeting could not be found.');
    }

    const body = await readJsonBody(request, { maxBytes: 32 * 1024 });
    const data = await validateBody(meetingUpdateSchema, body);

    const result = await updateMeetingStatus({
      workspaceId: viewer.membership.workspaceId,
      userId: viewer.user.id,
      meetingId,
      data,
      access: meetingAccessFor(viewer),
    });
    if (!result) {
      throw new ApiError(404, 'NOT_FOUND', 'That meeting could not be found.');
    }
    return jsonOk(result);
  } catch (error) {
    return errorResponse(error);
  }
}
