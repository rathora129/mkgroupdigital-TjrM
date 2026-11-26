export const CAMPAIGN_STATUS_META = {
  draft: { label: 'Draft', tone: 'muted' },
  active: { label: 'Active', tone: 'success' },
  paused: { label: 'Paused', tone: 'warning' },
  completed: { label: 'Completed', tone: 'info' },
  cancelled: { label: 'Cancelled', tone: 'muted' },
};

export const PROSPECT_STATUS_META = {
  pending_review: { label: 'Pending review', tone: 'warning' },
  approved: { label: 'Approved', tone: 'success' },
  rejected: { label: 'Rejected', tone: 'danger' },
  duplicate: { label: 'Duplicate', tone: 'muted' },
};

export const RUN_STATUS_META = {
  queued: { label: 'Queued', tone: 'info' },
  running: { label: 'Running', tone: 'info' },
  completed: { label: 'Completed', tone: 'success' },
  failed: { label: 'Failed', tone: 'danger' },
  cancelled: { label: 'Cancelled', tone: 'muted' },
};

export const TEMPERATURE_META = {
  hot: { label: 'Hot', tone: 'danger' },
  warm: { label: 'Warm', tone: 'warning' },
  cold: { label: 'Cold', tone: 'info' },
  unknown: { label: 'Unscored', tone: 'muted' },
};

export const VERIFICATION_META = {
  verified: { label: 'Verified in source', tone: 'success' },
  source_derived: { label: 'Source-derived', tone: 'info' },
  ai_analysis: { label: 'AI analysis', tone: 'warning' },
  unverified: { label: 'Unverified', tone: 'muted' },
};

export const PROVIDER_LABELS = {
  google_places: 'Google Places',
  public_web_search: 'Public web search',
};

export const FREQUENCY_LABELS = {
  manual: 'Manual only',
  daily: 'Daily',
  weekly: 'Weekly',
};

export const WEBSITE_PRESENCE_LABELS = {
  any: 'Any',
  with_website: 'Has a website',
  without_website: 'No website found',
};

export function metaFor(map, key) {
  return map[key] || { label: key || 'Unknown', tone: 'muted' };
}

export function formatCount(value) {
  return Number(value || 0).toLocaleString('en-IN');
}

export function formatBudgetCents(cents) {
  const value = Number(cents || 0);
  if (!Number.isFinite(value) || value <= 0) return 'No AI budget';
  return `$${(value / 100).toFixed(2)} AI budget`;
}

export function truncate(value, length = 140) {
  if (!value) return '';
  const text = String(value);
  return text.length > length ? `${text.slice(0, length - 1)}…` : text;
}
