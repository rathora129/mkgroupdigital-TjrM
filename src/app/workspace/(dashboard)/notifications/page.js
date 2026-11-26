import NotificationsView from '@/components/workspace/notifications/NotificationsView';
import { requirePermissionPage } from '@/lib/auth/authorization';
import { listNotifications } from '@/lib/notifications/service';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Notifications',
};

function parseUnread(value) {
  return ['1', 'true', 'yes'].includes(String(value || '').toLowerCase());
}

export default async function NotificationsPage({ searchParams }) {
  const viewer = await requirePermissionPage('notifications.view');
  const params = (await searchParams) || {};
  const unreadOnly = parseUnread(params.unread);
  const page = Math.max(1, Number(params.page) || 1);

  const data = await listNotifications({
    workspaceId: viewer.membership.workspaceId,
    userId: viewer.user.id,
    page,
    pageSize: 20,
    unreadOnly,
  });

  return (
    <NotificationsView
      data={data}
      unreadOnly={unreadOnly}
      timezone={viewer.workspace.timezone || 'UTC'}
    />
  );
}
