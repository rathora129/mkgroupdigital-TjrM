import test from 'node:test';
import assert from 'node:assert/strict';

// Phase 2H unit coverage. These tests never touch the database, the queue or a
// provider: they pin the vocabulary, adapter contracts, webhook crypto and
// approval rules that the rest of the phase relies on.

const constants = await import('@/lib/integrations/constants');
const registry = await import('@/lib/integrations/registry');
const adapters = await import('@/lib/integrations/adapters');
const webhooks = await import('@/lib/integrations/webhooks');
const { canDecideExecution } = await import('@/lib/integrations/execution');
const automation = await import('@/lib/automation/constants');
const validation = await import('@/lib/integrations/validation');
const { ApiError } = await import('@/lib/api-error');

function withEnv(name, value, fn) {
  const previous = process.env[name];
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
  try {
    return fn();
  } finally {
    if (previous === undefined) delete process.env[name];
    else process.env[name] = previous;
  }
}

function expectCode(code) {
  return (error) => {
    assert.ok(error instanceof ApiError, 'expected an ApiError');
    assert.equal(error.code, code, `expected ${code}, received ${error.code}`);
    return true;
  };
}

test('execution transitions only allow the documented lifecycle', () => {
  assert.equal(constants.isExecutionTransitionAllowed('proposed', 'awaiting_approval'), true);
  assert.equal(constants.isExecutionTransitionAllowed('awaiting_approval', 'approved'), true);
  assert.equal(constants.isExecutionTransitionAllowed('approved', 'queued'), true);
  assert.equal(constants.isExecutionTransitionAllowed('queued', 'executing'), true);
  assert.equal(constants.isExecutionTransitionAllowed('executing', 'completed'), true);

  // State skipping and resurrection are refused.
  assert.equal(constants.isExecutionTransitionAllowed('proposed', 'approved'), false);
  assert.equal(constants.isExecutionTransitionAllowed('rejected', 'approved'), false);
  assert.equal(constants.isExecutionTransitionAllowed('cancelled', 'queued'), false);
  assert.equal(constants.isExecutionTransitionAllowed('completed', 'queued'), false);
});

test('execution decision rules forbid self-approval and gate high risk', () => {
  const base = {
    status: 'awaiting_approval',
    requestedByUserId: 'user-a',
    riskLevel: 'medium',
  };
  assert.equal(
    canDecideExecution({ actorUserId: 'user-b', actorRole: 'member', row: base }),
    true,
  );
  assert.equal(
    canDecideExecution({ actorUserId: 'user-a', actorRole: 'owner', row: base }),
    false,
  );
  assert.equal(
    canDecideExecution({
      actorUserId: 'user-b',
      actorRole: 'manager',
      row: { ...base, riskLevel: 'high' },
    }),
    false,
  );
  assert.equal(
    canDecideExecution({
      actorUserId: 'user-b',
      actorRole: 'admin',
      row: { ...base, riskLevel: 'critical' },
    }),
    true,
  );
  assert.equal(
    canDecideExecution({
      actorUserId: 'user-b',
      actorRole: 'owner',
      row: { ...base, status: 'approved' },
    }),
    false,
  );
});

test('the integration registry exposes names only, never credential values', () => {
  const definitions = registry.listProviderDefinitions();
  assert.ok(definitions.length >= 14);

  const kinds = new Set(definitions.map((item) => item.kind));
  for (const kind of constants.INTEGRATION_KIND_KEYS) {
    assert.ok(kinds.has(kind), `missing provider for kind ${kind}`);
  }

  for (const definition of definitions) {
    assert.ok(Array.isArray(definition.requiredEnvKeys));
    for (const key of definition.requiredEnvKeys) {
      assert.match(key, /^[A-Z0-9_]+$/, `${key} must be an env NAME`);
    }
    const view = registry.providerPublicView(definition);
    assert.equal(typeof view.configured, 'boolean');
    assert.equal(view.credentials, undefined);
    assert.equal(view.requiredEnvValues, undefined);
  }
});

