import * as yup from 'yup';

// Proposal statuses track the state of the current version. "Expired" is
// derived from the validity date and is never stored, so an elapsed validity
// can never rewrite history.
export const PROPOSAL_STATUSES = [
  'draft',
  'internal_review',
  'approved',
  'sent',
  'accepted',
  'rejected',
];

export const PROPOSAL_STATUS_LABELS = {
  draft: 'Draft',
  internal_review: 'In review',
  approved: 'Approved',
  sent: 'Sent',
  accepted: 'Accepted',
  rejected: 'Rejected',
  expired: 'Expired',
};

export const ITEM_KINDS = ['included', 'optional', 'excluded'];

export const DISCOUNT_TYPES = ['none', 'fixed', 'percent'];

export const TAX_SCHEMES = ['none', 'cgst_sgst', 'igst'];

export const BILLING_TYPES = [
  'one_time',
  'monthly',
  'quarterly',
  'annual',
  'milestone',
  'custom',
];

export const RECURRING_BILLING_TYPES = ['monthly', 'quarterly', 'annual'];

// Sections hold free-form narrative. Deliverables and milestones are separate
// structured lists so they keep an order and an expected completion period.
export const SECTION_KEYS = [
  'executiveSummary',
  'businessUnderstanding',
  'objectives',
  'scopeOfWork',
  'servicesIncluded',
  'estimatedTimeline',
  'clientResponsibilities',
  'assumptions',
  'exclusions',
  'dependencies',
  'supportMaintenanceTerms',
  'paymentTerms',
  'validityTerms',
  'additionalNotes',
];

export const SECTION_LABELS = {
  executiveSummary: 'Executive summary',
  businessUnderstanding: 'Client business understanding',
  objectives: 'Objectives',
  scopeOfWork: 'Scope of work',
  servicesIncluded: 'Services included',
  estimatedTimeline: 'Estimated timeline',
  clientResponsibilities: 'Client responsibilities',
  assumptions: 'Assumptions',
  exclusions: 'Exclusions',
  dependencies: 'Dependencies',
  supportMaintenanceTerms: 'Support and maintenance terms',
  paymentTerms: 'Payment terms',
  validityTerms: 'Validity and expiry',
  additionalNotes: 'Additional notes',
};

export const PROPOSAL_SORTS = ['created', 'updated', 'validity', 'value', 'status'];

export const VALIDITY_FILTERS = ['expiring', 'expired'];

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value) {
  return typeof value === 'string' && UUID_RE.test(value);
}

const emptyToNull = (value) =>
  typeof value === 'string' && value.trim() === '' ? null : value;

const nullableText = (max, message) =>
  yup
    .string()
    .trim()
    .transform(emptyToNull)
    .max(max, message)
    .nullable();

const uuidField = (message) =>
  yup
    .string()
    .trim()
    .transform(emptyToNull)
    .test('uuid', message, (value) => value === undefined || value === null || isUuid(value))
    .nullable();

const dateField = (message) =>
  yup
    .date()
    .transform((value, original) => (original === '' ? null : value))
    .typeError(message)
    .nullable();

const integerField = ({ min = 0, max, message }) =>
  yup
    .number()
    .transform((value, original) => (original === '' || original === null ? 0 : value))
    .integer('Use a whole number.')
    .min(min, message)
    .max(max, 'That value is too large.');

const titleField = yup
  .string()
  .trim()
  .min(2, 'Proposal title must be at least 2 characters.')
  .max(200, 'Proposal title must be 200 characters or fewer.');

const currencyField = yup
  .string()
  .trim()
  .uppercase()
  .matches(/^[A-Z]{3}$/, 'Use a three-letter currency code.');

const MAX_MINOR_UNITS = 1_000_000_000_000;
const MAX_QUANTITY = 1_000_000;

export const proposalCreateSchema = yup.object({
  opportunityId: yup
    .string()
    .uuid('Choose an opportunity.')
    .required('Choose the opportunity this proposal belongs to.'),
  title: titleField,
  prefill: yup.boolean().default(true),
  salesOwnerUserId: uuidField('Choose a workspace member.'),
  validityDate: dateField('Enter a valid validity date.'),
});

export const proposalUpdateSchema = yup.object({
  title: titleField,
  salesOwnerUserId: uuidField('Choose a workspace member.'),
});

