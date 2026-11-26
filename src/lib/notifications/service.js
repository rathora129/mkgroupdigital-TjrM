import { and, count, desc, eq, isNull } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { notifications } from '@/db/schema';

export const NOTIFICATION_LEVELS = ['info', 'success', 'warning', 'danger'];

export const NOTIFICATION_TYPES = {
  followUpDue: 'follow_up_due',
  followUpOverdue: 'follow_up_overdue',
  meetingScheduled: 'meeting_scheduled',
  meetingReminder: 'meeting_reminder',
  leadAssigned: 'lead_assigned',
  discoveryReview: 'discovery_review',
  calendarUnavailable: 'calendar_unavailable',
};

// Dedupe is enforced by a partial unique index on (workspace_id, dedupe_key).
// A repeated call with the same key is ignored instead of notifying twice.
export async function createNotification({
  workspaceId,
  userId,
  type,
  title,
  body = null,
  level = 'info',
  resourceType = null,
  resourceId = null,
  actionUrl = null,
  dedupeKey = null,
}) {
  if (!workspaceId || !userId || !type || !title) return null;

  const rows = await getDb()
    .insert(notifications)
    .values({
      workspaceId,
      userId,
      type,
      title,
      body,
      level: NOTIFICATION_LEVELS.includes(level) ? level : 'info',
      resourceType,
      resourceId: resourceId || null,
      actionUrl,
      dedupeKey,
    })
    .onConflictDoNothing()
    .returning();

  return rows[0] || null;
}

export async function listNotifications({
  workspaceId,
  userId,
  page = 1,
  pageSize = 20,
  unreadOnly = false,
}) {
  const filters = [
    eq(notifications.workspaceId, workspaceId),
    eq(notifications.userId, userId),
  ];
  if (unreadOnly) filters.push(isNull(notifications.readAt));
  const where = and(...filters);

  const [rows, totals, unreadTotals, allTotals] = await Promise.all([
    getDb()
      .select()
      .from(notifications)
      .where(where)
      .orderBy(desc(notifications.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    getDb().select({ value: count() }).from(notifications).where(where),
    getDb()
      .select({ value: count() })
      .from(notifications)
      .where(
        and(
          eq(notifications.workspaceId, workspaceId),
          eq(notifications.userId, userId),
          isNull(notifications.readAt),
        ),
      ),
    getDb()
      .select({ value: count() })
      .from(notifications)
      .where(
        and(
          eq(notifications.workspaceId, workspaceId),
          eq(notifications.userId, userId),
        ),
      ),
  ]);

  const total = Number(totals[0]?.value || 0);
  return {
    items: rows.map((row) => ({ ...row, unread: !row.readAt })),
    total,
    allTotal: Number(allTotals[0]?.value || 0),
    unreadTotal: Number(unreadTotals[0]?.value || 0),
    page,
    pageSize,
    pages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export async function countUnreadNotifications(workspaceId, userId) {
  const rows = await getDb()
    .select({ value: count() })
    .from(notifications)
    .where(
      and(
        eq(notifications.workspaceId, workspaceId),
        eq(notifications.userId, userId),
        isNull(notifications.readAt),
      ),
    );
  return Number(rows[0]?.value || 0);
}

export async function markNotificationRead({ workspaceId, userId, notificationId }) {
  const rows = await getDb()
    .update(notifications)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(notifications.workspaceId, workspaceId),
        eq(notifications.userId, userId),
        eq(notifications.id, notificationId),
      ),
    )
    .returning();
  return rows[0] || null;
}

export async function markAllNotificationsRead({ workspaceId, userId }) {
  const rows = await getDb()
    .update(notifications)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(notifications.workspaceId, workspaceId),
        eq(notifications.userId, userId),
        isNull(notifications.readAt),
      ),
    )
    .returning({ id: notifications.id });
  return rows.length;
}
