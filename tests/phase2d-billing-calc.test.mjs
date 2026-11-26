import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeInvoiceLines,
  paymentOutcome,
  taxSplit,
  totalsFromStoredLines,
} from '@/lib/billing/calc';
import {
  canTransitionInvoice,
  invoiceActions,
  invoiceDisplayStatus,
  isInvoiceDueSoon,
  isInvoiceOverdue,
  isInvoicePayable,
} from '@/lib/billing/transitions';
import {
  expenseCreateSchema,
  expenseDecisionSchema,
  invoiceCreateSchema,
  invoiceLineSchema,
  invoiceUpdateSchema,
  paymentCreateSchema,
} from '@/lib/billing/validation';

test('invoice lines use integer minor units with deterministic tax splits', () => {
  const { lines, totals } = computeInvoiceLines([
    {
      description: 'Website build',
      quantity: 2,
      unitPriceCents: 50_000,
      discountType: 'percent',
      discountValue: 1_000, // 10%
      taxScheme: 'cgst_sgst',
      taxRateBps: 1_800, // 18%
    },
    {
      description: 'Hosting',
      quantity: 1,
      unitPriceCents: 12_345,
      taxScheme: 'igst',
      taxRateBps: 1_800,
    },
  ]);

  assert.equal(lines.length, 2);
  assert.equal(lines[0].lineSubtotalCents, 100_000);
  assert.equal(lines[0].lineDiscountCents, 10_000);
  assert.equal(lines[0].lineNetCents, 90_000);
  assert.equal(lines[0].lineTaxCents, 16_200);
  assert.equal(lines[0].lineTotalCents, 106_200);

  assert.equal(totals.subtotalCents, 112_345);
  assert.equal(totals.discountCents, 10_000);
  assert.equal(totals.taxCents, lines[0].lineTaxCents + lines[1].lineTaxCents);
  assert.equal(
    totals.totalCents,
    totals.subtotalCents - totals.discountCents + totals.taxCents,
    'total is net plus tax in minor units',
  );

  const cgst = Math.floor(lines[0].lineTaxCents / 2);
  assert.equal(totals.cgstCents, cgst);
  assert.equal(totals.sgstCents, lines[0].lineTaxCents - cgst);
  assert.equal(totals.igstCents, lines[1].lineTaxCents);
});

test('odd tax amounts always split into whole minor units', () => {
  const split = taxSplit(101, 'cgst_sgst');
  assert.equal(split.cgstCents + split.sgstCents, 101);
  assert.equal(split.igstCents, 0);
  assert.deepEqual(taxSplit(101, 'igst'), {
    cgstCents: 0,
    sgstCents: 0,
    igstCents: 101,
  });
  assert.deepEqual(taxSplit(101, 'none'), {
    cgstCents: 0,
    sgstCents: 0,
    igstCents: 0,
  });
});

test('stored line totals are the only source of invoice totals', () => {
  const totals = totalsFromStoredLines([
    {
      lineSubtotalCents: 100,
      lineDiscountCents: 10,
      lineTaxCents: 9,
      lineTotalCents: 99,
      taxScheme: 'cgst_sgst',
    },
    {
      lineSubtotalCents: 50,
      lineDiscountCents: 0,
      lineTaxCents: 5,
      lineTotalCents: 55,
      taxScheme: 'igst',
    },
  ]);
  assert.equal(totals.subtotalCents, 150);
  assert.equal(totals.discountCents, 10);
  assert.equal(totals.taxCents, 14);
  assert.equal(totals.totalCents, 154);
  assert.equal(totals.cgstCents, 4);
  assert.equal(totals.sgstCents, 5);
  assert.equal(totals.igstCents, 5);
});

test('payments move an invoice between partially paid and paid exactly', () => {
  const partial = paymentOutcome({
    totalCents: 100_000,
    amountPaidCents: 0,
    amountCents: 40_000,
  });
  assert.equal(partial.amountPaidCents, 40_000);
  assert.equal(partial.balanceDueCents, 60_000);
  assert.equal(partial.status, 'partially_paid');

  const full = paymentOutcome({
    totalCents: 100_000,
    amountPaidCents: partial.amountPaidCents,
    amountCents: 60_000,
  });
  assert.equal(full.amountPaidCents, 100_000);
  assert.equal(full.balanceDueCents, 0);
  assert.equal(full.status, 'paid');
});

