import {
  CAMPAIGN_STATUS_LABELS,
  CONTENT_STATUS_LABELS,
  FINDING_SOURCE_LABELS,
  FINDING_STATUS_LABELS,
  PROPOSAL_STATUS_LABELS,
} from '@/lib/marketing/constants';

export const CAMPAIGN_STATUS_META = {
  planned: { label: CAMPAIGN_STATUS_LABELS.planned, tone: 'muted' },
  draft: { label: CAMPAIGN_STATUS_LABELS.draft, tone: 'muted' },
  awaiting_review: { label: CAMPAIGN_STATUS_LABELS.awaiting_review, tone: 'warning' },
  approved: { label: CAMPAIGN_STATUS_LABELS.approved, tone: 'success' },
  scheduled: { label: CAMPAIGN_STATUS_LABELS.scheduled, tone: 'warning' },
  executed: { label: CAMPAIGN_STATUS_LABELS.executed, tone: 'success' },
  failed: { label: CAMPAIGN_STATUS_LABELS.failed, tone: 'danger' },
  cancelled: { label: CAMPAIGN_STATUS_LABELS.cancelled, tone: 'muted' },
};

export const CONTENT_STATUS_META = {
  idea: { label: CONTENT_STATUS_LABELS.idea, tone: 'muted' },
  draft: { label: CONTENT_STATUS_LABELS.draft, tone: 'muted' },
  in_review: { label: CONTENT_STATUS_LABELS.in_review, tone: 'warning' },
  changes_requested: {
    label: CONTENT_STATUS_LABELS.changes_requested,
    tone: 'danger',
  },
  approved: { label: CONTENT_STATUS_LABELS.approved, tone: 'success' },
  scheduled: { label: CONTENT_STATUS_LABELS.scheduled, tone: 'warning' },
  published: { label: CONTENT_STATUS_LABELS.published, tone: 'success' },
  failed: { label: CONTENT_STATUS_LABELS.failed, tone: 'danger' },
  cancelled: { label: CONTENT_STATUS_LABELS.cancelled, tone: 'muted' },
};

export const PROPOSAL_STATUS_META = {
  draft: { label: PROPOSAL_STATUS_LABELS.draft, tone: 'muted' },
  awaiting_review: {
    label: PROPOSAL_STATUS_LABELS.awaiting_review,
    tone: 'warning',
  },
  approved: { label: PROPOSAL_STATUS_LABELS.approved, tone: 'success' },
  rejected: { label: PROPOSAL_STATUS_LABELS.rejected, tone: 'danger' },
  executing: { label: PROPOSAL_STATUS_LABELS.executing, tone: 'warning' },
  executed: { label: PROPOSAL_STATUS_LABELS.executed, tone: 'success' },
  cancelled: { label: PROPOSAL_STATUS_LABELS.cancelled, tone: 'muted' },
};

export const FINDING_STATUS_META = {
  open: { label: FINDING_STATUS_LABELS.open, tone: 'warning' },
  in_progress: { label: FINDING_STATUS_LABELS.in_progress, tone: 'default' },
  resolved: { label: FINDING_STATUS_LABELS.resolved, tone: 'success' },
  wont_fix: { label: FINDING_STATUS_LABELS.wont_fix, tone: 'muted' },
};

export const FINDING_SOURCE_META = {
  verified: { label: FINDING_SOURCE_LABELS.verified, tone: 'success' },
  manual: { label: FINDING_SOURCE_LABELS.manual, tone: 'default' },
  ai_suggestion: { label: FINDING_SOURCE_LABELS.ai_suggestion, tone: 'warning' },
  unverified: { label: FINDING_SOURCE_LABELS.unverified, tone: 'danger' },
};

export const SEVERITY_META = {
  critical: { label: 'Critical', tone: 'danger' },
  high: { label: 'High', tone: 'danger' },
  medium: { label: 'Medium', tone: 'warning' },
  low: { label: 'Low', tone: 'muted' },
  info: { label: 'Info', tone: 'muted' },
};

export const SEVERITY_ORDER = ['critical', 'high', 'medium', 'low', 'info'];

export const METRIC_SOURCE_TONES = {
  manual: 'muted',
  imported: 'default',
  calculated: 'warning',
  ai_estimate: 'danger',
};

export function metaFor(map, key) {
  return map[key] || { label: key || 'Unknown', tone: 'muted' };
}

export function dateInputValue(value) {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

export function toIsoDate(value) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function formatMoney(amountMinor, currency = 'INR') {
  const amount = Number(amountMinor || 0) / 100;
  try {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: currency || 'INR',
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

export const CAMPAIGN_STATUS_ORDER = [
  'planned',
  'draft',
  'awaiting_review',
  'approved',
  'scheduled',
  'executed',
  'failed',
  'cancelled',
];

export const CONTENT_STATUS_ORDER = [
  'idea',
  'draft',
  'in_review',
  'changes_requested',
  'approved',
  'scheduled',
  'published',
  'failed',
  'cancelled',
];

export const PROPOSAL_STATUS_ORDER = [
  'draft',
  'awaiting_review',
  'approved',
  'rejected',
  'executing',
  'executed',
  'cancelled',
];
