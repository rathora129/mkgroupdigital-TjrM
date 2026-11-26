import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PERMISSIONS,
  ROLES,
  hasPermission,
  permissionsFor,
} from '@/lib/auth/permissions';
import {
  allowedNextStages,
  OPPORTUNITY_STAGE_TRANSITIONS,
} from '@/lib/opportunities/service';
import {
  discoverySchema,
  opportunityCreateSchema,
  opportunityQuerySchema,
  opportunityStageSchema,
  requirementItemCreateSchema,
} from '@/lib/opportunities/validation';

const LEAD_ID = '8a1d6f7b-2c3d-4e5f-8a9b-0c1d2e3f4a5b';
const MISSING_ID = '00000000-0000-4000-8000-000000000000';

const NEW_PERMISSIONS = [
  PERMISSIONS.opportunitiesView,
  PERMISSIONS.opportunitiesCreate,
  PERMISSIONS.opportunitiesUpdate,
  PERMISSIONS.opportunitiesAssign,
  PERMISSIONS.opportunitiesClose,
  PERMISSIONS.requirementsView,
  PERMISSIONS.requirementsEdit,
  PERMISSIONS.servicesView,
  PERMISSIONS.servicesManage,
];

test('phase 2D-A role grants follow least privilege', () => {
  for (const role of ['owner', 'admin', 'manager']) {
    for (const permission of NEW_PERMISSIONS) {
      assert.equal(
        hasPermission(role, permission),
        true,
        `${role} should have ${permission}`,
      );
    }
  }

  for (const role of ['member', 'specialist']) {
    for (const permission of [
      PERMISSIONS.opportunitiesView,
      PERMISSIONS.opportunitiesCreate,
      PERMISSIONS.opportunitiesUpdate,
      PERMISSIONS.requirementsView,
      PERMISSIONS.requirementsEdit,
      PERMISSIONS.servicesView,
    ]) {
      assert.equal(
        hasPermission(role, permission),
        true,
        `${role} should have ${permission}`,
      );
    }
    for (const permission of [
      PERMISSIONS.opportunitiesAssign,
      PERMISSIONS.opportunitiesClose,
      PERMISSIONS.servicesManage,
    ]) {
      assert.equal(
        hasPermission(role, permission),
        false,
        `${role} must not have ${permission}`,
      );
    }
  }

  for (const permission of [
    PERMISSIONS.opportunitiesView,
    PERMISSIONS.requirementsView,
    PERMISSIONS.servicesView,
  ]) {
    assert.equal(hasPermission('viewer', permission), true);
  }
  for (const permission of NEW_PERMISSIONS.filter(
    (entry) =>
      entry !== PERMISSIONS.opportunitiesView &&
      entry !== PERMISSIONS.requirementsView &&
      entry !== PERMISSIONS.servicesView,
  )) {
    assert.equal(
      hasPermission('viewer', permission),
      false,
      `viewer must not have ${permission}`,
    );
  }

  for (const role of ROLES) {
    const permissions = permissionsFor(role);
    const unique = new Set(permissions);
    assert.equal(unique.size, permissions.length, `${role} grants must be unique`);
    if (hasPermission(role, PERMISSIONS.opportunitiesView)) {
      assert.equal(
        hasPermission(role, PERMISSIONS.requirementsView),
        true,
        `${role} needs requirement visibility to read an opportunity`,
      );
    }
  }
});

test('opportunity stage transitions are one-way apart from reopening a loss', () => {
  assert.deepEqual(allowedNextStages('discovery'), ['requirements', 'lost']);
  assert.deepEqual(allowedNextStages('requirements'), [
    'discovery',
    'proposal',
    'lost',
  ]);
  assert.deepEqual(allowedNextStages('proposal'), [
    'requirements',
    'negotiation',
    'won',
    'lost',
  ]);
  assert.deepEqual(allowedNextStages('negotiation'), [
    'proposal',
    'won',
    'lost',
  ]);
  assert.deepEqual(allowedNextStages('won'), []);
  assert.deepEqual(allowedNextStages('lost'), ['discovery']);
  assert.deepEqual(allowedNextStages('unknown'), []);

  for (const [stage, targets] of Object.entries(OPPORTUNITY_STAGE_TRANSITIONS)) {
    assert.equal(
      targets.includes(stage),
      false,
      `${stage} must not transition to itself`,
    );
  }
  assert.equal(OPPORTUNITY_STAGE_TRANSITIONS.won.length, 0);
});

