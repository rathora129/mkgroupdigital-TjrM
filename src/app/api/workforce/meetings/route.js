import {
  ApiError,
  assertSameOrigin,
  errorResponse,
  jsonOk,
  readJsonBody,
  validateBody,
} from '@/lib/api';
import { requirePermission } from '@/lib/auth/authorization';
import {
  createMeeting,
  listMeetings,
  meetingAccessFor,
} from '@/lib/meetings/service';
import { meetingCreateSchema, meetingQuerySchema } from '@/lib/sales/validation';
import { rateLimit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function normaliseSearch(search) {
  return { ...search, upcoming: search.upcoming === 'true' };
}

export async function GET(request) {
  try {
    const viewer = await requirePermission('meetings.view');
    const search = Object.fromEntries(new URL(request.url).searchParams);
    const query = await validateBody(meetingQuerySchema, normaliseSearch(search));

    const result = await listMeetings(
      viewer.membership.workspaceId,
      query,
      meetingAccessFor(viewer),
    );
    return jsonOk(result);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request) {
  try {
    assertSameOrigin(request);
    const viewer = await requirePermission('meetings.schedule');
    const limit = rateLimit(`meeting-create:${viewer.user.id}`, {
      limit: 30,
      windowMs: 60_000,
    });
    if (!limit.ok) {
      throw new ApiError(
        429,
        'RATE_LIMITED',
        'Too many meeting changes in a short period. Try again shortly.',
      );
    }

    const body = await readJsonBody(request, { maxBytes: 64 * 1024 });
    const data = await validateBody(meetingCreateSchema, body);

    const result = await createMeeting({
      workspaceId: viewer.membership.workspaceId,
      userId: viewer.user.id,
      data,
      access: meetingAccessFor(viewer),
    });
    return jsonOk(result, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
