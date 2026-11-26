import * as yup from 'yup';
import {
  CAMPAIGN_STATUSES,
  CONTENT_PLATFORM_KEYS,
  CONTENT_STATUSES,
  CONTENT_TYPE_KEYS,
  FINDING_SOURCES,
  FINDING_STATUSES,
  MARKETING_CHANNEL_KEYS,
  MARKETING_SERVICE_KEYS,
  METRIC_KEYS,
  METRIC_SOURCES,
  PROPOSAL_STATUSES,
} from './constants';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value) {
  return typeof value === 'string' && UUID_RE.test(value);
}

const emptyToNull = (value) =>
  typeof value === 'string' && value.trim() === '' ? null : value;

const nullableText = (max, message) =>
  yup.string().trim().transform(emptyToNull).max(max, message).nullable();

const requiredText = (min, max, message) =>
  yup
    .string()
    .trim()
    .min(min, message)
    .max(max, message)
    .required(message);

const uuidField = (message) =>
  yup
    .string()
    .trim()
    .transform(emptyToNull)
    .test(
      'uuid',
      message,
      (value) => value === undefined || value === null || isUuid(value),
    )
    .nullable();

const requiredUuid = (message) =>
  yup
    .string()
    .trim()
    .test('uuid', message, (value) => isUuid(value))
    .required(message);

const dateField = (message) =>
  yup
    .date()
    .transform((value, original) => (original === '' ? null : value))
    .typeError(message)
    .nullable();

const websiteField = (label, required = false) => {
  let field = yup
    .string()
    .trim()
    .transform(emptyToNull)
    .test(
      'http-url',
      `Enter a full http(s) ${label}.`,
      (value) => !value || /^https?:\/\/[^\s]+$/i.test(value),
    )
    .max(500, `That ${label} is too long.`);
  field = required ? field.required(`Enter the ${label}.`) : field.nullable();
  return field;
};

const moneyField = yup
  .number()
  .transform((value, original) =>
    original === '' || original === null || original === undefined ? 0 : value,
  )
  .integer('Use whole minor units.')
  .min(0, 'Amount cannot be negative.')
  .max(100_000_000_000, 'That amount is too large.')
  .default(0);

const currencyField = yup
  .string()
  .trim()
  .uppercase()
  .matches(/^[A-Z]{3}$/, 'Use a three-letter currency code.')
  .default('INR');

const uuidListField = (max, message) =>
  yup
    .array()
    .of(yup.string().trim().test('uuid', message, (value) => isUuid(value)))
    .max(max, message)
    .default([]);

const serviceListField = yup
  .array()
  .of(yup.string().oneOf(MARKETING_SERVICE_KEYS, 'Choose a known service.'))
  .max(50, 'Too many services selected.')
  .default([]);

const pageQueryBase = {
  page: yup.number().integer().min(1).default(1),
  pageSize: yup.number().integer().min(1).max(50).default(20),
};

const searchField = yup
  .string()
  .trim()
  .transform(emptyToNull)
  .max(200, 'Search is too long.')
  .nullable();

// ---------------------------------------------------------------------------
// 2G-A — client marketing profile
// ---------------------------------------------------------------------------

export const marketingProfileSchema = yup.object({
  clientId: requiredUuid('Choose a client.'),
  businessDescription: nullableText(4_000, 'Description is too long.'),
  industry: nullableText(160, 'Industry is too long.'),
  targetAudience: nullableText(2_000, 'Target audience is too long.'),
  targetLocations: yup
    .array()
    .of(yup.string().trim().max(120, 'Each location is too long.'))
    .max(30, 'Too many locations.')
    .default([]),
  serviceAreas: yup
    .array()
    .of(yup.string().trim().max(120, 'Each area is too long.'))
    .max(30, 'Too many service areas.')
    .default([]),
  websiteUrl: websiteField('website address'),
  businessGoals: nullableText(4_000, 'Business goals are too long.'),
  competitors: nullableText(4_000, 'Competitors are too long.'),
  brandVoice: nullableText(2_000, 'Brand voice is too long.'),
  communicationGuidelines: nullableText(
    4_000,
    'Communication guidelines are too long.',
  ),
  contentLanguage: yup
    .string()
    .trim()
    .max(20, 'Language is too long.')
    .default('en'),
  marketingNotes: nullableText(6_000, 'Marketing notes are too long.'),
  availableServices: serviceListField,
  selectedServices: serviceListField,
});

