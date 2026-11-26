import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {
  sql,
  query,
  closeDatabase,
  assertDisposableTestUrl,
} from './support/db.mjs';

// Phase 2I owner-import checks: pure parsing/normalisation plus the
// preview → correction → commit → audit pipeline against the disposable test
// database (name must end in _test).
const TEST_DATABASE_URL = process.env.PHASE2A_TEST_DATABASE_URL || '';
const skip = TEST_DATABASE_URL
  ? false
  : 'set PHASE2A_TEST_DATABASE_URL to a disposable, migrated database';

const validation = await import('@/lib/leads/validation');
const importer = await import('@/lib/leads/import');

if (TEST_DATABASE_URL) {
  assertDisposableTestUrl(TEST_DATABASE_URL);
  process.env.DATABASE_URL = TEST_DATABASE_URL;
}

const service = await import('@/lib/leads/service');

after(async () => {
  await closeDatabase();
});

const HEADER = [
  'Company Name',
  'Contact Number',
  'Owner / Contact Person',
  'Initial Requirement',
  'Website',
  'Call Date',
  'Call Status',
  'Detailed Client Requirement',
  'Next Meeting Date',
  'Next Meeting Time',
  'Date Added',
  'Amount Received',
  'Outstanding',
  'Project Cost',
  'Follow up',
].join('\t');

function buildTsv(rows) {
  return [HEADER, ...rows].join('\n');
}

async function createFixture() {
  const suffix = randomUUID();
  const [workspace] = await query(sql`
    insert into workspaces (name, slug)
    values ('Phase 2I import', ${`p2i-import-${suffix}`})
    returning id
  `);

  const [owner] = await query(sql`
    insert into users (email, name)
    values (${`p2i-owner-${suffix}@example.test`}, 'Owner Person')
    returning id
  `);
  await query(sql`
    insert into workspace_memberships (workspace_id, user_id, role)
    values (${workspace.id}, ${owner.id}, 'owner')
  `);

  const [caller] = await query(sql`
    insert into users (email, name)
    values (${`p2i-caller-${suffix}@example.test`}, 'Caller Person')
    returning id
  `);
  await query(sql`
    insert into workspace_memberships (workspace_id, user_id, role)
    values (${workspace.id}, ${caller.id}, 'member')
  `);

  return {
    workspaceId: workspace.id,
    ownerId: owner.id,
    callerId: caller.id,
    suffix,
  };
}

async function cleanup(fixture) {
  await query(
    sql`delete from audit_logs where workspace_id = ${fixture.workspaceId}`,
  );
  await query(sql`delete from workspaces where id = ${fixture.workspaceId}`);
  await query(
    sql`delete from users where id in (${fixture.ownerId}, ${fixture.callerId})`,
  );
}

// ---- pure parsing -----------------------------------------------------------

test('header mapping tolerates casing, spacing and aliases', () => {
  const mapping = importer.mapHeaders([
    'company name',
    'Contact No.',
    'Owner',
    'Initial Requirement',
    'Website',
    'Call Date',
    'Call Status',
    'Follow up',
    'Something Else',
  ]);
  assert.equal(mapping.companyName, 0);
  assert.equal(mapping.phone, 1);
  assert.equal(mapping.contactName, 2);
  assert.equal(mapping.requirementsInitial, 3);
  assert.equal(mapping.website, 4);
  assert.equal(mapping.callDate, 5);
  assert.equal(mapping.callStatus, 6);
  assert.equal(mapping.followUp, 7);
  assert.equal(Object.values(mapping).includes(8), false);

  assert.equal(importer.normalizeHeader('  Owner / Contact Person '), 'ownercontactperson');
});

test('delimited parser keeps quoted delimiters and newlines', () => {
  const rows = importer.parseDelimited(
    'Name,Notes\n"Acme, Inc.","Line one\nLine two"\n',
    ',',
  );
  assert.deepEqual(rows, [
    ['Name', 'Notes'],
    ['Acme, Inc.', 'Line one\nLine two'],
  ]);
});

test('markdown table parser drops separator rows', () => {
  const rows = importer.parseMarkdownTable(
    '| Company | Phone |\n| --- | --- |\n| Acme | 98765 |\n',
  );
  assert.deepEqual(rows, [
    ['Company', 'Phone'],
    ['Acme', '98765'],
  ]);
});

