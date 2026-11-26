// Presentation-only labels and money helpers for proposals. No database or
// validation imports, so client components can use this safely.

export const PROPOSAL_STATUS_META = {
  draft: { label: 'Draft', tone: 'muted' },
  internal_review: { label: 'In review', tone: 'warning' },
  approved: { label: 'Approved', tone: 'success' },
  sent: { label: 'Sent', tone: 'info' },
  accepted: { label: 'Accepted', tone: 'success' },
  rejected: { label: 'Rejected', tone: 'danger' },
  expired: { label: 'Expired', tone: 'warning' },
};

export const PROPOSAL_ACTIVITY_LABELS = {
  created: 'Proposal created',
  updated: 'Details updated',
  draft_saved: 'Draft saved',
  submitted: 'Submitted for review',
  approved: 'Approved',
  changes_requested: 'Changes requested',
  sent: 'Marked as sent',
  accepted: 'Client accepted',
  rejected: 'Client rejected',
  version_created: 'Revision created',
};

export const ITEM_KIND_LABELS = {
  included: 'Included',
  optional: 'Optional',
  excluded: 'Excluded',
};

export const BILLING_TYPE_LABELS = {
  one_time: 'One-time',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  annual: 'Annual',
  milestone: 'Milestone',
  custom: 'Custom schedule',
};

export const DISCOUNT_TYPE_LABELS = {
  none: 'No discount',
  fixed: 'Fixed amount',
  percent: 'Percentage',
};

export const TAX_SCHEME_LABELS = {
  none: 'No tax',
  cgst_sgst: 'CGST + SGST',
  igst: 'IGST',
};

export const SECTION_GROUP_LABELS = {
  narrative: 'Narrative',
  scope: 'Scope and delivery',
  terms: 'Terms and conditions',
};

export const SECTION_LABELS = {
  executiveSummary: 'Executive summary',
  businessUnderstanding: 'Client business understanding',
  objectives: 'Objectives',
  scopeOfWork: 'Scope of work',
  servicesIncluded: 'Services included',
  estimatedTimeline: 'Estimated timeline',
  clientResponsibilities: 'Client responsibilities',
  assumptions: 'Assumptions',
  exclusions: 'Exclusions',
  dependencies: 'Dependencies',
  supportMaintenanceTerms: 'Support and maintenance terms',
  paymentTerms: 'Payment terms',
  validityTerms: 'Validity and expiry',
  additionalNotes: 'Additional notes',
};

export const SECTION_GROUPS = [
  {
    key: 'narrative',
    label: SECTION_GROUP_LABELS.narrative,
    keys: ['executiveSummary', 'businessUnderstanding', 'objectives'],
  },
  {
    key: 'scope',
    label: SECTION_GROUP_LABELS.scope,
    keys: ['scopeOfWork', 'servicesIncluded', 'estimatedTimeline'],
  },
  {
    key: 'terms',
    label: SECTION_GROUP_LABELS.terms,
    keys: [
      'clientResponsibilities',
      'assumptions',
      'exclusions',
      'dependencies',
      'supportMaintenanceTerms',
      'paymentTerms',
      'validityTerms',
      'additionalNotes',
    ],
  },
];

export function statusMeta(status) {
  return PROPOSAL_STATUS_META[status] || { label: status || 'Unknown', tone: 'muted' };
}

export function formatMoney(cents, currency = 'INR') {
  const amount = Number(cents || 0) / 100;
  try {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: currency || 'INR',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(Number.isFinite(amount) ? amount : 0);
  } catch {
    return `${currency || ''} ${(Number.isFinite(amount) ? amount : 0).toFixed(2)}`.trim();
  }
}

export function toMajorInput(cents) {
  if (cents === null || cents === undefined) return '';
  return (Number(cents) / 100).toFixed(2);
}

export function toMinorInput(value) {
  const amount = Number(String(value).replace(/,/g, ''));
  return Number.isFinite(amount) ? Math.round(amount * 100) : 0;
}

export function percentInput(bps) {
  if (bps === null || bps === undefined) return '';
  return String(Number(bps) / 100);
}

export function bpsFromPercent(value) {
  const amount = Number(value);
  return Number.isFinite(amount) ? Math.round(amount * 100) : 0;
}
