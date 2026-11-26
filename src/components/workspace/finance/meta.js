// Presentation-only labels for invoices, payments and expenses. No database
// imports, so client components can use this safely.

export const INVOICE_STATUS_META = {
  draft: { label: 'Draft', tone: 'muted' },
  pending_approval: { label: 'Pending approval', tone: 'warning' },
  approved: { label: 'Approved', tone: 'info' },
  issued: { label: 'Issued', tone: 'info' },
  partially_paid: { label: 'Partially paid', tone: 'warning' },
  paid: { label: 'Paid', tone: 'success' },
  overdue: { label: 'Overdue', tone: 'danger' },
  cancelled: { label: 'Cancelled', tone: 'muted' },
};

export const INVOICE_SOURCE_LABELS = {
  proposal: 'Accepted proposal',
  engagement: 'Service engagement',
  manual: 'Manual entry',
};

export const PAYMENT_METHOD_LABELS = {
  bank_transfer: 'Bank transfer',
  upi: 'UPI',
  card: 'Card',
  cash: 'Cash',
  cheque: 'Cheque',
  other: 'Other',
};

export const EXPENSE_STATUS_META = {
  pending_approval: { label: 'Pending approval', tone: 'warning' },
  approved: { label: 'Approved', tone: 'success' },
  rejected: { label: 'Rejected', tone: 'danger' },
};

export const EXPENSE_CATEGORY_LABELS = {
  software: 'Software',
  hardware: 'Hardware',
  contractor: 'Contractor',
  travel: 'Travel',
  marketing: 'Marketing',
  office: 'Office',
  utilities: 'Utilities',
  professional_fees: 'Professional fees',
  other: 'Other',
};

export const INVOICE_ACTION_LABELS = {
  submit: 'Submit for approval',
  approve: 'Approve',
  issue: 'Issue invoice',
  cancel: 'Cancel invoice',
};

export function metaFor(map, value) {
  return map[value] || { label: value || 'Unknown', tone: 'muted' };
}

export function dateInputValue(value) {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}
