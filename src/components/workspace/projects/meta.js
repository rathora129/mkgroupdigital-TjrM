// Presentation-only labels for project delivery. No database imports so client
// components can import this freely.

export const PROJECT_STATUS_META = {
  not_started: { label: 'Not started', tone: 'muted' },
  planning: { label: 'Planning', tone: 'info' },
  in_progress: { label: 'In progress', tone: 'info' },
  client_review: { label: 'Client review', tone: 'warning' },
  on_hold: { label: 'On hold', tone: 'warning' },
  completed: { label: 'Completed', tone: 'success' },
  cancelled: { label: 'Cancelled', tone: 'danger' },
};

export const TASK_STATUS_META = {
  todo: { label: 'To do', tone: 'muted' },
  in_progress: { label: 'In progress', tone: 'info' },
  blocked: { label: 'Blocked', tone: 'danger' },
  in_review: { label: 'In review', tone: 'warning' },
  completed: { label: 'Completed', tone: 'success' },
  cancelled: { label: 'Cancelled', tone: 'muted' },
};

export const PRIORITY_META = {
  low: { label: 'Low', tone: 'muted' },
  medium: { label: 'Medium', tone: 'info' },
  high: { label: 'High', tone: 'warning' },
  urgent: { label: 'Urgent', tone: 'danger' },
};

export const REVIEW_STATUS_META = {
  pending: { label: 'Pending review', tone: 'muted' },
  in_review: { label: 'In review', tone: 'warning' },
  approved: { label: 'Approved', tone: 'success' },
  changes_requested: { label: 'Changes requested', tone: 'danger' },
};

export const CLIENT_APPROVAL_META = {
  not_requested: { label: 'Not requested', tone: 'muted' },
  pending: { label: 'Awaiting client', tone: 'warning' },
  approved: { label: 'Client approved', tone: 'success' },
  rejected: { label: 'Client rejected', tone: 'danger' },
};

export const SCOPE_CHANGE_META = {
  requested: { label: 'Requested', tone: 'warning' },
  approved: { label: 'Approved', tone: 'success' },
  rejected: { label: 'Rejected', tone: 'danger' },
  withdrawn: { label: 'Withdrawn', tone: 'muted' },
};

export const PROJECT_ACTIVITY_LABELS = {
  created: 'Project created',
  updated: 'Details updated',
  status_changed: 'Status changed',
  task_created: 'Task added',
  task_updated: 'Task updated',
  task_status: 'Task status changed',
  task_comment: 'Task comment',
  milestone_created: 'Milestone added',
  milestone_updated: 'Milestone updated',
  deliverable_created: 'Deliverable added',
  deliverable_updated: 'Deliverable updated',
  scope_requested: 'Scope change requested',
  scope_decided: 'Scope change decided',
};

export function metaFor(map, value) {
  return map[value] || { label: value || 'Unknown', tone: 'muted' };
}

export function durationLabel(minutes) {
  const value = Number(minutes || 0);
  if (!Number.isFinite(value) || value <= 0) return '—';
  if (value < 60) return `${value}m`;
  const hours = Math.floor(value / 60);
  const rest = value % 60;
  if (hours < 8) return rest ? `${hours}h ${rest}m` : `${hours}h`;
  const days = Math.floor(hours / 8);
  const leftover = hours % 8;
  const parts = [`${days}d`];
  if (leftover) parts.push(`${leftover}h`);
  if (rest) parts.push(`${rest}m`);
  return parts.join(' ');
}

// A calendar date input round-trips through UTC so a picked day never shifts.
export function dateInputValue(value) {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

export function toIsoDate(value) {
  if (!value) return null;
  return new Date(`${value}T00:00:00.000Z`).toISOString();
}