test('provider readiness reflects environment names honestly', () => {
  withEnv('WORDPRESS_API_URL', undefined, () =>
    withEnv('WORDPRESS_API_TOKEN', undefined, () => {
      const definition = registry.getProviderDefinition('cms', 'wordpress_rest');
      assert.equal(registry.providerConfigured(definition), false);
    }),
  );

  withEnv('WORDPRESS_API_URL', 'https://example.test', () =>
    withEnv('WORDPRESS_API_TOKEN', 'not-a-real-token', () => {
      const definition = registry.getProviderDefinition('cms', 'wordpress_rest');
      assert.equal(registry.providerConfigured(definition), true);
    }),
  );

  // `any` requirement: one of the accepted names is enough.
  withEnv('GEMINI_API_KEY', undefined, () =>
    withEnv('GOOGLE_API_KEY', undefined, () => {
      const definition = registry.getProviderDefinition('ai_provider', 'gemini');
      assert.equal(registry.providerConfigured(definition), false);
      withEnv('GEMINI_API_KEY', 'place-holder', () => {
        assert.equal(registry.providerConfigured(definition), true);
      });
    }),
  );

  const builtin = registry.getProviderDefinition('file_storage', 'local_document_store');
  assert.equal(registry.providerConfigured(builtin), true);

  assert.equal(registry.getProviderDefinition('cms', 'does_not_exist'), null);
  assert.equal(registry.isKnownProvider('cms', 'does_not_exist'), false);
});

test('live adapters never call a provider', async () => {
  const unconfigured = adapters.getLiveAdapter('cms', { configured: false });
  await assert.rejects(
    unconfigured.methods.retrievePages(),
    expectCode('INTEGRATION_NOT_CONFIGURED'),
  );

  const configured = adapters.getLiveAdapter('social', { configured: true });
  await assert.rejects(
    configured.methods.submitPost({ caption: 'x' }),
    expectCode('LIVE_INTEGRATION_DISABLED'),
  );

  assert.equal(adapters.adapterSupports('cms', 'retrievePages'), true);
  assert.equal(adapters.adapterSupports('cms', 'dropDatabase'), false);
});

test('the mock adapter is deterministic and clearly labelled', async () => {
  const adapter = adapters.getMockAdapter('cms');
  assert.equal(adapter.mode, 'mock');
  const first = await adapter.methods.submitPublishingRequest({ title: 'Hello' });
  const second = await adapter.methods.submitPublishingRequest({ title: 'Hello' });
  assert.equal(first.mode, 'mock');
  assert.equal(first.operation, 'submitPublishingRequest');
  assert.match(first.inputDigest, /^mock-/);
  assert.equal(first.inputDigest, second.inputDigest);
  assert.match(first.summary, /no external request/i);
});

test('adapter validators normalise and refuse unsafe payloads', () => {
  const ads = adapters.validateAdsPlan({
    platform: 'Google Ads',
    campaignName: 'Q4 plan',
    plannedBudgetMinor: 500000,
    actualSpendMinor: 999999,
  });
  assert.equal(ads.actualSpendMinor, 0);
  assert.equal(ads.plannedBudgetMinor, 500000);
  assert.throws(
    () => adapters.validateAdsPlan({ platform: 'x', campaignName: 'y', plannedBudgetMinor: -1 }),
    expectCode('VALIDATION_FAILED'),
  );

  const social = adapters.validateSocialPost({ platform: 'instagram', caption: 'Draft only' });
  assert.equal(social.externalPublishing, false);

  const email = adapters.validateEmailCampaign({
    subject: 'Hello',
    audience: 'customers',
    body: 'Body',
  });
  assert.equal(email.externalSending, false);

  const lead = adapters.validateLeadPayload({ lead: { name: 'Ada', email: 'ada@example.test' } });
  assert.equal(lead.name, 'Ada');
  assert.equal(lead.email, 'ada@example.test');
  assert.throws(() => adapters.validateLeadPayload({ lead: {} }), expectCode('VALIDATION_FAILED'));

  assert.throws(
    () => adapters.validateCmsContentPayload({ pageReference: 'home', body: 'b' }),
    expectCode('VALIDATION_FAILED'),
  );

  assert.throws(
    () =>
      adapters.validateAnalyticsQuery({
        dateFrom: '2026-02-01',
        dateTo: '2026-01-01',
      }),
    expectCode('VALIDATION_FAILED'),
  );
});

