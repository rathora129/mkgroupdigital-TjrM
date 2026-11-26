import * as yup from 'yup';
import {
  CLIENT_APPROVAL_STATUSES,
  MILESTONE_REVIEW_STATUSES,
  PROJECT_STATUSES,
  SCOPE_CHANGE_STATUSES,
  TASK_PRIORITIES,
  TASK_STATUSES,
} from './transitions';

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

const uuidList = (max = 50) =>
  yup
    .array()
    .of(yup.string().uuid('Choose a workspace member.'))
    .max(max, `Choose ${max} people or fewer.`)
    .default([]);

export const projectCreateSchema = yup.object({
  proposalId: yup
    .string()
    .uuid('Choose an accepted proposal.')
    .required('Choose the accepted proposal this project delivers.'),
  name: nullableText(200, 'Project name must be 200 characters or fewer.'),
  ownerUserId: uuidField('Choose a workspace member.'),
  priority: yup
    .string()
    .oneOf(TASK_PRIORITIES, 'Choose a valid priority.')
    .default('medium'),
  startDate: dateField('Enter a valid start date.'),
  expectedCompletionDate: dateField('Enter a valid completion date.'),
  description: nullableText(4_000, 'Description must be 4,000 characters or fewer.'),
  internalNotes: nullableText(4_000, 'Internal notes must be 4,000 characters or fewer.'),
  memberUserIds: uuidList(),
});

export const projectUpdateSchema = yup.object({
  expectedUpdatedAt: yup
    .string()
    .trim()
    .required('Reload the project before saving again.'),
  name: requiredText(200, 'Project name must be at least 2 characters.'),
  ownerUserId: uuidField('Choose a workspace member.'),
  priority: yup.string().oneOf(TASK_PRIORITIES, 'Choose a valid priority.'),
  startDate: dateField('Enter a valid start date.'),
  expectedCompletionDate: dateField('Enter a valid completion date.'),
  description: nullableText(4_000, 'Description must be 4,000 characters or fewer.'),
  internalNotes: nullableText(4_000, 'Internal notes must be 4,000 characters or fewer.'),
  clientId: uuidField('Choose a client record.'),
  memberUserIds: uuidList(),
});

export const projectStatusSchema = yup.object({
  status: yup
    .string()
    .oneOf(PROJECT_STATUSES, 'Choose a valid project status.')
    .required('Choose the new status.'),
  note: nullableText(1_000, 'Note must be 1,000 characters or fewer.'),
});

const taskBase = {
  title: requiredText(200, 'Task title must be at least 2 characters.'),
  description: nullableText(4_000, 'Description must be 4,000 characters or fewer.'),
  priority: yup.string().oneOf(TASK_PRIORITIES, 'Choose a valid priority.'),
  ownerUserId: uuidField('Choose a workspace member.'),
  startDate: dateField('Enter a valid start date.'),
  dueDate: dateField('Enter a valid due date.'),
  estimatedMinutes: integerField({
    min: 0,
    max: 10_000_000,
    message: 'Estimated effort cannot be negative.',
  }),
  actualMinutes: integerField({
    min: 0,
    max: 10_000_000,
    message: 'Actual effort cannot be negative.',
  }),
  collaboratorUserIds: uuidList(),
  dependsOnTaskIds: uuidList(30),
  acceptanceCriteria: nullableText(
    4_000,
    'Acceptance criteria must be 4,000 characters or fewer.',
  ),
  completionEvidence: nullableText(
    4_000,
    'Completion evidence must be 4,000 characters or fewer.',
  ),
};

export const taskCreateSchema = yup.object({
  ...taskBase,
  status: yup
    .string()
    .oneOf(['todo', 'in_progress'], 'New tasks start as To do or In progress.')
    .default('todo'),
  priority: taskBase.priority.default('medium'),
  estimatedMinutes: taskBase.estimatedMinutes.default(0),
  actualMinutes: taskBase.actualMinutes.default(0),
});

export const taskUpdateSchema = yup.object({
  ...taskBase,
  expectedUpdatedAt: yup
    .string()
    .trim()
    .required('Reload the task before saving again.'),
  status: yup.string().oneOf(TASK_STATUSES, 'Choose a valid task status.'),
  title: taskBase.title,
  priority: taskBase.priority,
});

