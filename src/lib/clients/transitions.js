// Controlled lifecycles for client relationship records.

export const CLIENT_STATUSES = ['active', 'inactive', 'archived'];
export const CLIENT_STATUS_TRANSITIONS = {
  active: ['inactive', 'archived'],
  inactive: ['active', 'archived'],
  archived: ['active'],
};

export const ENGAGEMENT_STATUSES = [
  'planned',
  'active',
  'paused',
  'ending',
  'ended',
  'cancelled',
];
export const ENGAGEMENT_STATUS_TRANSITIONS = {
  planned: ['active', 'cancelled'],
  active: ['paused', 'ending', 'ended', 'cancelled'],
  paused: ['active', 'ending', 'cancelled'],
  ending: ['ended', 'cancelled'],
  ended: [],
  cancelled: [],
};

export const ENGAGEMENT_FREQUENCIES = [
  'one_time',
  'weekly',
  'monthly',
  'quarterly',
  'annual',
  'custom',
];

export const TICKET_STATUSES = [
  'open',
  'assigned',
  'in_progress',
  'waiting_client',
  'resolved',
  'closed',
];
export const TICKET_STATUS_TRANSITIONS = {
  open: ['assigned', 'in_progress', 'waiting_client', 'resolved', 'closed'],
  assigned: ['in_progress', 'waiting_client', 'resolved', 'closed'],
  in_progress: ['waiting_client', 'resolved', 'closed'],
  waiting_client: ['in_progress', 'resolved', 'closed'],
  resolved: ['in_progress', 'closed'],
  closed: [],
};

export const TICKET_CATEGORIES = [
  'general',
  'delivery',
  'billing',
  'technical',
  'account_management',
  'other',
];

export const TICKET_MESSAGE_VISIBILITIES = ['internal', 'client'];

export const TIMELINE_TYPES = ['note', 'meeting', 'call', 'email_manual'];

export function canTransitionClient(from, to) {
  return (CLIENT_STATUS_TRANSITIONS[from] || []).includes(to);
}

export function canTransitionEngagement(from, to) {
  return (ENGAGEMENT_STATUS_TRANSITIONS[from] || []).includes(to);
}

export function canTransitionTicket(from, to) {
  return (TICKET_STATUS_TRANSITIONS[from] || []).includes(to);
}
