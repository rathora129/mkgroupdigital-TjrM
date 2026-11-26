import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { integrations, webhookEvents } from '@/db/schema';
import { ApiError } from '@/lib/api-error';
import { recordAudit } from '@/lib/audit';
import {
  INTEGRATION_JOB_MAX_ATTEMPTS,
  enqueueWebhookEvent,
} from '@/lib/ai/queue';
import { validateLeadPayload } from './adapters';
import { isUniqueViolation } from '@/lib/business/references';
import { isUuid } from './validation';
import { recordSyncEvent } from './service';

export const WEBHOOK_SIGNATURE_HEADER = 'x-mk-signature';
export const WEBHOOK_TIMESTAMP_HEADER = 'x-mk-timestamp';
export const WEBHOOK_MAX_SKEW_SECONDS = 300;
export const WEBHOOK_MAX_BODY_BYTES = 64 * 1024;

function webhookSecret() {
  const value = process.env.INTEGRATION_WEBHOOK_SECRET;
  return value && value.trim() ? value.trim() : null;
}

// Only a boolean leaves this function; the secret itself is never returned to
// a request, log line or audit record.
export function isWebhookConfigured() {
  return Boolean(webhookSecret());
}

export function computeSignature({ secret, timestamp, rawBody }) {
  return createHmac('sha256', secret)
    .update(`${timestamp}.${rawBody}`)
    .digest('hex');
}

export function verifyWebhookSignature({
  rawBody,
  signature,
  timestamp,
  secret = webhookSecret(),
  now = Date.now(),
}) {
  if (!secret) return { ok: false, reason: 'not_configured' };
  if (!signature || typeof signature !== 'string') {
    return { ok: false, reason: 'missing_signature' };
  }
  if (!timestamp || !/^\d{1,12}$/.test(String(timestamp))) {
    return { ok: false, reason: 'invalid_timestamp' };
  }
  const seconds = Number(timestamp);
  if (!Number.isFinite(seconds)) return { ok: false, reason: 'invalid_timestamp' };
  if (Math.abs(Math.floor(now / 1000) - seconds) > WEBHOOK_MAX_SKEW_SECONDS) {
    return { ok: false, reason: 'stale_timestamp' };
  }

  const expected = computeSignature({ secret, timestamp, rawBody });
  const given = signature.trim().toLowerCase().replace(/^sha256=/, '');
  if (expected.length !== given.length) return { ok: false, reason: 'invalid_signature' };
  const equal = timingSafeEqual(Buffer.from(expected), Buffer.from(given));
  return equal ? { ok: true, reason: 'ok' } : { ok: false, reason: 'invalid_signature' };
}

export function buildIdempotencyKey({ provider, externalEventId, rawBody }) {
  if (externalEventId) return `${provider}:${String(externalEventId).slice(0, 180)}`;
  const digest = createHash('sha256').update(rawBody).digest('hex');
  return `${provider}:sha256:${digest}`;
}

export function parseWebhookEnvelope(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new ApiError(422, 'VALIDATION_FAILED', 'The event payload must be an object.');
  }
  if (!isUuid(payload.workspaceId)) {
    throw new ApiError(422, 'VALIDATION_FAILED', 'workspaceId must be a UUID.', {
      workspaceId: 'A valid workspace id is required.',
    });
  }
  const eventType = typeof payload.eventType === 'string' ? payload.eventType.trim() : '';
  if (!eventType || eventType.length > 100) {
    throw new ApiError(422, 'VALIDATION_FAILED', 'eventType is required.', {
      eventType: 'Provide an event type under 100 characters.',
    });
  }
  const externalEventId =
    typeof payload.externalEventId === 'string' && payload.externalEventId.trim()
      ? payload.externalEventId.trim().slice(0, 200)
      : null;
  const data = payload.data;
  if (data !== undefined && (typeof data !== 'object' || data === null || Array.isArray(data))) {
    throw new ApiError(422, 'VALIDATION_FAILED', 'data must be an object.', {
      data: 'data must be an object.',
    });
  }
  return {
    workspaceId: payload.workspaceId,
    eventType,
    externalEventId,
    data: data || {},
  };
}

export async function readRawWebhookBody(request) {
  const contentLength = Number(request.headers.get('content-length') || 0);
  if (contentLength > WEBHOOK_MAX_BODY_BYTES) {
    throw new ApiError(413, 'BODY_TOO_LARGE', 'That request is too large.');
  }
  const raw = await request.text();
  if (Buffer.byteLength(raw, 'utf8') > WEBHOOK_MAX_BODY_BYTES) {
    throw new ApiError(413, 'BODY_TOO_LARGE', 'That request is too large.');
  }
  return raw;
}

async function findProviderRow(workspaceId, provider) {
  const rows = await getDb()
    .select()
    .from(integrations)
    .where(
      and(eq(integrations.workspaceId, workspaceId), eq(integrations.provider, provider)),
    )
    .limit(1);
  return rows[0] || null;
}