export const marketingClientQuerySchema = yup.object({
  ...pageQueryBase,
  search: searchField,
  hasProfile: yup.string().oneOf(['yes', 'no']).nullable(),
});

// ---------------------------------------------------------------------------
// 2G-C — campaigns
// ---------------------------------------------------------------------------

const campaignFields = {
  clientId: requiredUuid('Choose a client.'),
  projectId: uuidField('Choose a project in this workspace.'),
  name: requiredText(2, 200, 'Campaign name must be at least 2 characters.'),
  objective: nullableText(200, 'Objective is too long.'),
  objectiveDescription: nullableText(4_000, 'Objective details are too long.'),
  targetAudience: nullableText(2_000, 'Target audience is too long.'),
  targetGeography: nullableText(1_000, 'Target geography is too long.'),
  channel: yup
    .string()
    .oneOf(MARKETING_CHANNEL_KEYS, 'Choose a supported marketing channel.')
    .required('Choose a channel.'),
  startDate: dateField('Enter a valid start date.'),
  endDate: dateField('Enter a valid end date.'),
  budgetEstimate: moneyField,
  currency: currencyField,
  successMetrics: nullableText(2_000, 'Success metrics are too long.'),
  ownerUserId: uuidField('Choose a workspace member.'),
  notes: nullableText(6_000, 'Notes are too long.'),
};

export const campaignCreateSchema = yup.object({
  ...campaignFields,
  status: yup
    .string()
    .oneOf(['planned', 'draft'], 'Campaigns start as planned or draft.')
    .default('planned'),
});

export const campaignUpdateSchema = yup.object({
  ...campaignFields,
  expectedUpdatedAt: yup
    .string()
    .trim()
    .required('Reload the campaign before saving.'),
});

export const campaignStatusSchema = yup.object({
  status: yup
    .string()
    .oneOf(CAMPAIGN_STATUSES, 'Choose a valid campaign status.')
    .required('Choose a status.'),
  note: nullableText(2_000, 'Note is too long.'),
  expectedUpdatedAt: yup.string().trim().nullable(),
});

export const campaignApprovalSchema = yup.object({
  clientApprovalStatus: yup
    .string()
    .oneOf(
      ['not_requested', 'pending', 'approved', 'rejected'],
      'Choose a valid approval status.',
    )
    .required('Choose an approval status.'),
  note: nullableText(2_000, 'Note is too long.'),
});

export const campaignQuerySchema = yup.object({
  ...pageQueryBase,
  status: yup.string().oneOf(CAMPAIGN_STATUSES).nullable(),
  channel: yup.string().oneOf(MARKETING_CHANNEL_KEYS).nullable(),
  clientId: uuidField('Choose a client.'),
  owner: yup.string().trim().max(80).nullable(),
  search: searchField,
});

// ---------------------------------------------------------------------------
// 2G-D / 2G-E — content items, versions and calendar
// ---------------------------------------------------------------------------

const contentMetadataFields = {
  campaignId: uuidField('Choose a campaign in this workspace.'),
  projectId: uuidField('Choose a project in this workspace.'),
  targetAudience: nullableText(2_000, 'Target audience is too long.'),
  targetKeyword: nullableText(200, 'Target keyword is too long.'),
  targetPlatform: yup
    .string()
    .oneOf(CONTENT_PLATFORM_KEYS, 'Choose a supported platform.')
    .nullable(),
  language: yup.string().trim().max(20, 'Language is too long.').default('en'),
  ownerUserId: uuidField('Choose a workspace member.'),
  scheduledFor: dateField('Enter a valid schedule date.'),
  dueDate: dateField('Enter a valid due date.'),
};

