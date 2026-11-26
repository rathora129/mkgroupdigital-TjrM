import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {
  sql,
  query,
  closeDatabase,
  assertDisposableTestUrl,
} from './support/db.mjs';

// Database-backed Phase 2C lead checks. Runs only against
// PHASE2A_TEST_DATABASE_URL (a disposable database whose name ends in _test).
const TEST_DATABASE_URL = process.env.PHASE2A_TEST_DATABASE_URL || '';
const skip = TEST_DATABASE_URL
  ? false
  : 'set PHASE2A_TEST_DATABASE_URL to a disposable, migrated database';

const validation = await import('@/lib/leads/validation');

if (TEST_DATABASE_URL) {
  assertDisposableTestUrl(TEST_DATABASE_URL);
  process.env.DATABASE_URL = TEST_DATABASE_URL;
}

const service = await import('@/lib/leads/service');

after(async () => {
  await closeDatabase();
});

async function createFixture() {
  const suffix = randomUUID();
  const [workspace] = await query(sql`
    insert into workspaces (name, slug)
    values ('Phase 2C leads', ${`p2c-leads-${suffix}`})
    returning id
  `);

  const [owner] = await query(sql`
    insert into users (email, name)
    values (${`p2c-owner-${suffix}@example.test`}, 'Owner Person')
    returning id
  `);
  await query(sql`
    insert into workspace_memberships (workspace_id, user_id, role)
    values (${workspace.id}, ${owner.id}, 'owner')
  `);

  const [member] = await query(sql`
    insert into users (email, name)
    values (${`p2c-member-${suffix}@example.test`}, 'Member Person')
    returning id
  `);
  await query(sql`
    insert into workspace_memberships (workspace_id, user_id, role)
    values (${workspace.id}, ${member.id}, 'member')
  `);

  return { workspaceId: workspace.id, ownerId: owner.id, memberId: member.id, suffix };
}

async function cleanup(fixture) {
  await query(
    sql`delete from audit_logs where workspace_id = ${fixture.workspaceId}`,
  );
  await query(sql`delete from workspaces where id = ${fixture.workspaceId}`);
  await query(sql`delete from users where id in (${fixture.ownerId}, ${fixture.memberId})`);
}

async function makeLead(fixture, overrides = {}) {
  const payload = await validation.leadCreateSchema.validate({
    companyName: `Acme ${randomUUID().slice(0, 6)}`,
    email: 'hello@acme.test',
    website: 'https://www.acme.test',
    ...overrides,
  });
  return service.createLead({
    workspaceId: fixture.workspaceId,
    userId: fixture.ownerId,
    data: payload,
  });
}

test('lead schemas validate required fields and defaults', async () => {
  await assert.rejects(
    () => validation.leadCreateSchema.validate({}, { abortEarly: false }),
    /Company name is required/,
  );

  const parsed = await validation.leadCreateSchema.validate({
    companyName: '  Acme Pvt Ltd  ',
    email: '',
    estimatedValueCents: '',
  });
  assert.equal(parsed.companyName, 'Acme Pvt Ltd');
  assert.equal(parsed.email, null);
  assert.equal(parsed.estimatedValueCents, null);
  assert.equal(parsed.priority, 'medium');
  assert.equal(parsed.status, 'new');
  assert.equal(parsed.currency, 'INR');
  assert.equal(parsed.source, 'other');

  const queryDefaults = await validation.leadQuerySchema.validate({});
  assert.equal(queryDefaults.page, 1);
  assert.equal(queryDefaults.pageSize, 20);
  assert.equal(queryDefaults.archived, 'active');
  assert.equal(queryDefaults.sort, 'created');

  assert.deepEqual(service.allowedNextStatuses('proposal'), ['follow_up', 'won', 'lost']);
  assert.equal(service.normalizeWebsiteKey('https://www.Acme.test/'), 'acme.test');
  assert.equal(service.normalizeCompanyKey('Acme, Inc.'), 'acmeinc');
});

