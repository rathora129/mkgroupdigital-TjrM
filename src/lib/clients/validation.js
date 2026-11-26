import * as yup from 'yup';
import {
  CLIENT_STATUSES,
  ENGAGEMENT_FREQUENCIES,
  ENGAGEMENT_STATUSES,
  TICKET_CATEGORIES,
  TICKET_MESSAGE_VISIBILITIES,
  TICKET_STATUSES,
  TIMELINE_TYPES,
} from './transitions';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value) {
  return typeof value === 'string' && UUID_RE.test(value);
}

const emptyToNull = (value) =>
  typeof value === 'string' && value.trim() === '' ? null : value;

const nullableText = (max, message) =>
  yup.string().trim().transform(emptyToNull).max(max, message).nullable();

const requiredText = (max, message) =>
  yup
    .string()
    .trim()
    .min(2, message)
    .max(max, message)
    .required(message);

const uuidField = (message) =>
  yup
    .string()
    .trim()
    .transform(emptyToNull)
    .test('uuid', message, (value) => value === undefined || value === null || isUuid(value))
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

const emailField = yup
  .string()
  .trim()
  .transform(emptyToNull)
  .email('Enter a valid email address.')
  .max(254, 'That email is too long.')
  .nullable();

const websiteField = yup
  .string()
  .trim()
  .transform(emptyToNull)
  .test(
    'https-url',
    'Enter a full http(s) address.',
    (value) => !value || /^https?:\/\/[^\s]+$/i.test(value),
  )
  .max(300, 'That address is too long.')
  .nullable();

const moneyField = yup
  .number()
  .transform((value, original) => (original === '' || original === null ? 0 : value))
  .integer('Use whole minor units.')
  .min(0, 'Amount cannot be negative.')
  .max(10_000_000_000, 'That amount is too large.');

const currencyField = yup
  .string()
  .trim()
  .uppercase()
  .matches(/^[A-Z]{3}$/, 'Use a three-letter currency code.')
  .default('INR');

export const clientCreateSchema = yup.object({
  leadId: uuidField('Choose a valid lead.'),
  companyName: requiredText(200, 'Company name must be at least 2 characters.'),
  primaryContactName: nullableText(160, 'Contact name is too long.'),
  email: emailField,
  phone: nullableText(40, 'Phone number is too long.'),
  website: websiteField,
  industry: nullableText(120, 'Industry is too long.'),
  address: nullableText(500, 'Address is too long.'),
  ownerUserId: uuidField('Choose a workspace member.'),
  internalNotes: nullableText(4_000, 'Internal notes are too long.'),
});

export const clientUpdateSchema = yup.object({
  expectedUpdatedAt: yup.string().trim().required('Reload the client before saving.'),
  companyName: requiredText(200, 'Company name must be at least 2 characters.'),
  primaryContactName: nullableText(160, 'Contact name is too long.'),
  email: emailField,
  phone: nullableText(40, 'Phone number is too long.'),
  website: websiteField,
  industry: nullableText(120, 'Industry is too long.'),
  address: nullableText(500, 'Address is too long.'),
  ownerUserId: uuidField('Choose a workspace member.'),
  status: yup.string().oneOf(CLIENT_STATUSES, 'Choose a valid client status.'),
  internalNotes: nullableText(4_000, 'Internal notes are too long.'),
});

export const clientStatusSchema = yup.object({
  status: yup
    .string()
    .oneOf(CLIENT_STATUSES, 'Choose a valid client status.')
    .required('Choose a status.'),
  note: nullableText(1_000, 'Note is too long.'),
});

export const contactCreateSchema = yup.object({
  name: requiredText(160, 'Contact name must be at least 2 characters.'),
  title: nullableText(120, 'Title is too long.'),
  email: emailField,
  phone: nullableText(40, 'Phone number is too long.'),
  isPrimary: yup.boolean().default(false),
  notes: nullableText(2_000, 'Notes are too long.'),
});

export const contactUpdateSchema = contactCreateSchema;

export const timelineEntrySchema = yup.object({
  type: yup.string().oneOf(TIMELINE_TYPES, 'Choose a valid entry type.').default('note'),
  title: requiredText(200, 'Title must be at least 2 characters.'),
  body: nullableText(8_000, 'Detail is too long.'),
  occurredAt: dateField('Enter a valid date.'),
});

export const engagementCreateSchema = yup.object({
  clientId: requiredUuid('Choose a client.'),
  name: requiredText(200, 'Engagement name is required.'),
  serviceId: uuidField('Choose a catalogue service.'),
  proposalId: uuidField('Choose a proposal.'),
  projectId: uuidField('Choose a project.'),
  managerUserId: uuidField('Choose a workspace member.'),
  status: yup.string().oneOf(ENGAGEMENT_STATUSES, 'Choose a valid status.').default('planned'),
  frequency: yup
    .string()
    .oneOf(ENGAGEMENT_FREQUENCIES, 'Choose a valid frequency.')
    .default('monthly'),
  startDate: dateField('Enter a valid start date.'),
  endDate: dateField('Enter a valid end date.'),
  renewalDate: dateField('Enter a valid renewal date.'),
  scopeReference: nullableText(300, 'Scope reference is too long.'),
  contractValueCents: moneyField.default(0),
  currency: currencyField,
  internalNotes: nullableText(4_000, 'Internal notes are too long.'),
});

