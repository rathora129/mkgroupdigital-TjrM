import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  ilike,
  ne,
  or,
  sql,
} from 'drizzle-orm';
import { getDb, getDbDriver } from '@/db/client';
import {
  auditLogs,
  invitations,
  users,
  workspaceMemberships,
  workspaces,
} from '@/db/schema';
import { recordAudit } from '@/lib/audit';
import { normalizeEmail } from '@/lib/auth/hash';

export const DEFAULT_WORKSPACE = {
  slug: 'mk-group-digital',
  name: 'MK Group Digital',
};

export function getBootstrapOwnerEmail() {
  const email = process.env.WORKSPACE_OWNER_EMAIL;
  return email ? normalizeEmail(email) : null;
}

export function isBootstrapOwner(email) {
  const owner = getBootstrapOwnerEmail();
  return Boolean(owner) && owner === normalizeEmail(email);
}

export async function findMembershipForUser(userId) {
  const rows = await getDb()
    .select({
      membership: workspaceMemberships,
      workspace: workspaces,
    })
    .from(workspaceMemberships)
    .innerJoin(workspaces, eq(workspaces.id, workspaceMemberships.workspaceId))
    .where(eq(workspaceMemberships.userId, userId))
    .orderBy(asc(workspaceMemberships.createdAt))
    .limit(1);

  return rows[0] || null;
}

export async function getWorkspaceById(workspaceId) {
  const rows = await getDb()
    .select()
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1);
  return rows[0] || null;
}

export async function ensureWorkspace(slug = DEFAULT_WORKSPACE.slug, name = DEFAULT_WORKSPACE.name) {
  const db = getDb();
  const existing = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.slug, slug))
    .limit(1);

  if (existing[0]) return existing[0];

  const inserted = await db
    .insert(workspaces)
    .values({ slug, name })
    .onConflictDoNothing({ target: workspaces.slug })
    .returning();

  if (inserted[0]) return inserted[0];

  const retry = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.slug, slug))
    .limit(1);
  return retry[0] || null;
}

export async function ensureMembership({ workspaceId, userId, role = 'member' }) {
  const db = getDb();
  const existing = await db
    .select()
    .from(workspaceMemberships)
    .where(
      and(
        eq(workspaceMemberships.workspaceId, workspaceId),
        eq(workspaceMemberships.userId, userId),
      ),
    )
    .limit(1);

  if (existing[0]) return existing[0];

  const inserted = await db
    .insert(workspaceMemberships)
    .values({ workspaceId, userId, role })
    .onConflictDoNothing()
    .returning();

  if (inserted[0]) return inserted[0];

  const retry = await db
    .select()
    .from(workspaceMemberships)
    .where(
      and(
        eq(workspaceMemberships.workspaceId, workspaceId),
        eq(workspaceMemberships.userId, userId),
      ),
    )
    .limit(1);
  return retry[0] || null;
}

export async function findActiveInvitation(email) {
  const rows = await getDb()
    .select()
    .from(invitations)
    .where(
      and(
        eq(invitations.email, normalizeEmail(email)),
        eq(invitations.status, 'pending'),
        gt(invitations.expiresAt, new Date()),
      ),
    )
    .orderBy(asc(invitations.createdAt))
    .limit(1);
  return rows[0] || null;
}

export async function isEmailAllowed(email) {
  const address = normalizeEmail(email);
  if (isBootstrapOwner(address)) return true;
  if (await findActiveInvitation(address)) return true;

  const rows = await getDb()
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, address))
    .limit(1);

  if (!rows[0]) return false;

  const membership = await findMembershipForUser(rows[0].id);
  return Boolean(membership);
}