export async function ingestWebhook({
  provider,
  rawBody,
  signature,
  timestamp,
  enqueue = enqueueWebhookEvent,
}) {
  if (!isWebhookConfigured()) {
    throw new ApiError(
      503,
      'INTEGRATION_NOT_CONFIGURED',
      'This webhook endpoint is not configured.',
    );
  }

  const verification = verifyWebhookSignature({
    rawBody,
    signature,
    timestamp,
  });
  if (!verification.ok) {
    throw new ApiError(401, 'INVALID_SIGNATURE', 'The webhook signature is not valid.', {
      reason: verification.reason,
    });
  }

  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    throw new ApiError(400, 'INVALID_JSON', 'The event payload could not be read.');
  }

  const envelope = parseWebhookEnvelope(payload);
  const idempotencyKey = buildIdempotencyKey({
    provider,
    externalEventId: envelope.externalEventId,
    rawBody,
  });

  const providerRow = await findProviderRow(envelope.workspaceId, provider);

  let inserted;
  try {
    inserted = await getDb()
      .insert(webhookEvents)
      .values({
        workspaceId: envelope.workspaceId,
        integrationId: providerRow?.id || null,
        provider,
        eventType: envelope.eventType,
        externalEventId: envelope.externalEventId,
        idempotencyKey,
        signatureValid: true,
        status: 'received',
        payload: envelope,
        receivedAt: new Date(),
      })
      .returning();
  } catch (error) {
    if (isUniqueViolation(error)) {
      const existing = await getDb()
        .select()
        .from(webhookEvents)
        .where(
          and(
            eq(webhookEvents.workspaceId, envelope.workspaceId),
            eq(webhookEvents.idempotencyKey, idempotencyKey),
          ),
        )
        .limit(1);
      await recordAudit({
        workspaceId: envelope.workspaceId,
        action: 'integration.webhook_received',
        resourceType: 'webhook_event',
        resourceId: existing[0]?.id || null,
        metadata: { provider, duplicate: true, eventType: envelope.eventType },
      });
      return {
        id: existing[0]?.id || null,
        duplicate: true,
        status: existing[0]?.status || 'received',
      };
    }
    throw error;
  }

  const event = inserted[0];

  await recordAudit({
    workspaceId: envelope.workspaceId,
    action: 'integration.webhook_received',
    resourceType: 'webhook_event',
    resourceId: event.id,
    metadata: {
      provider,
      eventType: envelope.eventType,
      externalEventId: envelope.externalEventId,
    },
  });

  try {
    await enqueue(event.id);
  } catch {
    // The event is already stored. A queue outage leaves it in `received` so
    // an operator can replay it; it is never silently dropped.
    await getDb()
      .update(webhookEvents)
      .set({ errorMessage: 'Queue unavailable; event stored for replay.' })
      .where(eq(webhookEvents.id, event.id));
  }

  return { id: event.id, duplicate: false, status: 'received' };
}

async function loadEvent(webhookEventId) {
  const rows = await getDb()
    .select()
    .from(webhookEvents)
    .where(eq(webhookEvents.id, webhookEventId))
    .limit(1);
  return rows[0] || null;
}

async function markFailed(event, message) {
  const updates = {
    status: 'failed',
    attemptCount: event.attemptCount + 1,
    errorMessage: String(message).slice(0, 500),
    processedAt: new Date(),
  };
  await getDb().update(webhookEvents).set(updates).where(eq(webhookEvents.id, event.id));
  await recordSyncEvent({
    workspaceId: event.workspaceId,
    integrationId: event.integrationId,
    direction: 'inbound',
    eventType: event.eventType,
    source: event.provider,
    status: 'failed',
    externalId: event.externalEventId,
    idempotencyKey: `webhook-failure:${event.id}:${updates.attemptCount}`,
    summary: { provider: event.provider },
    errorMessage: updates.errorMessage,
  });
  await recordAudit({
    workspaceId: event.workspaceId,
    action: 'integration.webhook_failed',
    resourceType: 'webhook_event',
    resourceId: event.id,
    success: false,
    metadata: {
      provider: event.provider,
      eventType: event.eventType,
      error: updates.errorMessage,
    },
  });
  return updates;
}

// Worker entry point. Safe to run twice: a processed event is skipped, and a
// permanent validation failure is recorded rather than retried forever.
export async function processWebhookEvent(webhookEventId) {
  const event = await loadEvent(webhookEventId);
  if (!event) return { status: 'skipped', reason: 'missing-event' };
  if (event.status === 'processed' || event.status === 'ignored') {
    return { status: 'skipped', reason: 'already-settled' };
  }

  await getDb()
    .update(webhookEvents)
    .set({ status: 'processing' })
    .where(eq(webhookEvents.id, event.id));

  try {
    let summary = { provider: event.provider, eventType: event.eventType };
    if (event.provider === 'inbound_hmac') {
      const lead = validateLeadPayload(event.payload?.data || {});
      // The event is recorded as a lead candidate. Leads are never created
      // automatically, so a bad or duplicate event cannot pollute the CRM.
      summary = { ...summary, leadCandidate: { name: lead.name, hasEmail: Boolean(lead.email) } };
    }

    await recordSyncEvent({
      workspaceId: event.workspaceId,
      integrationId: event.integrationId,
      direction: 'inbound',
      eventType: event.eventType,
      source: event.provider,
      status: 'recorded',
      externalId: event.externalEventId,
      summary,
      actorUserId: null,
    });

    await getDb()
      .update(webhookEvents)
      .set({
        status: 'processed',
        signatureValid: true,
        attemptCount: event.attemptCount + 1,
        processedAt: new Date(),
        errorMessage: null,
      })
      .where(eq(webhookEvents.id, event.id));

    await recordAudit({
      workspaceId: event.workspaceId,
      action: 'integration.webhook_processed',
      resourceType: 'webhook_event',
      resourceId: event.id,
      metadata: { provider: event.provider, eventType: event.eventType },
    });

    return { status: 'processed' };
  } catch (error) {
    const message =
      error instanceof ApiError ? error.message : 'The event could not be processed.';
    const updates = await markFailed(event, message);
    if (updates.attemptCount < INTEGRATION_JOB_MAX_ATTEMPTS && !(error instanceof ApiError)) {
      // Only unexpected failures retry; a deterministic validation failure is
      // terminal so it cannot occupy the queue indefinitely.
      throw error;
    }
    return { status: 'failed', reason: updates.errorMessage };
  }
}
