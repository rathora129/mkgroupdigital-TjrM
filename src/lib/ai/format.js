export function formatTokens(value) {
  const tokens = Number(value || 0);
  if (!Number.isFinite(tokens)) return '0';
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
  if (tokens >= 10_000) return `${(tokens / 1_000).toFixed(1)}k`;
  return new Intl.NumberFormat('en-US').format(Math.round(tokens));
}

export function formatCents(value) {
  const cents = Number(value || 0);
  const amount = Number.isFinite(cents) ? cents / 100 : 0;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: amount < 1 ? 4 : 2,
    maximumFractionDigits: amount < 1 ? 4 : 2,
  }).format(amount);
}

export function formatDuration(ms) {
  const value = Number(ms);
  if (!Number.isFinite(value) || value <= 0) return '—';
  if (value < 1000) return `${Math.round(value)} ms`;
  if (value < 60_000) return `${(value / 1000).toFixed(1)} s`;
  const minutes = Math.floor(value / 60_000);
  const seconds = Math.round((value % 60_000) / 1000);
  return `${minutes}m ${seconds}s`;
}

export function formatDate(value, timezone = 'UTC') {
  if (!value) return '—';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  try {
    return new Intl.DateTimeFormat('en-IN', {
      dateStyle: 'medium',
      timeZone: timezone || 'UTC',
    }).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

export function formatDateTime(value, timezone = 'UTC') {
  if (!value) return '—';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  try {
    return new Intl.DateTimeFormat('en-IN', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: timezone || 'UTC',
    }).format(date);
  } catch {
    return date.toISOString();
  }
}

export const RUN_STATUS_META = {
  queued: { label: 'Queued', tone: 'info' },
  running: { label: 'Running', tone: 'info' },
  completed: { label: 'Completed', tone: 'success' },
  failed: { label: 'Failed', tone: 'danger' },
  cancelled: { label: 'Cancelled', tone: 'muted' },
  awaiting_approval: { label: 'Awaiting approval', tone: 'warning' },
};

export const APPROVAL_STATUS_META = {
  pending: { label: 'Pending', tone: 'warning' },
  approved: { label: 'Approved', tone: 'success' },
  rejected: { label: 'Rejected', tone: 'danger' },
  cancelled: { label: 'Cancelled', tone: 'muted' },
};

export function statusMeta(status, map = RUN_STATUS_META) {
  return map[status] || { label: status || 'Unknown', tone: 'muted' };
}
