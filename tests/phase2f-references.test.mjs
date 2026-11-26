import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {
  sql,
  query,
  closeDatabase,
  assertDisposableTestUrl,
} from './support/db.mjs';

// Phase 2F-B regression coverage for per-workspace sequential references.
// Runs only against PHASE2A_TEST_DATABASE_URL (a disposable database whose
// name ends in _test).
const TEST_DATABASE_URL = process.env.PHASE2A_TEST_DATABASE_URL || '';
const skip = TEST_DATABASE_URL
  ? false
  : 'set PHASE2A_TEST_DATABASE_URL to a disposable, migrated database';

if (TEST_DATABASE_URL) {
  assertDisposableTestUrl(TEST_DATABASE_URL);
  process.env.DATABASE_URL = TEST_DATABASE_URL;
}

const clientsService = await import('@/lib/clients/service');
const clientValidation = await import('@/lib/clients/validation');
const { insertWithReference } = await import('@/lib/business/references');
const { clients } = await import('@/db/schema');

after(async () => {
  await closeDatabase();
});

async function createWorkspace(label) {
  const suffix = randomUUID();
  const [workspace] = await query(sql`
    insert into workspaces (name, slug)
    values (${`Phase 2F ref ${label}`}, ${`p2f-ref-${label}-${suffix}`})
    returning id
  `);

  const [user] = await query(sql`
    insert into users (email, name)
    values (${`p2f-ref-${label}-${suffix}@example.test`}, ${'owner person'})
    returning id
  `);
  await query(sql`
    insert into workspace_memberships (workspace_id, user_id, role)
    values (${workspace.id}, ${user.id}, 'owner')
  `);

  return { workspaceId: workspace.id, ownerId: user.id };
}

async function cleanup(fixtures) {
  const workspaceIds = fixtures.map((f) => f.workspaceId);
  const userIds = fixtures.map((f) => f.ownerId);
  if (workspaceIds.length) {
    await query(
      sql`delete from audit_logs where workspace_id in (${sql.join(
        workspaceIds.map((id) => sql`${id}`),
        sql`, `,
      )})`,
    );
    await query(
      sql`delete from workspaces where id in (${sql.join(
        workspaceIds.map((id) => sql`${id}`),
        sql`, `,
      )})`,
    );
  }
  for (const userId of userIds) {
    await query(sql`delete from users where id = ${userId}`);
  }
}

async function makeClient(fixture, overrides = {}) {
  const data = await clientValidation.clientCreateSchema.validate({
    companyName: `Client ${randomUUID().slice(0, 8)}`,
    ...overrides,
  });
  const detail = await clientsService.createClient({
    workspaceId: fixture.workspaceId,
    userId: fixture.ownerId,
    data,
  });
  return detail.client;
}

async function insertHistorical(fixture, reference) {
  await query(sql`
    insert into clients (workspace_id, reference, company_name, created_by_user_id)
    values (${fixture.workspaceId}, ${reference}, ${`Historical ${reference}`}, ${fixture.ownerId})
  `);
}

test('first client reference is CLI-0001', { skip }, async () => {
  const fixture = await createWorkspace('first');
  try {
    const client = await makeClient(fixture);
    assert.equal(client.reference, 'CLI-0001');
  } finally {
    await cleanup([fixture]);
  }
});

test('second client reference is CLI-0002 in the same workspace', { skip }, async () => {
  const fixture = await createWorkspace('second');
  try {
    const first = await makeClient(fixture);
    const second = await makeClient(fixture);
    assert.equal(first.reference, 'CLI-0001');
    assert.equal(second.reference, 'CLI-0002');
  } finally {
    await cleanup([fixture]);
  }
});

test('multiple client references allocate sequentially', { skip }, async () => {
  const fixture = await createWorkspace('many');
  try {
    const references = [];
    for (let index = 0; index < 5; index += 1) {
      const client = await makeClient(fixture);
      references.push(client.reference);
    }
    assert.deepEqual(references, [
      'CLI-0001',
      'CLI-0002',
      'CLI-0003',
      'CLI-0004',
      'CLI-0005',
    ]);
  } finally {
    await cleanup([fixture]);
  }
});

test('separate workspaces each start at CLI-0001', { skip }, async () => {
  const a = await createWorkspace('iso-a');
  const b = await createWorkspace('iso-b');
  try {
    const firstA = await makeClient(a);
    const secondA = await makeClient(a);
    const firstB = await makeClient(b);
    assert.equal(firstA.reference, 'CLI-0001');
    assert.equal(secondA.reference, 'CLI-0002');
    assert.equal(firstB.reference, 'CLI-0001');
  } finally {
    await cleanup([a, b]);
  }
});

test('concurrent allocations never duplicate a reference', { skip }, async () => {
  const fixture = await createWorkspace('concurrent');
  try {
    const created = await Promise.all(
      Array.from({ length: 8 }, () => makeClient(fixture)),
    );
    const references = created.map((client) => client.reference);
    const unique = new Set(references);
    assert.equal(unique.size, references.length);
    for (const reference of references) {
      assert.match(reference, /^CLI-\d{4}$/);
    }
    const numbers = references
      .map((reference) => Number(reference.slice(4)))
      .sort((left, right) => left - right);
    assert.deepEqual(numbers, [1, 2, 3, 4, 5, 6, 7, 8]);
  } finally {
    await cleanup([fixture]);
  }
});

test('historical numeric references are respected', { skip }, async () => {
  const fixture = await createWorkspace('historical');
  try {
    await insertHistorical(fixture, 'CLI-0007');
    await insertHistorical(fixture, 'CLI-0019');
    const client = await makeClient(fixture);
    assert.equal(client.reference, 'CLI-0020');
  } finally {
    await cleanup([fixture]);
  }
});

test('malformed and foreign references do not break allocation', { skip }, async () => {
  const fixture = await createWorkspace('malformed');
  try {
    await insertHistorical(fixture, 'CLI-ABCD');
    await insertHistorical(fixture, 'CLI-12x');
    await insertHistorical(fixture, 'ZZZ-0009');
    const first = await makeClient(fixture);
    const second = await makeClient(fixture);
    assert.match(first.reference, /^CLI-\d{4}$/);
    assert.match(second.reference, /^CLI-\d{4}$/);
    assert.notEqual(first.reference, second.reference);
  } finally {
    await cleanup([fixture]);
  }
});

test('insertWithReference rejects an empty prefix instead of overflowing', { skip }, async () => {
  const fixture = await createWorkspace('empty-prefix');
  try {
    await assert.rejects(
      insertWithReference({
        table: clients,
        workspaceId: fixture.workspaceId,
        prefix: '',
        values: {
          workspaceId: fixture.workspaceId,
          companyName: 'No prefix',
          createdByUserId: fixture.ownerId,
        },
      }),
      (error) => error.status === 400 || error.status === 422,
    );
  } finally {
    await cleanup([fixture]);
  }
});
