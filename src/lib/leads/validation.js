import * as yup from 'yup';

export const LEAD_STATUSES = [
  'new',
  'researching',
  'qualified',
  'contacted',
  'follow_up',
  'meeting',
  'proposal',
  'won',
  'lost',
];

export const LEAD_STATUS_LABELS = {
  new: 'New',
  researching: 'Researching',
  qualified: 'Qualified',
  contacted: 'Contacted',
  follow_up: 'Follow-up',
  meeting: 'Meeting scheduled',
  proposal: 'Proposal',
  won: 'Won',
  lost: 'Lost',
};

export const LEAD_PRIORITIES = ['low', 'medium', 'high', 'urgent'];

// Phase 2I adds explicit attribution for the two new acquisition channels.
export const LEAD_SOURCES = [
  'website',
  'referral',
  'outbound',
  'inbound',
  'event',
  'social',
  'partner',
  'cold_call',
  'owner_import',
  'ai_discovery',
  'manual_entry',
  'integration',
  'other',
];

export const LEAD_SOURCE_LABELS = {
  website: 'Website',
  referral: 'Referral',
  outbound: 'Outbound',
  inbound: 'Inbound',
  event: 'Event',
  social: 'Social',
  partner: 'Partner',
  cold_call: 'Cold call',
  owner_import: 'Owner import',
  ai_discovery: 'AI discovery',
  manual_entry: 'Manual entry',
  integration: 'Integration',
  other: 'Other',
};

export const LEAD_ARCHIVE_FILTERS = ['active', 'archived', 'all'];
export const LEAD_SORTS = [
  'created',
  'updated',
  'company',
  'value',
  'followUp',
  'priority',
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

const companyNameField = yup
  .string()
  .trim()
  .min(1, 'Company name is required.')
  .max(160, 'Company name must be 160 characters or fewer.');

const emailField = yup
  .string()
  .trim()
  .transform(emptyToNull)
  .email('Enter a valid email address.')
  .max(200, 'Email must be 200 characters or fewer.')
  .nullable();

const websiteField = nullableText(
  300,
  'Website must be 300 characters or fewer.',
);

const estimatedValueField = yup
  .number()
  .transform((value, original) => (original === '' ? null : value))
  .integer('Use whole currency units.')
  .min(0, 'Estimated value cannot be negative.')
  .max(1_000_000_000_000, 'That value is too large.')
  .nullable();

const currencyField = yup
  .string()
  .trim()
  .uppercase()
  .matches(/^[A-Z]{3}$/, 'Use a three-letter currency code.')
  .default('INR');

const followUpField = yup
  .date()
  .transform((value, original) => (original === '' ? null : value))
  .typeError('Enter a valid follow-up date.')
  .nullable();

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value) {
  return typeof value === 'string' && UUID_RE.test(value);
}

const uuidField = (message) =>
  nullableText(36, message).test(
    'uuid',
    message,
    (value) => value == null || value === '' || isUuid(value),
  );

const assignmentField = yup
  .mixed()
  .nullable()
  .test(
    'assignee',
    'Choose a workspace member.',
    (value) =>
      value === undefined ||
      value === null ||
      (typeof value === 'string' && UUID_RE.test(value)),
  );

const notesField = nullableText(5_000, 'Notes must be 5,000 characters or fewer.');

export const leadCreateSchema = yup.object({
  companyName: companyNameField.required('Company name is required.'),
  contactName: nullableText(160, 'Contact name must be 160 characters or fewer.'),
  email: emailField,
  phone: nullableText(60, 'Phone must be 60 characters or fewer.'),
  website: websiteField,
  industry: nullableText(120, 'Industry must be 120 characters or fewer.'),
  businessType: nullableText(120, 'Business type must be 120 characters or fewer.'),
  location: nullableText(160, 'Location must be 160 characters or fewer.'),
  country: nullableText(120, 'Country must be 120 characters or fewer.'),
  source: yup
    .string()
    .oneOf(LEAD_SOURCES, 'Choose a valid source.')
    .default('other'),
  estimatedValueCents: estimatedValueField,
  currency: currencyField,
  assignedUserId: assignmentField,
  priority: yup
    .string()
    .oneOf(LEAD_PRIORITIES, 'Choose a valid priority.')
    .default('medium'),
  status: yup
    .string()
    .oneOf(LEAD_STATUSES, 'Choose a valid status.')
    .default('new'),
  nextFollowUpAt: followUpField,
  notes: notesField,
  requirementsInitial: nullableText(
    5_000,
    'Initial requirement must be 5,000 characters or fewer.',
  ),
  requirementsDetailed: nullableText(
    10_000,
    'Detailed requirement must be 10,000 characters or fewer.',
  ),
  nextAction: nullableText(500, 'Next action must be 500 characters or fewer.'),
});

