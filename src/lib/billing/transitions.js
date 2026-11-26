// Controlled lifecycles for internal billing records. "Overdue" is never
// stored: it is derived at read time from an unpaid, past-due invoice so a
// stale row can never claim a payment state that did not happen.

export const INVOICE_STATUSES = [
  'draft',
  'pending_approval',
  'approved',
  'issued',
  'partially_paid',
  'paid',
  'cancelled',
];

// paid and partially_paid are reached only by recording a payment; cancel is
// blocked once money has been recorded.
export const INVOICE_STATUS_TRANSITIONS = {
  draft: ['pending_approval', 'cancelled'],
  pending_approval: ['approved', 'cancelled'],
  approved: ['issued', 'cancelled'],
  issued: ['partially_paid', 'paid', 'cancelled'],
  partially_paid: ['paid'],
  paid: [],
  cancelled: [],
};

export const INVOICE_SOURCES = ['proposal', 'engagement', 'manual'];

export const PAYMENT_METHODS = [
  'bank_transfer',
  'upi',
  'card',
  'cash',
  'cheque',
  'other',
];

export const EXPENSE_STATUSES = ['pending_approval', 'approved', 'rejected'];

export const EXPENSE_CATEGORIES = [
  'software',
  'hardware',
  'contractor',
  'travel',
  'marketing',
  'office',
  'utilities',
  'professional_fees',
  'other',
];

// Statuses that represent money the client has actually been invoiced for.
// Pipeline proposals and approved-but-unissued invoices are deliberately not
// included: they are not receivables.
export const BILLED_INVOICE_STATUSES = ['issued', 'partially_paid', 'paid'];

// Only an issued invoice can receive a payment.
export const PAYABLE_INVOICE_STATUSES = ['issued', 'partially_paid'];

const DAY_MS = 24 * 60 * 60 * 1000;

export function startOfUtcDay(nowMs = Date.now()) {
  return nowMs - (nowMs % DAY_MS);
}

export function canTransitionInvoice(from, to) {
  return (INVOICE_STATUS_TRANSITIONS[from] || []).includes(to);
}

export function isInvoiceBilled(status) {
  return BILLED_INVOICE_STATUSES.includes(status);
}

export function isInvoicePayable(status) {
  return PAYABLE_INVOICE_STATUSES.includes(status);
}

export function isInvoiceDraft(status) {
  return status === 'draft';
}

// An invoice is overdue only while it is payable, carries a balance and its due
// date has fully elapsed in UTC.
export function isInvoiceOverdue(row, nowMs = Date.now()) {
  if (!row || !PAYABLE_INVOICE_STATUSES.includes(row.status)) return false;
  if (!row.dueDate) return false;
  if (Number(row.balanceDueCents || 0) <= 0) return false;
  const due = new Date(row.dueDate).getTime();
  if (Number.isNaN(due)) return false;
  return due < startOfUtcDay(nowMs);
}

export function isInvoiceDueSoon(row, days = 7, nowMs = Date.now()) {
  if (!row || !PAYABLE_INVOICE_STATUSES.includes(row.status)) return false;
  if (!row.dueDate) return false;
  if (Number(row.balanceDueCents || 0) <= 0) return false;
  const due = new Date(row.dueDate).getTime();
  if (Number.isNaN(due)) return false;
  const today = startOfUtcDay(nowMs);
  return due >= today && due < today + days * DAY_MS;
}

export function invoiceDisplayStatus(row, nowMs = Date.now()) {
  if (!row) return null;
  return isInvoiceOverdue(row, nowMs) ? 'overdue' : row.status;
}

export const INVOICE_ACTIONS = {
  draft: ['submit', 'cancel'],
  pending_approval: ['approve', 'cancel'],
  approved: ['issue', 'cancel'],
  issued: ['cancel'],
  partially_paid: [],
  paid: [],
  cancelled: [],
};

export function invoiceActions(status) {
  return [...(INVOICE_ACTIONS[status] || [])];
}