export const contentCreateSchema = yup.object({
  clientId: requiredUuid('Choose a client.'),
  contentType: yup
    .string()
    .oneOf(CONTENT_TYPE_KEYS, 'Choose a supported content type.')
    .required('Choose a content type.'),
  title: requiredText(2, 220, 'Title must be at least 2 characters.'),
  body: requiredText(1, 60_000, 'Write the draft content.'),
  ...contentMetadataFields,
  status: yup
    .string()
    .oneOf(['idea', 'draft'], 'Content starts as an idea or draft.')
    .default('draft'),
});

export const contentUpdateSchema = yup.object({
  title: requiredText(2, 220, 'Title must be at least 2 characters.'),
  ...contentMetadataFields,
  expectedUpdatedAt: yup
    .string()
    .trim()
    .required('Reload the content before saving.'),
});

export const contentVersionSchema = yup.object({
  body: requiredText(1, 60_000, 'Write the draft content.'),
  changeNote: nullableText(500, 'Change note is too long.'),
  expectedVersion: yup
    .number()
    .integer('Reload the content before saving.')
    .min(1)
    .required('Reload the content before saving.'),
});

export const CONTENT_ACTIONS = [
  'start_draft',
  'submit',
  'approve',
  'reject',
  'schedule',
  'unschedule',
  'mark_published',
  'record_failure',
  'cancel',
  'regenerate',
  'import_agent_run',
];

export const contentActionSchema = yup.object({
  action: yup
    .string()
    .oneOf(CONTENT_ACTIONS, 'Choose a valid action.')
    .required('Choose an action.'),
  feedback: nullableText(2_000, 'Feedback is too long.'),
  scheduledFor: dateField('Enter a valid schedule date.'),
  publishNote: nullableText(2_000, 'Publish note is too long.'),
  runId: uuidField('Choose a completed AI run.'),
  expectedUpdatedAt: yup.string().trim().nullable(),
});

export const contentQuerySchema = yup.object({
  ...pageQueryBase,
  status: yup.string().oneOf(CONTENT_STATUSES).nullable(),
  clientId: uuidField('Choose a client.'),
  campaignId: uuidField('Choose a campaign.'),
  contentType: yup.string().oneOf(CONTENT_TYPE_KEYS).nullable(),
  platform: yup.string().oneOf(CONTENT_PLATFORM_KEYS).nullable(),
  owner: yup.string().trim().max(80).nullable(),
  from: dateField('Enter a valid start date.'),
  to: dateField('Enter a valid end date.'),
  view: yup.string().oneOf(['list', 'month', 'week']).default('list'),
  search: searchField,
});

// ---------------------------------------------------------------------------
// 2G-F — website page inventory and change proposals
// ---------------------------------------------------------------------------

export const websitePageCreateSchema = yup.object({
  clientId: requiredUuid('Choose a client.'),
  pageTitle: requiredText(2, 220, 'Page title must be at least 2 characters.'),
  pageUrl: websiteField('page URL', true),
  pageType: nullableText(120, 'Page type is too long.'),
  pageObjective: nullableText(2_000, 'Page objective is too long.'),
  existingContentNotes: nullableText(8_000, 'Content notes are too long.'),
  seoTitle: nullableText(200, 'SEO title is too long.'),
  metaDescription: nullableText(400, 'Meta description is too long.'),
  ctaRecommendations: nullableText(2_000, 'CTA recommendations are too long.'),
  mediaRequirements: nullableText(2_000, 'Media requirements are too long.'),
  internalLinkRecommendations: nullableText(
    2_000,
    'Internal link recommendations are too long.',
  ),
});

