import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {
  sql,
  query,
  closeDatabase,
  assertDisposableTestUrl,
} from './support/db.mjs';

// Database-backed Phase 2A checks. Like last-owner-concurrency.test.mjs these
// only ever run against PHASE2A_TEST_DATABASE_URL, whose database name must end
// in _test. They create uniquely named fixtures and delete exactly those rows.
const TEST_DATABASE_URL = process.env.PHASE2A_TEST_DATABASE_URL || '';
const skip = TEST_DATABASE_URL
  ? false
  : 'set PHASE2A_TEST_DATABASE_URL to a disposable, migrated database';

let service = null;
let audit = null;

if (TEST_DATABASE_URL) {
  assertDisposableTestUrl(TEST_DATABASE_URL);
  process.env.DATABASE_URL = TEST_DATABASE_URL;
  service = await import('@/lib/workspace/service');
  audit = await import('@/lib/audit');
}

after(async () => {
  await closeDatabase();
});

async function createWorkspace(roles = ['owner']) {
  const suffix = randomUUID();
  const [workspace] = await query(sql`
    insert into workspaces (name, slug)
    values ('Phase 2A test', ${`p2a-${suffix}`})
    returning id
  `);

  const members = [];
  for (const role of roles) {
    const email = `p2a-${suffix}-${members.length}@example.test`;
    const [user] = await query(sql`
      insert into users (email) values (${email}) returning id
    `);
    const [membership] = await query(sql`
      insert into workspace_memberships (workspace_id, user_id, role)
      values (${workspace.id}, ${user.id}, ${role})
      returning id
    `);
    members.push({ userId: user.id, membershipId: membership.id, email, role });
  }

  return { workspaceId: workspace.id, suffix, members, extraUserIds: [] };
}

async function cleanup(fixture) {
  await query(
    sql`delete from audit_logs where workspace_id = ${fixture.workspaceId}`,
  );
  await query(sql`delete from workspaces where id = ${fixture.workspaceId}`);
  for (const member of fixture.members) {
    await query(sql`delete from users where id = ${member.userId}`);
  }
  for (const userId of fixture.extraUserIds) {
    await query(sql`delete from users where id = ${userId}`);
  }
}

test(
  'workspace profile persists fields and merges preferences',
  { skip },
  async () => {
    const fixture = await createWorkspace();
    try {
      const updated = await service.updateWorkspaceProfile(fixture.workspaceId, {
        name: 'Renamed Workspace',
        timezone: 'Asia/Kolkata',
        businessEmail: null,
        brandColor: '#112233',
        preferences: { dateFormat: 'YYYY-MM-DD' },
      });

      assert.equal(updated.name, 'Renamed Workspace');
      assert.equal(updated.timezone, 'Asia/Kolkata');
      assert.equal(updated.businessEmail, null);
      assert.equal(updated.brandColor, '#112233');

      const second = await service.updateWorkspaceProfile(fixture.workspaceId, {
        preferences: { weekStart: 'sunday' },
      });
      assert.deepEqual(second.preferences, {
        dateFormat: 'YYYY-MM-DD',
        weekStart: 'sunday',
      });

      const persisted = await service.getWorkspaceById(fixture.workspaceId);
      assert.equal(persisted.name, 'Renamed Workspace');
      assert.equal(persisted.preferences.weekStart, 'sunday');
    } finally {
      await cleanup(fixture);
    }
  },
);

test(
  'invitation acceptance grants its role once and records history',
  { skip },
  async () => {
    const fixture = await createWorkspace();
    const owner = fixture.members[0];
    const invitedEmail = `accept-${fixture.suffix}@example.test`;
    try {
      const invitation = await service.upsertInvitation({
        workspaceId: fixture.workspaceId,
        email: invitedEmail,
        role: 'manager',
        invitedByUserId: owner.userId,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      });
      assert.equal(invitation.role, 'manager');
      assert.equal(invitation.status, 'pending');

      const [invitedUser] = await query(sql`
        insert into users (email) values (${invitedEmail}) returning id
      `);
      fixture.extraUserIds.push(invitedUser.id);

      const access = await service.provisionWorkspaceAccess({
        userId: invitedUser.id,
        email: invitedEmail,
        isNewUser: true,
      });

      assert.equal(access.source, 'invitation');
      assert.equal(access.role, 'manager');

      const [membership] = await query(sql`
        select role from workspace_memberships
        where workspace_id = ${fixture.workspaceId}
          and user_id = ${invitedUser.id}
      `);
      assert.equal(membership.role, 'manager');

      const [storedInvitation] = await query(sql`
        select status from invitations where id = ${invitation.id}
      `);
      assert.equal(storedInvitation.status, 'accepted');
      assert.equal(await service.findActiveInvitation(invitedEmail), null);

      const history = await service.listMembershipHistory(
        fixture.workspaceId,
        access.membershipId,
      );
      assert.ok(history.some((entry) => entry.action === 'membership.join'));

      const acceptEvents = await service.listAuditLogs({
        workspaceId: fixture.workspaceId,
        action: 'invitation.accept',
        resourceId: invitation.id,
      });
      assert.equal(acceptEvents.total, 1);

      const resentAccepted = await service.resendInvitation({
        workspaceId: fixture.workspaceId,
        invitationId: invitation.id,
        invitedByUserId: owner.userId,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      });
      assert.equal(resentAccepted, null);
    } finally {
      await cleanup(fixture);
    }
  },
);

