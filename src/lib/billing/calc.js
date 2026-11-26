// Deterministic invoice arithmetic. Every amount is an integer count of minor
// units (paise for INR) and every rate is basis points. Invoice lines are
// calculated with the same engine used for proposals so a client sees the same
// discount and tax ordering on both documents.

import { computeProposal, percentOfBps } from '@/lib/proposals/calc';

export { percentOfBps };

function toInt(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.trunc(number) : fallback;
}

export function taxSplit(taxCents, scheme) {
  const tax = Math.max(0, toInt(taxCents));
  if (scheme === 'cgst_sgst') {
    const cgst = Math.floor(tax / 2);
    return { cgstCents: cgst, sgstCents: tax - cgst, igstCents: 0 };
  }
  if (scheme === 'igst') return { cgstCents: 0, sgstCents: 0, igstCents: tax };
  return { cgstCents: 0, sgstCents: 0, igstCents: 0 };
}

// Totals are always rebuilt from the stored per-line values. No screen or
// service ever recomputes an invoice total from a separate subtotal field.
export function totalsFromStoredLines(lines = []) {
  const totals = {
    subtotalCents: 0,
    discountCents: 0,
    taxCents: 0,
    totalCents: 0,
    cgstCents: 0,
    sgstCents: 0,
    igstCents: 0,
  };

  for (const line of lines) {
    totals.subtotalCents += toInt(line.lineSubtotalCents);
    totals.discountCents += toInt(line.lineDiscountCents);
    totals.taxCents += toInt(line.lineTaxCents);
    totals.totalCents += toInt(line.lineTotalCents);
    const split = taxSplit(line.lineTaxCents, line.taxScheme);
    totals.cgstCents += split.cgstCents;
    totals.sgstCents += split.sgstCents;
    totals.igstCents += split.igstCents;
  }

  return totals;
}

// Computes stored line values from editable invoice lines. Proposal-level
// discounts are not offered on invoices; a manual invoice states its discount
// per line instead.
export function computeInvoiceLines(items = []) {
  if (!Array.isArray(items) || items.length === 0) {
    return { lines: [], totals: totalsFromStoredLines([]) };
  }

  const computed = computeProposal({
    items: items.map((item) => ({
      ...item,
      kind: 'included',
      billingType: 'one_time',
    })),
    proposalDiscountType: 'none',
    proposalDiscountValue: 0,
  });

  const lines = computed.lines.map((line) => ({
    description: line.description || line.name,
    quantity: line.quantity,
    unitPriceCents: line.unitPriceCents,
    discountType: line.discountType || 'none',
    discountValue: toInt(line.discountValue),
    taxScheme: line.taxScheme || 'none',
    taxRateBps: toInt(line.taxRateBps),
    lineSubtotalCents: line.lineSubtotalCents,
    lineDiscountCents: line.lineDiscountCents,
    lineNetCents: line.lineNetCents,
    lineTaxCents: line.lineTaxCents,
    lineTotalCents: line.lineTotalCents,
  }));

  return { lines, totals: totalsFromStoredLines(lines) };
}

// Returns the invoice state after a payment. The caller has already rejected
// overpayments, so this is a pure, deterministic projection.
export function paymentOutcome({
  totalCents,
  amountPaidCents,
  amountCents,
}) {
  const total = Math.max(0, toInt(totalCents));
  const paid = Math.max(0, toInt(amountPaidCents)) + Math.max(0, toInt(amountCents));
  const balance = total - paid;
  return {
    amountPaidCents: paid,
    balanceDueCents: balance,
    status: balance <= 0 ? 'paid' : 'partially_paid',
  };
}
