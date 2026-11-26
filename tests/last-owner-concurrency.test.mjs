import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {
  sql,
  query,
  closeDatabase,
  assertDisposableTestUrl,
} from './support/db.mjs';

// These tests need a disposable PostgreSQL database that has the Phase 2A
// migrations applied. They deliberately ignore DATABASE_URL: only the clearly
// separated PHASE2A_TEST_DATABASE_URL is used, so a shell that happens to hold
// production credentials can never be mutated by `npm test`.
//
//   PHASE2A_TEST_DATABASE_URL=postgres://... npm test
const TEST_DATABASE_URL = process.env.PHASE2A_TEST_DATABASE_URL || '';
const skip = TEST_DATABASE_URL
  ? false
  : 'set PHASE2A_TEST_DATABASE_URL to a disposable, migrated database';

let service = null;

if (TEST_DATABASE_URL) {
  assertDisposableTestUrl(TEST_DATABASE_URL);
  process.env.DATABASE_URL = TEST_DATABASE_URL;
  service = await import('@/lib/workspace/service');
}

after(async () => {
  await closeDatabase();
});

async function createWorkspace(ownerCount) {
  const suffix = randomUUID();
  const [workspace] = await query(sql`
    insert into workspaces (name, slug)
    values ('P0 last-owner test', ${`p0-${suffix}`})
    returning id
  `);

  const members = [];
  for (let index = 0; index < ownerCount; index += 1) {
    const email = `p0-${suffix}-${index}@example.test`;
    const [user] = await query(sql`
      insert into users (email) values (${email}) returning id
    `);
    const [membership] = await query(sql`
      insert into workspace_memberships (workspace_id, user_id, role)
      values (${workspace.id}, ${user.id}, 'owner')
      returning id
    `);
    members.push({ userId: user.id, membershipId: membership.id });
  }

  return { workspaceId: workspace.id, members };
}

async function cleanup(fixture) {
  await query(sql`delete from workspaces where id = ${fixture.workspaceId}`);
  for (const member of fixture.members) {
    await query(sql`delete from users where id = ${member.userId}`);
  }
}

test('concurrent owner demotions keep at least one owner', { skip }, async () => {
  const fixture = await createWorkspace(2);
  try {
    const results = await Promise.all(
      fixture.members.map((member) =>
        service.changeMemberRole({
          workspaceId: fixture.workspaceId,
          membershipId: member.membershipId,
          role: 'member',
        }),
      ),
    );

    assert.deepEqual(
      results.map((result) => result.status).sort(),
      ['last_owner', 'updated'],
    );
    assert.equal(await service.countOwners(fixture.workspaceId), 1);
  } finally {
    await cleanup(fixture);
  }
});

test('concurrent owner removals keep at least one owner', { skip }, async () => {
  const fixture = await createWorkspace(2);
  try {
    const results = await Promise.all(
      fixture.members.map((member) =>
        service.removeMember(fixture.workspaceId, member.membershipId),
      ),
    );

    assert.deepEqual(
      results.map((result) => result.status).sort(),
      ['last_owner', 'removed'],
    );
    assert.equal(await service.countOwners(fixture.workspaceId), 1);
  } finally {
    await cleanup(fixture);
  }
});

test('a demotion is allowed while another owner remains', { skip }, async () => {
  const fixture = await createWorkspace(3);
  try {
    const results = await Promise.all(
      fixture.members.slice(0, 2).map((member) =>
        service.changeMemberRole({
          workspaceId: fixture.workspaceId,
          membershipId: member.membershipId,
          role: 'member',
        }),
      ),
    );

    assert.deepEqual(
      results.map((result) => result.status),
      ['updated', 'updated'],
    );
    assert.equal(await service.countOwners(fixture.workspaceId), 1);
  } finally {
    await cleanup(fixture);
  }
});

test('a membership from another workspace is not found', { skip }, async () => {
  const first = await createWorkspace(1);
  const second = await createWorkspace(1);
  try {
    const result = await service.changeMemberRole({
      workspaceId: first.workspaceId,
      membershipId: second.members[0].membershipId,
      role: 'member',
    });

    assert.equal(result.status, 'not_found');
  } finally {
    await cleanup(first);
    await cleanup(second);
  }
});