export async function provisionWorkspaceAccess({
  userId,
  email,
  isNewUser = false,
}) {
  const address = normalizeEmail(email);

  if (isBootstrapOwner(address)) {
    const workspace = await ensureWorkspace();
    if (!workspace) throw new Error('Workspace could not be created');
    const membership = await ensureMembership({
      workspaceId: workspace.id,
      userId,
      role: 'owner',
    });

    if (isNewUser && membership) {
      await recordAudit({
        workspaceId: workspace.id,
        actorUserId: userId,
        action: 'membership.join',
        resourceType: 'membership',
        resourceId: membership.id,
        metadata: { role: membership.role, source: 'bootstrap' },
      });
    }

    return {
      workspaceId: workspace.id,
      membershipId: membership?.id || null,
      role: membership?.role || 'owner',
      source: 'bootstrap',
    };
  }

  const invitation = await findActiveInvitation(address);
  if (invitation) {
    const membership = await ensureMembership({
      workspaceId: invitation.workspaceId,
      userId,
      role: invitation.role,
    });

    // The status guard makes acceptance a one-time transition even when two
    // sign-ins race, so the acceptance and join audits are written once.
    const accepted = await getDb()
      .update(invitations)
      .set({ status: 'accepted', acceptedAt: new Date() })
      .where(
        and(
          eq(invitations.id, invitation.id),
          eq(invitations.status, 'pending'),
        ),
      )
      .returning({ id: invitations.id });

    if (accepted[0] && membership) {
      await recordAudit({
        workspaceId: invitation.workspaceId,
        actorUserId: userId,
        action: 'invitation.accept',
        resourceType: 'invitation',
        resourceId: invitation.id,
        metadata: { role: invitation.role },
      });
      await recordAudit({
        workspaceId: invitation.workspaceId,
        actorUserId: userId,
        action: 'membership.join',
        resourceType: 'membership',
        resourceId: membership.id,
        metadata: { role: membership.role, source: 'invitation' },
      });
    }

    return {
      workspaceId: invitation.workspaceId,
      membershipId: membership?.id || null,
      role: membership?.role || invitation.role,
      source: 'invitation',
    };
  }

  const existing = await findMembershipForUser(userId);
  if (existing) {
    return {
      workspaceId: existing.membership.workspaceId,
      role: existing.membership.role,
      source: 'membership',
    };
  }

  throw new Error('No workspace access');
}

export async function listMembers(workspaceId) {
  return getDb()
    .select({
      id: workspaceMemberships.id,
      userId: workspaceMemberships.userId,
      role: workspaceMemberships.role,
      createdAt: workspaceMemberships.createdAt,
      name: users.name,
      email: users.email,
    })
    .from(workspaceMemberships)
    .innerJoin(users, eq(users.id, workspaceMemberships.userId))
    .where(eq(workspaceMemberships.workspaceId, workspaceId))
    .orderBy(asc(workspaceMemberships.createdAt));
}

export async function countOwners(workspaceId) {
  const rows = await getDb()
    .select({ value: count() })
    .from(workspaceMemberships)
    .where(
      and(
        eq(workspaceMemberships.workspaceId, workspaceId),
        eq(workspaceMemberships.role, 'owner'),
      ),
    );
  return Number(rows[0]?.value || 0);
}

// Membership changes that can reduce the owner count are serialized on the
// workspace row and re-checked inside the same transaction. The Neon HTTP
// driver has no interactive transactions, so `db.batch` is its transactional
// primitive; node-postgres (local development) uses an interactive
// transaction. Both run the same FOR UPDATE lock and guarded mutation at READ
// COMMITTED, so a concurrent demotion/removal cannot leave zero owners.
function workspaceLock(executor, workspaceId) {
  return executor
    .select({ id: workspaces.id })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .for('update');
}

function memberRow(executor, workspaceId, membershipId) {
  return executor
    .select()
    .from(workspaceMemberships)
    .where(
      and(
        eq(workspaceMemberships.workspaceId, workspaceId),
        eq(workspaceMemberships.id, membershipId),
      ),
    )
    .limit(1);
}

function otherOwnersRemain(workspaceId) {
  return sql`(select count(*) from ${workspaceMemberships} where ${workspaceMemberships.workspaceId} = ${workspaceId} and ${workspaceMemberships.role} = 'owner') > 1`;
}

async function runMembershipMutation(workspaceId, membershipId, buildMutation) {
  const db = getDb();

  if (getDbDriver() === 'node-postgres') {
    return db.transaction(async (tx) => {
      await workspaceLock(tx, workspaceId);
      const memberRows = await memberRow(tx, workspaceId, membershipId);
      const member = memberRows[0] || null;
      if (!member) return { status: 'not_found', member: null };

      const changed = await buildMutation(tx);
      if (!changed[0]) return { status: 'last_owner', member };

      return { status: 'changed', member, row: changed[0] };
    });
  }

  const [, memberRows, changedRows] = await db.batch([
    workspaceLock(db, workspaceId),
    memberRow(db, workspaceId, membershipId),
    buildMutation(db),
  ]);

  const member = memberRows[0] || null;
  if (!member) return { status: 'not_found', member: null };
  if (!changedRows[0]) return { status: 'last_owner', member };

  return { status: 'changed', member, row: changedRows[0] };
}