test('lead lifecycle records activity and status history', { skip }, async () => {
  const fixture = await createFixture();
  try {
    const created = await makeLead(fixture, {
      assignedUserId: fixture.memberId,
      companyName: 'Globex Industries',
      website: 'https://globex.test',
      email: 'sales@globex.test',
    });
    assert.equal(created.lead.status, 'new');
    assert.equal(created.lead.assignedName, 'Member Person');
    assert.equal(created.possibleDuplicates.length, 0);

    const detail = await service.getLead(fixture.workspaceId, created.lead.id);
    assert.equal(detail.activities.length, 1);
    assert.equal(detail.activities[0].type, 'created');
    assert.equal(detail.statusHistory.length, 1);
    assert.equal(detail.statusHistory[0].fromStatus, null);
    assert.equal(detail.statusHistory[0].toStatus, 'new');
    assert.deepEqual(detail.allowedTransitions, [
      'researching',
      'qualified',
      'contacted',
      'follow_up',
      'lost',
    ]);

    const moved = await service.changeLeadStatus({
      workspaceId: fixture.workspaceId,
      userId: fixture.ownerId,
      leadId: created.lead.id,
      status: 'qualified',
      note: 'Budgets confirmed.',
    });
    assert.equal(moved.lead.status, 'qualified');

    await assert.rejects(
      () =>
        service.changeLeadStatus({
          workspaceId: fixture.workspaceId,
          userId: fixture.ownerId,
          leadId: created.lead.id,
          status: 'new',
        }),
      (error) => error.code === 'INVALID_STATUS_TRANSITION',
    );

    const updated = await service.updateLead({
      workspaceId: fixture.workspaceId,
      userId: fixture.ownerId,
      leadId: created.lead.id,
      data: { industry: 'Manufacturing', estimatedValueCents: 250000 },
    });
    assert.equal(updated.lead.industry, 'Manufacturing');
    assert.equal(updated.lead.estimatedValueCents, 250000);

    const reassigned = await service.assignLead({
      workspaceId: fixture.workspaceId,
      userId: fixture.ownerId,
      leadId: created.lead.id,
      assignedUserId: fixture.ownerId,
    });
    assert.equal(reassigned.lead.assignedUserId, fixture.ownerId);

    await assert.rejects(
      () =>
        service.assignLead({
          workspaceId: fixture.workspaceId,
          userId: fixture.ownerId,
          leadId: created.lead.id,
          assignedUserId: randomUUID(),
        }),
      (error) => error.code === 'ASSIGNEE_NOT_MEMBER',
    );

    const note = await service.addLeadNote({
      workspaceId: fixture.workspaceId,
      userId: fixture.memberId,
      leadId: created.lead.id,
      body: 'Called the founder; asked for a proposal.',
    });
    assert.equal(note.type, 'note');

    const archived = await service.setLeadArchived({
      workspaceId: fixture.workspaceId,
      userId: fixture.ownerId,
      leadId: created.lead.id,
      archived: true,
    });
    assert.ok(archived.lead.archivedAt instanceof Date);

    await assert.rejects(
      () =>
        service.updateLead({
          workspaceId: fixture.workspaceId,
          userId: fixture.ownerId,
          leadId: created.lead.id,
          data: { industry: 'Retail' },
        }),
      (error) => error.code === 'LEAD_ARCHIVED',
    );

    const finalDetail = await service.getLead(
      fixture.workspaceId,
      created.lead.id,
    );
    assert.ok(finalDetail.statusHistory.length >= 2);
    const types = finalDetail.activities.map((activity) => activity.type);
    for (const expected of ['created', 'status_changed', 'updated', 'assigned', 'note', 'archived']) {
      assert.ok(types.includes(expected), `missing ${expected} activity`);
    }

    const restored = await service.setLeadArchived({
      workspaceId: fixture.workspaceId,
      userId: fixture.ownerId,
      leadId: created.lead.id,
      archived: false,
    });
    assert.equal(restored.lead.archivedAt, null);

    const audits = await query(sql`
      select action from audit_logs
      where workspace_id = ${fixture.workspaceId} and resource_id = ${created.lead.id}
    `);
    const actions = audits.map((row) => row.action);
    for (const expected of [
      'lead.create',
      'lead.status_change',
      'lead.update',
      'lead.assign',
      'lead.note',
      'lead.archive',
      'lead.restore',
    ]) {
      assert.ok(actions.includes(expected), `missing ${expected} audit`);
    }
  } finally {
    await cleanup(fixture);
  }
});

