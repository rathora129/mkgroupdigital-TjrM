import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeProposal,
  mulRatio,
  percentOfBps,
  proposalDiscountAmount,
} from '@/lib/proposals/calc';
import {
  approvalDecisionSchema,
  proposalCreateSchema,
  proposalResponseSchema,
  versionContentSchema,
} from '@/lib/proposals/validation';

// Pure pricing checks for Phase 2D-B. No database is touched.

function item(overrides = {}) {
  return {
    name: 'Service',
    quantity: 1,
    unitPriceCents: 0,
    discountType: 'none',
    discountValue: 0,
    taxScheme: 'none',
    taxRateBps: 0,
    billingType: 'one_time',
    kind: 'included',
    ...overrides,
  };
}

test('money helpers round half-up on integer minor units without float drift', () => {
  assert.equal(mulRatio(5, 1, 2), 3, '2.5 rounds half-up');
  assert.equal(mulRatio(4, 1, 2), 2);
  assert.equal(mulRatio(0, 1234, 10_000), 0);
  assert.equal(mulRatio(100, 0, 10_000), 0);
  assert.equal(mulRatio(199_999, 250, 10_000), 5000, '2.5% of 199999 paise');
  assert.equal(
    mulRatio(1_234_567_890_123, 10_000, 10_000),
    1_234_567_890_123,
    'large values stay exact',
  );
  assert.equal(percentOfBps(100_000, 1800), 18_000, '18% GST');
});

test('percentage item discount, tax and CGST/SGST split', () => {
  const result = computeProposal({
    items: [
      item({
        quantity: 2,
        unitPriceCents: 100_000,
        discountType: 'percent',
        discountValue: 1000,
        taxScheme: 'cgst_sgst',
        taxRateBps: 1800,
      }),
    ],
  });

  const line = result.lines[0];
  assert.equal(line.lineSubtotalCents, 200_000);
  assert.equal(line.itemDiscountCents, 20_000);
  assert.equal(line.lineNetCents, 180_000);
  assert.equal(line.lineTaxCents, 32_400);
  assert.equal(line.lineTotalCents, 212_400);

  const period = result.periods.one_time;
  assert.equal(period.cgstCents, 16_200);
  assert.equal(period.sgstCents, 16_200);
  assert.equal(period.igstCents, 0);
  assert.equal(period.totalCents, 212_400);
  assert.equal(result.totals.oneTimeTotalCents, 212_400);
});

test('odd tax amounts split deterministically between CGST and SGST', () => {
  const result = computeProposal({
    items: [
      item({
        unitPriceCents: 55_561,
        taxScheme: 'cgst_sgst',
        taxRateBps: 1800,
      }),
    ],
  });
  const period = result.periods.one_time;
  assert.equal(period.taxCents, 10_001);
  assert.equal(period.cgstCents, 5000);
  assert.equal(period.sgstCents, 5001);
  assert.equal(period.cgstCents + period.sgstCents, period.taxCents);
});

test('discounts and invalid values never produce negative totals', () => {
  const fixed = computeProposal({
    items: [
      item({
        unitPriceCents: 100_000,
        discountType: 'fixed',
        discountValue: 500_000,
        taxScheme: 'cgst_sgst',
        taxRateBps: 1800,
      }),
    ],
  });
  assert.equal(fixed.lines[0].itemDiscountCents, 100_000);
  assert.equal(fixed.lines[0].lineNetCents, 0);
  assert.equal(fixed.lines[0].lineTaxCents, 0);
  assert.equal(fixed.lines[0].lineTotalCents, 0);

  const overHundred = proposalDiscountAmount(100_000, 'percent', 55_000);
  assert.equal(overHundred, 100_000, 'over-100% discounts clamp to the base');

  const clamps = computeProposal({
    items: [
      item({
        quantity: 0,
        unitPriceCents: -500,
        discountType: 'fixed',
        discountValue: -100,
        taxScheme: 'none',
        taxRateBps: 1800,
      }),
    ],
  });
  assert.equal(clamps.lines[0].quantity, 1);
  assert.equal(clamps.lines[0].unitPriceCents, 0);
  assert.equal(clamps.lines[0].lineDiscountCents, 0);
  assert.equal(clamps.lines[0].lineTaxCents, 0);
  assert.equal(clamps.totals.oneTimeTotalCents, 0);
});

test('proposal-level fixed discount allocates exactly across included lines', () => {
  const result = computeProposal({
    items: [
      item({ name: 'A', unitPriceCents: 333_333 }),
      item({ name: 'B', unitPriceCents: 666_667 }),
    ],
    proposalDiscountType: 'fixed',
    proposalDiscountValue: 100_000,
  });

  assert.equal(result.proposalDiscountCents, 100_000);
  const shares = result.lines.map((line) => line.proposalShareCents);
  assert.equal(shares[0] + shares[1], 100_000, 'allocation sums exactly');
  assert.deepEqual(shares, [33_333, 66_667], 'largest remainder is deterministic');
  assert.equal(result.periods.one_time.discountTotalCents, 100_000);
  assert.equal(result.periods.one_time.totalCents, 900_000);

  const clamped = computeProposal({
    items: [
      item({ name: 'A', unitPriceCents: 1 }),
      item({ name: 'B', unitPriceCents: 2 }),
    ],
    proposalDiscountType: 'fixed',
    proposalDiscountValue: 100,
  });
  assert.equal(clamped.proposalDiscountCents, 3, 'a discount never exceeds the included base');
  assert.deepEqual(
    clamped.lines.map((line) => line.proposalShareCents),
    [1, 2],
  );
  assert.equal(clamped.periods.one_time.totalCents, 0);
});

