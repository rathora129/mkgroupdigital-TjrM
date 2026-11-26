import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {
  sql,
  query,
  closeDatabase,
  assertDisposableTestUrl,
} from './support/db.mjs';

// Phase 2F-C.3 / 2F-G — invoice, payment and expense integrity checks.
const TEST_DATABASE_URL = process.env.PHASE2A_TEST_DATABASE_URL || '';
const skip = TEST_DATABASE_URL
  ? false
  : 'set PHASE2A_TEST_DATABASE_URL to a disposable, migrated database';

if (TEST_DATABASE_URL) {
  assertDisposableTestUrl(TEST_DATABASE_URL);
  process.env.DATABASE_URL = TEST_DATABASE_URL;
}

const billing = await import('@/lib/billing/service');
const billingValidation = await import('@/lib/billing/validation');
const clientsService = await import('@/lib/clients/service');
const clientValidation = await import('@/lib/clients/validation');

after(async () => {
  await closeDatabase();
});

async function createWorkspace(label) {
  const suffix = randomUUID();
  const [workspace] = await query(sql`
    insert into workspaces (name, slug)
    values (${`Phase 2F ${label}`}, ${`p2f-bill-${label}-${suffix}`})
    returning id
  `);
  const users = {};
  for (const [key, role] of [
    ['owner', 'owner'],
    ['member', 'member'],
  ]) {
    const [user] = await query(sql`
      insert into users (email, name)
      values (${`p2f-bill-${label}-${key}-${suffix}@example.test`}, ${`${key} person`})
      returning id
    `);
    await query(sql`
      insert into workspace_memberships (workspace_id, user_id, role)
      values (${workspace.id}, ${user.id}, ${role})
    `);
    users[key] = user.id;
  }
  return {
    workspaceId: workspace.id,
    ownerId: users.owner,
    memberId: users.member,
    userIds: Object.values(users),
  };
}

async function createFixture() {
  const main = await createWorkspace('main');
  const other = await createWorkspace('other');
  return {
    ...main,
    otherWorkspaceId: other.workspaceId,
    otherOwnerId: other.ownerId,
    otherUserIds: other.userIds,
  };
}

async function cleanup(fixture) {
  await query(sql`
    delete from audit_logs
    where workspace_id in (${fixture.workspaceId}, ${fixture.otherWorkspaceId})
  `);
  await query(sql`
    delete from workspaces
    where id in (${fixture.workspaceId}, ${fixture.otherWorkspaceId})
  `);
  for (const userId of [...fixture.userIds, ...fixture.otherUserIds]) {
    await query(sql`delete from users where id = ${userId}`);
  }
}

async function makeClient(fixture) {
  const data = await clientValidation.clientCreateSchema.validate({
    companyName: `Client ${randomUUID().slice(0, 8)}`,
  });
  const detail = await clientsService.createClient({
    workspaceId: fixture.workspaceId,
    userId: fixture.ownerId,
    data,
  });
  return detail.client;
}

function invoiceLine(overrides = {}) {
  return {
    description: 'Implementation',
    quantity: 1,
    unitPriceCents: 100_000,
    discountType: 'none',
    discountValue: 0,
    taxScheme: 'cgst_sgst',
    taxRateBps: 1_800,
    ...overrides,
  };
}

async function createIssuedInvoice(fixture, clientId, lines = [invoiceLine()]) {
  const created = await billing.createInvoice({
    workspaceId: fixture.workspaceId,
    userId: fixture.ownerId,
    data: await billingValidation.invoiceCreateSchema.validate({
      source: 'manual',
      clientId,
      invoiceDate: new Date().toISOString().slice(0, 10),
      lines,
    }),
  });
  await billing.submitInvoice({
    workspaceId: fixture.workspaceId,
    userId: fixture.ownerId,
    invoiceId: created.invoice.id,
  });
  await billing.approveInvoice({
    workspaceId: fixture.workspaceId,
    userId: fixture.ownerId,
    invoiceId: created.invoice.id,
  });
  await billing.issueInvoice({
    workspaceId: fixture.workspaceId,
    userId: fixture.ownerId,
    invoiceId: created.invoice.id,
  });
  return billing.getInvoice(fixture.workspaceId, created.invoice.id);
}

async function invoiceRow(fixture, invoiceId) {
  const rows = await query(sql`
    select subtotal_cents, tax_cents, total_cents, amount_paid_cents, balance_due_cents, status
    from invoices where workspace_id = ${fixture.workspaceId} and id = ${invoiceId}
  `);
  return rows[0];
}

async function paymentTotals(fixture, invoiceId) {
  const rows = await query(sql`
    select count(*)::int as count, coalesce(sum(amount_cents), 0)::int as total
    from payments where workspace_id = ${fixture.workspaceId} and invoice_id = ${invoiceId}
  `);
  return rows[0];
}