test('opportunity create validation applies safe defaults and rejects bad input', async () => {
  const minimal = await opportunityCreateSchema.validate({
    leadId: LEAD_ID,
    title: 'Website and growth programme',
  });
  assert.equal(minimal.priority, 'medium');
  assert.equal(minimal.source, 'other');
  assert.equal(minimal.currency, 'INR');
  assert.equal(minimal.expectedValueCents ?? null, null);

  await assert.rejects(() =>
    opportunityCreateSchema.validate({ title: 'No lead attached' }),
  );
  await assert.rejects(() =>
    opportunityCreateSchema.validate({ leadId: 'not-a-uuid', title: 'Bad lead' }),
  );
  await assert.rejects(() =>
    opportunityCreateSchema.validate({
      leadId: LEAD_ID,
      title: 'Negative value',
      expectedValueCents: -1,
    }),
  );
  await assert.rejects(() =>
    opportunityCreateSchema.validate({
      leadId: LEAD_ID,
      title: 'Bad currency',
      currency: 'RUPEE',
    }),
  );
  await assert.rejects(() =>
    opportunityCreateSchema.validate({
      leadId: LEAD_ID,
      title: 'x',
    }),
  );

  const stage = await opportunityStageSchema.validate({
    stage: 'lost',
    lostReason: 'Budget withdrawn',
  });
  assert.equal(stage.stage, 'lost');
  await assert.rejects(() => opportunityStageSchema.validate({ stage: 'archived' }));
});

test('discovery and requirement validation constrain status and lengths', async () => {
  const defaults = await discoverySchema.validate({});
  assert.equal(defaults.status, 'draft');

  await assert.rejects(() => discoverySchema.validate({ status: 'approved ' }));

  const longIndustry = await discoverySchema.validate({
    industry: 'x'.repeat(500),
  });
  assert.equal(longIndustry.industry.length, 500);
  await assert.rejects(() =>
    discoverySchema.validate({ industry: 'x'.repeat(501) }),
  );
  await assert.rejects(() =>
    discoverySchema.validate({ companyOverview: 'x'.repeat(4_001) }),
  );

  const requirement = await requirementItemCreateSchema.validate({
    name: 'Monthly bookkeeping',
  });
  assert.equal(requirement.priority, 'medium');
  assert.equal(requirement.status, 'requested');
  assert.equal(requirement.serviceId ?? null, null);

  await assert.rejects(() =>
    requirementItemCreateSchema.validate({ name: 'A' }),
  );
  await assert.rejects(() =>
    requirementItemCreateSchema.validate({
      name: 'Bad service',
      serviceId: 'not-a-uuid',
    }),
  );
  await assert.rejects(() =>
    requirementItemCreateSchema.validate({
      name: 'Bad status',
      status: 'approved',
    }),
  );
});

test('opportunity query validation supplies list defaults and strips unknown keys', async () => {
  const query = await opportunityQuerySchema.validate(
    { page: '2', pageSize: '10', unknown: 'ignored' },
    { stripUnknown: true },
  );
  assert.equal(query.page, 2);
  assert.equal(query.pageSize, 10);
  assert.equal(query.scope, 'open');
  assert.equal(query.sort, 'created');
  assert.equal(query.direction, 'desc');
  assert.equal(Object.hasOwn(query, 'unknown'), false);

  await assert.rejects(() =>
    opportunityQuerySchema.validate({ stage: 'closed' }),
  );
  await assert.rejects(() =>
    opportunityQuerySchema.validate({ owner: 'someone' }),
  );
  await assert.rejects(() =>
    opportunityQuerySchema.validate({ pageSize: 1000 }),
  );

  const owner = await opportunityQuerySchema.validate({ owner: MISSING_ID });
  assert.equal(owner.owner, MISSING_ID);
});
