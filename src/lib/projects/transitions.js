// Controlled lifecycle maps. Terminal states cannot be reopened, so a completed
// or cancelled project always keeps its recorded finish. Task statuses follow a
// small forward-only map so a completed task cannot silently return to To do.

export const PROJECT_STATUSES = [
  'not_started',
  'planning',
  'in_progress',
  'client_review',
  'on_hold',
  'completed',
  'cancelled',
];

export const PROJECT_STATUS_LABELS = {
  not_started: 'Not started',
  planning: 'Planning',
  in_progress: 'In progress',
  client_review: 'Client review',
  on_hold: 'On hold',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

export const PROJECT_STATUS_TRANSITIONS = {
  not_started: ['planning', 'cancelled'],
  planning: ['in_progress', 'on_hold', 'cancelled'],
  in_progress: ['client_review', 'on_hold', 'completed', 'cancelled'],
  client_review: ['in_progress', 'on_hold', 'completed', 'cancelled'],
  on_hold: ['planning', 'in_progress', 'cancelled'],
  completed: [],
  cancelled: [],
};

export const TASK_STATUSES = [
  'todo',
  'in_progress',
  'blocked',
  'in_review',
  'completed',
  'cancelled',
];

export const TASK_STATUS_LABELS = {
  todo: 'To do',
  in_progress: 'In progress',
  blocked: 'Blocked',
  in_review: 'In review',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

export const TASK_STATUS_TRANSITIONS = {
  todo: ['in_progress', 'cancelled'],
  in_progress: ['blocked', 'in_review', 'completed', 'cancelled'],
  blocked: ['in_progress', 'cancelled'],
  in_review: ['in_progress', 'completed'],
  completed: [],
  cancelled: [],
};

export const TASK_PRIORITIES = ['low', 'medium', 'high', 'urgent'];

export const TASK_PRIORITY_LABELS = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  urgent: 'Urgent',
};

export const MILESTONE_REVIEW_STATUSES = [
  'pending',
  'in_review',
  'approved',
  'changes_requested',
];

export const CLIENT_APPROVAL_STATUSES = [
  'not_requested',
  'pending',
  'approved',
  'rejected',
];

export const SCOPE_CHANGE_STATUSES = [
  'requested',
  'approved',
  'rejected',
  'withdrawn',
];

export function allowedNextProjectStatuses(status) {
  return [...(PROJECT_STATUS_TRANSITIONS[status] || [])];
}

export function canTransitionProject(from, to) {
  return allowedNextProjectStatuses(from).includes(to);
}

export function canTransitionTask(from, to) {
  return (TASK_STATUS_TRANSITIONS[from] || []).includes(to);
}

export function isProjectClosed(status) {
  return status === 'completed' || status === 'cancelled';
}