const lineItemSchema = yup.object({
  id: uuidField('Use a valid line identifier.'),
  serviceId: uuidField('Choose a catalogue service.'),
  name: yup
    .string()
    .trim()
    .min(2, 'Line name must be at least 2 characters.')
    .max(200, 'Line name must be 200 characters or fewer.')
    .required('Enter a name for this line.'),
  description: nullableText(2_000, 'Description must be 2,000 characters or fewer.'),
  scope: nullableText(2_000, 'Scope must be 2,000 characters or fewer.'),
  quantity: integerField({
    min: 1,
    max: MAX_QUANTITY,
    message: 'Quantity must be at least 1.',
  }).default(1),
  unit: yup
    .string()
    .trim()
    .max(40, 'Unit must be 40 characters or fewer.')
    .default('unit'),
  unitPriceCents: integerField({
    min: 0,
    max: MAX_MINOR_UNITS,
    message: 'Unit price cannot be negative.',
  }).default(0),
  discountType: yup
    .string()
    .oneOf(DISCOUNT_TYPES, 'Choose a valid discount type.')
    .default('none'),
  discountValue: integerField({
    min: 0,
    max: MAX_MINOR_UNITS,
    message: 'Discount cannot be negative.',
  })
    .default(0)
    .when('discountType', {
      is: 'percent',
      then: (schema) =>
        schema.max(10_000, 'A percentage discount cannot exceed 100%.'),
    }),
  taxScheme: yup
    .string()
    .oneOf(TAX_SCHEMES, 'Choose a valid tax treatment.')
    .default('none'),
  taxRateBps: integerField({
    min: 0,
    max: 10_000,
    message: 'Tax rate must be between 0 and 100%.',
  }).default(0),
  billingType: yup
    .string()
    .oneOf(BILLING_TYPES, 'Choose a valid billing type.')
    .default('one_time'),
  startCondition: nullableText(500, 'Start condition must be 500 characters or fewer.'),
  billingNotes: nullableText(1_000, 'Billing notes must be 1,000 characters or fewer.'),
  minimumCommitmentMonths: yup
    .number()
    .transform((value, original) => (original === '' || original === null ? null : value))
    .integer('Use a whole number of months.')
    .min(0, 'Minimum commitment cannot be negative.')
    .max(120, 'Minimum commitment must be 120 months or fewer.')
    .nullable(),
  kind: yup
    .string()
    .oneOf(ITEM_KINDS, 'Choose how this line is presented.')
    .default('included'),
});

const deliverableSchema = yup.object({
  id: uuidField('Use a valid identifier.'),
  serviceId: uuidField('Choose a catalogue service.'),
  title: yup
    .string()
    .trim()
    .min(2, 'Title must be at least 2 characters.')
    .max(200, 'Title must be 200 characters or fewer.')
    .required('Enter a title.'),
  description: nullableText(2_000, 'Description must be 2,000 characters or fewer.'),
  expectedCompletion: nullableText(
    120,
    'Expected completion must be 120 characters or fewer.',
  ),
  displayOrder: integerField({
    min: 0,
    max: 10_000,
    message: 'Order cannot be negative.',
  }).default(0),
});

const sectionsSchema = yup.object(
  Object.fromEntries(
    SECTION_KEYS.map((key) => [
      key,
      nullableText(20_000, 'This section must be 20,000 characters or fewer.'),
    ]),
  ),
);

export const versionContentSchema = yup.object({
  expectedUpdatedAt: yup
    .string()
    .trim()
    .required('Reload the proposal before saving again.'),
  changeSummary: nullableText(500, 'Change summary must be 500 characters or fewer.'),
  currency: currencyField.default('INR'),
  validityDate: dateField('Enter a valid validity date.'),
  proposalDiscountType: yup
    .string()
    .oneOf(DISCOUNT_TYPES, 'Choose a valid discount type.')
    .default('none'),
  proposalDiscountValue: integerField({
    min: 0,
    max: MAX_MINOR_UNITS,
    message: 'Discount cannot be negative.',
  })
    .default(0)
    .when('proposalDiscountType', {
      is: 'percent',
      then: (schema) =>
        schema.max(10_000, 'A percentage discount cannot exceed 100%.'),
    }),
  items: yup.array().of(lineItemSchema).max(200, 'A proposal can hold 200 lines or fewer.'),
  sections: sectionsSchema,
  deliverables: yup
    .array()
    .of(deliverableSchema)
    .max(100, 'A proposal can hold 100 deliverables or fewer.'),
  milestones: yup
    .array()
    .of(deliverableSchema)
    .max(100, 'A proposal can hold 100 milestones or fewer.'),
});

export const approvalDecisionSchema = yup.object({
  decision: yup
    .string()
    .oneOf(['approved', 'changes_requested'], 'Choose a valid decision.')
    .required('Choose a decision.'),
  notes: nullableText(2_000, 'Notes must be 2,000 characters or fewer.'),
});

export const proposalResponseSchema = yup.object({
  response: yup
    .string()
    .oneOf(['accepted', 'rejected'], 'Record whether the client accepted or rejected.')
    .required('Choose a response.'),
  notes: nullableText(1_000, 'Notes must be 1,000 characters or fewer.'),
});

export const proposalVersionCreateSchema = yup.object({
  changeSummary: nullableText(500, 'Change summary must be 500 characters or fewer.'),
});

export const proposalAiDraftSchema = yup.object({
  instruction: nullableText(1_000, 'Instruction must be 1,000 characters or fewer.'),
});

export const proposalQuerySchema = yup.object({
  page: yup.number().integer().min(1).default(1),
  pageSize: yup.number().integer().min(1).max(100).default(20),
  search: yup
    .string()
    .trim()
    .transform(emptyToNull)
    .max(120, 'Search is too long.')
    .nullable(),
  status: yup.string().oneOf(PROPOSAL_STATUSES),
  opportunityId: yup.string().uuid('Choose a valid opportunity.'),
  owner: yup
    .string()
    .trim()
    .test(
      'owner-filter',
      'Choose a member.',
      (value) =>
        !value || value === 'me' || value === 'unassigned' || isUuid(value),
    ),
  validity: yup.string().oneOf(VALIDITY_FILTERS),
  sort: yup
    .string()
    .oneOf(PROPOSAL_SORTS, 'Choose a valid sort.')
    .default('created'),
  direction: yup.string().oneOf(['asc', 'desc']).default('desc'),
});
