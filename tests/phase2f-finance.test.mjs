import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { computeProposal, percentOfBps } from '@/lib/proposals/calc';
import {
  computeInvoiceLines,
  totalsFromStoredLines,
  paymentOutcome,
  taxSplit,
} from '@/lib/billing/calc';
import {
  sql,
  query,
  closeDatabase,
  assertDisposableTestUrl,
} from './support/db.mjs';

// Phase 2F-G — financial data integrity: integer minor units, tax rounding,
// discount allocation, pipeline vs billed separation and currency isolation.
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
const proposalsService = await import('@/lib/proposals/service');
const proposalsValidation = await import('@/lib/proposals/validation');
const opportunities = await import('@/lib/opportunities/service');
const opportunityValidation = await import('@/lib/opportunities/validation');
const clientsService = await import('@/lib/clients/service');
const clientValidation = await import('@/lib/clients/validation');
const leads = await import('@/lib/leads/service');
const leadValidation = await import('@/lib/leads/validation');

after(async () => {
  await closeDatabase();
});

const MONEY_FIELDS = [
  'lineSubtotalCents',
  'itemDiscountCents',
  'proposalShareCents',
  'lineDiscountCents',
  'lineNetCents',
  'lineTaxCents',
  'lineTotalCents',
];

function assertIntegerMoney(line) {
  for (const field of MONEY_FIELDS) {
    assert.ok(
      Number.isInteger(line[field]),
      `${field} must be an integer minor-unit amount, got ${line[field]}`,
    );
  }
}

function calcLine(overrides = {}) {
  return {
    description: 'Line',
    quantity: 1,
    unitPriceCents: 0,
    discountType: 'none',
    discountValue: 0,
    taxScheme: 'none',
    taxRateBps: 0,
    ...overrides,
  };
}

test('monetary arithmetic stays in integer minor units with exact rounding', () => {
  // Half-up rounding on a value that a naive float multiply would lose.
  const rounded = percentOfBps(123_456_789, 750);
  assert.equal(rounded, 9_259_259);
  assert.ok(Number.isInteger(rounded));

  // An odd tax amount splits without losing a minor unit.
  const odd = computeProposal({
    items: [calcLine({ unitPriceCents: 101, taxScheme: 'cgst_sgst', taxRateBps: 500 })],
  });
  const oddLine = odd.lines[0];
  assert.equal(oddLine.lineTaxCents, 5);
  assert.deepEqual(taxSplit(oddLine.lineTaxCents, 'cgst_sgst'), {
    cgstCents: 2,
    sgstCents: 3,
    igstCents: 0,
  });

  // A proposal discount that does not divide evenly is allocated by largest
  // remainder, so the shares always add back to the discount exactly.
  const allocated = computeProposal({
    items: [calcLine({ unitPriceCents: 100 }), calcLine({ unitPriceCents: 100 }), calcLine({ unitPriceCents: 100 })],
    proposalDiscountType: 'percent',
    proposalDiscountValue: 333,
  });
  assert.equal(allocated.proposalDiscountCents, 10);
  assert.deepEqual(
    allocated.lines.map((line) => line.proposalShareCents),
    [4, 3, 3],
  );
  assert.equal(
    allocated.lines.reduce((sum, line) => sum + line.proposalShareCents, 0),
    allocated.proposalDiscountCents,
  );
  for (const line of allocated.lines) {
    assertIntegerMoney(line);
    assert.equal(line.lineTotalCents, line.lineNetCents + line.lineTaxCents);
  }

  // Recurring and optional buckets never leak into the one-time total.
  const bucketed = computeProposal({
    items: [
      calcLine({ unitPriceCents: 100_000, billingType: 'one_time' }),
      calcLine({ unitPriceCents: 50_000, billingType: 'monthly' }),
      calcLine({ unitPriceCents: 10_000, billingType: 'quarterly' }),
      calcLine({ unitPriceCents: 1_000, billingType: 'annual' }),
      calcLine({ unitPriceCents: 9_999, kind: 'optional' }),
    ],
  });
  assert.equal(bucketed.totals.grandTotalCents, 100_000);
  assert.equal(bucketed.totals.oneTimeTotalCents, bucketed.periods.one_time.totalCents);
  assert.equal(bucketed.totals.recurringMonthlyCents, 50_000);
  assert.equal(bucketed.totals.recurringQuarterlyCents, 10_000);
  assert.equal(bucketed.totals.recurringAnnualCents, 1_000);
  assert.equal(bucketed.totals.optionalTotalCents, 9_999);
  assert.equal(bucketed.recurringTotalCents, 61_000);

  // Invoice lines reuse the same engine; recomputing stored lines is exact.
  const invoice = computeInvoiceLines([
    calcLine({
      description: 'Implementation',
      unitPriceCents: 100_000,
      discountType: 'percent',
      discountValue: 3_333,
      taxScheme: 'cgst_sgst',
      taxRateBps: 1_800,
    }),
  ]);
  const line = invoice.lines[0];
  assert.equal(line.lineDiscountCents, 33_330);
  assert.equal(line.lineNetCents, 66_670);
  assert.equal(line.lineTaxCents, 12_001);
  assert.equal(line.lineTotalCents, 78_671);
  assert.deepEqual(invoice.totals, {
    subtotalCents: 100_000,
    discountCents: 33_330,
    taxCents: 12_001,
    totalCents: 78_671,
    cgstCents: 6_000,
    sgstCents: 6_001,
    igstCents: 0,
  });
  assert.deepEqual(totalsFromStoredLines(invoice.lines), invoice.totals);

  const partial = paymentOutcome({
    totalCents: 78_671,
    amountPaidCents: 30_000,
    amountCents: 10_000,
  });
  assert.deepEqual(partial, {
    amountPaidCents: 40_000,
    balanceDueCents: 38_671,
    status: 'partially_paid',
  });
  assert.equal(
    paymentOutcome({ totalCents: 78_671, amountPaidCents: 68_671, amountCents: 10_000 }).status,
    'paid',
  );
});