const reportedMoneyField = yup
  .number()
  .transform((value, original) => (original === '' || original === null ? null : value))
  .integer('Use whole currency units.')
  .min(0, 'Amount cannot be negative.')
  .max(1_000_000_000_000, 'That amount is too large.')
  .nullable();

export const leadReportedMoneySchema = yup.object({
  reportedAmountReceivedCents: reportedMoneyField,
  reportedOutstandingCents: reportedMoneyField,
  reportedProjectCostCents: reportedMoneyField,
  reportedAmountVerified: yup.boolean(),
});

export const leadUpdateSchema = yup.object({
  companyName: companyNameField,
  contactName: nullableText(160, 'Contact name must be 160 characters or fewer.'),
  email: emailField,
  phone: nullableText(60, 'Phone must be 60 characters or fewer.'),
  website: websiteField,
  industry: nullableText(120, 'Industry must be 120 characters or fewer.'),
  businessType: nullableText(120, 'Business type must be 120 characters or fewer.'),
  location: nullableText(160, 'Location must be 160 characters or fewer.'),
  country: nullableText(120, 'Country must be 120 characters or fewer.'),
  source: yup.string().oneOf(LEAD_SOURCES, 'Choose a valid source.'),
  estimatedValueCents: estimatedValueField,
  currency: yup
    .string()
    .trim()
    .uppercase()
    .matches(/^[A-Z]{3}$/, 'Use a three-letter currency code.'),
  priority: yup.string().oneOf(LEAD_PRIORITIES, 'Choose a valid priority.'),
  nextFollowUpAt: followUpField,
  notes: notesField,
  requirementsInitial: nullableText(
    5_000,
    'Initial requirement must be 5,000 characters or fewer.',
  ),
  requirementsDetailed: nullableText(
    10_000,
    'Detailed requirement must be 10,000 characters or fewer.',
  ),
  nextAction: nullableText(500, 'Next action must be 500 characters or fewer.'),
});

export const leadCallSchema = yup.object({
  outcome: yup
    .string()
    .oneOf(
      ['connected', 'no_answer', 'busy', 'wrong_number', 'callback', 'not_interested', 'interested'],
      'Choose a valid call outcome.',
    )
    .required('Choose a call outcome.'),
  notes: nullableText(5_000, 'Call notes must be 5,000 characters or fewer.'),
  requirements: nullableText(
    10_000,
    'Requirement notes must be 10,000 characters or fewer.',
  ),
  nextFollowUpAt: followUpField,
  nextAction: nullableText(500, 'Next action must be 500 characters or fewer.'),
});

