import * as yup from 'yup';
import { TASK_PRIORITIES } from '@/lib/projects/transitions';

export const CALL_OUTCOMES = [
  'connected',
  'interested',
  'callback_requested',
  'no_answer',
  'busy',
  'voicemail',
  'wrong_number',
  'not_interested',
];

export const CALL_OUTCOME_META = {
  connected: { label: 'Connected', tone: 'success', countsAsContact: true },
  interested: { label: 'Interested', tone: 'success', countsAsContact: true },
  callback_requested: {
    label: 'Callback requested',
    tone: 'info',
    countsAsContact: true,
  },
  no_answer: { label: 'No answer', tone: 'muted', countsAsContact: false },
  busy: { label: 'Busy', tone: 'muted', countsAsContact: false },
  voicemail: { label: 'Voicemail', tone: 'muted', countsAsContact: false },
  wrong_number: {
    label: 'Wrong number',
    tone: 'warning',
    countsAsContact: false,
  },
  not_interested: {
    label: 'Not interested',
    tone: 'danger',
    countsAsContact: true,
  },
};

export const FOLLOW_UP_TASK_TYPE = 'follow_up';

const emptyToNull = (value) =>
  typeof value === 'string' && value.trim() === '' ? null : value;

const nullableText = (max, message) =>
  yup
    .string()
    .trim()
    .transform(emptyToNull)
    .max(max, message)
    .nullable();

const dateField = (message) =>
  yup
    .date()
    .transform((value, original) => (original === '' ? null : value))
    .typeError(message)
    .nullable();

const uuidField = (message) =>
  yup
    .string()
    .trim()
    .transform(emptyToNull)
    .test(
      'uuid',
      message,
      (value) =>
        value == null ||
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          value,
        ),
    )
    .nullable();

function isValidTimezone(value) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

const timezoneField = yup
  .string()
  .trim()
  .transform(emptyToNull)
  .max(80, 'Timezone must be 80 characters or fewer.')
  .test('valid-timezone', 'Choose a valid timezone.', (value) =>
    value == null ? true : isValidTimezone(value),
  )
  .nullable();

const timeField = yup
  .string()
  .trim()
  .transform(emptyToNull)
  .matches(/^([01]\d|2[0-3]):[0-5]\d$/, {
    message: 'Choose a time in 24-hour HH:MM format.',
    excludeEmptyString: true,
  })
  .nullable();

export const callLogSchema = yup.object({
  outcome: yup
    .string()
    .oneOf(CALL_OUTCOMES, 'Choose a valid call outcome.')
    .required('Choose the call outcome.'),
  summary: nullableText(2_000, 'Call notes must be 2,000 characters or fewer.'),
  durationSeconds: yup
    .number()
    .transform((value, original) =>
      original === '' || original == null ? 0 : value,
    )
    .integer('Duration must be a whole number of seconds.')
    .min(0, 'Duration cannot be negative.')
    .max(86_400, 'Duration must be under 24 hours.')
    .default(0),
  followUpAt: dateField('Enter a valid follow-up date.'),
  followUpTime: timeField,
  timezone: timezoneField,
  nextAction: nullableText(300, 'Next action must be 300 characters or fewer.'),
  createFollowUpTask: yup.boolean().default(true),
});

export const followUpTaskSchema = yup.object({
  title: nullableText(200, 'Title must be 200 characters or fewer.'),
  description: nullableText(2_000, 'Notes must be 2,000 characters or fewer.'),
  dueDate: dateField('Enter a valid follow-up date.').required(
    'Choose when to follow up.',
  ),
  dueTime: timeField,
  timezone: timezoneField,
  priority: yup
    .string()
    .oneOf(TASK_PRIORITIES, 'Choose a valid priority.')
    .default('medium'),
  ownerUserId: uuidField('Choose a workspace member.'),
});

export const MEETING_STATUSES = ['scheduled', 'rescheduled', 'completed', 'cancelled'];

export const meetingCreateSchema = yup.object({
  title: yup
    .string()
    .trim()
    .min(2, 'Title must be at least 2 characters.')
    .max(200, 'Title must be 200 characters or fewer.')
    .required('Title is required.'),
  leadId: uuidField('Choose a valid lead.'),
  clientId: uuidField('Choose a valid client.'),
  projectId: uuidField('Choose a valid project.'),
  startsAt: yup
    .date()
    .typeError('Enter a valid start time.')
    .required('Choose when the meeting starts.'),
  endsAt: yup
    .date()
    .typeError('Enter a valid end time.')
    .required('Choose when the meeting ends.'),
  timezone: yup
    .string()
    .trim()
    .max(80)
    .test('valid-timezone', 'Choose a valid timezone.', (value) =>
      value == null ? true : isValidTimezone(value),
    )
    .default('UTC'),
  location: nullableText(300, 'Location must be 300 characters or fewer.'),
  agenda: nullableText(4_000, 'Agenda must be 4,000 characters or fewer.'),
  notes: nullableText(4_000, 'Notes must be 4,000 characters or fewer.'),
  attendees: yup
    .array()
    .of(
      yup
        .string()
        .trim()
        .max(254)
        .test('attendee-email', 'Enter a valid email address.', (value) =>
          value == null || value === '' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value),
        ),
    )
    .transform((value) =>
      Array.isArray(value) ? value.filter((item) => item && item.trim()) : [],
    )
    .max(50, 'A meeting can list at most 50 attendees.')
    .default([]),
  syncCalendar: yup.boolean().default(false),
});

export const meetingUpdateSchema = yup.object({
  status: yup
    .string()
    .oneOf(MEETING_STATUSES, 'Choose a valid meeting status.')
    .required('Choose a meeting status.'),
  notes: nullableText(4_000, 'Notes must be 4,000 characters or fewer.'),
  outcome: nullableText(2_000, 'Outcome must be 2,000 characters or fewer.'),
});

export const meetingQuerySchema = yup.object({
  page: yup.number().integer().min(1).default(1),
  pageSize: yup.number().integer().min(1).max(100).default(20),
  status: yup.string().oneOf(MEETING_STATUSES),
  upcoming: yup.boolean().default(false),
  search: nullableText(120, 'Search is too long.'),
});