test('issued invoices are immutable and keep their computed totals', { skip }, async () => {
  const fixture = await createFixture();
  try {
    const client = await makeClient(fixture);
    const issued = await createIssuedInvoice(fixture, client.id);
    assert.equal(issued.invoice.status, 'issued');
    assert.ok(issued.invoice.issuedAt);
    assert.equal(issued.invoice.subtotalCents, 100_000);
    assert.equal(issued.invoice.totalCents, 118_000);
    assert.equal(issued.invoice.cgstCents, 9_000);
    assert.equal(issued.invoice.sgstCents, 9_000);

    await assert.rejects(
      () =>
        billing.updateDraftInvoice({
          workspaceId: fixture.workspaceId,
          userId: fixture.ownerId,
          invoiceId: issued.invoice.id,
          data: {
            expectedUpdatedAt: new Date(issued.invoice.updatedAt).toISOString(),
            invoiceDate: new Date().toISOString().slice(0, 10),
            lines: [invoiceLine({ unitPriceCents: 999_999 })],
          },
        }),
      (error) => error.code === 'INVOICE_LOCKED' && error.status === 409,
    );

    const row = await invoiceRow(fixture, issued.invoice.id);
    assert.equal(row.subtotal_cents, 100_000);
    assert.equal(row.total_cents, 118_000);
    assert.equal(row.status, 'issued');
  } finally {
    await cleanup(fixture);
  }
});

test('partial payments track balance and overpayment writes nothing', { skip }, async () => {
  const fixture = await createFixture();
  try {
    const client = await makeClient(fixture);
    const issued = await createIssuedInvoice(fixture, client.id);
    const invoiceId = issued.invoice.id;

    const partial = await billing.recordPayment({
      workspaceId: fixture.workspaceId,
      userId: fixture.ownerId,
      data: await billingValidation.paymentCreateSchema.validate({
        invoiceId,
        amountCents: 30_000,
        paymentDate: new Date().toISOString().slice(0, 10),
        method: 'bank_transfer',
      }),
    });
    assert.equal(partial.invoice.status, 'partially_paid');
    assert.equal(partial.invoice.amountPaidCents, 30_000);
    assert.equal(partial.invoice.balanceDueCents, 88_000);

    const before = await paymentTotals(fixture, invoiceId);
    assert.equal(before.count, 1);
    assert.equal(before.total, 30_000);

    await assert.rejects(
      () =>
        billing.recordPayment({
          workspaceId: fixture.workspaceId,
          userId: fixture.ownerId,
          data: {
            invoiceId,
            amountCents: 88_001,
            paymentDate: new Date(),
            method: 'upi',
          },
        }),
      (error) => error.code === 'OVERPAYMENT' && error.status === 409,
    );

    const afterReject = await paymentTotals(fixture, invoiceId);
    assert.equal(afterReject.count, 1, 'failed payment must not create a row');
    assert.equal(afterReject.total, 30_000);
    const midRow = await invoiceRow(fixture, invoiceId);
    assert.equal(midRow.balance_due_cents, 88_000);
    assert.equal(midRow.amount_paid_cents, 30_000);

    const settled = await billing.recordPayment({
      workspaceId: fixture.workspaceId,
      userId: fixture.ownerId,
      data: {
        invoiceId,
        amountCents: 88_000,
        paymentDate: new Date(),
        method: 'cash',
      },
    });
    assert.equal(settled.invoice.status, 'paid');
    assert.equal(settled.invoice.balanceDueCents, 0);

    const afterSettle = await paymentTotals(fixture, invoiceId);
    assert.equal(afterSettle.count, 2);
    assert.equal(afterSettle.total, 118_000);
    const finalRow = await invoiceRow(fixture, invoiceId);
    assert.equal(finalRow.amount_paid_cents, 118_000);
    assert.equal(finalRow.balance_due_cents, 0);
  } finally {
    await cleanup(fixture);
  }
});

test('expenses record, require a decision and stay workspace-isolated', { skip }, async () => {
  const fixture = await createFixture();
  try {
    const created = await billing.createExpense({
      workspaceId: fixture.workspaceId,
      userId: fixture.ownerId,
      data: await billingValidation.expenseCreateSchema.validate({
        category: 'software',
        description: 'Design tooling subscription',
        amountCents: 25_000,
        currency: 'INR',
        expenseDate: new Date().toISOString().slice(0, 10),
        vendor: 'Vendor Co',
      }),
    });
    assert.match(created.reference, /^EXP-\d{4,}$/);
    assert.equal(created.status, 'pending_approval');
    assert.equal(created.amountCents, 25_000);

    const decided = await billing.decideExpense({
      workspaceId: fixture.workspaceId,
      userId: fixture.ownerId,
      expenseId: created.id,
      data: await billingValidation.expenseDecisionSchema.validate({
        status: 'approved',
        decisionNotes: 'Within budget.',
      }),
    });
    assert.equal(decided.status, 'approved');
    assert.ok(decided.reviewedAt);

    await assert.rejects(
      () =>
        billing.decideExpense({
          workspaceId: fixture.workspaceId,
          userId: fixture.ownerId,
          expenseId: created.id,
          data: { status: 'rejected', decisionNotes: 'Second look.' },
        }),
      (error) => error.code === 'INVALID_STATE' && error.status === 409,
    );

    assert.equal(
      await billing.getExpense(fixture.otherWorkspaceId, created.id),
      null,
    );
    const otherList = await billing.listExpenses(fixture.otherWorkspaceId, {
      page: 1,
      pageSize: 20,
    });
    assert.equal(otherList.total, 0);

    const actions = await query(sql`
      select action from audit_logs where workspace_id = ${fixture.workspaceId}
    `);
    const set = new Set(actions.map((row) => row.action));
    assert.ok(set.has('expense.create'));
    assert.ok(set.has('expense.decision'));
  } finally {
    await cleanup(fixture);
  }
});
