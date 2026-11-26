import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {
  sql,
  query,
  closeDatabase,
  assertDisposableTestUrl,
} from './support/db.mjs';

// Database-backed Phase 2D-E checks. Runs only against
// PHASE2A_TEST_DATABASE_URL (a disposable database whose name ends in _test).
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
const clients = await import('@/lib/clients/service');
const clientValidation = await import('@/lib/clients/validation');
const proposalsService = await import('@/lib/proposals/service');
const proposalValidation = await import('@/lib/proposals/validation');
const opportunities = await import('@/lib/opportunities/service');
const opportunityValidation = await import('@/lib/opportunities/validation');
const leads = await import('@/lib/leads/service');
const leadValidation = await import('@/lib/leads/validation');
const permissions = await import('@/lib/auth/permissions');

after(async () => {
  await closeDatabase();
});

async function createWorkspace(label) {
  const suffix = randomUUID();
  const [workspace] = await query(sql`
    insert into workspaces (name, slug)
    values (${`Phase 2D-E ${label}`}, ${`p2de-${label}-${suffix}`})
    returning id
  `);

  const users = {};
  for (const [key, role] of [
    ['owner', 'owner'],
    ['member', 'member'],
    ['viewer', 'viewer'],
    ['manager', 'manager'],
  ]) {
    const [user] = await query(sql`
      insert into users (email, name)
      values (${`p2de-${label}-${key}-${suffix}@example.test`}, ${`${key} person`})
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
    viewerId: users.viewer,
    managerId: users.manager,
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
    cleanupUsers: [...main.userIds, ...other.userIds],
    cleanupWorkspaces: [main.workspaceId, other.workspaceId],
  };
}

async function cleanup(fixture) {
  await query(
    sql`delete from audit_logs where workspace_id in (${fixture.workspaceId}, ${fixture.otherWorkspaceId})`,
  );
  await query(
    sql`delete from workspaces where id in (${fixture.workspaceId}, ${fixture.otherWorkspaceId})`,
  );
  for (const userId of fixture.cleanupUsers) {
    await query(sql`delete from users where id = ${userId}`);
  }
}

async function makeClient(fixture, overrides = {}) {
  const data = await clientValidation.clientCreateSchema.validate({
    companyName: `Client ${randomUUID().slice(0, 8)}`,
    ...overrides,
  });
  return clients.createClient({
    workspaceId: fixture.workspaceId,
    userId: fixture.ownerId,
    data,
  });
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

async function createManualInvoice(fixture, clientId, lines = [invoiceLine()]) {
  const data = await billingValidation.invoiceCreateSchema.validate({
    source: 'manual',
    clientId,
    invoiceDate: new Date().toISOString().slice(0, 10),
    lines,
  });
  return billing.createInvoice({
    workspaceId: fixture.workspaceId,
    userId: fixture.ownerId,
    data,
  });
}

async function makeAcceptedProposal(fixture, unitPriceCents = 250_000) {
  const leadData = await leadValidation.leadCreateSchema.validate({
    companyName: `Acme ${randomUUID().slice(0, 6)}`,
    email: `lead-${randomUUID().slice(0, 8)}@acme.test`,
  });
  const lead = await leads.createLead({
    workspaceId: fixture.workspaceId,
    userId: fixture.ownerId,
    data: leadData,
  });

  const opportunityData = await opportunityValidation.opportunityCreateSchema.validate({
    leadId: lead.lead.id,
    title: `Opportunity ${randomUUID().slice(0, 8)}`,
  });
  const opportunity = await opportunities.createOpportunity({
    workspaceId: fixture.workspaceId,
    userId: fixture.ownerId,
    data: opportunityData,
  });

  const proposal = await proposalsService.createProposal({
    workspaceId: fixture.workspaceId,
    userId: fixture.ownerId,
    data: await proposalValidation.proposalCreateSchema.validate({
      opportunityId: opportunity.opportunity.id,
      prefill: false,
    }),
  });

  const versionData = await proposalValidation.versionContentSchema.validate({
    expectedUpdatedAt: new Date(proposal.currentVersion.updatedAt).toISOString(),
    currency: 'INR',
    validityDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10),
    items: [
      {
        name: 'Implementation',
        quantity: 1,
        unitPriceCents,
        billingType: 'one_time',
        kind: 'included',
        taxScheme: 'cgst_sgst',
        taxRateBps: 1_800,
      },
    ],
  });
  await proposalsService.saveDraftContent({
    workspaceId: fixture.workspaceId,
    userId: fixture.ownerId,
    proposalId: proposal.proposal.id,
    data: versionData,
  });
  await proposalsService.submitProposal({
    workspaceId: fixture.workspaceId,
    userId: fixture.ownerId,
    proposalId: proposal.proposal.id,
  });
  await proposalsService.decideProposal({
    workspaceId: fixture.workspaceId,
    userId: fixture.ownerId,
    proposalId: proposal.proposal.id,
    decision: 'approved',
  });
  await proposalsService.markProposalSent({
    workspaceId: fixture.workspaceId,
    userId: fixture.ownerId,
    proposalId: proposal.proposal.id,
  });
  const accepted = await proposalsService.recordProposalResponse({
    workspaceId: fixture.workspaceId,
    userId: fixture.ownerId,
    proposalId: proposal.proposal.id,
    response: 'accepted',
  });

  return { lead: lead.lead, accepted };
}

test('manual invoice lifecycle records payments, keeps history and isolates workspaces', { skip }, async () => {
  const fixture = await createFixture();
  try {
    const client = await makeClient(fixture);
    const created = await createManualInvoice(fixture, client.client.id);

    assert.match(created.invoice.reference, /^INV-\d{4,}$/);
    assert.equal(created.invoice.status, 'draft');
    assert.equal(created.invoice.subtotalCents, 100_000);
    assert.equal(created.invoice.totalCents, 118_000);
    assert.equal(created.invoice.balanceDueCents, 118_000);
    assert.equal(created.invoice.cgstCents, 9_000);
    assert.equal(created.invoice.sgstCents, 9_000);
    assert.equal(created.lines.length, 1);

    const updated = await billing.updateDraftInvoice({
      workspaceId: fixture.workspaceId,
      userId: fixture.ownerId,
      invoiceId: created.invoice.id,
      data: await billingValidation.invoiceUpdateSchema.validate({
        expectedUpdatedAt: new Date(created.invoice.updatedAt).toISOString(),
        invoiceDate: new Date().toISOString().slice(0, 10),
        currency: 'INR',
        lines: [invoiceLine({ unitPriceCents: 200_000 })],
      }),
    });
    assert.equal(updated.invoice.totalCents, 236_000);
    assert.equal(updated.lines[0].lineTotalCents, 236_000);

    await billing.submitInvoice({
      workspaceId: fixture.workspaceId,
      userId: fixture.ownerId,
      invoiceId: created.invoice.id,
    });
    const submitted = await billing.getInvoice(fixture.workspaceId, created.invoice.id);
    assert.equal(submitted.invoice.status, 'pending_approval');

    await assert.rejects(
      () =>
        billing.updateDraftInvoice({
          workspaceId: fixture.workspaceId,
          userId: fixture.ownerId,
          invoiceId: created.invoice.id,
          data: { expectedUpdatedAt: new Date().toISOString(), lines: [invoiceLine()] },
        }),
      (error) => error.code === 'INVOICE_LOCKED' && error.status === 409,
    );

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
    const issued = await billing.getInvoice(fixture.workspaceId, created.invoice.id);
    assert.equal(issued.invoice.status, 'issued');
    assert.ok(issued.invoice.issuedAt);
    assert.equal(issued.canRecordPayment, true);

    const partial = await billing.recordPayment({
      workspaceId: fixture.workspaceId,
      userId: fixture.ownerId,
      data: await billingValidation.paymentCreateSchema.validate({
        invoiceId: created.invoice.id,
        amountCents: 100_000,
        paymentDate: new Date().toISOString().slice(0, 10),
        method: 'bank_transfer',
        transactionReference: `TXN-${randomUUID()}`,
      }),
    });
    assert.equal(partial.invoice.status, 'partially_paid');
    assert.equal(partial.invoice.amountPaidCents, 100_000);
    assert.equal(partial.invoice.balanceDueCents, 136_000);
    assert.equal(partial.payments.length, 1);

    await assert.rejects(
      () =>
        billing.recordPayment({
          workspaceId: fixture.workspaceId,
          userId: fixture.ownerId,
          data: {
            invoiceId: created.invoice.id,
            amountCents: 136_001,
            paymentDate: new Date(),
            method: 'upi',
          },
        }),
      (error) => error.code === 'OVERPAYMENT' && error.status === 409,
    );

    const duplicateReference = `TXN-${randomUUID()}`;
    await billing.recordPayment({
      workspaceId: fixture.workspaceId,
      userId: fixture.ownerId,
      data: {
        invoiceId: created.invoice.id,
        amountCents: 6_000,
        paymentDate: new Date(),
        method: 'upi',
        transactionReference: duplicateReference,
      },
    });
    await assert.rejects(
      () =>
        billing.recordPayment({
          workspaceId: fixture.workspaceId,
          userId: fixture.ownerId,
          data: {
            invoiceId: created.invoice.id,
            amountCents: 6_000,
            paymentDate: new Date(),
            method: 'upi',
            transactionReference: duplicateReference,
          },
        }),
      (error) => error.code === 'DUPLICATE_TRANSACTION_REFERENCE' && error.status === 409,
    );

    const settled = await billing.recordPayment({
      workspaceId: fixture.workspaceId,
      userId: fixture.ownerId,
      data: {
        invoiceId: created.invoice.id,
        amountCents: 130_000,
        paymentDate: new Date(),
        method: 'cash',
      },
    });
    assert.equal(settled.invoice.status, 'paid');
    assert.equal(settled.invoice.balanceDueCents, 0);
    assert.equal(settled.payments.length, 3);

    await assert.rejects(
      () =>
        billing.cancelInvoice({
          workspaceId: fixture.workspaceId,
          userId: fixture.ownerId,
          invoiceId: created.invoice.id,
          cancellationReason: 'Client dispute.',
        }),
      (error) => error.code === 'INVOICE_HAS_PAYMENTS' && error.status === 409,
    );

    assert.equal(await billing.getInvoice(fixture.otherWorkspaceId, created.invoice.id), null);
    const otherList = await billing.listInvoices(fixture.otherWorkspaceId, fixture.otherOwnerId, {
      page: 1,
      pageSize: 20,
      sort: 'date',
      direction: 'desc',
    });
    assert.equal(otherList.total, 0);
    assert.equal(
      await billing.submitInvoice({
        workspaceId: fixture.otherWorkspaceId,
        userId: fixture.otherOwnerId,
        invoiceId: created.invoice.id,
      }),
      null,
    );

    const auditRows = await query(sql`
      select action from audit_logs
      where workspace_id = ${fixture.workspaceId}
    `);
    const actions = new Set(auditRows.map((row) => row.action));
    for (const expected of [
      'invoice.create',
      'invoice.update',
      'invoice.submit',
      'invoice.approve',
      'invoice.issue',
      'payment.record',
    ]) {
      assert.ok(actions.has(expected), `missing audit action ${expected}`);
    }

    const invoicesOverview = await billing.getInvoicesOverview(fixture.workspaceId);
    assert.equal(invoicesOverview.outstandingCents, 0);
    assert.equal(invoicesOverview.collectedThisMonthCents, 236_000);
    assert.equal(invoicesOverview.counts.paid, 1);

    const finance = await billing.getFinanceOverview(fixture.workspaceId);
    assert.equal(finance.totals.invoicedCents, 236_000);
    assert.equal(finance.totals.collectedCents, 236_000);
    assert.equal(finance.totals.outstandingCents, 0);
    assert.equal(finance.statusCounts.paid, 1);
  } finally {
    await cleanup(fixture);
  }
});

test('proposal-sourced invoices copy accepted lines and reject duplicates', { skip }, async () => {
  const fixture = await createFixture();
  try {
    const { lead, accepted } = await makeAcceptedProposal(fixture);
    assert.equal(accepted.currentVersion.status, 'accepted');

    const client = await makeClient(fixture, { leadId: lead.id });

    const data = await billingValidation.invoiceCreateSchema.validate({
      source: 'proposal',
      proposalId: accepted.proposal.id,
      invoiceDate: new Date().toISOString().slice(0, 10),
    });
    const created = await billing.createInvoice({
      workspaceId: fixture.workspaceId,
      userId: fixture.ownerId,
      data,
    });

    assert.equal(created.invoice.source, 'proposal');
    assert.equal(created.invoice.clientId, client.client.id);
    assert.equal(created.invoice.totalCents, accepted.currentVersion.grandTotalCents);
    assert.equal(created.lines.length, 1);
    assert.equal(
      created.lines[0].lineTotalCents,
      accepted.items[0].lineTotalCents,
      'invoice keeps the accepted line values',
    );

    await assert.rejects(
      () =>
        billing.createInvoice({
          workspaceId: fixture.workspaceId,
          userId: fixture.ownerId,
          data,
        }),
      (error) => ['INVOICE_EXISTS', 'PROPOSAL_NOT_ACCEPTED'].includes(error.code),
    );

    const options = await billing.getInvoiceSourceOptions(fixture.workspaceId);
    assert.equal(
      options.proposals.some((entry) => entry.proposalId === accepted.proposal.id),
      false,
      'an accepted proposal with an invoice is not offered again',
    );

    const otherOptions = await billing.getInvoiceSourceOptions(fixture.otherWorkspaceId);
    assert.equal(otherOptions.proposals.length, 0);
  } finally {
    await cleanup(fixture);
  }
});

test('expenses require a decision and feed the finance overview', { skip }, async () => {
  const fixture = await createFixture();
  try {
    const expense = await billing.createExpense({
      workspaceId: fixture.workspaceId,
      userId: fixture.ownerId,
      data: await billingValidation.expenseCreateSchema.validate({
        category: 'software',
        description: 'Annual design licence',
        amountCents: 24_000,
        expenseDate: new Date().toISOString().slice(0, 10),
      }),
    });
    assert.equal(expense.status, 'pending_approval');
    assert.match(expense.reference, /^EXP-/);

    const approved = await billing.decideExpense({
      workspaceId: fixture.workspaceId,
      userId: fixture.managerId,
      expenseId: expense.id,
      data: { status: 'approved', decisionNotes: 'Approved for the quarter.' },
    });
    assert.equal(approved.status, 'approved');
    assert.ok(approved.reviewedAt);

    await assert.rejects(
      () =>
        billing.decideExpense({
          workspaceId: fixture.workspaceId,
          userId: fixture.managerId,
          expenseId: expense.id,
          data: { status: 'rejected' },
        }),
      (error) => error.code === 'INVALID_STATE' && error.status === 409,
    );

    const overview = await billing.getExpensesOverview(fixture.workspaceId);
    assert.equal(overview.total, 1);
    assert.equal(overview.counts.approved, 1);
    assert.equal(overview.approvedThisMonthCents, 24_000);

    const finance = await billing.getFinanceOverview(fixture.workspaceId);
    assert.equal(finance.totals.approvedExpenseCents, 24_000);

    const otherFinance = await billing.getFinanceOverview(fixture.otherWorkspaceId);
    assert.equal(otherFinance.totals.approvedExpenseCents, 0);
    assert.equal(otherFinance.totals.invoicedCents, 0);
  } finally {
    await cleanup(fixture);
  }
});

async function issueInvoice(fixture, invoiceId) {
  await billing.submitInvoice({
    workspaceId: fixture.workspaceId,
    userId: fixture.ownerId,
    invoiceId,
  });
  await billing.approveInvoice({
    workspaceId: fixture.workspaceId,
    userId: fixture.ownerId,
    invoiceId,
  });
  return billing.issueInvoice({
    workspaceId: fixture.workspaceId,
    userId: fixture.ownerId,
    invoiceId,
  });
}

test('finance keeps currencies separate and billing permissions stay least-privilege', { skip }, async () => {
  const fixture = await createFixture();
  try {
    const client = await makeClient(fixture);
    const inrInvoice = await createManualInvoice(fixture, client.client.id);

    const usdData = await billingValidation.invoiceCreateSchema.validate({
      source: 'manual',
      clientId: client.client.id,
      currency: 'USD',
      invoiceDate: new Date().toISOString().slice(0, 10),
      lines: [invoiceLine({ taxScheme: 'none', taxRateBps: 0, unitPriceCents: 500 })],
    });
    const usdInvoice = await billing.createInvoice({
      workspaceId: fixture.workspaceId,
      userId: fixture.ownerId,
      data: usdData,
    });

    await issueInvoice(fixture, inrInvoice.invoice.id);
    await issueInvoice(fixture, usdInvoice.invoice.id);

    const finance = await billing.getFinanceOverview(fixture.workspaceId);
    assert.equal(finance.currency, 'INR');
    assert.equal(finance.byCurrency.length, 2);
    const usd = finance.byCurrency.find((row) => row.currency === 'USD');
    assert.ok(usd);
    assert.equal(usd.invoicedCents, 500);
    assert.equal(finance.totals.invoicedCents, 118_000, 'INR totals never include USD');

    const inrOverview = await billing.getInvoicesOverview(fixture.workspaceId, 'INR');
    assert.equal(inrOverview.total, 1);
    assert.equal(inrOverview.outstandingCents, 118_000);
    const usdOverview = await billing.getInvoicesOverview(fixture.workspaceId, 'USD');
    assert.equal(usdOverview.total, 1);

    assert.equal(permissions.hasPermission('viewer', 'invoices.view'), true);
    assert.equal(permissions.hasPermission('viewer', 'invoices.create'), false);
    assert.equal(permissions.hasPermission('viewer', 'payments.record'), false);
    assert.equal(permissions.hasPermission('member', 'invoices.create'), true);
    assert.equal(permissions.hasPermission('member', 'invoices.approve'), false);
    assert.equal(permissions.hasPermission('member', 'payments.record'), false);
    assert.equal(permissions.hasPermission('manager', 'invoices.approve'), true);
    assert.equal(permissions.hasPermission('manager', 'payments.record'), true);
    assert.equal(permissions.hasPermission('manager', 'expenses.approve'), true);
    assert.equal(permissions.hasPermission('specialist', 'expenses.create'), true);
    assert.equal(permissions.hasPermission('specialist', 'invoices.create'), false);
  } finally {
    await cleanup(fixture);
  }
});