export async function changeMemberRole({ workspaceId, membershipId, role }) {
  const result = await runMembershipMutation(
    workspaceId,
    membershipId,
    (executor) =>
      executor
        .update(workspaceMemberships)
        .set({ role })
        .where(
          and(
            eq(workspaceMemberships.workspaceId, workspaceId),
            eq(workspaceMemberships.id, membershipId),
            or(
              ne(workspaceMemberships.role, 'owner'),
              eq(role, 'owner'),
              otherOwnersRemain(workspaceId),
            ),
          ),
        )
        .returning(),
  );

  if (result.status === 'changed') {
    return {
      status: 'updated',
      member: result.member,
      updated: result.row,
    };
  }

  return { status: result.status, member: result.member };
}

export async function removeMember(workspaceId, membershipId) {
  const result = await runMembershipMutation(
    workspaceId,
    membershipId,
    (executor) =>
      executor
        .delete(workspaceMemberships)
        .where(
          and(
            eq(workspaceMemberships.workspaceId, workspaceId),
            eq(workspaceMemberships.id, membershipId),
            or(
              ne(workspaceMemberships.role, 'owner'),
              otherOwnersRemain(workspaceId),
            ),
          ),
        )
        .returning(),
  );

  if (result.status === 'changed') {
    return { status: 'removed', member: result.member };
  }

  return { status: result.status, member: result.member };
}

const PROFILE_COLUMNS = new Set([
  'name',
  'timezone',
  'businessEmail',
  'businessPhone',
  'businessAddress',
  'websiteUrl',
  'brandColor',
  'logoUrl',
]);

export async function updateWorkspaceProfile(workspaceId, changes) {
  const current = await getWorkspaceById(workspaceId);
  if (!current) return null;

  const next = {};
  for (const [key, value] of Object.entries(changes)) {
    if (PROFILE_COLUMNS.has(key)) next[key] = value;
  }

  if (changes.preferences && typeof changes.preferences === 'object') {
    next.preferences = {
      ...(current.preferences || {}),
      ...changes.preferences,
    };
  }

  const rows = await getDb()
    .update(workspaces)
    .set(next)
    .where(eq(workspaces.id, workspaceId))
    .returning();
  return rows[0] || null;
}

export async function listInvitations(workspaceId) {
  const rows = await getDb()
    .select({
      id: invitations.id,
      email: invitations.email,
      role: invitations.role,
      status: invitations.status,
      expiresAt: invitations.expiresAt,
      acceptedAt: invitations.acceptedAt,
      createdAt: invitations.createdAt,
    })
    .from(invitations)
    .where(eq(invitations.workspaceId, workspaceId))
    .orderBy(desc(invitations.createdAt));

  const now = new Date();
  return rows.map((row) => ({
    ...row,
    status:
      row.status === 'pending' && row.expiresAt <= now ? 'expired' : row.status,
  }));
}

export async function resendInvitation({
  workspaceId,
  invitationId,
  invitedByUserId,
  expiresAt,
}) {
  const rows = await getDb()
    .update(invitations)
    .set({
      status: 'pending',
      expiresAt,
      invitedByUserId,
      acceptedAt: null,
    })
    .where(
      and(
        eq(invitations.workspaceId, workspaceId),
        eq(invitations.id, invitationId),
        ne(invitations.status, 'accepted'),
      ),
    )
    .returning();
  return rows[0] || null;
}

export async function getMembershipById(workspaceId, membershipId) {
  const rows = await getDb()
    .select({
      id: workspaceMemberships.id,
      userId: workspaceMemberships.userId,
      role: workspaceMemberships.role,
      createdAt: workspaceMemberships.createdAt,
      name: users.name,
      email: users.email,
    })
    .from(workspaceMemberships)
    .innerJoin(users, eq(users.id, workspaceMemberships.userId))
    .where(
      and(
        eq(workspaceMemberships.workspaceId, workspaceId),
        eq(workspaceMemberships.id, membershipId),
      ),
    )
    .limit(1);
  return rows[0] || null;
}