test('webhook signatures verify, expire and reject tampering', () => {
  const secret = 'phase2h-unit-secret-value';
  const rawBody = JSON.stringify({ hello: 'world' });
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = webhooks.computeSignature({ secret, timestamp, rawBody });

  assert.equal(
    webhooks.verifyWebhookSignature({ rawBody, signature, timestamp, secret }).ok,
    true,
  );

  const staleTimestamp = String(Number(timestamp) - webhooks.WEBHOOK_MAX_SKEW_SECONDS - 60);
  const staleSignature = webhooks.computeSignature({
    secret,
    timestamp: staleTimestamp,
    rawBody,
  });
  assert.equal(
    webhooks.verifyWebhookSignature({
      rawBody,
      signature: staleSignature,
      timestamp: staleTimestamp,
      secret,
    }).reason,
    'stale_timestamp',
  );

  assert.equal(
    webhooks.verifyWebhookSignature({ rawBody, signature: 'deadbeef', timestamp, secret })
      .reason,
    'invalid_signature',
  );
  assert.equal(
    webhooks.verifyWebhookSignature({ rawBody, signature: '', timestamp, secret }).reason,
    'missing_signature',
  );
  assert.equal(
    webhooks.verifyWebhookSignature({ rawBody, signature, timestamp, secret: null }).reason,
    'not_configured',
  );

  // The signature is computed over the timestamp and the exact raw body.
  assert.notEqual(
    webhooks.computeSignature({ secret, timestamp, rawBody: `${rawBody} ` }),
    signature,
  );
});

test('webhook idempotency keys are stable across duplicates', () => {
  assert.equal(
    webhooks.buildIdempotencyKey({ provider: 'inbound_hmac', externalEventId: 'evt_1', rawBody: 'x' }),
    'inbound_hmac:evt_1',
  );
  const hashed = webhooks.buildIdempotencyKey({ provider: 'generic_hmac', rawBody: '{"a":1}' });
  const hashedAgain = webhooks.buildIdempotencyKey({ provider: 'generic_hmac', rawBody: '{"a":1}' });
  assert.equal(hashed, hashedAgain);
  assert.match(hashed, /^generic_hmac:sha256:[0-9a-f]+$/);
});

test('webhook envelopes are validated before use', () => {
  const workspaceId = '11111111-1111-4111-8111-111111111111';
  const envelope = webhooks.parseWebhookEnvelope({
    workspaceId,
    eventType: 'lead.created',
    externalEventId: 'evt_1',
    data: { lead: { name: 'Ada' } },
  });
  assert.equal(envelope.workspaceId, workspaceId);
  assert.equal(envelope.eventType, 'lead.created');
  assert.deepEqual(envelope.data, { lead: { name: 'Ada' } });

  assert.throws(
    () => webhooks.parseWebhookEnvelope({ workspaceId: 'not-a-uuid', eventType: 'x' }),
    expectCode('VALIDATION_FAILED'),
  );
  assert.throws(
    () => webhooks.parseWebhookEnvelope({ workspaceId, eventType: '' }),
    expectCode('VALIDATION_FAILED'),
  );
  assert.throws(
    () => webhooks.parseWebhookEnvelope([{ workspaceId, eventType: 'x' }]),
    expectCode('VALIDATION_FAILED'),
  );
});

test('workflow definitions are unique and complete', () => {
  const definitions = automation.WORKFLOW_DEFINITIONS;
  assert.equal(definitions.length, 9);
  const keys = new Set(definitions.map((item) => item.key));
  assert.equal(keys.size, definitions.length);
  for (const definition of definitions) {
    assert.ok(definition.label);
    assert.ok(definition.description);
    assert.ok(Array.isArray(definition.steps) && definition.steps.length > 0);
    assert.equal(automation.getWorkflowDefinition(definition.key).key, definition.key);
  }
  assert.equal(automation.getWorkflowDefinition('nope'), null);
});

test('integration request schemas reject unknown vocabulary', async () => {
  await assert.rejects(
    validation.executionCreateSchema.validate({
      category: 'delete_everything',
      operation: 'Do it',
      targetSystem: 'live',
    }),
  );
  await assert.rejects(
    validation.workflowStartSchema.validate({ workflowKey: 'nope' }),
  );

  const clean = await validation.workflowStartSchema.validate(
    { workflowKey: 'new_client_onboarding', clientId: '', extra: 'ignored' },
    { abortEarly: false, stripUnknown: true },
  );
  assert.equal(clean.extra, undefined);
  assert.equal(clean.clientId, null);

  await assert.rejects(
    validation.executionCreateSchema.validate({
      category: 'internal_record',
      operation: 'Note',
      targetSystem: 'internal',
      requiredPermission: 'not.a.permission',
    }),
  );
});