async function createWorkspace(label) {
  const suffix = randomUUID();
  const [workspace] = await query(sql`
    insert into workspaces (name, slug)
    values (${`Phase 2F ${label}`}, ${`p2f-fin-${label}-${suffix}`})
    returning id
  `);
  const users = {};
  for (const [key, role] of [
    ['owner', 'owner'],
    ['member', 'member'],
  ]) {
    const [user] = await query(sql`
      insert into users (email, name)
      values (${`p2f-fin-${label}-${key}-${suffix}@example.test`}, ${`${key} person`})
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

async function makeLead(fixture) {
  const data = await leadValidation.leadCreateSchema.validate({
    companyName: `Acme ${randomUUID().slice(0, 6)}`,
    email: `lead-${randomUUID().slice(0, 8)}@acme.test`,
    website: 'https://www.acme.test',
  });
  const result = await leads.createLead({
    workspaceId: fixture.workspaceId,
    userId: fixture.ownerId,
    data,
  });
  return result.lead;
}

async function makeClient(fixture, leadId = null) {
  const data = await clientValidation.clientCreateSchema.validate({
    companyName: `Client ${randomUUID().slice(0, 8)}`,
    ...(leadId ? { leadId } : {}),
  });
  const detail = await clientsService.createClient({
    workspaceId: fixture.workspaceId,
    userId: fixture.ownerId,
    data,
  });
  return detail.client;
}

function proposalLine(overrides = {}) {
  return {
    name: 'Implementation',
    quantity: 1,
    unitPriceCents: 100_000,
    billingType: 'one_time',
    kind: 'included',
    taxScheme: 'none',
    taxRateBps: 0,
    ...overrides,
  };
}

async function draftProposal(fixture, leadId, items, currency = 'INR') {
  const opportunityData = await opportunityValidation.opportunityCreateSchema.validate({
    leadId,
    title: `Opportunity ${randomUUID().slice(0, 8)}`,
  });
  const opportunity = await opportunities.createOpportunity({
    workspaceId: fixture.workspaceId,
    userId: fixture.ownerId,
    data: opportunityData,
  });
  const proposalData = await proposalsValidation.proposalCreateSchema.validate({
    opportunityId: opportunity.opportunity.id,
    prefill: false,
  });
  const created = await proposalsService.createProposal({
    workspaceId: fixture.workspaceId,
    userId: fixture.ownerId,
    data: proposalData,
  });
  const content = await proposalsValidation.versionContentSchema.validate({
    expectedUpdatedAt: new Date(created.currentVersion.updatedAt).toISOString(),
    currency,
    validityDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10),
    items,
  });
  await proposalsService.saveDraftContent({
    workspaceId: fixture.workspaceId,
    userId: fixture.ownerId,
    proposalId: created.proposal.id,
    data: content,
  });
  return created.proposal.id;
}

async function acceptedProposal(fixture, items = [proposalLine()]) {
  const lead = await makeLead(fixture);
  const proposalId = await draftProposal(fixture, lead.id, items);
  const base = { workspaceId: fixture.workspaceId, userId: fixture.ownerId, proposalId };
  await proposalsService.submitProposal(base);
  await proposalsService.decideProposal({ ...base, decision: 'approved', notes: 'Approved.' });
  await proposalsService.markProposalSent(base);
  await proposalsService.recordProposalResponse({ ...base, response: 'accepted', notes: 'Signed.' });
  return { proposalId, lead };
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

async function createIssuedInvoice(fixture, data) {
  const created = await billing.createInvoice({
    workspaceId: fixture.workspaceId,
    userId: fixture.ownerId,
    data: await billingValidation.invoiceCreateSchema.validate(data),
  });
  const base = {
    workspaceId: fixture.workspaceId,
    userId: fixture.ownerId,
    invoiceId: created.invoice.id,
  };
  await billing.submitInvoice(base);
  await billing.approveInvoice(base);
  await billing.issueInvoice(base);
  return billing.getInvoice(fixture.workspaceId, created.invoice.id);
}

async function recordPayment(fixture, invoiceId, amountCents) {
  return billing.recordPayment({
    workspaceId: fixture.workspaceId,
    userId: fixture.ownerId,
    data: await billingValidation.paymentCreateSchema.validate({
      invoiceId,
      amountCents,
      paymentDate: new Date().toISOString().slice(0, 10),
      method: 'bank_transfer',
    }),
  });
}

async function approvedExpense(fixture, amountCents, currency = 'INR') {
  const created = await billing.createExpense({
    workspaceId: fixture.workspaceId,
    userId: fixture.ownerId,
    data: await billingValidation.expenseCreateSchema.validate({
      category: 'software',
      description: 'Tooling subscription',
      amountCents,
      currency,
      expenseDate: new Date().toISOString().slice(0, 10),
      vendor: 'Vendor Co',
    }),
  });
  return billing.decideExpense({
    workspaceId: fixture.workspaceId,
    userId: fixture.ownerId,
    expenseId: created.id,
    data: await billingValidation.expenseDecisionSchema.validate({
      status: 'approved',
      decisionNotes: 'Within budget.',
    }),
  });
}

test('finance overview keeps pipeline, accepted, invoiced and collected apart', { skip }, async () => {
  const fixture = await createFixture();
  try {
    const { lead } = await acceptedProposal(fixture, [
      proposalLine({ unitPriceCents: 100_000 }),
      proposalLine({ name: 'Care plan', unitPriceCents: 50_000, billingType: 'monthly' }),
    ]);
    await draftProposal(fixture, lead.id, [proposalLine({ unitPriceCents: 200_000 })]);

    const client = await makeClient(fixture);
    const invoice = await createIssuedInvoice(fixture, {
      source: 'manual',
      clientId: client.id,
      invoiceDate: new Date().toISOString().slice(0, 10),
      lines: [invoiceLine()],
    });
    assert.equal(invoice.invoice.totalCents, 118_000);
    await recordPayment(fixture, invoice.invoice.id, 30_000);
    await approvedExpense(fixture, 25_000);

    const overview = await billing.getFinanceOverview(fixture.workspaceId);
    assert.equal(overview.currency, 'INR');
    const totals = overview.totals;
    assert.equal(totals.pipelineCents, 200_000, 'accepted value stays out of the pipeline');
    assert.equal(totals.pipelineCount, 1);
    assert.equal(overview.pipelineProposals, 1);
    assert.equal(totals.approvedOneTimeCents, 100_000);
    assert.equal(totals.approvedRecurringMonthlyCents, 50_000);
    assert.equal(totals.approvedCount, 1);
    assert.equal(totals.invoicedCents, 118_000, 'only issued invoices count as billed');
    assert.equal(totals.invoiceCount, 1);
    assert.equal(totals.collectedCents, 30_000);
    assert.equal(totals.paymentCount, 1);
    assert.equal(totals.outstandingCents, 88_000);
    assert.equal(totals.overdueCents, 0);
    assert.equal(totals.approvedExpenseCents, 25_000);

    // Pipeline, accepted and billed are three distinct measures, not a running
    // sum that a screen could misread as revenue.
    assert.notEqual(totals.pipelineCents, totals.approvedOneTimeCents);
    assert.notEqual(totals.invoicedCents, totals.approvedOneTimeCents);
    assert.equal(totals.outstandingCents, totals.invoicedCents - totals.collectedCents);

    assert.equal(overview.byCurrency.length, 1);
    assert.equal(overview.byCurrency[0].currency, 'INR');
    assert.equal(overview.statusCounts.partially_paid, 1);
    assert.equal(overview.recentInvoices[0].reference, invoice.invoice.reference);
    assert.equal(overview.recentPayments[0].amountCents, 30_000);
  } finally {
    await cleanup(fixture);
  }
});

test('currencies are reported independently and never summed together', { skip }, async () => {
  const fixture = await createFixture();
  try {
    const client = await makeClient(fixture);
    const inrInvoice = await createIssuedInvoice(fixture, {
      source: 'manual',
      clientId: client.id,
      invoiceDate: new Date().toISOString().slice(0, 10),
      lines: [invoiceLine()],
    });
    await recordPayment(fixture, inrInvoice.invoice.id, 30_000);

    const usdInvoice = await createIssuedInvoice(fixture, {
      source: 'manual',
      clientId: client.id,
      currency: 'USD',
      invoiceDate: new Date().toISOString().slice(0, 10),
      lines: [invoiceLine({ unitPriceCents: 200_000, taxScheme: 'none', taxRateBps: 0 })],
    });
    assert.equal(usdInvoice.invoice.currency, 'USD');
    assert.equal(usdInvoice.invoice.totalCents, 200_000);
    await recordPayment(fixture, usdInvoice.invoice.id, 50_000);
    await approvedExpense(fixture, 7_500, 'USD');

    const overview = await billing.getFinanceOverview(fixture.workspaceId);
    assert.equal(overview.currency, 'INR', 'INR is the primary reporting currency');
    assert.deepEqual(
      overview.byCurrency.map((row) => row.currency),
      ['INR', 'USD'],
    );
    const [inr, usd] = overview.byCurrency;
    assert.equal(inr.invoicedCents, 118_000);
    assert.equal(inr.collectedCents, 30_000);
    assert.equal(inr.outstandingCents, 88_000);
    assert.equal(inr.approvedExpenseCents, 0);
    assert.equal(usd.invoicedCents, 200_000);
    assert.equal(usd.collectedCents, 50_000);
    assert.equal(usd.outstandingCents, 150_000);
    assert.equal(usd.approvedExpenseCents, 7_500);
    assert.equal(overview.totals.invoicedCents, 118_000, 'primary currency excludes USD');
  } finally {
    await cleanup(fixture);
  }
});

test('a proposal-sourced invoice must match the accepted proposal currency', { skip }, async () => {
  const fixture = await createFixture();
  try {
    const { proposalId, lead } = await acceptedProposal(fixture, [
      proposalLine({ unitPriceCents: 100_000 }),
      proposalLine({
        name: 'Care plan',
        unitPriceCents: 50_000,
        billingType: 'monthly',
      }),
    ]);
    await makeClient(fixture, lead.id);

    const invoiceDate = new Date().toISOString().slice(0, 10);
    await assert.rejects(
      () =>
        billing.createInvoice({
          workspaceId: fixture.workspaceId,
          userId: fixture.ownerId,
          data: {
            source: 'proposal',
            proposalId,
            currency: 'USD',
            invoiceDate,
          },
        }),
      (error) => error.code === 'CURRENCY_MISMATCH' && error.status === 422,
    );
    const [afterMismatch] = await query(sql`
      select count(*)::int as count from invoices where workspace_id = ${fixture.workspaceId}
    `);
    assert.equal(afterMismatch.count, 0, 'a rejected currency mismatch creates no invoice');

    const matched = await billing.createInvoice({
      workspaceId: fixture.workspaceId,
      userId: fixture.ownerId,
      data: await billingValidation.invoiceCreateSchema.validate({
        source: 'proposal',
        proposalId,
        invoiceDate,
      }),
    });
    assert.equal(matched.invoice.currency, 'INR');
    assert.equal(matched.invoice.totalCents, 100_000);
    assert.ok(
      matched.lines.every((line) => line.description !== 'Care plan'),
      'recurring lines are not billed on the one-time invoice',
    );
  } finally {
    await cleanup(fixture);
  }
});
