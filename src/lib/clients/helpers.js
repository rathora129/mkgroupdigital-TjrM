import { and, eq } from 'drizzle-orm';
import { getDb, getDbDriver } from '@/db/client';
import { users, workspaceMemberships } from '@/db/schema';
import { ApiError } from '@/lib/api-error';

export async function runAtomic(build) {
  const db = getDb();
  if (getDbDriver() === 'node-postgres') return db.transaction(build);
  return build(db);
}

export function staleError(label = 'record') {
  return new ApiError(
    409,
    'STALE_RECORD',
    `This ${label} changed while you were editing it. Reload and try again.`,
  );
}

export function escapeLike(value) {
  return String(value).replace(/[\\%_]/g, '\\$&');
}

export async function assertMembers(workspaceId, ids) {
  const unique = [...new Set((ids || []).filter(Boolean))];
  if (unique.length === 0) return [];
  const rows = await getDb()
    .select({ userId: workspaceMemberships.userId })
    .from(workspaceMemberships)
    .where(eq(workspaceMemberships.workspaceId, workspaceId));
  const set = new Set(rows.map((row) => row.userId));
  const missing = unique.filter((id) => !set.has(id));
  if (missing.length > 0) {
    throw new ApiError(
      422,
      'ASSIGNEE_NOT_MEMBER',
      'Choose people who belong to this workspace.',
      { assignedUserId: 'One or more selected people are not workspace members.' },
    );
  }
  return unique;
}

export async function loadUserName(workspaceId, userId) {
  if (!userId) return null;
  const rows = await getDb()
    .select({ name: users.name, email: users.email })
    .from(users)
    .innerJoin(workspaceMemberships, eq(workspaceMemberships.userId, users.id))
    .where(
      and(
        eq(users.id, userId),
        eq(workspaceMemberships.workspaceId, workspaceId),
      ),
    )
    .limit(1);
  return rows[0] || null;
}