export const taskCommentSchema = yup.object({
  body: yup
    .string()
    .trim()
    .min(1, 'Write a comment.')
    .max(4_000, 'Comments must be 4,000 characters or fewer.')
    .required('Write a comment.'),
});

const trackableBase = {
  title: requiredText(200, 'Title must be at least 2 characters.'),
  description: nullableText(4_000, 'Description must be 4,000 characters or fewer.'),
  targetDate: dateField('Enter a valid target date.'),
  completionDate: dateField('Enter a valid completion date.'),
  ownerUserId: uuidField('Choose a workspace member.'),
  reviewStatus: yup.string().oneOf(MILESTONE_REVIEW_STATUSES, 'Choose a valid review status.'),
  clientApprovalStatus: yup
    .string()
    .oneOf(CLIENT_APPROVAL_STATUSES, 'Choose a valid client approval state.'),
  evidenceNotes: nullableText(4_000, 'Evidence notes must be 4,000 characters or fewer.'),
};

export const milestoneCreateSchema = yup.object({
  ...trackableBase,
  reviewStatus: trackableBase.reviewStatus.default('pending'),
  clientApprovalStatus: trackableBase.clientApprovalStatus.default('not_requested'),
});

export const milestoneUpdateSchema = yup.object(trackableBase);

export const deliverableCreateSchema = yup.object({
  ...trackableBase,
  reviewStatus: trackableBase.reviewStatus.default('pending'),
  clientApprovalStatus: trackableBase.clientApprovalStatus.default('not_requested'),
});

export const deliverableUpdateSchema = yup.object(trackableBase);

export const scopeChangeCreateSchema = yup.object({
  title: requiredText(200, 'Title must be at least 2 characters.'),
  description: nullableText(4_000, 'Description must be 4,000 characters or fewer.'),
  impactNotes: nullableText(4_000, 'Impact notes must be 4,000 characters or fewer.'),
});

export const scopeChangeDecisionSchema = yup.object({
  status: yup
    .string()
    .oneOf(
      SCOPE_CHANGE_STATUSES.filter((value) => value !== 'requested'),
      'Choose a valid decision.',
    )
    .required('Choose a decision.'),
  decisionNotes: nullableText(2_000, 'Decision notes must be 2,000 characters or fewer.'),
});

export const projectAiDraftSchema = yup.object({
  instruction: nullableText(1_000, 'Instruction must be 1,000 characters or fewer.'),
});

export const projectQuerySchema = yup.object({
  page: yup.number().integer().min(1).default(1),
  pageSize: yup.number().integer().min(1).max(100).default(20),
  search: nullableText(120, 'Search is too long.'),
  status: yup.string().oneOf(PROJECT_STATUSES),
  owner: yup
    .string()
    .trim()
    .test(
      'owner-filter',
      'Choose a member.',
      (value) => !value || value === 'me' || value === 'unassigned' || isUuid(value),
    ),
  risk: yup.string().oneOf(['at_risk', 'due_soon']),
  sort: yup
    .string()
    .oneOf(['created', 'updated', 'completion', 'priority'])
    .default('created'),
  direction: yup.string().oneOf(['asc', 'desc']).default('desc'),
});

export const taskQuerySchema = yup.object({
  page: yup.number().integer().min(1).default(1),
  pageSize: yup.number().integer().min(1).max(100).default(50),
  search: nullableText(120, 'Search is too long.'),
  projectId: yup.string().uuid('Choose a valid project.'),
  owner: yup
    .string()
    .trim()
    .test(
      'owner-filter',
      'Choose a member.',
      (value) => !value || value === 'me' || value === 'unassigned' || isUuid(value),
    ),
  status: yup.string().oneOf(TASK_STATUSES),
  priority: yup.string().oneOf(TASK_PRIORITIES),
  due: yup.string().oneOf(['overdue', 'today', 'week']),
  sort: yup
    .string()
    .oneOf(['created', 'updated', 'due', 'priority'])
    .default('created'),
  direction: yup.string().oneOf(['asc', 'desc']).default('desc'),
});