test('duplicate detection surfaces matches without merging', { skip }, async () => {
  const fixture = await createFixture();
  try {
    const first = await makeLead(fixture, {
      companyName: 'Initech Solutions',
      email: 'Contact@Initech.test',
      website: 'https://www.initech.test/',
    });

    const second = await makeLead(fixture, {
      companyName: 'Initech',
      email: 'contact@initech.test',
      website: 'http://initech.test',
    });

    assert.equal(second.possibleDuplicates.length, 1);
    assert.equal(second.possibleDuplicates[0].id, first.lead.id);
    assert.deepEqual(
      [...second.possibleDuplicates[0].reasons].sort(),
      ['email', 'website'],
    );

    const matches = await service.findPossibleDuplicates(
      fixture.workspaceId,
      { companyName: 'Initech Solutions', email: null, website: null },
      { excludeLeadId: second.lead.id },
    );
    assert.equal(matches.length, 1);
    assert.equal(matches[0].id, first.lead.id);

    const [row] = await query(sql`
      select count(*)::int as total from leads
      where workspace_id = ${fixture.workspaceId}
    `);
    assert.equal(row.total, 2);
  } finally {
    await cleanup(fixture);
  }
});

test('lead listing filters, sorts and paginates within one workspace', { skip }, async () => {
  const fixture = await createFixture();
  try {
    const alpha = await makeLead(fixture, {
      companyName: 'Alpha Robotics',
      email: 'alpha@alpha.test',
      website: 'https://alpha.test',
      priority: 'high',
      status: 'researching',
      assignedUserId: fixture.memberId,
    });
    await makeLead(fixture, {
      companyName: 'Beta Foods',
      email: 'beta@beta.test',
      website: 'https://beta.test',
      priority: 'low',
      assignedUserId: fixture.ownerId,
    });

    const baseQuery = await validation.leadQuerySchema.validate({});
    const all = await service.listLeads(
      fixture.workspaceId,
      fixture.ownerId,
      baseQuery,
    );
    assert.equal(all.total, 2);

    const searched = await service.listLeads(
      fixture.workspaceId,
      fixture.ownerId,
      await validation.leadQuerySchema.validate({ search: 'Alpha' }),
    );
    assert.equal(searched.total, 1);
    assert.equal(searched.items[0].id, alpha.lead.id);

    const mine = await service.listLeads(
      fixture.workspaceId,
      fixture.ownerId,
      await validation.leadQuerySchema.validate({ assigned: 'me' }),
    );
    assert.equal(mine.total, 1);
    assert.equal(mine.items[0].companyName, 'Beta Foods');

    const byStatus = await service.listLeads(
      fixture.workspaceId,
      fixture.ownerId,
      await validation.leadQuerySchema.validate({ status: 'researching' }),
    );
    assert.equal(byStatus.total, 1);

    const paged = await service.listLeads(
      fixture.workspaceId,
      fixture.ownerId,
      await validation.leadQuerySchema.validate({
        pageSize: 1,
        page: 2,
        sort: 'company',
        direction: 'asc',
      }),
    );
    assert.equal(paged.pages, 2);
    assert.equal(paged.items[0].companyName, 'Beta Foods');

    const overview = await service.getLeadOverview(
      fixture.workspaceId,
      fixture.memberId,
    );
    assert.equal(overview.total, 2);
    assert.equal(overview.assignedToMe, 1);
  } finally {
    await cleanup(fixture);
  }
});

test('leads cannot be read or assigned across workspaces', { skip }, async () => {
  const first = await createFixture();
  const second = await createFixture();
  try {
    const created = await makeLead(first);

    assert.equal(
      await service.getLead(second.workspaceId, created.lead.id),
      null,
    );

    const otherList = await service.listLeads(
      second.workspaceId,
      second.ownerId,
      await validation.leadQuerySchema.validate({}),
    );
    assert.equal(otherList.total, 0);

    const crossWorkspace = await service.assignLead({
      workspaceId: second.workspaceId,
      userId: second.ownerId,
      leadId: created.lead.id,
      assignedUserId: second.ownerId,
    });
    assert.equal(crossWorkspace, null);
  } finally {
    await cleanup(first);
    await cleanup(second);
  }
});