test(
  'invitations can be revoked and resent, and expire when overdue',
  { skip },
  async () => {
    const fixture = await createWorkspace();
    const owner = fixture.members[0];
    const email = `resend-${fixture.suffix}@example.test`;
    try {
      const invitation = await service.upsertInvitation({
        workspaceId: fixture.workspaceId,
        email,
        role: 'viewer',
        invitedByUserId: owner.userId,
        expiresAt: new Date(Date.now() + 1000),
      });

      await service.revokeInvitation(fixture.workspaceId, invitation.id);
      assert.equal(await service.findActiveInvitation(email), null);

      const resent = await service.resendInvitation({
        workspaceId: fixture.workspaceId,
        invitationId: invitation.id,
        invitedByUserId: owner.userId,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      });
      assert.equal(resent.status, 'pending');
      assert.ok(await service.findActiveInvitation(email));

      const overdue = await service.upsertInvitation({
        workspaceId: fixture.workspaceId,
        email,
        role: 'viewer',
        invitedByUserId: owner.userId,
        expiresAt: new Date(Date.now() - 1000),
      });
      assert.equal(overdue.status, 'pending');

      const listed = await service.listInvitations(fixture.workspaceId);
      const row = listed.find((entry) => entry.id === overdue.id);
      assert.equal(row.status, 'expired');
      assert.equal(await service.findActiveInvitation(email), null);
    } finally {
      await cleanup(fixture);
    }
  },
);

test(
  'audit logs are workspace scoped, filterable and redact secrets',
  { skip },
  async () => {
    const fixture = await createWorkspace();
    const other = await createWorkspace();
    try {
      await audit.recordAudit({
        workspaceId: fixture.workspaceId,
        actorUserId: fixture.members[0].userId,
        action: 'test.secret_event',
        resourceType: 'membership',
        resourceId: 'audit-fixture',
        success: false,
        metadata: {
          note: 'keep me',
          token: 'do-not-store',
          nested: { password: 'do-not-store', visible: 'ok' },
        },
      });
      await audit.recordAudit({
        workspaceId: other.workspaceId,
        actorUserId: other.members[0].userId,
        action: 'test.other_event',
        resourceType: 'workspace',
      });

      const scoped = await service.listAuditLogs({
        workspaceId: fixture.workspaceId,
      });
      assert.equal(scoped.total, 1);

      const [entry] = scoped.items;
      assert.equal(entry.action, 'test.secret_event');
      assert.equal(entry.success, false);
      assert.equal(entry.metadata.note, 'keep me');
      assert.equal(entry.metadata.token, undefined);
      assert.equal(entry.metadata.nested.password, undefined);
      assert.equal(entry.metadata.nested.visible, 'ok');
      assert.ok(entry.actorEmail.includes(fixture.suffix));

      const byAction = await service.listAuditLogs({
        workspaceId: fixture.workspaceId,
        action: 'secret_event',
      });
      assert.equal(byAction.total, 1);

      const otherAction = await service.listAuditLogs({
        workspaceId: fixture.workspaceId,
        action: 'other_event',
      });
      assert.equal(otherAction.total, 0);

      const byActor = await service.listAuditLogs({
        workspaceId: fixture.workspaceId,
        actor: fixture.suffix,
      });
      assert.equal(byActor.total, 1);

      const failures = await service.listAuditLogs({
        workspaceId: fixture.workspaceId,
        success: 'false',
      });
      assert.equal(failures.total, 1);
      assert.equal(failures.items[0].action, 'test.secret_event');
    } finally {
      await cleanup(fixture);
      await cleanup(other);
    }
  },
);

test(
  'members and invitations never cross workspace boundaries',
  { skip },
  async () => {
    const first = await createWorkspace(['owner', 'member']);
    const second = await createWorkspace(['owner', 'member']);
    try {
      const firstMembers = await service.listMembers(first.workspaceId);
      assert.equal(firstMembers.length, 2);
      assert.ok(
        firstMembers.every((member) =>
          first.members.some((fixture) => fixture.userId === member.userId),
        ),
      );

      const crossChange = await service.changeMemberRole({
        workspaceId: first.workspaceId,
        membershipId: second.members[1].membershipId,
        role: 'viewer',
      });
      assert.equal(crossChange.status, 'not_found');

      await service.upsertInvitation({
        workspaceId: first.workspaceId,
        email: `scoped-${first.suffix}@example.test`,
        role: 'specialist',
        invitedByUserId: first.members[0].userId,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      });

      const secondInvitations = await service.listInvitations(
        second.workspaceId,
      );
      assert.equal(secondInvitations.length, 0);

      const firstInvitations = await service.listInvitations(first.workspaceId);
      assert.equal(firstInvitations.length, 1);
      assert.equal(firstInvitations[0].role, 'specialist');
    } finally {
      await cleanup(first);
      await cleanup(second);
    }
  },
);
