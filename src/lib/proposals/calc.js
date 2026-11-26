// Deterministic proposal pricing. All money is integer minor units (paise for
// INR). Percentages are stored as basis points (1% = 100 bps). No floating
// point arithmetic is used for any monetary value.
//
// Rounding rule: every individually computed amount (item discount, tax and
// the proposal-level discount allocation) is rounded half-up to the nearest
// minor unit. The proposal discount is allocated across included lines by
// largest remainder so the allocation always sums exactly to the discount.

const BPS = 10_000n;

const RECURRING_TYPES = new Set(['monthly', 'quarterly', 'annual']);

// One-time billing includes milestone and custom schedules: they are consumed
// once and must never be added to a recurring period.
function bucketOf(billingType) {
  return RECURRING_TYPES.has(billingType) ? billingType : 'one_time';
}

function toInt(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.trunc(number) : fallback;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

// Half-up rounding of (value * numerator / denominator) for integers. BigInt
// avoids the precision loss that plain Number multiplication would introduce
// on large paise amounts.
export function mulRatio(value, numerator, denominator) {
  const v = BigInt(toInt(value));
  const n = BigInt(toInt(numerator));
  const d = BigInt(toInt(denominator));
  if (d === 0n) return 0;
  const negative = v < 0n || n < 0n;
  const product = (v < 0n ? -v : v) * (n < 0n ? -n : n);
  const rounded = (product + d / 2n) / d;
  return Number(negative ? -rounded : rounded);
}

export function percentOfBps(value, bps) {
  return mulRatio(value, bps, Number(BPS));
}

function itemDiscount(gross, type, value) {
  if (type === 'fixed') return clamp(toInt(value), 0, gross);
  if (type === 'percent') {
    const bps = clamp(toInt(value), 0, Number(BPS));
    return clamp(percentOfBps(gross, bps), 0, gross);
  }
  return 0;
}

function taxFor(net, scheme, rateBps) {
  if (scheme === 'none') return 0;
  const bps = clamp(toInt(rateBps), 0, Number(BPS));
  return percentOfBps(net, bps);
}

function splitTax(tax, scheme) {
  if (scheme === 'cgst_sgst') {
    const cgst = Math.floor(tax / 2);
    return { cgst, sgst: tax - cgst, igst: 0 };
  }
  if (scheme === 'igst') return { cgst: 0, sgst: 0, igst: tax };
  return { cgst: 0, sgst: 0, igst: 0 };
}

// Allocate `amount` across `weights` proportionally using the largest
// remainder method. Floors first, then hands out the leftover minor units by
// descending fractional remainder. Ties break by index, so the result is
// deterministic and always sums exactly to `amount`.
function allocate(amount, weights) {
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  if (amount <= 0 || total <= 0) return weights.map(() => 0);

  const bigTotal = BigInt(total);
  const shares = weights.map((weight) => {
    const product = BigInt(weight) * BigInt(amount);
    return { floor: Number(product / bigTotal), remainder: product % bigTotal };
  });

  let allocated = shares.reduce((sum, share) => sum + share.floor, 0);
  const order = shares
    .map((share, index) => ({ index, remainder: share.remainder }))
    .sort((a, b) => {
      if (a.remainder === b.remainder) return a.index - b.index;
      return a.remainder > b.remainder ? -1 : 1;
    });

  const result = shares.map((share) => share.floor);
  for (let i = 0; allocated < amount; i += 1, allocated += 1) {
    result[order[i % order.length].index] += 1;
  }
  return result;
}

export function proposalDiscountAmount(base, type, value) {
  if (type === 'fixed') return clamp(toInt(value), 0, Math.max(base, 0));
  if (type === 'percent') {
    const bps = clamp(toInt(value), 0, Number(BPS));
    return clamp(percentOfBps(base, bps), 0, Math.max(base, 0));
  }
  return 0;
}

export function proposeDiscount(base, type, value) {
  return proposalDiscountAmount(base, type, value);
}

function aggregate(lines) {
  const sum = (key) => lines.reduce((total, line) => total + line[key], 0);
  const subtotal = sum('lineSubtotalCents');
  const net = sum('lineNetCents');
  return {
    subtotalCents: subtotal,
    itemDiscountCents: sum('itemDiscountCents'),
    proposalDiscountCents: sum('proposalShareCents'),
    discountTotalCents: subtotal - net,
    taxableCents: lines
      .filter((line) => line.taxScheme !== 'none')
      .reduce((total, line) => total + line.lineNetCents, 0),
    taxCents: sum('lineTaxCents'),
    totalCents: sum('lineTotalCents'),
    cgstCents: lines.reduce((total, line) => total + line.taxSplit.cgst, 0),
    sgstCents: lines.reduce((total, line) => total + line.taxSplit.sgst, 0),
    igstCents: lines.reduce((total, line) => total + line.taxSplit.igst, 0),
  };
}

export function computeProposal({
  items = [],
  proposalDiscountType = 'none',
  proposalDiscountValue = 0,
} = {}) {
  const prepared = items.map((item, index) => {
    const quantity = Math.max(1, toInt(item.quantity, 1));
    const unitPriceCents = Math.max(0, toInt(item.unitPriceCents, 0));
    const gross = quantity * unitPriceCents;
    const discount = itemDiscount(gross, item.discountType, item.discountValue);
    return {
      ...item,
      index,
      quantity,
      unitPriceCents,
      lineSubtotalCents: gross,
      itemDiscountCents: discount,
      netCents: gross - discount,
      kind: item.kind || 'included',
      billingType: item.billingType || 'one_time',
    };
  });

  const included = prepared.filter((item) => item.kind === 'included');
  const optional = prepared.filter((item) => item.kind === 'optional');

  // A proposal-level discount is spread across every included line so the
  // percentage a client sees is applied consistently. The shares always sum
  // to the discount amount because the allocation is exact.
  const discountBase = included.reduce((sum, item) => sum + item.netCents, 0);
  const proposalDiscount = proposalDiscountAmount(
    discountBase,
    proposalDiscountType,
    proposalDiscountValue,
  );
  const shares = allocate(
    proposalDiscount,
    included.map((item) => item.netCents),
  );

  let shareIndex = 0;
  const computed = prepared.map((item) => {
    const share = item.kind === 'included' ? shares[shareIndex++] || 0 : 0;
    const netAfter = item.netCents - share;
    const tax = taxFor(netAfter, item.taxScheme, item.taxRateBps);
    return {
      ...item,
      proposalShareCents: share,
      lineDiscountCents: item.itemDiscountCents + share,
      lineNetCents: netAfter,
      lineTaxCents: tax,
      lineTotalCents: netAfter + tax,
      taxSplit: splitTax(tax, item.taxScheme),
    };
  });

  const includedLines = computed.filter((item) => item.kind === 'included');
  const optionalLines = computed.filter((item) => item.kind === 'optional');
  const buckets = {
    one_time: includedLines.filter((item) => bucketOf(item.billingType) === 'one_time'),
    monthly: includedLines.filter((item) => bucketOf(item.billingType) === 'monthly'),
    quarterly: includedLines.filter((item) => bucketOf(item.billingType) === 'quarterly'),
    annual: includedLines.filter((item) => bucketOf(item.billingType) === 'annual'),
  };

  const periods = {
    one_time: aggregate(buckets.one_time),
    monthly: aggregate(buckets.monthly),
    quarterly: aggregate(buckets.quarterly),
    annual: aggregate(buckets.annual),
    optional: aggregate(optionalLines),
  };

  // Top-level totals describe the one-time contract value only. Recurring
  // periods are reported separately so no screen presents a combined amount.
  const totals = {
    subtotalCents: periods.one_time.subtotalCents,
    itemDiscountCents: periods.one_time.itemDiscountCents,
    proposalDiscountCents: periods.one_time.proposalDiscountCents,
    discountTotalCents: periods.one_time.discountTotalCents,
    taxableCents: periods.one_time.taxableCents,
    taxCents: periods.one_time.taxCents,
    grandTotalCents: periods.one_time.totalCents,
    oneTimeTotalCents: periods.one_time.totalCents,
    recurringMonthlyCents: periods.monthly.totalCents,
    recurringQuarterlyCents: periods.quarterly.totalCents,
    recurringAnnualCents: periods.annual.totalCents,
    optionalTotalCents: periods.optional.totalCents,
    cgstCents: periods.one_time.cgstCents,
    sgstCents: periods.one_time.sgstCents,
    igstCents: periods.one_time.igstCents,
  };

  return {
    lines: computed,
    totals,
    periods,
    proposalDiscountCents: proposalDiscount,
    recurringTotalCents:
      totals.recurringMonthlyCents +
      totals.recurringQuarterlyCents +
      totals.recurringAnnualCents,
  };
}

