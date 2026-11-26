import { ApiError, assertSameOrigin, errorResponse, jsonOk } from '@/lib/api';
import { requirePermission } from '@/lib/auth/authorization';
import { isUuid } from '@/lib/leads/validation';
import { markNotificationRead } from '@/lib/notifications/service';
import { rateLimit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function PATCH(request, { params }) {
  try {
    assertSameOrigin(request);
    const viewer = await requirePermission('notifications.view');
    const { notificationId } = await params;
    if (!isUuid(notificationId)) {
      throw new ApiError(404, 'NOT_FOUND', 'That notification could not be found.');
    }

    const limit = rateLimit(`notifications-read:${viewer.user.id}`, {
      limit: 120,
      windowMs: 60_000,
    });
    if (!limit.ok) {
      throw new ApiError(
        429,
        'RATE_LIMITED',
        'Too many notification updates in a short period. Try again shortly.',
      );
    }

    const notification = await markNotificationRead({
      workspaceId: viewer.membership.workspaceId,
      userId: viewer.user.id,
      notificationId,
    });
    if (!notification) {
      throw new ApiError(404, 'NOT_FOUND', 'That notification could not be found.');
    }
    return jsonOk({ notification: { ...notification, unread: false } });
  } catch (error) {
    return errorResponse(error);
  }
}
