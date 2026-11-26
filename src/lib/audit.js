import { getDb } from '@/db/client';
import { auditLogs } from '@/db/schema';

const SENSITIVE_KEY = /pass|token|secret|key|auth|cookie|session|credential/i;
const MAX_STRING = 300;
const MAX_DEPTH = 3;

export function sanitizeMetadata(value) {
  return sanitize(value);
}

function sanitize(value, depth = 0) {
  if (value === null || value === undefined) return value;
  if (depth > MAX_DEPTH) return '[truncated]';

  if (typeof value === 'string') return value.slice(0, MAX_STRING);
  if (typeof value === 'number' || typeof value === 'boolean') return value;

  if (Array.isArray(value)) {
    return value.slice(0, 20).map((item) => sanitize(item, depth + 1));
  }

  if (typeof value === 'object') {
    const result = {};
    for (const [key, item] of Object.entries(value)) {
      if (SENSITIVE_KEY.test(key)) continue;
      result[key] = sanitize(item, depth + 1);
    }
    return result;
  }

  return undefined;
}

// Audit writes are best-effort: a logging failure must not take down the
// request or leak its payload to stdout.
export async function recordAudit({
  workspaceId = null,
  actorUserId = null,
  actorType = 'user',
  action,
  resourceType = null,
  resourceId = null,
  success = true,
  metadata = null,
}) {
  if (!action) return;

  try {
    await getDb().insert(auditLogs).values({
      workspaceId,
      actorUserId,
      actorType,
      action,
      resourceType,
      resourceId: resourceId ? String(resourceId) : null,
      success: Boolean(success),
      metadata: metadata ? sanitize(metadata) : null,
    });
  } catch {
    console.error('[audit] event could not be recorded');
  }
}