test('import text parser maps headers and falls back to the 15-column order', () => {
  const withHeader = importer.parseLeadImportText(
    buildTsv(['Acme\t9876543210\tMr Rao']),
  );
  assert.equal(withHeader.format, 'tsv');
  assert.equal(withHeader.rows.length, 1);
  assert.equal(withHeader.rows[0].rowNumber, 2);
  assert.equal(withHeader.rows[0].raw.companyName, 'Acme');
  assert.equal(withHeader.rows[0].raw.phone, '9876543210');

  const positional = importer.parseLeadImportText(
    ['Acme Pvt Ltd', '9876543210', 'Mr Rao'].join('\t'),
  );
  assert.equal(positional.rows[0].raw.companyName, 'Acme Pvt Ltd');
  assert.equal(positional.rows[0].raw.contactName, 'Mr Rao');

  assert.throws(
    () =>
      importer.parseLeadImportText(
        'Phone\tWebsite\tCall Status\n9876543210\tsite.test\tInterested',
      ),
    (error) => error.code === 'COMPANY_COLUMN_MISSING',
  );

  assert.throws(
    () => importer.parseLeadImportText('   '),
    (error) => error.code === 'EMPTY_IMPORT',
  );
});

test('flexible date, time and money normalisation', () => {
  const dmy = importer.parseFlexibleDate('12/01/2026');
  assert.ok(dmy.value instanceof Date);
  assert.equal(dmy.value.toISOString().slice(0, 10), '2026-01-12');

  const mdy = importer.parseFlexibleDate('25/01/2026');
  assert.equal(mdy.value.toISOString().slice(0, 10), '2026-01-25');

  assert.equal(
    importer.parseFlexibleDate('2026-03-04').value.toISOString().slice(0, 10),
    '2026-03-04',
  );
  assert.equal(
    importer.parseFlexibleDate('12 Jan 2026').value.toISOString().slice(0, 10),
    '2026-01-12',
  );
  assert.equal(importer.parseFlexibleDate('').value, null);
  assert.ok(importer.parseFlexibleDate('31/02/2026').error);

  assert.equal(importer.parseFlexibleTime('2:30 pm').value, '14:30');
  assert.equal(importer.parseFlexibleTime('1430').value, '14:30');
  assert.equal(importer.parseFlexibleTime('00:15').value, '00:15');
  assert.ok(importer.parseFlexibleTime('25:99').error);

  assert.equal(importer.parseMoney('₹5,000').value, 500000);
  assert.equal(importer.parseMoney('1234.56').value, 123456);
  assert.equal(importer.parseMoney('').value, null);
  assert.ok(importer.parseMoney('(100)').error);
  assert.ok(importer.parseMoney('twelve').error);
});

test('row normalisation separates errors from usable values', async () => {
  const { normalized, errors, warnings } = importer.normalizeImportRow({
    companyName: '  Sunrise Traders ',
    phone: '98765 43210',
    requirementsInitial: 'New website',
    website: 'sunrise.test',
    callDate: '12/01/2026',
    nextMeetingDate: '',
    nextMeetingTime: '14:30',
    amountReceived: '₹5,000',
    outstanding: '15,000',
    projectCost: '20,000',
    followUp: 'Call again',
  });

  assert.equal(normalized.companyName, 'Sunrise Traders');
  assert.equal(normalized.phone, '9876543210');
  assert.equal(normalized.reportedAmountReceivedCents, 500000);
  assert.equal(normalized.reportedOutstandingCents, 1500000);
  assert.equal(normalized.reportedProjectCostCents, 2000000);
  assert.equal(normalized.followUpNote, 'Call again');
  assert.deepEqual(errors, {});
  assert.ok(
    warnings.includes('A meeting time was provided without a meeting date.'),
  );

  const broken = importer.normalizeImportRow({
    companyName: '',
    phone: '12',
    website: 'not a website',
  });
  assert.ok(broken.errors.companyName);
  assert.ok(broken.errors.phone);
  assert.ok(broken.errors.website);
  assert.equal(broken.normalized.companyName, null);
});

test('import signature is stable regardless of row objects order', () => {
  const rows = [
    { rowNumber: 2, normalized: { companyName: 'A', phone: '1' } },
    { rowNumber: 3, normalized: { companyName: 'B', phone: '2' } },
  ];
  const reversed = [...rows].reverse();
  assert.equal(importer.importSignature(rows), importer.importSignature(reversed));
  assert.notEqual(
    importer.importSignature(rows),
    importer.importSignature([
      rows[0],
      { rowNumber: 3, normalized: { companyName: 'B', phone: '3' } },
    ]),
  );
});

// ---- database pipeline ------------------------------------------------------

