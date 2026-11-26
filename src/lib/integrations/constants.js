// Phase 2H vocabulary. These lists are the single source of truth for the
// browser labels, server-side validation and the worker. Nothing here implies
// a live connection: an integration is only "configured" when the environment
// already contains every required credential name.

export const INTEGRATION_KINDS = [
  { key: 'ai_provider', label: 'AI provider' },
  { key: 'email', label: 'Email delivery' },
  { key: 'cms', label: 'Website CMS' },
  { key: 'analytics', label: 'Analytics' },
  { key: 'search_console', label: 'Search Console' },
  { key: 'ads', label: 'Advertising' },
  { key: 'social', label: 'Social platforms' },
  { key: 'lead_source', label: 'Lead sources' },
  { key: 'file_storage', label: 'File storage' },
  { key: 'webhook', label: 'Webhooks' },
];

export const INTEGRATION_KIND_KEYS = INTEGRATION_KINDS.map((item) => item.key);

export const INTEGRATION_KIND_LABELS = Object.fromEntries(
  INTEGRATION_KINDS.map((item) => [item.key, item.label]),
);

export const INTEGRATION_STATUSES = [
  'not_configured',
  'configured',
  'error',
  'disconnected',
];

export const INTEGRATION_STATUS_LABELS = {
  not_configured: 'Not configured',
  configured: 'Configured',
  error: 'Error',
  disconnected: 'Disconnected',
};

export const INTEGRATION_STATUS_TONES = {
  not_configured: 'muted',
  configured: 'success',
  error: 'danger',
  disconnected: 'warning',
};

export const CAPABILITY_KEYS = [
  'read',
  'propose',
  'validate',
  'publish_request',
  'import_metrics',
  'report',
  'send_message',
  'receive_event',
  'store_file',
];

export const CAPABILITY_LABELS = {
  read: 'Read',
  propose: 'Prepare proposals',
  validate: 'Validate',
  publish_request: 'Request publishing',
  import_metrics: 'Import metrics',
  report: 'Reporting',
  send_message: 'Prepare messages',
  receive_event: 'Receive events',
  store_file: 'Store files',
};

export const EXECUTION_STATUSES = [
  'proposed',
  'awaiting_approval',
  'approved',
  'rejected',
  'queued',
  'executing',
  'completed',
  'failed',
  'cancelled',
];

export const EXECUTION_STATUS_LABELS = {
  proposed: 'Proposed',
  awaiting_approval: 'Awaiting approval',
  approved: 'Approved',
  rejected: 'Rejected',
  queued: 'Queued',
  executing: 'Executing',
  completed: 'Completed',
  failed: 'Failed',
  cancelled: 'Cancelled',
};

export const EXECUTION_STATUS_TONES = {
  proposed: 'muted',
  awaiting_approval: 'warning',
  approved: 'default',
  rejected: 'danger',
  queued: 'warning',
  executing: 'warning',
  completed: 'success',
  failed: 'danger',
  cancelled: 'muted',
};

export const EXECUTION_TRANSITIONS = {
  proposed: ['awaiting_approval', 'cancelled'],
  awaiting_approval: ['approved', 'rejected', 'cancelled'],
  approved: ['queued', 'cancelled'],
  queued: ['executing', 'cancelled', 'failed'],
  executing: ['completed', 'failed'],
  completed: [],
  rejected: [],
  failed: ['queued', 'cancelled'],
  cancelled: [],
};

export const RISK_LEVELS = ['low', 'medium', 'high', 'critical'];

export const RISK_LEVEL_LABELS = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  critical: 'Critical',
};

export const EXECUTION_CATEGORIES = [
  { key: 'website_publish', label: 'Website publishing' },
  { key: 'website_content', label: 'Website content change' },
  { key: 'social_publish', label: 'Social publishing' },
  { key: 'email_send', label: 'Email send' },
  { key: 'ads_budget', label: 'Advertising budget' },
  { key: 'ads_pause', label: 'Advertising pause' },
  { key: 'data_import', label: 'Data import' },
  { key: 'internal_record', label: 'Internal record' },
];

export const EXECUTION_CATEGORY_KEYS = EXECUTION_CATEGORIES.map(
  (item) => item.key,
);

export const EXECUTION_CATEGORY_LABELS = Object.fromEntries(
  EXECUTION_CATEGORIES.map((item) => [item.key, item.label]),
);

export const WEBHOOK_EVENT_STATUSES = [
  'received',
  'processing',
  'processed',
  'failed',
  'ignored',
];

export const WEBHOOK_EVENT_STATUS_LABELS = {
  received: 'Received',
  processing: 'Processing',
  processed: 'Processed',
  failed: 'Failed',
  ignored: 'Ignored',
};

export const WORKFLOW_RUN_STATUSES = [
  'queued',
  'running',
  'completed',
  'failed',
  'cancelled',
];

export const WORKFLOW_RUN_STATUS_LABELS = {
  queued: 'Queued',
  running: 'Running',
  completed: 'Completed',
  failed: 'Failed',
  cancelled: 'Cancelled',
};

export const WORKFLOW_RUN_STATUS_TONES = {
  queued: 'muted',
  running: 'warning',
  completed: 'success',
  failed: 'danger',
  cancelled: 'muted',
};

export function isExecutionTransitionAllowed(from, to) {
  return (EXECUTION_TRANSITIONS[from] || []).includes(to);
}

export function labelFor(map, key) {
  return map[key] || 'Unknown';
}
