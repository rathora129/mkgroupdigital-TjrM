import { errorResponse, jsonOk } from '@/lib/api';
import { requirePermission } from '@/lib/auth/authorization';
import { listNotifications } from '@/lib/notifications/service';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request) {
  try {
    const viewer = await requirePermission('notifications.view');
    const url = new URL(request.url);
    const page = Math.max(1, Number(url.searchParams.get('page')) || 1);
    const pageSize = Math.min(
      50,
      Math.max(1, Number(url.searchParams.get('pageSize')) || 20),
    );
    const unreadOnly = ['1', 'true', 'yes'].includes(
      String(url.searchParams.get('unread') || '').toLowerCase(),
    );

    const result = await listNotifications({
      workspaceId: viewer.membership.workspaceId,
      userId: viewer.user.id,
      page,
      pageSize,
      unreadOnly,
    });
    return jsonOk(result);
  } catch (error) {
    return errorResponse(error);
  }
}
