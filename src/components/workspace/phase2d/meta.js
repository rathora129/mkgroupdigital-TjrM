// Presentation-only labels for the Phase 2D sales pipeline. Kept free of
// database imports so client components can use them safely.

export const OPPORTUNITY_STAGE_META = {
  discovery: { label: 'Discovery', tone: 'info' },
  requirements: { label: 'Requirements', tone: 'info' },
  proposal: { label: 'Proposal', tone: 'warning' },
  negotiation: { label: 'Negotiation', tone: 'warning' },
  won: { label: 'Won', tone: 'success' },
  lost: { label: 'Lost', tone: 'danger' },
};

export const OPPORTUNITY_STAGE_ORDER = [
  'discovery',
  'requirements',
  'proposal',
  'negotiation',
  'won',
  'lost',
];

export const DISCOVERY_STATUS_META = {
  draft: { label: 'Draft', tone: 'muted' },
  in_review: { label: 'In review', tone: 'warning' },
  approved: { label: 'Approved', tone: 'success' },
  archived: { label: 'Archived', tone: 'muted' },
};

export const REQUIREMENT_STATUS_META = {
  requested: { label: 'Requested', tone: 'info' },
  in_review: { label: 'In review', tone: 'warning' },
  confirmed: { label: 'Confirmed', tone: 'success' },
  deferred: { label: 'Deferred', tone: 'muted' },
};

export const SERVICE_STATUS_META = {
  active: { label: 'Active', tone: 'success' },
  archived: { label: 'Archived', tone: 'muted' },
};

export const BILLING_TYPE_LABELS = {
  one_time: 'One-time',
  monthly: 'Monthly recurring',
  both: 'One-time + monthly',
  custom: 'Custom',
};

export const OPPORTUNITY_ACTIVITY_LABELS = {
  created: 'Opportunity created',
  updated: 'Details updated',
  stage_changed: 'Stage changed',
  assigned: 'Owner changed',
  note: 'Note',
  discovery_updated: 'Discovery saved',
  requirement_added: 'Requirement added',
  requirement_updated: 'Requirement updated',
};

export const REGULATED_REVIEW_NOTICE =
  'MK Group Digital coordinates this work. Legal review, certification, signing and filing are performed by the qualified professional identified on the service.';

export const DISCOVERY_FORM_FIELDS = [
  {
    key: 'companyOverview',
    label: 'Company overview',
    hint: 'What the business does, size and ownership.',
  },
  { key: 'industry', label: 'Industry', hint: 'Sector and sub-sector.' },
  {
    key: 'businessModel',
    label: 'Business model',
    hint: 'How revenue is generated and who the customers are.',
  },
  {
    key: 'challenges',
    label: 'Current challenges',
    hint: 'The problems behind this engagement.',
  },
  {
    key: 'websitePresence',
    label: 'Website and digital presence',
    hint: 'Current website, channels and known gaps.',
  },
  {
    key: 'technologyRequirements',
    label: 'Technology requirements',
    hint: 'Systems, integrations, hosting or automation needs.',
  },
  {
    key: 'marketingRequirements',
    label: 'Marketing requirements',
    hint: 'Channels, campaigns, content and measurement.',
  },
  {
    key: 'financeRequirements',
    label: 'Finance and accounting requirements',
    hint: 'Bookkeeping, reporting, tax coordination and payroll.',
  },
  {
    key: 'complianceRequirements',
    label: 'Corporate compliance requirements',
    hint: 'Incorporation, ROC, board records and filing calendar.',
  },
  {
    key: 'expectedOutcomes',
    label: 'Expected outcomes',
    hint: 'What success looks like for the client.',
  },
  {
    key: 'budgetRange',
    label: 'Budget range',
    hint: 'Client-stated budget or range. This is not a quote.',
  },
  {
    key: 'timeline',
    label: 'Timeline',
    hint: 'Requested start, milestones or deadlines.',
  },
  {
    key: 'specialRequirements',
    label: 'Special requirements and notes',
    hint: 'Constraints, approvals, access or dependencies.',
  },
  {
    key: 'internalNotes',
    label: 'Internal notes',
    hint: 'Not included in the generated requirement document.',
  },
];

export function metaFor(map, key) {
  return map[key] || { label: key || 'Unknown', tone: 'muted' };
}
