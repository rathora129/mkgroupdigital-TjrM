import * as yup from 'yup';

export const DISCOVERY_STATUSES = [
  'draft',
  'active',
  'paused',
  'completed',
  'cancelled',
];

export const DISCOVERY_FREQUENCIES = ['manual', 'daily', 'weekly'];

export const DISCOVERY_PROSPECT_STATUSES = [
  'pending_review',
  'approved',
  'rejected',
  'duplicate',
];

export const DISCOVERY_TEMPERATURES = ['hot', 'warm', 'cold', 'unknown'];

export const DISCOVERY_PROVIDER_KEYS = ['google_places', 'public_web_search'];

export const WEBSITE_PRESENCE = ['any', 'with_website', 'without_website'];

export const DISCOVERY_REVIEW_ACTIONS = [
  'approve',
  'reject',
  'edit',
  'request_research',
  'mark_duplicate',
];

export const DISCOVERY_RUN_STATUSES = [
  'queued',
  'running',
  'completed',
  'failed',
  'cancelled',
];

const emptyToNull = (value) =>
  typeof value === 'string' && value.trim() === '' ? null : value;

const nullableText = (max, message) =>
  yup
    .string()
    .trim()
    .transform(emptyToNull)
    .max(max, message)
    .nullable();

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const uuidField = (message) =>
  yup
    .string()
    .trim()
    .transform(emptyToNull)
    .matches(UUID_RE, message)
    .nullable();

const dateField = (message) =>
  yup
    .date()
    .transform((value, original) => (original === '' ? null : value))
    .typeError(message)
    .nullable();

const servicesBase = yup
  .array()
  .of(yup.string().trim().min(1).max(80))
  .max(20, 'List at most 20 services.');

const servicesField = servicesBase
  .transform((value) => (Array.isArray(value) ? value : []))
  .default([]);

const criteriaBase = yup.object({
  city: nullableText(120, 'City must be 120 characters or fewer.'),
  area: nullableText(120, 'Area must be 120 characters or fewer.'),
  state: nullableText(120, 'State must be 120 characters or fewer.'),
  country: nullableText(120, 'Country must be 120 characters or fewer.'),
  industry: nullableText(160, 'Industry must be 160 characters or fewer.'),
  businessSize: nullableText(80, 'Business size must be 80 characters or fewer.'),
  websitePresence: yup
    .string()
    .oneOf(WEBSITE_PRESENCE, 'Choose a valid website filter.'),
  qualityCriteria: nullableText(
    1_000,
    'Quality criteria must be 1,000 characters or fewer.',
  ),
  keywords: nullableText(500, 'Keywords must be 500 characters or fewer.'),
});

const criteriaField = criteriaBase
  .default(() => ({}))
  .transform((value) => value || {});

const budgetField = yup
  .number()
  .transform((value, original) => (original === '' ? 0 : value))
  .integer('Budget must be a whole number of cents.')
  .min(0, 'Budget cannot be negative.')
  .max(100_000_000, 'That budget is too large.');

const dailyLimitField = yup
  .number()
  .integer('Daily limit must be a whole number.')
  .min(1, 'Daily limit must be at least 1.')
  .max(50, 'Keep the daily limit at 50 or fewer qualified prospects.');

const researchOpsField = yup
  .number()
  .integer('Research operations must be a whole number.')
  .min(0, 'Research operations cannot be negative.')
  .max(100, 'Keep research operations at 100 or fewer.');

function requireTarget(value) {
  const criteria = value?.criteria || {};
  return Boolean(
    criteria.city ||
      criteria.area ||
      criteria.state ||
      criteria.country ||
      criteria.industry ||
      criteria.keywords ||
      (Array.isArray(value?.services) && value.services.length > 0),
  );
}

function endAfterStart(value) {
  if (!value?.startDate || !value?.endDate) return true;
  return new Date(value.endDate).getTime() >= new Date(value.startDate).getTime();
}

export const discoveryCampaignCreateSchema = yup
  .object({
    name: yup
      .string()
      .trim()
      .min(3, 'Give the campaign at least 3 characters.')
      .max(160, 'Campaign name must be 160 characters or fewer.')
      .required('Give the campaign a name.'),
    provider: yup
      .string()
      .oneOf(DISCOVERY_PROVIDER_KEYS, 'Choose a supported discovery provider.')
      .default('public_web_search'),
    frequency: yup
      .string()
      .oneOf(DISCOVERY_FREQUENCIES, 'Choose a valid frequency.')
      .default('manual'),
    dailyLimit: dailyLimitField.default(20),
    maxResearchOps: researchOpsField.default(20),
    budgetCents: budgetField.default(0),
    services: servicesField,
    criteria: criteriaField,
    startDate: dateField('Enter a valid start date.'),
    endDate: dateField('Enter a valid end date.'),
  })
  .test(
    'target-required',
    'Add a location, industry, keyword or service so discovery has a target.',
    requireTarget,
  )
  .test(
    'date-order',
    'The end date must be on or after the start date.',
    endAfterStart,
  );