test('proposal-level percent discount is exact on awkward amounts', () => {
  const result = computeProposal({
    items: [
      item({ name: 'A', unitPriceCents: 78_126 }),
      item({ name: 'B', unitPriceCents: 21_743 }),
    ],
    proposalDiscountType: 'percent',
    proposalDiscountValue: 750,
  });

  const base = 78_126 + 21_743;
  assert.equal(result.proposalDiscountCents, mulRatio(base, 750, 10_000));
  const shares = result.lines.reduce((sum, line) => sum + line.proposalShareCents, 0);
  assert.equal(shares, result.proposalDiscountCents);
  assert.equal(result.periods.one_time.discountTotalCents, result.proposalDiscountCents);
});

test('one-time and recurring periods are never combined', () => {
  const result = computeProposal({
    items: [
      item({ name: 'Setup', unitPriceCents: 100_000 }),
      item({ name: 'Retainer', unitPriceCents: 50_000, billingType: 'monthly' }),
      item({ name: 'Quarterly', unitPriceCents: 150_000, billingType: 'quarterly' }),
      item({ name: 'Annual', unitPriceCents: 600_000, billingType: 'annual' }),
      item({ name: 'Milestone', unitPriceCents: 20_000, billingType: 'milestone' }),
      item({ name: 'Custom', unitPriceCents: 30_000, billingType: 'custom' }),
    ],
  });

  assert.equal(result.periods.one_time.totalCents, 150_000, 'milestone and custom stay one-time');
  assert.equal(result.periods.monthly.totalCents, 50_000);
  assert.equal(result.periods.quarterly.totalCents, 150_000);
  assert.equal(result.periods.annual.totalCents, 600_000);

  assert.equal(result.totals.oneTimeTotalCents, 150_000);
  assert.equal(result.totals.grandTotalCents, result.totals.oneTimeTotalCents);
  assert.equal(result.totals.recurringMonthlyCents, 50_000);
  assert.equal(result.totals.recurringQuarterlyCents, 150_000);
  assert.equal(result.totals.recurringAnnualCents, 600_000);
  assert.equal(
    result.totals.grandTotalCents,
    result.totals.oneTimeTotalCents,
    'no grand total adds recurring periods to the one-time total',
  );
});

test('optional and excluded lines never enter contract totals', () => {
  const result = computeProposal({
    items: [
      item({ name: 'Included', unitPriceCents: 100_000 }),
      item({ name: 'Optional', unitPriceCents: 250_000, kind: 'optional' }),
      item({ name: 'Excluded', unitPriceCents: 900_000, kind: 'excluded' }),
    ],
  });

  assert.equal(result.totals.oneTimeTotalCents, 100_000);
  assert.equal(result.totals.optionalTotalCents, 250_000);
  assert.equal(result.periods.one_time.subtotalCents, 100_000);
  assert.equal(result.lines.length, 3, 'excluded lines are still returned for display');
  const excludedTotal = result.lines
    .filter((line) => line.kind === 'excluded')
    .reduce((sum, line) => sum + line.lineTotalCents, 0);
  assert.equal(excludedTotal, 900_000, 'excluded lines are computed but unaggregated');
});

test('proposal-level discount ignores optional and excluded lines', () => {
  const result = computeProposal({
    items: [
      item({ name: 'Included', unitPriceCents: 10_000 }),
      item({ name: 'Optional', unitPriceCents: 50_000, kind: 'optional' }),
    ],
    proposalDiscountType: 'percent',
    proposalDiscountValue: 1000,
  });

  assert.equal(result.proposalDiscountCents, 1000);
  assert.equal(result.lines[1].proposalShareCents, 0);
  assert.equal(result.periods.optional.totalCents, 50_000);
});

test('validation schemas reject invalid money and workflow input', async () => {
  await assert.rejects(
    versionContentSchema.validate(
      {
        expectedUpdatedAt: new Date().toISOString(),
        items: [{ name: 'Line', unitPriceCents: -1 }],
      },
      { abortEarly: false },
    ),
  );
  await assert.rejects(
    versionContentSchema.validate(
      {
        expectedUpdatedAt: new Date().toISOString(),
        items: [{ name: 'Line', discountType: 'percent', discountValue: 10_001 }],
      },
      { abortEarly: false },
    ),
    'percentage discounts above 100% must be rejected',
  );
  await assert.rejects(
    proposalResponseSchema.validate({ response: 'maybe' }, { abortEarly: false }),
  );
  await assert.rejects(
    approvalDecisionSchema.validate(
      { decision: 'approved', notes: 'x'.repeat(2_001) },
      { abortEarly: false },
    ),
    'approval notes must respect the stored length limit',
  );
  await assert.rejects(
    proposalCreateSchema.validate({ opportunityId: 'not-a-uuid' }, { abortEarly: false }),
  );
});
