import { neon } from '@neondatabase/serverless';
import pg from 'pg';
import { drizzle as drizzleNeonHttp } from 'drizzle-orm/neon-http';
import { drizzle as drizzleNodePg } from 'drizzle-orm/node-postgres';
import * as schema from './schema';

let database;
let driver;
let pool;

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

export function isDatabaseConfigured() {
  return Boolean(process.env.DATABASE_URL);
}

function isLoopbackUrl(url) {
  try {
    return LOOPBACK_HOSTS.has(new URL(url).hostname);
  } catch {
    return false;
  }
}

export function resolveDriver(url) {
  const configured = (process.env.DB_DRIVER || '').trim().toLowerCase();

  if (configured) {
    if (configured !== 'neon-http' && configured !== 'node-postgres') {
      throw new Error(`Unsupported DB_DRIVER: ${process.env.DB_DRIVER}`);
    }
    return configured;
  }

  // Local PostgreSQL speaks the wire protocol, not Neon's HTTPS /sql
  // endpoint, so it always needs the TCP driver.
  return isLoopbackUrl(url) ? 'node-postgres' : 'neon-http';
}

function createClient() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL is not configured');
  }

  const selected = resolveDriver(url);
  const loopback = isLoopbackUrl(url);

  if (selected === 'neon-http' && loopback) {
    throw new Error(
      'DB_DRIVER=neon-http cannot reach a local PostgreSQL server. Use DB_DRIVER=node-postgres.',
    );
  }

  // A development shell that happens to export a production URL must not be
  // able to drive the local TCP driver against it by accident.
  if (
    selected === 'node-postgres' &&
    !loopback &&
    process.env.NODE_ENV !== 'production' &&
    process.env.ALLOW_REMOTE_DB !== '1'
  ) {
    throw new Error(
      'Refusing to open a remote database with node-postgres outside production. Set ALLOW_REMOTE_DB=1 to override.',
    );
  }

  driver = selected;

  if (selected === 'node-postgres') {
    pool = new pg.Pool({ connectionString: url, max: 10 });
    return drizzleNodePg(pool, { schema });
  }

  return drizzleNeonHttp(neon(url), { schema });
}

export function getDb() {
  if (!database) database = createClient();
  return database;
}

export function getDbDriver() {
  if (!database) getDb();
  return driver;
}

export async function closeDb() {
  const activePool = pool;
  pool = undefined;
  database = undefined;
  driver = undefined;
  if (activePool) await activePool.end();
}