test('invoice lifecycle transitions are one-way and cancel blocks payment', () => {
  assert.equal(canTransitionInvoice('draft', 'pending_approval'), true);
  assert.equal(canTransitionInvoice('draft', 'issued'), false);
  assert.equal(canTransitionInvoice('pending_approval', 'approved'), true);
  assert.equal(canTransitionInvoice('approved', 'issued'), true);
  assert.equal(canTransitionInvoice('issued', 'paid'), true);
  assert.equal(canTransitionInvoice('paid', 'cancelled'), false);
  assert.equal(canTransitionInvoice('cancelled', 'draft'), false);
  assert.deepEqual(invoiceActions('draft'), ['submit', 'cancel']);
  assert.deepEqual(invoiceActions('paid'), []);
  assert.equal(isInvoicePayable('issued'), true);
  assert.equal(isInvoicePayable('partially_paid'), true);
  assert.equal(isInvoicePayable('approved'), false);
});

test('overdue is derived from a past due date and unpaid balance', () => {
  const now = Date.UTC(2026, 10, 20, 10, 0, 0); // 2026-11-20
  const overdue = {
    status: 'issued',
    dueDate: new Date(Date.UTC(2026, 10, 10)),
    balanceDueCents: 500,
  };
  assert.equal(isInvoiceOverdue(overdue, now), true);
  assert.equal(invoiceDisplayStatus(overdue, now), 'overdue');

  assert.equal(
    isInvoiceOverdue({ ...overdue, balanceDueCents: 0 }, now),
    false,
    'a settled invoice is never overdue',
  );
  assert.equal(
    isInvoiceOverdue({ ...overdue, status: 'approved' }, now),
    false,
    'only issued invoices can be overdue',
  );
  assert.equal(
    isInvoiceOverdue({ ...overdue, dueDate: new Date(Date.UTC(2026, 10, 21)) }, now),
    false,
  );

  assert.equal(
    isInvoiceDueSoon(
      { status: 'issued', dueDate: new Date(Date.UTC(2026, 10, 23)), balanceDueCents: 100 },
      7,
      now,
    ),
    true,
  );
  assert.equal(
    isInvoiceDueSoon(
      { status: 'issued', dueDate: new Date(Date.UTC(2026, 10, 30)), balanceDueCents: 100 },
      7,
      now,
    ),
    false,
  );
});

function errorPaths(error) {
  const entries = error?.inner?.length ? error.inner : [error];
  return entries.map((entry) => entry.path).filter(Boolean);
}

test('invoice validation requires source inputs and rejects unsafe money', async () => {
  const proposalMissing = await invoiceCreateSchema
    .validate({ source: 'proposal', invoiceDate: '2026-11-20' }, { abortEarly: false })
    .catch((error) => error);
  assert.ok(errorPaths(proposalMissing).includes('proposalId'));

  const manualMissing = await invoiceCreateSchema
    .validate({ source: 'manual', invoiceDate: '2026-11-20' }, { abortEarly: false })
    .catch((error) => error);
  assert.ok(errorPaths(manualMissing).includes('clientId'));

  const accepted = await invoiceCreateSchema.validate({
    source: 'manual',
    clientId: '00000000-0000-4000-8000-000000000001',
    invoiceDate: '2026-11-20',
    lines: [
      {
        description: 'Consulting',
        quantity: 1,
        unitPriceCents: 1_000,
        taxScheme: 'none',
      },
    ],
  });
  assert.equal(accepted.currency, 'INR');

  await assert.rejects(() =>
    invoiceLineSchema.validate({
      description: 'Bad discount',
      discountType: 'percent',
      discountValue: 20_000,
    }),
  );
  await assert.rejects(() =>
    invoiceLineSchema.validate({
      description: 'Bad tax',
      taxScheme: 'vat',
    }),
  );
  await assert.rejects(() =>
    invoiceUpdateSchema.validate({
      invoiceDate: '2026-11-20',
      lines: [],
    }),
  );
});

test('payment and expense validation enforce safe defaults', async () => {
  await assert.rejects(() =>
    paymentCreateSchema.validate({
      invoiceId: '00000000-0000-4000-8000-000000000001',
      amountCents: 0,
      paymentDate: '2026-11-20',
    }),
  );
  await assert.rejects(() =>
    expenseDecisionSchema.validate({ status: 'rejected' }),
  );
  const rejection = await expenseDecisionSchema.validate({
    status: 'rejected',
    decisionNotes: 'Duplicate receipt.',
  });
  assert.equal(rejection.status, 'rejected');

  const expense = await expenseCreateSchema.validate({
    category: 'software',
    description: 'Annual design tool licence',
    amountCents: 12_000,
    expenseDate: '2026-11-20',
  });
  assert.equal(expense.currency, 'INR');
});