export const engagementUpdateSchema = engagementCreateSchema.shape({
  expectedUpdatedAt: yup.string().trim().required('Reload the engagement before saving.'),
});

export const engagementStatusSchema = yup.object({
  status: yup
    .string()
    .oneOf(ENGAGEMENT_STATUSES, 'Choose a valid status.')
    .required('Choose a status.'),
  note: nullableText(1_000, 'Note is too long.'),
});

export const ticketCreateSchema = yup.object({
  clientId: requiredUuid('Choose a client.'),
  projectId: uuidField('Choose a project.'),
  subject: requiredText(200, 'Subject must be at least 2 characters.'),
  description: nullableText(8_000, 'Description is too long.'),
  category: yup
    .string()
    .oneOf(TICKET_CATEGORIES, 'Choose a valid category.')
    .default('general'),
  priority: yup
    .string()
    .oneOf(['low', 'medium', 'high', 'urgent'], 'Choose a valid priority.')
    .default('medium'),
  assignedUserId: uuidField('Choose a workspace member.'),
  dueDate: dateField('Enter a valid due date.'),
});

export const ticketUpdateSchema = yup.object({
  expectedUpdatedAt: yup.string().trim().required('Reload the ticket before saving.'),
  subject: requiredText(200, 'Subject must be at least 2 characters.'),
  description: nullableText(8_000, 'Description is too long.'),
  category: yup.string().oneOf(TICKET_CATEGORIES, 'Choose a valid category.'),
  priority: yup.string().oneOf(['low', 'medium', 'high', 'urgent'], 'Choose a valid priority.'),
  assignedUserId: uuidField('Choose a workspace member.'),
  dueDate: dateField('Enter a valid due date.'),
});

export const ticketStatusSchema = yup.object({
  status: yup
    .string()
    .oneOf(TICKET_STATUSES, 'Choose a valid status.')
    .required('Choose a status.'),
  resolutionNotes: nullableText(4_000, 'Resolution notes are too long.'),
});

export const ticketMessageSchema = yup.object({
  body: yup
    .string()
    .trim()
    .min(1, 'Write a message.')
    .max(8_000, 'Messages must be 8,000 characters or fewer.')
    .required('Write a message.'),
  visibility: yup
    .string()
    .oneOf(TICKET_MESSAGE_VISIBILITIES, 'Choose a valid visibility.')
    .default('internal'),
});

export const clientQuerySchema = yup.object({
  page: yup.number().integer().min(1).default(1),
  pageSize: yup.number().integer().min(1).max(100).default(20),
  search: nullableText(120, 'Search is too long.'),
  status: yup.string().oneOf(CLIENT_STATUSES),
  owner: yup
    .string()
    .trim()
    .test(
      'owner-filter',
      'Choose a member.',
      (value) => !value || value === 'me' || value === 'unassigned' || isUuid(value),
    ),
  sort: yup
    .string()
    .oneOf(['created', 'updated', 'name'])
    .default('created'),
  direction: yup.string().oneOf(['asc', 'desc']).default('desc'),
});

export const engagementQuerySchema = yup.object({
  page: yup.number().integer().min(1).default(1),
  pageSize: yup.number().integer().min(1).max(100).default(20),
  search: nullableText(120, 'Search is too long.'),
  clientId: uuidField('Choose a client.'),
  status: yup.string().oneOf(ENGAGEMENT_STATUSES),
  frequency: yup.string().oneOf(ENGAGEMENT_FREQUENCIES),
  renewal: yup.string().oneOf(['due_30', 'due_90']),
});

export const ticketQuerySchema = yup.object({
  page: yup.number().integer().min(1).default(1),
  pageSize: yup.number().integer().min(1).max(100).default(20),
  search: nullableText(120, 'Search is too long.'),
  clientId: uuidField('Choose a client.'),
  status: yup.string().oneOf(TICKET_STATUSES),
  priority: yup.string().oneOf(['low', 'medium', 'high', 'urgent']),
  assignee: yup
    .string()
    .trim()
    .test(
      'assignee-filter',
      'Choose a member.',
      (value) => !value || value === 'me' || value === 'unassigned' || isUuid(value),
    ),
  due: yup.string().oneOf(['overdue', 'today']),
});

export const clientAiBriefSchema = yup.object({
  instruction: nullableText(1_000, 'Instruction is too long.'),
});

export const ticketAiDraftSchema = yup.object({
  instruction: nullableText(1_000, 'Instruction is too long.'),
});
