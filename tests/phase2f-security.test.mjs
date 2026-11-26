import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {
  assertSameOrigin,
  readJsonBody,
  errorPayload,
} from '@/lib/http-guards';
import { ApiError } from '@/lib/api-error';
import { rateLimit } from '@/lib/rate-limit';
import {
  sql,
  query,
  closeDatabase,
  assertDisposableTestUrl,
} from './support/db.mjs';

// Phase 2F-I — security hardening of the shared request layer: same-origin
// enforcement, body limits, error sanitisation, rate limiting and resistance
// to SQL injection through user-supplied search text.
const TEST_DATABASE_URL = process.env.PHASE2A_TEST_DATABASE_URL || '';
const skip = TEST_DATABASE_URL
  ? false
  : 'set PHASE2A_TEST_DATABASE_URL to a disposable, migrated database';

if (TEST_DATABASE_URL) {
  assertDisposableTestUrl(TEST_DATABASE_URL);
  process.env.DATABASE_URL = TEST_DATABASE_URL;
}

const leads = await import('@/lib/leads/service');
const leadValidation = await import('@/lib/leads/validation');

after(async () => {
  await closeDatabase();
});

function requestWith(headers = {}, body = undefined) {
  const map = new Map(
    Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]),
  );
  return {
    headers: { get: (name) => map.get(String(name).toLowerCase()) ?? null },
    json: async () => {
      if (body === undefined) throw new SyntaxError('Unexpected end of JSON input');
      if (typeof body === 'string') return JSON.parse(body);
      return body;
    },
  };
}

test('state-changing requests must come from the same origin', () => {
  const rejects = (error) => error.code === 'INVALID_ORIGIN' && error.status === 403;

  assert.throws(() => assertSameOrigin(requestWith({})), rejects);
  assert.throws(
    () => assertSameOrigin(requestWith({ origin: 'not a url', host: 'app.test' })),
    rejects,
  );
  assert.throws(
    () => assertSameOrigin(requestWith({ origin: 'https://evil.test', host: 'app.test' })),
    rejects,
  );
  assert.throws(
    () =>
      assertSameOrigin(
        requestWith({
          origin: 'https://app.test',
          'x-forwarded-host': 'evil.test',
        }),
      ),
    rejects,
  );

  assert.doesNotThrow(() =>
    assertSameOrigin(requestWith({ origin: 'https://app.test', host: 'app.test' })),
  );
  assert.doesNotThrow(() =>
    assertSameOrigin(
      requestWith({
        origin: 'https://app.test',
        'x-forwarded-host': 'app.test, edge.internal',
      }),
    ),
  );
  // Portable local origin with a port must compare host (including port).
  assert.doesNotThrow(() =>
    assertSameOrigin(
      requestWith({ origin: 'http://127.0.0.1:3000', host: '127.0.0.1:3000' }),
    ),
  );
});

test('request bodies are size-limited and must be valid JSON', async () => {
  await assert.rejects(
    () =>
      readJsonBody(
        requestWith({ 'content-length': String(33 * 1024) }, '{}'),
      ),
    (error) => error.code === 'BODY_TOO_LARGE' && error.status === 413,
  );

  await assert.rejects(
    () => readJsonBody(requestWith({ 'content-length': '10' }, '{not json')),
    (error) => error.code === 'INVALID_JSON' && error.status === 400,
  );

  const parsed = await readJsonBody(
    requestWith({ 'content-length': '13' }, { amountCents: 1 }),
  );
  assert.deepEqual(parsed, { amountCents: 1 });
});

