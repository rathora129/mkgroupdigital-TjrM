// Reusable workflow definitions for agency operations. A definition is pure
// metadata: the runner in service.js supplies the read-only data for each
// step. Nothing here sends a real message, publishes content or spends money.

export const WORKFLOW_DEFINITIONS = [
  {
    key: 'new_client_onboarding',
    label: 'New client onboarding checklist',
    description:
      'Summarises client contacts, engagements, open tasks and marketing setup so onboarding gaps are visible.',
    requiresClient: true,
    requiresProject: false,
    steps: [
      { key: 'client_profile', label: 'Check client profile completeness' },
      { key: 'engagements', label: 'List active service engagements' },
      { key: 'open_tasks', label: 'Collect open onboarding tasks' },
      { key: 'marketing_profile', label: 'Check marketing profile setup' },
    ],
  },
  {
    key: 'website_audit_followup',
    label: 'Website audit follow-up',
    description:
      'Collects the latest website audit status and unresolved SEO findings for follow-up.',
    requiresClient: true,
    requiresProject: false,
    steps: [
      { key: 'latest_audit', label: 'Read latest website audit status' },
      { key: 'open_findings', label: 'Count unresolved SEO findings' },
      { key: 'followup_tasks', label: 'List website follow-up tasks' },
    ],
  },
  {
    key: 'seo_task_creation',
    label: 'SEO task creation check',
    description:
      'Reviews generated marketing tasks and pending SEO work before a human accepts them.',
    requiresClient: true,
    requiresProject: false,
    steps: [
      { key: 'marketing_tasks', label: 'Count open marketing tasks' },
      { key: 'findings_without_tasks', label: 'Find SEO findings without a task' },
      { key: 'overdue', label: 'List overdue SEO tasks' },
    ],
  },
  {
    key: 'content_approval_reminder',
    label: 'Content approval reminder',
    description:
      'Prepares an internal reminder listing content that has been waiting for review.',
    requiresClient: false,
    requiresProject: false,
    steps: [
      { key: 'awaiting_review', label: 'Count content awaiting review' },
      { key: 'stale_drafts', label: 'Find drafts older than 7 days' },
      { key: 'reminder_ready', label: 'Prepare internal reminder summary' },
    ],
  },
  {
    key: 'marketing_report_preparation',
    label: 'Marketing report preparation',
    description:
      'Gathers recorded metrics and campaign counts using their source labels.',
    requiresClient: true,
    requiresProject: false,
    steps: [
      { key: 'campaigns', label: 'Count campaigns by status' },
      { key: 'metrics', label: 'Count recorded metrics by source' },
      { key: 'reports', label: 'List existing reports' },
    ],
  },
  {
    key: 'website_improvement_review',
    label: 'Website improvement review',
    description:
      'Lists website change proposals awaiting review and executed changes with evidence.',
    requiresClient: true,
    requiresProject: false,
    steps: [
      { key: 'pending_proposals', label: 'List proposals awaiting review' },
      { key: 'executed_proposals', label: 'List executed proposals' },
      { key: 'missing_evidence', label: 'Find executions without evidence' },
    ],
  },
  {
    key: 'pending_approval_reminder',
    label: 'Pending approval reminder',
    description:
      'Summarises agent-run approvals, execution requests and marketing reviews waiting on a decision.',
    requiresClient: false,
    requiresProject: false,
    steps: [
      { key: 'agent_approvals', label: 'Count pending agent-run approvals' },
      { key: 'execution_approvals', label: 'Count pending execution requests' },
      { key: 'marketing_reviews', label: 'Count marketing items awaiting review' },
    ],
  },
  {
    key: 'failed_integration_notification',
    label: 'Failed integration notification',
    description:
      'Lists integrations and webhook events that failed so they can be reviewed internally.',
    requiresClient: false,
    requiresProject: false,
    steps: [
      { key: 'integration_errors', label: 'List integrations in error state' },
      { key: 'failed_webhooks', label: 'List failed webhook events' },
      { key: 'notification_ready', label: 'Prepare internal notification summary' },
    ],
  },
  {
    key: 'project_progress_summary',
    label: 'Project progress summary',
    description:
      'Summarises milestones, deliverables and open tasks for one project.',
    requiresClient: false,
    requiresProject: true,
    steps: [
      { key: 'project_status', label: 'Read project status' },
      { key: 'milestones', label: 'Count open milestones' },
      { key: 'open_tasks', label: 'Count open project tasks' },
    ],
  },
];

export const WORKFLOW_KEYS = WORKFLOW_DEFINITIONS.map((item) => item.key);

export function getWorkflowDefinition(key) {
  return WORKFLOW_DEFINITIONS.find((item) => item.key === key) || null;
}

export const WORKFLOW_LABELS = Object.fromEntries(
  WORKFLOW_DEFINITIONS.map((item) => [item.key, item.label]),
);
