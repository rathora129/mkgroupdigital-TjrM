import {
  ApiError,
  assertSameOrigin,
  errorResponse,
  jsonOk,
  readJsonBody,
  validateBody,
} from '@/lib/api';
import { requirePermission } from '@/lib/auth/authorization';
import { rateLimit } from '@/lib/rate-limit';
import {
  addTimelineEntry,
  getClientTimeline,
} from '@/lib/clients/service';
import { isUuid, timelineEntrySchema } from '@/lib/clients/validation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const NOT_FOUND = 'That client could not be found.';

export async function GET(request, { params }) {
  try {
    const viewer = await requirePermission('clients.view');
    const { clientId } = await params;
    if (!isUuid(clientId)) throw new ApiError(404, 'NOT_FOUND', NOT_FOUND);

    const timeline = await getClientTimeline(
      viewer.membership.workspaceId,
      clientId,
    );
    if (!timeline) throw new ApiError(404, 'NOT_FOUND', NOT_FOUND);
    return jsonOk(timeline);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request, { params }) {
  try {
    assertSameOrigin(request);
    const viewer = await requirePermission('clients.update');
    const { clientId } = await params;
    if (!isUuid(clientId)) throw new ApiError(404, 'NOT_FOUND', NOT_FOUND);

    const limit = rateLimit(`client-timeline:${viewer.user.id}`, {
      limit: 60,
      windowMs: 60 * 1000,
    });
    if (!limit.ok) {
      throw new ApiError(
        429,
        'RATE_LIMITED',
        'Too many timeline entries in a short period. Try again shortly.',
      );
    }

    const body = await readJsonBody(request);
    const data = await validateBody(timelineEntrySchema, body);
    const result = await addTimelineEntry({
      workspaceId: viewer.membership.workspaceId,
      userId: viewer.user.id,
      clientId,
      data,
    });
    return jsonOk(result, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