test('import preview validates rows, commits native leads and protects repeats', { skip }, async () => {
  const fixture = await createFixture();
  try {
    const existing = await service.createLead({
      workspaceId: fixture.workspaceId,
      userId: fixture.ownerId,
      data: {
        companyName: 'Existing Co',
        phone: '9000000001',
        source: 'other',
        priority: 'medium',
        status: 'new',
        currency: 'INR',
      },
    });

    const text = buildTsv([
      'Sunrise Traders\t9876543210\tMr Rao\tNew website\tsunrise.test\t12/01/2026\tInterested\tNeed ecommerce\t20/01/2026\t14:30\t10/01/2026\t₹5,000\t15,000\t20,000\tCall again',
      'Broken Row\t12\tMs Sen\tSEO\t\t\t\t\t\t\t\t\t\t\t',
      'Mirror Co\t9000000001\tMr Shah\tCRM\t\t\t\t\t\t\t\t\t\t\t',
    ]);

    const preview = await importer.createImportBatch({
      workspaceId: fixture.workspaceId,
      userId: fixture.ownerId,
      text,
    });

    assert.equal(preview.totals.rows, 3);
    assert.equal(preview.totals.valid, 1);
    assert.equal(preview.totals.invalid, 1);
    assert.equal(preview.totals.duplicates, 1);
    assert.equal(preview.repeatedImport, false);

    const invalidRow = preview.rows.find((row) => row.status === 'invalid');
    const duplicateRow = preview.rows.find((row) => row.status === 'duplicate');
    const validRow = preview.rows.find((row) => row.status === 'valid');
    assert.ok(invalidRow.errors.phone);
    assert.equal(duplicateRow.duplicateLeadId, existing.lead.id);
    assert.equal(validRow.normalized.reportedAmountReceivedCents, 500000);

    const corrected = await importer.updateImportRows({
      workspaceId: fixture.workspaceId,
      userId: fixture.ownerId,
      batchId: preview.batch.id,
      corrections: [{ rowId: invalidRow.id, values: { phone: '9123456789' } }],
    });
    assert.equal(corrected.totals.valid, 2);
    assert.equal(corrected.totals.invalid, 0);
    assert.equal(corrected.totals.duplicates, 1);

    const committed = await importer.commitImportBatch({
      workspaceId: fixture.workspaceId,
      userId: fixture.ownerId,
      batchId: preview.batch.id,
    });
    assert.equal(committed.importedCount, 2);
    assert.equal(committed.batch.status, 'committed');
    assert.equal(committed.batch.approvedByUserId, fixture.ownerId);

    const imported = await query(sql`
      select company_name, source, reported_amount_received_cents,
             reported_amount_verified, import_batch_id
      from leads
      where workspace_id = ${fixture.workspaceId}
        and import_batch_id = ${preview.batch.id}
      order by company_name
    `);
    assert.equal(imported.length, 2);
    assert.deepEqual(
      imported.map((row) => row.company_name),
      ['Broken Row', 'Sunrise Traders'],
    );
    for (const row of imported) {
      assert.equal(row.source, 'owner_import');
      assert.equal(row.reported_amount_verified, false);
    }
    const sunrise = imported.find((row) => row.company_name === 'Sunrise Traders');
    assert.equal(sunrise.reported_amount_received_cents, 500000);

    const activities = await query(sql`
      select type from lead_activities
      where workspace_id = ${fixture.workspaceId}
        and lead_id in (
          select id from leads
          where workspace_id = ${fixture.workspaceId}
            and import_batch_id = ${preview.batch.id}
        )
    `);
    assert.equal(activities.length, 2);
    assert.ok(activities.every((row) => row.type === 'imported'));

    const audits = await query(sql`
      select action from audit_logs
      where workspace_id = ${fixture.workspaceId}
        and resource_id = ${preview.batch.id}
    `);
    const actions = audits.map((row) => row.action);
    for (const action of [
      'lead.import_preview',
      'lead.import_correct',
      'lead.import_commit',
    ]) {
      assert.ok(actions.includes(action), `missing ${action} audit`);
    }

    const repeatText = buildTsv(['Repeat Co\t9876522222\tMr Z\tWebsite']);
    const firstRepeat = await importer.createImportBatch({
      workspaceId: fixture.workspaceId,
      userId: fixture.ownerId,
      text: repeatText,
    });
    await importer.commitImportBatch({
      workspaceId: fixture.workspaceId,
      userId: fixture.ownerId,
      batchId: firstRepeat.batch.id,
    });

    const repeat = await importer.createImportBatch({
      workspaceId: fixture.workspaceId,
      userId: fixture.ownerId,
      text: repeatText,
    });
    assert.equal(repeat.repeatedImport, true);
    assert.equal(repeat.previousBatchId, firstRepeat.batch.id);

    await assert.rejects(
      () =>
        importer.commitImportBatch({
          workspaceId: fixture.workspaceId,
          userId: fixture.ownerId,
          batchId: repeat.batch.id,
        }),
      (error) => error.code === 'REPEATED_IMPORT',
    );

    await assert.rejects(
      () =>
        importer.commitImportBatch({
          workspaceId: fixture.workspaceId,
          userId: fixture.ownerId,
          batchId: repeat.batch.id,
          confirmRepeat: true,
        }),
      (error) => error.code === 'NOTHING_TO_IMPORT',
    );

    const [countRow] = await query(sql`
      select count(*)::int as total from leads
      where workspace_id = ${fixture.workspaceId}
    `);
    // Existing lead + two corrected rows + one repeated-content lead.
    assert.equal(countRow.total, 4);

    await assert.rejects(
      () =>
        importer.updateImportRows({
          workspaceId: fixture.workspaceId,
          userId: fixture.ownerId,
          batchId: preview.batch.id,
          corrections: [{ rowId: validRow.id, values: { phone: '9000000999' } }],
        }),
      (error) => error.code === 'IMPORT_LOCKED',
    );
  } finally {
    await cleanup(fixture);
  }
});

