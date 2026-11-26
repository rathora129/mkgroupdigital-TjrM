import { sql } from 'drizzle-orm';
import { getDb, closeDb } from '@/db/client';

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

// These fixtures create and delete rows, so they must never point at anything
// that could be a real database.
export function assertDisposableTestUrl(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('PHASE2A_TEST_DATABASE_URL is not a valid URL');
  }

  const database = parsed.pathname.replace(/^\//, '');
  if (!database.endsWith('_test')) {
    throw new Error(
      `Refusing to run destructive fixtures against "${database}": the test database name must end in _test.`,
    );
  }

  if (
    !LOOPBACK_HOSTS.has(parsed.hostname) &&
    process.env.PHASE2A_TEST_ALLOW_REMOTE !== '1'
  ) {
    throw new Error(
      'Refusing to run destructive fixtures against a remote database. Set PHASE2A_TEST_ALLOW_REMOTE=1 to override.',
    );
  }
}

export { sql };

export async function query(statement) {
  const result = await getDb().execute(statement);
  return result.rows;
}

export async function closeDatabase() {
  await closeDb();
}
