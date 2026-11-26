// Presentation-only labels and formatters for the Phase 2C modules. Kept out
// of the service modules so client components never import database code.

export const LEAD_STATUS_META = {
  new: { label: 'New', tone: 'info' },
  researching: { label: 'Researching', tone: 'info' },
  qualified: { label: 'Qualified', tone: 'info' },
  contacted: { label: 'Contacted', tone: 'info' },
  follow_up: { label: 'Follow-up', tone: 'warning' },
  meeting: { label: 'Meeting', tone: 'warning' },
  proposal: { label: 'Proposal', tone: 'warning' },
  won: { label: 'Won', tone: 'success' },
  lost: { label: 'Lost', tone: 'danger' },
};

export const LEAD_PRIORITY_META = {
  low: { label: 'Low', tone: 'muted' },
  medium: { label: 'Medium', tone: 'info' },
  high: { label: 'High', tone: 'warning' },
  urgent: { label: 'Urgent', tone: 'danger' },
};

export const LEAD_SOURCE_LABELS = {
  website: 'Website',
  referral: 'Referral',
  outbound: 'Outbound',
  inbound: 'Inbound',
  event: 'Event',
  social: 'Social',
  partner: 'Partner',
  cold_call: 'Cold call',
  other: 'Other',
};

export const ACTIVITY_LABELS = {
  created: 'Lead created',
  updated: 'Details updated',
  status_changed: 'Status changed',
  assigned: 'Assignment changed',
  note: 'Note',
  archived: 'Archived',
  restored: 'Restored',
  research_completed: 'Research completed',
  call_logged: 'Call logged',
  follow_up_scheduled: 'Follow-up scheduled',
  converted_to_client: 'Converted to client',
  converted_to_project: 'Project created on conversion',
  reported_amounts_updated: 'Reported amounts updated',
};

export const RESEARCH_STATUS_META = {
  queued: { label: 'Queued', tone: 'info' },
  running: { label: 'Running', tone: 'info' },
  awaiting_approval: { label: 'Awaiting approval', tone: 'warning' },
  completed: { label: 'Completed', tone: 'success' },
  failed: { label: 'Failed', tone: 'danger' },
  cancelled: { label: 'Cancelled', tone: 'muted' },
};

export const RESEARCH_VERIFICATION_META = {
  verified: { label: 'Verified in source', tone: 'success' },
  source_derived: { label: 'Source-derived', tone: 'info' },
  ai_analysis: { label: 'AI analysis', tone: 'warning' },
  unverified: { label: 'Unverified', tone: 'muted' },
};

export const RESEARCH_CATEGORY_LABELS = {
  overview: 'Company overview',
  website: 'Website overview',
  services: 'Services',
  industry: 'Industry',
  business_model: 'Business model',
  requirements: 'Potential requirements',
  opportunities: 'Growth & technology opportunities',
  risks: 'Risks',
  next_steps: 'Next steps',
};

export const RESEARCH_SUBJECT_LABELS = {
  company: 'Company',
  website: 'Website',
  industry: 'Industry',
  lead: 'CRM lead',
};

export const AUDIT_STATUS_META = {
  queued: { label: 'Queued', tone: 'info' },
  running: { label: 'Running', tone: 'info' },
  completed: { label: 'Completed', tone: 'success' },
  failed: { label: 'Failed', tone: 'danger' },
  cancelled: { label: 'Cancelled', tone: 'muted' },
};

export const SEVERITY_META = {
  critical: { label: 'Critical', tone: 'danger' },
  high: { label: 'High', tone: 'danger' },
  medium: { label: 'Medium', tone: 'warning' },
  low: { label: 'Low', tone: 'info' },
  info: { label: 'Informational', tone: 'muted' },
};

export const SEVERITY_ORDER = ['critical', 'high', 'medium', 'low', 'info'];

export function metaFor(map, key) {
  return map[key] || { label: key || 'Unknown', tone: 'muted' };
}

export function formatValue(value, currency = 'INR') {
  if (value === null || value === undefined || value === '') return '—';
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '—';
  try {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: currency || 'INR',
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${currency || ''} ${amount.toLocaleString('en-IN')}`.trim();
  }
}

export function formatBytes(bytes) {
  const value = Number(bytes);
  if (!Number.isFinite(value) || value <= 0) return '—';
  if (value < 1_024) return `${value} B`;
  if (value < 1_048_576) return `${(value / 1_024).toFixed(1)} KB`;
  return `${(value / 1_048_576).toFixed(2)} MB`;
}

export function formatMs(value) {
  const ms = Number(value);
  if (!Number.isFinite(ms) || ms <= 0) return '—';
  if (ms < 1_000) return `${Math.round(ms)} ms`;
  return `${(ms / 1_000).toFixed(2)} s`;
}

export function toDatetimeLocal(value) {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (part) => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function isOverdue(value) {
  if (!value) return false;
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && date.getTime() < Date.now();
}

export function deltaLabel(delta) {
  if (delta === null || delta === undefined || Number.isNaN(Number(delta))) {
    return 'No comparison available';
  }
  const value = Number(delta);
  if (value === 0) return 'Unchanged since the previous audit';
  return value > 0
    ? `+${value} points since the previous audit`
    : `${value} points since the previous audit`;
}
