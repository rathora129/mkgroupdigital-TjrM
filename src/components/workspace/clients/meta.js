// Presentation-only labels for clients, engagements and support. No database
// or validation imports so client components can use this safely.

export const CLIENT_STATUS_META = {
  active: { label: 'Active', tone: 'success' },
  inactive: { label: 'Inactive', tone: 'warning' },
  archived: { label: 'Archived', tone: 'muted' },
};

export const ENGAGEMENT_STATUS_META = {
  planned: { label: 'Planned', tone: 'muted' },
  active: { label: 'Active', tone: 'success' },
  paused: { label: 'Paused', tone: 'warning' },
  ending: { label: 'Ending', tone: 'info' },
  ended: { label: 'Ended', tone: 'muted' },
  cancelled: { label: 'Cancelled', tone: 'danger' },
};

export const ENGAGEMENT_FREQUENCY_LABELS = {
  one_time: 'One-time',
  weekly: 'Weekly',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  annual: 'Annual',
  custom: 'Custom',
};

export const TICKET_STATUS_META = {
  open: { label: 'Open', tone: 'info' },
  assigned: { label: 'Assigned', tone: 'info' },
  in_progress: { label: 'In progress', tone: 'warning' },
  waiting_client: { label: 'Waiting for client', tone: 'warning' },
  resolved: { label: 'Resolved', tone: 'success' },
  closed: { label: 'Closed', tone: 'muted' },
};

export const TICKET_CATEGORY_LABELS = {
  general: 'General',
  delivery: 'Delivery',
  billing: 'Billing',
  technical: 'Technical',
  account_management: 'Account management',
  other: 'Other',
};

export const TICKET_PRIORITY_META = {
  low: { label: 'Low', tone: 'muted' },
  medium: { label: 'Medium', tone: 'info' },
  high: { label: 'High', tone: 'warning' },
  urgent: { label: 'Urgent', tone: 'danger' },
};

export const TICKET_VISIBILITY_META = {
  internal: { label: 'Internal note', tone: 'warning' },
  client: { label: 'Client-visible', tone: 'success' },
};

export const TIMELINE_TYPE_LABELS = {
  note: 'Note',
  meeting: 'Meeting',
  call: 'Call',
  email_manual: 'Email (recorded manually)',
};

export const TIMELINE_SOURCE_LABELS = {
  manual: 'Recorded',
  project: 'Project',
  support: 'Support',
  proposal: 'Proposal',
  billing: 'Billing',
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

export function datetimeInputValue(value) {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

export function renewalLabel(days) {
  if (days === null || days === undefined) return 'No renewal date';
  if (days < 0) return `Renewal overdue by ${Math.abs(days)} days`;
  if (days === 0) return 'Renews today';
  return `Renews in ${days} days`;
}
