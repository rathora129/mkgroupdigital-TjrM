import * as yup from 'yup';
import { LEAD_PRIORITIES, LEAD_SOURCES } from '@/lib/leads/validation';

export const OPPORTUNITY_STAGES = [
  'discovery',
  'requirements',
  'proposal',
  'negotiation',
  'won',
  'lost',
];

export const OPPORTUNITY_SCOPES = ['open', 'closed', 'all'];

export const OPPORTUNITY_SORTS = [
  'created',
  'updated',
  'value',
  'closeDate',
  'stage',
  'followUp',
];

export const DISCOVERY_STATUSES = ['draft', 'in_review', 'approved', 'archived'];

export const REQUIREMENT_ITEM_STATUSES = [
  'requested',
  'in_review',
  'confirmed',
  'deferred',
];

export const DISCOVERY_FIELDS = [
  'companyOverview',
  'industry',
  'businessModel',
  'challenges',
  'websitePresence',
  'technologyRequirements',
  'marketingRequirements',
  'financeRequirements',
  'complianceRequirements',
  'expectedOutcomes',
  'budgetRange',
  'timeline',
  'specialRequirements',
  'internalNotes',
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

export function isUuid(value) {
  return typeof value === 'string' && UUID_RE.test(value);
}

const uuidField = (message) =>
  yup
    .mixed()
    .nullable()
    .test(
      'uuid',
      message,
      (value) => value === undefined || value === null || isUuid(value),
    );

const dateField = (message) =>
  yup
    .date()
    .transform((value, original) => (original === '' ? null : value))
    .typeError(message)
    .nullable();

const valueField = yup
  .number()
  .transform((value, original) => (original === '' ? null : value))
  .integer('Use whole currency units.')
  .min(0, 'Expected value cannot be negative.')
  .max(1_000_000_000_000, 'That value is too large.')
  .nullable();

const currencyField = yup
  .string()
  .trim()
  .uppercase()
  .matches(/^[A-Z]{3}$/, 'Use a three-letter currency code.');

const titleField = yup
  .string()
  .trim()
  .min(2, 'Opportunity title must be at least 2 characters.')
  .max(200, 'Opportunity title must be 200 characters or fewer.');

const summaryField = nullableText(
  5_000,
  'Summary must be 5,000 characters or fewer.',
);

export const opportunityCreateSchema = yup.object({
  leadId: yup
    .string()
    .uuid('Choose a lead.')
    .required('Choose the lead this opportunity belongs to.'),
  title: titleField.required('Opportunity title is required.'),
  priority: yup
    .string()
    .oneOf(LEAD_PRIORITIES, 'Choose a valid priority.')
    .default('medium'),
  source: yup
    .string()
    .oneOf(LEAD_SOURCES, 'Choose a valid source.')
    .default('other'),
  expectedValueCents: valueField,
  currency: currencyField.default('INR'),
  expectedCloseDate: dateField('Enter a valid expected close date.'),
  nextFollowUpAt: dateField('Enter a valid follow-up date.'),
  ownerUserId: uuidField('Choose a workspace member.'),
  summary: summaryField,
});

export const opportunityUpdateSchema = yup.object({
  title: titleField,
  priority: yup.string().oneOf(LEAD_PRIORITIES, 'Choose a valid priority.'),
  source: yup.string().oneOf(LEAD_SOURCES, 'Choose a valid source.'),
  expectedValueCents: valueField,
  currency: currencyField,
  expectedCloseDate: dateField('Enter a valid expected close date.'),
  nextFollowUpAt: dateField('Enter a valid follow-up date.'),
  summary: summaryField,
});

export const opportunityStageSchema = yup.object({
  stage: yup
    .string()
    .oneOf(OPPORTUNITY_STAGES, 'Choose a valid stage.')
    .required('Choose a stage.'),
  note: nullableText(500, 'Note must be 500 characters or fewer.'),
  lostReason: nullableText(1_000, 'Lost reason must be 1,000 characters or fewer.'),
});

export const opportunityAssignSchema = yup.object({
  ownerUserId: yup
    .mixed()
    .defined('Choose a member or unassign the opportunity.')
    .nullable()
    .test(
      'owner',
      'Choose a workspace member.',
      (value) => value === null || isUuid(value),
    ),
});

export const opportunityNoteSchema = yup.object({
  body: yup
    .string()
    .trim()
    .min(2, 'Note must be at least 2 characters.')
    .max(5_000, 'Note must be 5,000 characters or fewer.')
    .required('Write a note.'),
});

const discoveryText = (max) =>
  nullableText(max, `This field must be ${max.toLocaleString('en-US')} characters or fewer.`);

export const discoverySchema = yup.object({
  status: yup
    .string()
    .oneOf(DISCOVERY_STATUSES, 'Choose a valid status.')
    .default('draft'),
  companyOverview: discoveryText(4_000),
  industry: discoveryText(500),
  businessModel: discoveryText(2_000),
  challenges: discoveryText(4_000),
  websitePresence: discoveryText(2_000),
  technologyRequirements: discoveryText(4_000),
  marketingRequirements: discoveryText(4_000),
  financeRequirements: discoveryText(4_000),
  complianceRequirements: discoveryText(4_000),
  expectedOutcomes: discoveryText(4_000),
  budgetRange: discoveryText(500),
  timeline: discoveryText(1_000),
  specialRequirements: discoveryText(4_000),
  internalNotes: discoveryText(5_000),
});

export const requirementItemCreateSchema = yup.object({
  serviceId: uuidField('Choose a service from the catalogue.'),
  name: yup
    .string()
    .trim()
    .min(2, 'Requirement name must be at least 2 characters.')
    .max(200, 'Requirement name must be 200 characters or fewer.')
    .required('Requirement name is required.'),
  description: nullableText(
    2_000,
    'Description must be 2,000 characters or fewer.',
  ),
  priority: yup
    .string()
    .oneOf(LEAD_PRIORITIES, 'Choose a valid priority.')
    .default('medium'),
  status: yup
    .string()
    .oneOf(REQUIREMENT_ITEM_STATUSES, 'Choose a valid status.')
    .default('requested'),
});

export const requirementItemUpdateSchema = yup.object({
  serviceId: uuidField('Choose a service from the catalogue.'),
  name: yup
    .string()
    .trim()
    .min(2, 'Requirement name must be at least 2 characters.')
    .max(200, 'Requirement name must be 200 characters or fewer.'),
  description: nullableText(
    2_000,
    'Description must be 2,000 characters or fewer.',
  ),
  priority: yup.string().oneOf(LEAD_PRIORITIES, 'Choose a valid priority.'),
  status: yup
    .string()
    .oneOf(REQUIREMENT_ITEM_STATUSES, 'Choose a valid status.'),
});

export const opportunityAiDraftSchema = yup.object({
  instruction: nullableText(
    1_000,
    'Instruction must be 1,000 characters or fewer.',
  ),
});

export const opportunityQuerySchema = yup.object({
  page: yup.number().integer().min(1).default(1),
  pageSize: yup.number().integer().min(1).max(100).default(20),
  search: yup
    .string()
    .trim()
    .transform(emptyToNull)
    .max(120, 'Search is too long.')
    .nullable(),
  stage: yup.string().oneOf(OPPORTUNITY_STAGES),
  owner: yup
    .string()
    .trim()
    .test(
      'owner-filter',
      'Choose a member.',
      (value) => !value || value === 'me' || value === 'unassigned' || isUuid(value),
    ),
  leadId: yup.string().uuid('Choose a valid lead.'),
  scope: yup
    .string()
    .oneOf(OPPORTUNITY_SCOPES, 'Choose a valid scope.')
    .default('open'),
  sort: yup
    .string()
    .oneOf(OPPORTUNITY_SORTS, 'Choose a valid sort.')
    .default('created'),
  direction: yup.string().oneOf(['asc', 'desc']).default('desc'),
  due: yup.string().oneOf(['overdue', 'upcoming']),
});
