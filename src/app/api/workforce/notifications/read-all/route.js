import { ApiError, assertSameOrigin, errorResponse, jsonOk } from '@/lib/api';
import { requirePermission } from '@/lib/auth/authorization';
import { markAllNotificationsRead } from '@/lib/notifications/service';
import { rateLimit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request) {
  try {
    assertSameOrigin(request);
    const viewer = await requirePermission('notifications.view');

    const limit = rateLimit(`notifications-read-all:${viewer.user.id}`, {
      limit: 20,
      windowMs: 60_000,
    });
    if (!limit.ok) {
      throw new ApiError(
        429,
        'RATE_LIMITED',
        'Too many updates in a short period. Try again shortly.',
      );
    }

    const updated = await markAllNotificationsRead({
      workspaceId: viewer.membership.workspaceId,
      userId: viewer.user.id,
    });
    return jsonOk({ updated });
  } catch (error) {
    return errorResponse(error);
  }
}