export async function listAuditLogs({
  workspaceId,
  page = 1,
  pageSize = 25,
  action,
  resourceType,
  resourceId,
  actor,
  success,
}) {
  const filters = [eq(auditLogs.workspaceId, workspaceId)];
  if (action) filters.push(ilike(auditLogs.action, `%${action}%`));
  if (resourceType) {
    filters.push(eq(auditLogs.resourceType, resourceType));
  }
  if (resourceId) filters.push(eq(auditLogs.resourceId, resourceId));
  if (success === 'true' || success === 'false') {
    filters.push(eq(auditLogs.success, success === 'true'));
  }
  if (actor) {
    filters.push(
      or(
        ilike(users.name, `%${actor}%`),
        ilike(users.email, `%${actor}%`),
      ),
    );
  }

  const where = and(...filters);
  const db = getDb();
  const offset = (page - 1) * pageSize;

  const [items, totals] = await Promise.all([
    db
      .select({
        id: auditLogs.id,
        action: auditLogs.action,
        resourceType: auditLogs.resourceType,
        resourceId: auditLogs.resourceId,
        success: auditLogs.success,
        metadata: auditLogs.metadata,
        createdAt: auditLogs.createdAt,
        actorType: auditLogs.actorType,
        actorUserId: auditLogs.actorUserId,
        actorName: users.name,
        actorEmail: users.email,
      })
      .from(auditLogs)
      .leftJoin(users, eq(users.id, auditLogs.actorUserId))
      .where(where)
      .orderBy(desc(auditLogs.createdAt))
      .limit(pageSize)
      .offset(offset),
    db
      .select({ value: count() })
      .from(auditLogs)
      .leftJoin(users, eq(users.id, auditLogs.actorUserId))
      .where(where),
  ]);

  const total = Number(totals[0]?.value || 0);
  return {
    items,
    total,
    page,
    pageSize,
    pages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export async function listMembershipHistory(workspaceId, membershipId, limit = 50) {
  const rows = await getDb()
    .select({
      id: auditLogs.id,
      action: auditLogs.action,
      success: auditLogs.success,
      metadata: auditLogs.metadata,
      createdAt: auditLogs.createdAt,
      actorUserId: auditLogs.actorUserId,
      actorName: users.name,
      actorEmail: users.email,
    })
    .from(auditLogs)
    .leftJoin(users, eq(users.id, auditLogs.actorUserId))
    .where(
      and(
        eq(auditLogs.workspaceId, workspaceId),
        eq(auditLogs.resourceType, 'membership'),
        eq(auditLogs.resourceId, membershipId),
      ),
    )
    .orderBy(desc(auditLogs.createdAt))
    .limit(limit);
  return rows;
}

export async function upsertInvitation({
  workspaceId,
  email,
  role,
  invitedByUserId,
  expiresAt,
}) {
  const rows = await getDb()
    .insert(invitations)
    .values({
      workspaceId,
      email: normalizeEmail(email),
      role,
      invitedByUserId,
      expiresAt,
      status: 'pending',
    })
    .onConflictDoUpdate({
      target: [invitations.workspaceId, invitations.email],
      set: {
        role,
        invitedByUserId,
        expiresAt,
        status: 'pending',
        acceptedAt: null,
      },
    })
    .returning();
  return rows[0] || null;
}

export async function revokeInvitation(workspaceId, invitationId) {
  const rows = await getDb()
    .update(invitations)
    .set({ status: 'revoked' })
    .where(
      and(
        eq(invitations.workspaceId, workspaceId),
        eq(invitations.id, invitationId),
        eq(invitations.status, 'pending'),
      ),
    )
    .returning();
  return rows[0] || null;
}

export async function findMemberByEmail(workspaceId, email) {
  const rows = await getDb()
    .select({ id: workspaceMemberships.id })
    .from(workspaceMemberships)
    .innerJoin(users, eq(users.id, workspaceMemberships.userId))
    .where(
      and(
        eq(workspaceMemberships.workspaceId, workspaceId),
        eq(users.email, normalizeEmail(email)),
      ),
    )
    .limit(1);
  return rows[0] || null;
}