export const websitePageUpdateSchema = yup.object({
  pageTitle: requiredText(2, 220, 'Page title must be at least 2 characters.'),
  pageType: nullableText(120, 'Page type is too long.'),
  pageObjective: nullableText(2_000, 'Page objective is too long.'),
  existingContentNotes: nullableText(8_000, 'Content notes are too long.'),
  seoTitle: nullableText(200, 'SEO title is too long.'),
  metaDescription: nullableText(400, 'Meta description is too long.'),
  ctaRecommendations: nullableText(2_000, 'CTA recommendations are too long.'),
  mediaRequirements: nullableText(2_000, 'Media requirements are too long.'),
  internalLinkRecommendations: nullableText(
    2_000,
    'Internal link recommendations are too long.',
  ),
  status: yup.string().oneOf(['active', 'archived']).default('active'),
  expectedUpdatedAt: yup
    .string()
    .trim()
    .required('Reload the page before saving.'),
});

export const websitePageQuerySchema = yup.object({
  ...pageQueryBase,
  clientId: uuidField('Choose a client.'),
  search: searchField,
});

export const proposalCreateSchema = yup.object({
  clientId: requiredUuid('Choose a client.'),
  pageId: uuidField('Choose a page in this client inventory.'),
  title: requiredText(2, 220, 'Proposal title must be at least 2 characters.'),
  currentContent: nullableText(60_000, 'Current content is too long.'),
  proposedContent: requiredText(1, 60_000, 'Write the proposed content.'),
  ownerUserId: uuidField('Choose a workspace member.'),
});

export const proposalUpdateSchema = yup.object({
  title: requiredText(2, 220, 'Proposal title must be at least 2 characters.'),
  ownerUserId: uuidField('Choose a workspace member.'),
  reviewNotes: nullableText(4_000, 'Review notes are too long.'),
  expectedUpdatedAt: yup
    .string()
    .trim()
    .required('Reload the proposal before saving.'),
});

export const proposalVersionSchema = yup.object({
  body: requiredText(1, 60_000, 'Write the proposed content.'),
  changeNote: nullableText(500, 'Change note is too long.'),
  expectedVersion: yup
    .number()
    .integer('Reload the proposal before saving.')
    .min(1)
    .required('Reload the proposal before saving.'),
});

export const PROPOSAL_ACTIONS = [
  'submit',
  'approve',
  'reject',
  'start_execution',
  'record_execution',
  'cancel',
  'regenerate',
  'import_agent_run',
];

export const proposalActionSchema = yup.object({
  action: yup
    .string()
    .oneOf(PROPOSAL_ACTIONS, 'Choose a valid action.')
    .required('Choose an action.'),
  feedback: nullableText(2_000, 'Feedback is too long.'),
  evidence: nullableText(4_000, 'Execution evidence is too long.'),
  notes: nullableText(4_000, 'Execution notes are too long.'),
  runId: uuidField('Choose a completed AI run.'),
  expectedUpdatedAt: yup.string().trim().nullable(),
});

export const proposalQuerySchema = yup.object({
  ...pageQueryBase,
  status: yup.string().oneOf(PROPOSAL_STATUSES).nullable(),
  clientId: uuidField('Choose a client.'),
  pageId: uuidField('Choose a page.'),
  search: searchField,
});

// ---------------------------------------------------------------------------
// 2G-B — audit findings and task conversion
// ---------------------------------------------------------------------------

export const auditFindingCreateSchema = yup.object({
  category: requiredText(2, 80, 'Choose a category.'),
  severity: yup
    .string()
    .oneOf(['critical', 'high', 'medium', 'low', 'info'], 'Choose a severity.')
    .default('medium'),
  code: requiredText(2, 80, 'A short code is required.'),
  title: requiredText(2, 220, 'Title must be at least 2 characters.'),
  description: requiredText(2, 8_000, 'Describe the observation.'),
  evidence: nullableText(8_000, 'Evidence is too long.'),
  recommendation: requiredText(2, 8_000, 'Add a recommendation.'),
  sourcePage: nullableText(500, 'Source page is too long.'),
  sourceType: yup
    .string()
    .oneOf(FINDING_SOURCES, 'Choose a finding source.')
    .default('manual'),
  assignedToUserId: uuidField('Choose a workspace member.'),
});

