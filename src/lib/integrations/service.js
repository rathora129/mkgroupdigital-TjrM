import { randomUUID } from 'node:crypto';
import { and, count, desc, eq, inArray } from 'drizzle-orm';
import { getDb } from '@/db/client';
import {
  integrationSyncEvents,
  integrations,
  users,
  webhookEvents,
} from '@/db/schema';
import { ApiError } from '@/lib/api-error';
import { recordAudit } from '@/lib/audit';
import {
  INTEGRATION_KIND_LABELS,
  INTEGRATION_STATUS_LABELS,
} from './constants';
import {
  getProviderDefinition,
  listProviderDefinitions,
  providerConfigured,
  providerPublicView,
} from './registry';

const NOT_FOUND_MESSAGE =
  'That integration could not be found in this workspace.';

export function integrationNotFound() {
  return new ApiError(404, 'NOT_FOUND', NOT_FOUND_MESSAGE);
}

function toIso(value) {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

// Status is always derived from the environment plus stored state. A row can
// never claim "connected" while its credentials are missing.
function resolvedStatus(row, definition) {
  const configured = providerConfigured(definition);
  if (row?.disconnectedAt) return 'disconnected';
  if (!configured) return 'not_configured';
  if (row?.status === 'error' && row?.lastErrorAt) return 'error';
  return 'configured';
}

function toView(row, definition) {
  const base = definition
    ? providerPublicView(definition)
    : {
        kind: row.kind,
        provider: row.provider,
        label: row.provider,
        description: 'Unknown provider. It is no longer in the registry.',
        capabilities: [],
        requiredEnvKeys: [],
        connectionType: 'unknown',
        readOnly: true,
        requiresApproval: true,
        limitations: 'This provider is not recognised by the current build.',
        configured: false,
      };
  const status = resolvedStatus(row, definition);
  const kind = row?.kind || base.kind;
  const provider = row?.provider || base.provider;
  return {
    id: row?.id || null,
    kind,
    kindLabel: INTEGRATION_KIND_LABELS[kind] || kind,
    provider,
    name: row?.name || base.label,
    status,
    statusLabel: INTEGRATION_STATUS_LABELS[status],
    capabilities: row?.capabilities?.length ? row.capabilities : base.capabilities,
    settings: row?.settings || null,
    connectedByUserId: row?.connectedByUserId || null,
    lastSyncAt: toIso(row?.lastSyncAt),
    lastErrorAt: toIso(row?.lastErrorAt),
    lastErrorMessage: row?.lastErrorMessage || null,
    disconnectedAt: toIso(row?.disconnectedAt),
    createdAt: toIso(row?.createdAt),
    updatedAt: toIso(row?.updatedAt),
    // Provider metadata (names only; no credential values are ever read here).
    label: base.label,
    description: base.description,
    requiredEnvKeys: base.requiredEnvKeys,
    connectionType: base.connectionType,
    readOnly: base.readOnly,
    requiresApproval: base.requiresApproval,
    limitations: base.limitations,
    configured: base.configured,
  };
}

export async function listIntegrations(workspaceId, { kind, status } = {}) {
  const db = getDb();
  const rows = await db
    .select()
    .from(integrations)
    .where(eq(integrations.workspaceId, workspaceId));
  const byKey = new Map(rows.map((row) => [`${row.kind}:${row.provider}`, row]));

  const definitions = listProviderDefinitions(kind);
  const views = definitions.map((definition) =>
    toView(byKey.get(`${definition.kind}:${definition.provider}`) || null, definition),
  );

  // Rows whose provider was removed from the registry still show up, so a
  // stale record is visible rather than silently hidden.
  for (const row of rows) {
    if (kind && row.kind !== kind) continue;
    if (!getProviderDefinition(row.kind, row.provider)) {
      views.push(toView(row, null));
    }
  }

  const filtered = status ? views.filter((view) => view.status === status) : views;
  return {
    integrations: filtered,
    summary: summarize(views),
  };
}

function summarize(views) {
  const summary = {
    total: views.length,
    configured: 0,
    not_configured: 0,
    error: 0,
    disconnected: 0,
  };
  for (const view of views) summary[view.status] += 1;
  return summary;
}

export async function getIntegrationRow(workspaceId, integrationId) {
  const rows = await getDb()
    .select()
    .from(integrations)
    .where(
      and(eq(integrations.workspaceId, workspaceId), eq(integrations.id, integrationId)),
    )
    .limit(1);
  const row = rows[0];
  if (!row) throw integrationNotFound();
  return row;
}

export async function getIntegration(workspaceId, integrationId) {
  const row = await getIntegrationRow(workspaceId, integrationId);
  return toView(row, getProviderDefinition(row.kind, row.provider));
}

export async function registerIntegration({
  workspaceId,
  userId,
  kind,
  provider,
  name,
}) {
  const definition = getProviderDefinition(kind, provider);
  if (!definition) {
    throw new ApiError(422, 'VALIDATION_FAILED', 'Choose a known integration provider.', {
      provider: 'That provider is not supported by this build.',
    });
  }

  const db = getDb();
  const existing = await db
    .select()
    .from(integrations)
    .where(
      and(
        eq(integrations.workspaceId, workspaceId),
        eq(integrations.kind, kind),
        eq(integrations.provider, provider),
      ),
    )
    .limit(1);

  const displayName = name || definition.label;
  let row;
  if (existing[0]) {
    const updated = await db
      .update(integrations)
      .set({
        name: displayName,
        capabilities: definition.capabilities,
        updatedAt: new Date(),
      })
      .where(eq(integrations.id, existing[0].id))
      .returning();
    row = updated[0];
  } else {
    const inserted = await db
      .insert(integrations)
      .values({
        workspaceId,
        kind,
        provider,
        name: displayName,
        status: providerConfigured(definition) ? 'configured' : 'not_configured',
        capabilities: definition.capabilities,
        connectedByUserId: providerConfigured(definition) ? userId : null,
      })
      .returning();
    row = inserted[0];
  }

  await recordAudit({
    workspaceId,
    actorUserId: userId,
    action: 'integration.create',
    resourceType: 'integration',
    resourceId: row.id,
    metadata: { kind, provider, configured: providerConfigured(definition) },
  });

  return toView(row, definition);
}

export async function updateIntegration({
  workspaceId,
  userId,
  integrationId,
  values,
}) {
  const row = await getIntegrationRow(workspaceId, integrationId);
  const definition = getProviderDefinition(row.kind, row.provider);
  if (values.settings && !isPlainObject(values.settings)) {
    throw new ApiError(422, 'VALIDATION_FAILED', 'Settings must be an object.', {
      settings: 'Settings must be an object.',
    });
  }

  const updated = await getDb()
    .update(integrations)
    .set({
      name: values.name || row.name,
      settings: values.settings ?? row.settings,
      updatedAt: new Date(),
    })
    .where(eq(integrations.id, row.id))
    .returning();

  await recordAudit({
    workspaceId,
    actorUserId: userId,
    action: 'integration.update',
    resourceType: 'integration',
    resourceId: row.id,
    metadata: { kind: row.kind, provider: row.provider },
  });

  return toView(updated[0], definition);
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export async function connectIntegration({ workspaceId, userId, integrationId }) {
  const row = await getIntegrationRow(workspaceId, integrationId);
  const definition = getProviderDefinition(row.kind, row.provider);
  if (!definition || !providerConfigured(definition)) {
    throw new ApiError(
      409,
      'INTEGRATION_NOT_CONFIGURED',
      'This integration is not configured. Set its environment variables before connecting.',
    );
  }

  const updated = await getDb()
    .update(integrations)
    .set({
      status: 'configured',
      connectedByUserId: userId,
      disconnectedAt: null,
      lastErrorMessage: null,
      updatedAt: new Date(),
    })
    .where(eq(integrations.id, row.id))
    .returning();

  await recordAudit({
    workspaceId,
    actorUserId: userId,
    action: 'integration.connect',
    resourceType: 'integration',
    resourceId: row.id,
    metadata: { kind: row.kind, provider: row.provider, mode: definition.connectionType },
  });

  return toView(updated[0], definition);
}

export async function disconnectIntegration({
  workspaceId,
  userId,
  integrationId,
}) {
  const row = await getIntegrationRow(workspaceId, integrationId);
  const definition = getProviderDefinition(row.kind, row.provider);

  const updated = await getDb()
    .update(integrations)
    .set({
      status: 'disconnected',
      disconnectedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(integrations.id, row.id))
    .returning();

  await recordAudit({
    workspaceId,
    actorUserId: userId,
    action: 'integration.disconnect',
    resourceType: 'integration',
    resourceId: row.id,
    metadata: { kind: row.kind, provider: row.provider },
  });

  return toView(updated[0], definition);
}

export async function recordSyncEvent({
  workspaceId,
  integrationId = null,
  direction,
  eventType,
  source,
  status = 'recorded',
  externalId = null,
  idempotencyKey = null,
  summary = null,
  errorMessage = null,
  actorUserId = null,
  touchIntegration = true,
}) {
  const db = getDb();
  const values = {
    workspaceId,
    integrationId,
    direction,
    eventType,
    source,
    status,
    externalId,
    idempotencyKey: idempotencyKey || null,
    summary,
    errorMessage: errorMessage ? String(errorMessage).slice(0, 500) : null,
    actorUserId,
  };

  let inserted;
  try {
    inserted = await db.insert(integrationSyncEvents).values(values).returning();
  } catch (error) {
    if (error?.code === '23505' && idempotencyKey) {
      // Replaying the same idempotency key must not create a second event.
      const existing = await db
        .select()
        .from(integrationSyncEvents)
        .where(
          and(
            eq(integrationSyncEvents.workspaceId, workspaceId),
            eq(integrationSyncEvents.idempotencyKey, idempotencyKey),
          ),
        )
        .limit(1);
      return { event: existing[0] || null, duplicate: true };
    }
    throw error;
  }

  if (integrationId && touchIntegration) {
    await db
      .update(integrations)
      .set(
        status === 'failed'
          ? {
              lastErrorAt: new Date(),
              lastErrorMessage: String(errorMessage || 'Sync failed.').slice(0, 500),
              status: 'error',
              updatedAt: new Date(),
            }
          : { lastSyncAt: new Date(), updatedAt: new Date() },
      )
      .where(
        and(
          eq(integrations.workspaceId, workspaceId),
          eq(integrations.id, integrationId),
        ),
      );
  }

  return { event: inserted[0], duplicate: false };
}

export async function listSyncEvents(workspaceId, { page = 1, pageSize = 20 } = {}) {
  const db = getDb();
  const where = eq(integrationSyncEvents.workspaceId, workspaceId);
  const [rows, totalRows] = await Promise.all([
    db
      .select()
      .from(integrationSyncEvents)
      .where(where)
      .orderBy(desc(integrationSyncEvents.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db
      .select({ total: count() })
      .from(integrationSyncEvents)
      .where(where),
  ]);

  return {
    events: rows.map((row) => ({
      id: row.id,
      integrationId: row.integrationId,
      direction: row.direction,
      eventType: row.eventType,
      source: row.source,
      status: row.status,
      externalId: row.externalId,
      summary: row.summary,
      errorMessage: row.errorMessage,
      createdAt: toIso(row.createdAt),
    })),
    page,
    pageSize,
    total: Number(totalRows[0]?.total || 0),
  };
}

export async function getIntegrationOverview(workspaceId) {
  const db = getDb();
  const { integrations: views, summary } = await listIntegrations(workspaceId);
  const [recentEvents, failedEvents, recentWebhooks] = await Promise.all([
    db
      .select()
      .from(integrationSyncEvents)
      .where(eq(integrationSyncEvents.workspaceId, workspaceId))
      .orderBy(desc(integrationSyncEvents.createdAt))
      .limit(10),
    db
      .select()
      .from(integrationSyncEvents)
      .where(
        and(
          eq(integrationSyncEvents.workspaceId, workspaceId),
          eq(integrationSyncEvents.status, 'failed'),
        ),
      )
      .orderBy(desc(integrationSyncEvents.createdAt))
      .limit(10),
    db
      .select()
      .from(webhookEvents)
      .where(eq(webhookEvents.workspaceId, workspaceId))
      .orderBy(desc(webhookEvents.createdAt))
      .limit(10),
  ]);

  const actorIds = [
    ...new Set(
      [...recentEvents, ...failedEvents]
        .map((row) => row.actorUserId)
        .filter(Boolean),
    ),
  ];
  const actorRows = actorIds.length
    ? await db
        .select({ id: users.id, name: users.name, email: users.email })
        .from(users)
        .where(inArray(users.id, actorIds))
    : [];
  const actors = new Map(actorRows.map((row) => [row.id, row.name || row.email]));
  const shape = (row) => ({
    id: row.id,
    integrationId: row.integrationId,
    direction: row.direction,
    eventType: row.eventType,
    source: row.source,
    status: row.status,
    errorMessage: row.errorMessage,
    createdAt: toIso(row.createdAt),
    actorName: row.actorUserId ? actors.get(row.actorUserId) || null : null,
  });

  return {
    summary,
    integrations: views,
    recentEvents: recentEvents.map(shape),
    failedEvents: failedEvents.map(shape),
    recentWebhooks: recentWebhooks.map((row) => ({
      id: row.id,
      provider: row.provider,
      eventType: row.eventType,
      status: row.status,
      signatureValid: row.signatureValid,
      attemptCount: row.attemptCount,
      errorMessage: row.errorMessage,
      receivedAt: toIso(row.receivedAt),
      processedAt: toIso(row.processedAt),
    })),
    webhookSecretConfigured: Boolean(
      process.env.INTEGRATION_WEBHOOK_SECRET &&
        process.env.INTEGRATION_WEBHOOK_SECRET.trim(),
    ),
  };
}

export function newIdempotencyKey(prefix = 'int') {
  return `${prefix}-${randomUUID()}`;
}
