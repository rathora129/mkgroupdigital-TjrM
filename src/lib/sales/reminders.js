import { and, asc, eq, inArray, isNotNull, isNull, lte } from 'drizzle-orm';
import { getDb } from '@/db/client';
import {
  leads,
  projectTasks,
  users,
  workspaceMemberships,
} from '@/db/schema';
import { createNotification, NOTIFICATION_TYPES } from '@/lib/notifications/service';

const OPEN_TASK_STATUSES = ['todo', 'in_progress', 'blocked', 'in_review'];
const ESCALATION_ROLES = ['owner', 'admin', 'manager'];
const DAY_MS = 24 * 60 * 60 * 1000;

// The reminder scan runs on the existing pg-boss worker. Looking back one day
// as well as forward means a missed worker tick still delivers the reminder
// once; the notification dedupe key prevents duplicates on the next tick.
export async function runFollowUpReminderScan({ now = new Date() } = {}) {
  const db = getDb();
  const horizon = new Date(now.getTime() + DAY_MS);

  const due = await db
    .select({
      id: projectTasks.id,
      workspaceId: projectTasks.workspaceId,
      title: projectTasks.title,
      ownerUserId: projectTasks.ownerUserId,
      dueDate: projectTasks.dueDate,
      leadId: projectTasks.leadId,
      leadCompanyName: leads.companyName,
    })
    .from(projectTasks)
    .leftJoin(leads, eq(leads.id, projectTasks.leadId))
    .where(
      and(
        eq(projectTasks.taskType, 'follow_up'),
        inArray(projectTasks.status, OPEN_TASK_STATUSES),
        isNotNull(projectTasks.ownerUserId),
        isNotNull(projectTasks.dueDate),
        isNull(projectTasks.reminderSentAt),
        lte(projectTasks.dueDate, horizon),
      ),
    )
    .orderBy(asc(projectTasks.dueDate))
    .limit(200);

  let reminders = 0;
  for (const task of due) {
    const overdue = task.dueDate.getTime() < now.getTime();
    const created = await createNotification({
      workspaceId: task.workspaceId,
      userId: task.ownerUserId,
      type: overdue
        ? NOTIFICATION_TYPES.followUpOverdue
        : NOTIFICATION_TYPES.followUpDue,
      title: overdue
        ? `Overdue follow-up: ${task.leadCompanyName || task.title}`
        : `Follow-up due: ${task.leadCompanyName || task.title}`,
      body: overdue
        ? 'This follow-up is past its due time. Complete it or reschedule it.'
        : 'This follow-up is due within the next 24 hours.',
      level: overdue ? 'warning' : 'info',
      resourceType: 'task',
      resourceId: task.id,
      actionUrl: task.leadId
        ? `/workspace/leads/${task.leadId}`
        : '/workspace/tasks',
      dedupeKey: `follow-up-due:${task.id}`,
    });

    await db
      .update(projectTasks)
      .set({ reminderSentAt: now })
      .where(
        and(eq(projectTasks.id, task.id), isNull(projectTasks.reminderSentAt)),
      );

    if (created) reminders += 1;
  }

  const overdueBefore = new Date(now.getTime() - DAY_MS);
  const stale = await db
    .select({
      id: projectTasks.id,
      workspaceId: projectTasks.workspaceId,
      title: projectTasks.title,
      ownerUserId: projectTasks.ownerUserId,
      dueDate: projectTasks.dueDate,
      leadId: projectTasks.leadId,
      leadCompanyName: leads.companyName,
    })
    .from(projectTasks)
    .leftJoin(leads, eq(leads.id, projectTasks.leadId))
    .where(
      and(
        eq(projectTasks.taskType, 'follow_up'),
        inArray(projectTasks.status, OPEN_TASK_STATUSES),
        isNotNull(projectTasks.dueDate),
        isNull(projectTasks.escalatedAt),
        lte(projectTasks.dueDate, overdueBefore),
      ),
    )
    .orderBy(asc(projectTasks.dueDate))
    .limit(200);

  let escalated = 0;
  for (const task of stale) {
    const managers = await db
      .select({ userId: workspaceMemberships.userId, name: users.name })
      .from(workspaceMemberships)
      .leftJoin(users, eq(users.id, workspaceMemberships.userId))
      .where(
        and(
          eq(workspaceMemberships.workspaceId, task.workspaceId),
          inArray(workspaceMemberships.role, ESCALATION_ROLES),
        ),
      );

    let notified = 0;
    for (const manager of managers) {
      if (manager.userId === task.ownerUserId) continue;
      const created = await createNotification({
        workspaceId: task.workspaceId,
        userId: manager.userId,
        type: NOTIFICATION_TYPES.followUpOverdue,
        title: `Escalated follow-up: ${task.leadCompanyName || task.title}`,
        body: 'A follow-up has been overdue for more than 24 hours and is still open.',
        level: 'danger',
        resourceType: 'task',
        resourceId: task.id,
        actionUrl: task.leadId
          ? `/workspace/leads/${task.leadId}`
          : '/workspace/tasks',
        dedupeKey: `follow-up-escalation:${task.id}:${manager.userId}`,
      });
      if (created) notified += 1;
    }

    await db
      .update(projectTasks)
      .set({ escalatedAt: now })
      .where(and(eq(projectTasks.id, task.id), isNull(projectTasks.escalatedAt)));

    if (notified > 0) escalated += 1;
  }

  return {
    scanned: due.length,
    reminders,
    escalated,
    overdue: stale.length,
  };
}