export const discoveryCampaignUpdateSchema = yup
  .object({
    name: yup
      .string()
      .trim()
      .min(3, 'Give the campaign at least 3 characters.')
      .max(160, 'Campaign name must be 160 characters or fewer.'),
    provider: yup
      .string()
      .oneOf(DISCOVERY_PROVIDER_KEYS, 'Choose a supported discovery provider.'),
    frequency: yup
      .string()
      .oneOf(DISCOVERY_FREQUENCIES, 'Choose a valid frequency.'),
    dailyLimit: dailyLimitField,
    maxResearchOps: researchOpsField,
    budgetCents: budgetField,
    services: servicesBase,
    criteria: criteriaBase.default(undefined),
    startDate: dateField('Enter a valid start date.'),
    endDate: dateField('Enter a valid end date.'),
  });

const searchField = yup
  .string()
  .trim()
  .transform(emptyToNull)
  .max(160, 'Search is too long.')
  .nullable();

export const discoveryCampaignQuerySchema = yup.object({
  page: yup.number().integer().min(1).default(1),
  pageSize: yup.number().integer().min(1).max(50).default(20),
  status: yup.string().oneOf(DISCOVERY_STATUSES),
  provider: yup.string().oneOf(DISCOVERY_PROVIDER_KEYS),
  search: searchField,
});

export const discoveryProspectQuerySchema = yup.object({
  page: yup.number().integer().min(1).default(1),
  pageSize: yup.number().integer().min(1).max(100).default(20),
  status: yup
    .string()
    .oneOf([...DISCOVERY_PROSPECT_STATUSES, 'all'])
    .default('pending_review'),
  temperature: yup.string().oneOf(DISCOVERY_TEMPERATURES),
  campaignId: yup.string().trim().matches(UUID_RE, 'Choose a valid campaign.').nullable(),
  search: searchField,
});

export const discoveryProspectEditSchema = yup.object({
  businessName: yup
    .string()
    .trim()
    .min(1, 'Business name is required.')
    .max(200, 'Business name must be 200 characters or fewer.'),
  contactName: nullableText(160, 'Contact name must be 160 characters or fewer.'),
  phone: nullableText(60, 'Phone must be 60 characters or fewer.'),
  email: nullableText(200, 'Email must be 200 characters or fewer.'),
  website: nullableText(300, 'Website must be 300 characters or fewer.'),
  city: nullableText(120, 'City must be 120 characters or fewer.'),
  state: nullableText(120, 'State must be 120 characters or fewer.'),
  country: nullableText(120, 'Country must be 120 characters or fewer.'),
  industry: nullableText(160, 'Industry must be 160 characters or fewer.'),
  recommendedService: nullableText(
    200,
    'Recommended service must be 200 characters or fewer.',
  ),
  leadScore: yup
    .number()
    .transform((value, original) => (original === '' ? null : value))
    .integer('Lead score must be a whole number.')
    .min(0, 'Lead score must be 0 or more.')
    .max(100, 'Lead score must be 100 or less.')
    .nullable(),
  temperature: yup.string().oneOf(DISCOVERY_TEMPERATURES, 'Choose a valid temperature.'),
  confidence: yup
    .number()
    .transform((value, original) => (original === '' ? null : value))
    .integer('Confidence must be a whole number.')
    .min(0, 'Confidence must be 0 or more.')
    .max(100, 'Confidence must be 100 or less.')
    .nullable(),
  reason: nullableText(2_000, 'Reason must be 2,000 characters or fewer.'),
  pitch: nullableText(2_000, 'Pitch must be 2,000 characters or fewer.'),
  callingApproach: nullableText(
    2_000,
    'Calling approach must be 2,000 characters or fewer.',
  ),
  nextAction: nullableText(500, 'Next action must be 500 characters or fewer.'),
  qualificationQuestions: yup
    .array()
    .of(yup.string().trim().min(1).max(300))
    .max(12, 'Keep at most 12 qualification questions.')
    .transform((value) => (Array.isArray(value) ? value : []))
    .default([]),
});

export const discoveryReviewSchema = yup.object({
  action: yup
    .string()
    .oneOf(DISCOVERY_REVIEW_ACTIONS, 'Choose a valid review action.')
    .required('Choose a review action.'),
  note: nullableText(2_000, 'Note must be 2,000 characters or fewer.'),
  assignedUserId: uuidField('Choose a valid workspace member.'),
  duplicateLeadId: uuidField('Choose a valid lead.'),
  values: yup.object().nullable(),
});