export const auditFindingUpdateSchema = yup.object({
  status: yup.string().oneOf(FINDING_STATUSES, 'Choose a finding status.'),
  assignedToUserId: uuidField('Choose a workspace member.'),
  completionNotes: nullableText(4_000, 'Completion notes are too long.'),
  sourceType: yup.string().oneOf(FINDING_SOURCES, 'Choose a finding source.'),
  severity: yup
    .string()
    .oneOf(['critical', 'high', 'medium', 'low', 'info'], 'Choose a severity.'),
  recommendation: nullableText(8_000, 'Recommendation is too long.'),
  expectedUpdatedAt: yup.string().trim().nullable(),
});

export const auditFindingQuerySchema = yup.object({
  status: yup.string().oneOf(FINDING_STATUSES).nullable(),
  sourceType: yup.string().oneOf(FINDING_SOURCES).nullable(),
});

export const auditTaskSchema = yup.object({
  projectId: requiredUuid('Choose a project for the task.'),
  ownerUserId: uuidField('Choose a workspace member.'),
  priority: yup
    .string()
    .oneOf(['low', 'medium', 'high', 'urgent'], 'Choose a priority.')
    .nullable(),
  dueDate: dateField('Enter a valid due date.'),
  acceptanceCriteria: nullableText(4_000, 'Acceptance criteria are too long.'),
});

// ---------------------------------------------------------------------------
// 2G-H — metrics and reports
// ---------------------------------------------------------------------------

export const metricCreateSchema = yup.object({
  clientId: requiredUuid('Choose a client.'),
  campaignId: uuidField('Choose a campaign in this workspace.'),
  metricKey: yup
    .string()
    .oneOf(METRIC_KEYS, 'Choose a supported metric.')
    .required('Choose a metric.'),
  value: yup
    .number()
    .typeError('Enter a number.')
    .min(0, 'Value cannot be negative.')
    .max(1_000_000_000_000, 'That value is too large.')
    .required('Enter a value.'),
  source: yup
    .string()
    .oneOf(METRIC_SOURCES, 'Choose a valid source.')
    .default('manual'),
  periodStart: yup
    .date()
    .typeError('Enter a valid period start.')
    .required('Choose a period start.'),
  periodEnd: yup
    .date()
    .typeError('Enter a valid period end.')
    .required('Choose a period end.'),
  notes: nullableText(2_000, 'Notes are too long.'),
});

export const metricQuerySchema = yup.object({
  ...pageQueryBase,
  clientId: uuidField('Choose a client.'),
  campaignId: uuidField('Choose a campaign.'),
  metricKey: yup.string().oneOf(METRIC_KEYS).nullable(),
  source: yup.string().oneOf(METRIC_SOURCES).nullable(),
  from: dateField('Enter a valid start date.'),
  to: dateField('Enter a valid end date.'),
});

export const reportCreateSchema = yup.object({
  clientId: requiredUuid('Choose a client.'),
  projectId: uuidField('Choose a project.'),
  title: requiredText(2, 220, 'Report title must be at least 2 characters.'),
  periodStart: yup
    .date()
    .typeError('Enter a valid period start.')
    .required('Choose a period start.'),
  periodEnd: yup
    .date()
    .typeError('Enter a valid period end.')
    .required('Choose a period end.'),
  includeAiNarrative: yup.boolean().default(false),
});

export const reportQuerySchema = yup.object({
  ...pageQueryBase,
  clientId: uuidField('Choose a client.'),
  search: searchField,
});

export const reportNarrativeSchema = yup.object({
  action: yup
    .string()
    .oneOf(['request', 'import'], 'Choose a narrative action.')
    .required('Choose an action.'),
  runId: uuidField('Choose a completed AI run.'),
});
