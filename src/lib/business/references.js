import { and, eq, sql } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { ApiError } from '@/lib/api-error';

export function isUniqueViolation(error) {
  return (
    error?.code === '23505' ||
    error?.cause?.code === '23505' ||
    /duplicate key|unique constraint/i.test(error?.message || '')
  );
}

// Human-readable, per-workspace sequential references (PRJ-0001, INV-0001 ...).
// The max()+1 read is not atomic, so every insert retries on a unique
// violation. The unique index remains the authority under concurrency.
const MAX_ATTEMPTS = 12;

export async function insertWithReference({
  table,
  workspaceId,
  prefix,
  width = 4,
  values,
  returning,
}) {
  if (typeof prefix !== 'string' || prefix.length === 0) {
    throw new ApiError(
      400,
      'INVALID_REFERENCE_PREFIX',
      'A reference prefix is required.',
    );
  }
  if (!Number.isInteger(width) || width < 1 || width > 12) {
    throw new ApiError(
      400,
      'INVALID_REFERENCE_WIDTH',
      'Reference width must be a small positive integer.',
    );
  }

  const start = prefix.length + 1;

  // The numeric suffix is extracted positionally with substr() and only
  // counted when it is entirely digits. Reference text is never used as a
  // regular-expression pattern, and malformed or foreign-prefix rows are
  // ignored instead of aborting the allocation.
  const suffix = sql`substr(${table.reference}, ${start})`;
  const numericSuffix = sql`case when ${suffix} ~ '^[0-9]+$' then cast(${suffix} as integer) end`;
  const startsWithPrefix = sql`left(${table.reference}, ${prefix.length}) = ${prefix}`;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const rows = await getDb()
      .select({
        value: sql`coalesce(max(${numericSuffix}), 0)`,
      })
      .from(table)
      .where(and(eq(table.workspaceId, workspaceId), startsWithPrefix));

    const next = Number(rows[0]?.value || 0) + 1;
    const reference = `${prefix}${String(next).padStart(width, '0')}`;

    try {
      const inserted = await getDb()
        .insert(table)
        .values({ ...values, reference })
        .returning(returning || { id: table.id, reference: table.reference });
      return inserted[0];
    } catch (error) {
      if (isUniqueViolation(error) && attempt < MAX_ATTEMPTS - 1) continue;
      throw error;
    }
  }

  throw new ApiError(
    409,
    'REFERENCE_CONFLICT',
    'A reference could not be reserved. Try again.',
  );
}