test('cancelling a preview creates no leads', { skip }, async () => {
  const fixture = await createFixture();
  try {
    const preview = await importer.createImportBatch({
      workspaceId: fixture.workspaceId,
      userId: fixture.ownerId,
      text: buildTsv(['Cancelled Co\t9876500000\tMr X\tWebsite']),
    });
    assert.equal(preview.totals.valid, 1);

    const cancelled = await importer.cancelImportBatch({
      workspaceId: fixture.workspaceId,
      userId: fixture.ownerId,
      batchId: preview.batch.id,
    });
    assert.equal(cancelled.batch.status, 'cancelled');

    await assert.rejects(
      () =>
        importer.commitImportBatch({
          workspaceId: fixture.workspaceId,
          userId: fixture.ownerId,
          batchId: preview.batch.id,
        }),
      (error) => error.code === 'IMPORT_LOCKED',
    );

    const [countRow] = await query(sql`
      select count(*)::int as total from leads
      where workspace_id = ${fixture.workspaceId}
    `);
    assert.equal(countRow.total, 0);
  } finally {
    await cleanup(fixture);
  }
});

test('import batches are workspace scoped', { skip }, async () => {
  const first = await createFixture();
  const second = await createFixture();
  try {
    const preview = await importer.createImportBatch({
      workspaceId: first.workspaceId,
      userId: first.ownerId,
      text: buildTsv(['Scoped Co\t9876511111\tMr Y\tWebsite']),
    });

    assert.equal(
      await importer.getImportBatch(second.workspaceId, preview.batch.id),
      null,
    );

    const secondList = await importer.listImportBatches(second.workspaceId);
    assert.equal(secondList.length, 0);

    await assert.rejects(
      () =>
        importer.commitImportBatch({
          workspaceId: second.workspaceId,
          userId: second.ownerId,
          batchId: preview.batch.id,
        }),
      (error) => error.code === 'IMPORT_NOT_FOUND',
    );
  } finally {
    await cleanup(first);
    await cleanup(second);
  }
});

test('callers without leads.view_all only reach their assigned leads', { skip }, async () => {
  const fixture = await createFixture();
  try {
    const owned = await service.createLead({
      workspaceId: fixture.workspaceId,
      userId: fixture.ownerId,
      data: {
        companyName: 'Owner Only Co',
        source: 'other',
        priority: 'medium',
        status: 'new',
        currency: 'INR',
        assignedUserId: fixture.ownerId,
      },
    });

    const queryDefaults = await validation.leadQuerySchema.validate({});
    const restricted = { userId: fixture.callerId, canViewAll: false };

    const list = await service.listLeads(
      fixture.workspaceId,
      fixture.callerId,
      queryDefaults,
      restricted,
    );
    assert.equal(list.total, 0);

    const overview = await service.getLeadOverview(
      fixture.workspaceId,
      fixture.callerId,
      restricted,
    );
    assert.equal(overview.total, 0);

    await assert.rejects(
      () =>
        service.getLead(fixture.workspaceId, owned.lead.id, restricted),
      (error) => error.code === 'FORBIDDEN',
    );

    const unrestricted = await service.listLeads(
      fixture.workspaceId,
      fixture.ownerId,
      queryDefaults,
      { userId: fixture.ownerId, canViewAll: true },
    );
    assert.equal(unrestricted.total, 1);
  } finally {
    await cleanup(fixture);
  }
});