test('unexpected errors are sanitised instead of leaked to the client', () => {
  const apiPayload = errorPayload(
    new ApiError(422, 'VALIDATION_FAILED', 'Check the fields.', { name: 'Required' }),
  );
  assert.equal(apiPayload.status, 422);
  assert.equal(apiPayload.code, 'VALIDATION_FAILED');
  assert.equal(apiPayload.message, 'Check the fields.');
  assert.deepEqual(apiPayload.details, { name: 'Required' });

  const original = console.error;
  const logged = [];
  console.error = (line) => logged.push(line);
  try {
    const internal = errorPayload(
      new Error('connect failed: postgres://admin:hunter2@10.0.0.5/workforce'),
    );
    assert.equal(internal.status, 500);
    assert.equal(internal.code, 'INTERNAL');
    assert.equal(internal.message, 'Something went wrong. Please try again.');
    assert.equal(internal.details, undefined);
    const serialized = JSON.stringify(internal);
    assert.doesNotMatch(serialized, /postgres:\/\/|hunter2|10\.0\.0\.5|connect failed/);
    assert.deepEqual(logged, ['[workforce-api] Error']);
  } finally {
    console.error = original;
  }
});

test('rate limiting blocks a key after the limit and recovers after the window', async () => {
  const key = `security-test:${randomUUID()}`;
  assert.equal(rateLimit(key, { limit: 2, windowMs: 30 }).ok, true);
  assert.equal(rateLimit(key, { limit: 2, windowMs: 30 }).ok, true);
  const blocked = rateLimit(key, { limit: 2, windowMs: 30 });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.remaining, 0);
  assert.ok(blocked.retryAfter >= 1);

  assert.equal(
    rateLimit(`${key}:other`, { limit: 1, windowMs: 30 }).ok,
    true,
    'limits are per key',
  );

  await new Promise((resolve) => setTimeout(resolve, 45));
  assert.equal(rateLimit(key, { limit: 2, windowMs: 30 }).ok, true);
});

async function createWorkspace() {
  const suffix = randomUUID();
  const [workspace] = await query(sql`
    insert into workspaces (name, slug)
    values ('Phase 2F security', ${`p2f-sec-${suffix}`})
    returning id
  `);
  const [user] = await query(sql`
    insert into users (email, name)
    values (${`p2f-sec-${suffix}@example.test`}, 'security owner')
    returning id
  `);
  await query(sql`
    insert into workspace_memberships (workspace_id, user_id, role)
    values (${workspace.id}, ${user.id}, 'owner')
  `);
  return { workspaceId: workspace.id, ownerId: user.id, userIds: [user.id] };
}

async function cleanup(fixture) {
  await query(sql`delete from audit_logs where workspace_id = ${fixture.workspaceId}`);
  await query(sql`delete from workspaces where id = ${fixture.workspaceId}`);
  for (const userId of fixture.userIds) {
    await query(sql`delete from users where id = ${userId}`);
  }
}

test('search text is treated as data, never as SQL', { skip }, async () => {
  const fixture = await createWorkspace();
  try {
    for (const companyName of [
      'Acme Growth 100% Digital',
      `Robert'); DROP TABLE leads;--`,
      'Plain Sample Co',
    ]) {
      await leads.createLead({
        workspaceId: fixture.workspaceId,
        userId: fixture.ownerId,
        data: await leadValidation.leadCreateSchema.validate({ companyName }),
      });
    }

    const search = (text) =>
      leads.listLeads(fixture.workspaceId, fixture.ownerId, {
        page: 1,
        pageSize: 20,
        search: text,
      });

    const literalPercent = await search('100%');
    assert.equal(literalPercent.total, 1);
    assert.match(literalPercent.items[0].companyName, /100%/);

    // A bare wildcard must be escaped and match only rows that contain "%".
    const wildcard = await search('%');
    assert.equal(wildcard.total, 1);
    assert.equal(wildcard.items[0].companyName, 'Acme Growth 100% Digital');

    const injection = await search(`' OR '1'='1' --`);
    assert.equal(injection.total, 0, 'injection payload matches no rows');

    const quote = await search(`Robert'); DROP TABLE leads;--`);
    assert.equal(quote.total, 1, 'the stored name is matched literally');

    const [tableCount] = await query(sql`select count(*)::int as count from leads`);
    assert.ok(tableCount.count >= 3, 'leads table is intact after injection attempts');

    const underscore = await search('_');
    assert.equal(underscore.total, 0, 'a bare underscore is escaped to a literal');
  } finally {
    await cleanup(fixture);
  }
});