export const leadFollowUpSchema = yup.object({
  title: yup
    .string()
    .trim()
    .min(2, 'Give the follow-up a short title.')
    .max(200, 'Title must be 200 characters or fewer.')
    .required('Give the follow-up a short title.'),
  notes: nullableText(2_000, 'Notes must be 2,000 characters or fewer.'),
  dueDate: yup
    .date()
    .typeError('Enter a valid due date.')
    .required('Choose a due date.'),
  dueTime: yup
    .string()
    .trim()
    .matches(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use a 24-hour time like 14:30.')
    .nullable()
    .default(null),
  timezone: nullableText(80, 'Timezone must be 80 characters or fewer.'),
  priority: yup
    .string()
    .oneOf(LEAD_PRIORITIES, 'Choose a valid priority.')
    .default('medium'),
  ownerUserId: yup
    .string()
    .trim()
    .test('owner', 'Choose a workspace member.', (value) =>
      value === undefined || value === null || UUID_RE.test(value),
    ),
  taskType: yup
    .string()
    .oneOf(['callback', 'follow_up', 'meeting', 'proposal', 'payment', 'task'])
    .default('follow_up'),
});

export const leadStatusSchema = yup.object({
  status: yup
    .string()
    .oneOf(LEAD_STATUSES, 'Choose a valid status.')
    .required('Choose a status.'),
  note: nullableText(500, 'Note must be 500 characters or fewer.'),
});

export const leadAssignSchema = yup.object({
  assignedUserId: yup
    .mixed()
    .defined('Choose a member or unassign.')
    .nullable()
    .test(
      'assignee',
      'Choose a workspace member.',
      (value) => value === null || (typeof value === 'string' && UUID_RE.test(value)),
    ),
});

export const leadNoteSchema = yup.object({
  body: yup
    .string()
    .trim()
    .min(2, 'Note must be at least 2 characters.')
    .max(5_000, 'Note must be 5,000 characters or fewer.')
    .required('Write a note.'),
});

export const leadArchiveSchema = yup.object({
  archived: yup.boolean().required('Choose archive or restore.'),
});

export const leadQuerySchema = yup.object({
  page: yup.number().integer().min(1).default(1),
  pageSize: yup.number().integer().min(1).max(100).default(20),
  search: yup
    .string()
    .trim()
    .transform(emptyToNull)
    .max(120, 'Search is too long.')
    .nullable(),
  status: yup.string().oneOf(LEAD_STATUSES),
  priority: yup.string().oneOf(LEAD_PRIORITIES),
  source: yup.string().oneOf(LEAD_SOURCES),
  temperature: yup.string().oneOf(['hot', 'warm', 'cold', 'unknown']),
  assigned: yup
    .string()
    .trim()
    .test(
      'assigned-filter',
      'Choose a member.',
      (value) =>
        !value ||
        value === 'me' ||
        value === 'unassigned' ||
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          value,
        ),
    ),
  archived: yup
    .string()
    .oneOf(LEAD_ARCHIVE_FILTERS, 'Choose a valid archive filter.')
    .default('active'),
  sort: yup
    .string()
    .oneOf(LEAD_SORTS, 'Choose a valid sort.')
    .default('created'),
  direction: yup.string().oneOf(['asc', 'desc']).default('desc'),
  due: yup.string().oneOf(['overdue', 'upcoming']),
});

export const LEAD_IMPORT_SOURCES = ['paste', 'file'];

const importMappingField = yup
  .object()
  .nullable()
  .test('mapping', 'Choose valid columns for the import.', (value) => {
    if (!value) return true;
    return Object.entries(value).every(
      ([key, index]) =>
        typeof key === 'string' && Number.isInteger(index) && index >= 0,
    );
  });

export const leadImportCreateSchema = yup.object({
  text: yup
    .string()
    .required('Paste spreadsheet rows before importing.')
    .max(400_000, 'That import is too large. Split it into smaller batches.'),
  source: yup
    .string()
    .oneOf(LEAD_IMPORT_SOURCES, 'Choose a valid import source.')
    .default('paste'),
  fileName: nullableText(200, 'File name must be 200 characters or fewer.'),
  mapping: importMappingField,
});

export const leadImportCorrectSchema = yup.object({
  corrections: yup
    .array()
    .of(
      yup.object({
        rowId: yup
          .string()
          .trim()
          .matches(UUID_RE, 'Choose a valid import row.')
          .required('Choose a valid import row.'),
        values: yup
          .object()
          .required('Provide corrected values.'),
      }),
    )
    .min(1, 'Change at least one value.')
    .required('Provide row corrections.'),
});

export const leadImportCommitSchema = yup.object({
  confirmRepeat: yup.boolean().default(false),
});

export const leadConversionSchema = yup.object({
  createProject: yup.boolean().default(true),
  projectName: nullableText(200, 'Project name must be 200 characters or fewer.'),
  projectDescription: nullableText(
    4_000,
    'Project description must be 4,000 characters or fewer.',
  ),
  proposalId: uuidField('Choose a valid proposal.'),
  clientNotes: nullableText(2_000, 'Client notes must be 2,000 characters or fewer.'),
});
