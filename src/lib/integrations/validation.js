import * as yup from 'yup';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { WORKFLOW_KEYS } from '@/lib/automation/constants';
import {
  EXECUTION_CATEGORY_KEYS,
  EXECUTION_STATUSES,
  INTEGRATION_KIND_KEYS,
  INTEGRATION_STATUSES,
  RISK_LEVELS,
  WORKFLOW_RUN_STATUSES,
} from './constants';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value) {
  return typeof value === 'string' && UUID_RE.test(value);
}

const emptyToNull = (value) =>
  typeof value === 'string' && value.trim() === '' ? null : value;

const optionalUuid = (message) =>
  yup
    .string()
    .trim()
    .transform(emptyToNull)
    .test('uuid', message, (value) => value === undefined || value === null || isUuid(value))
    .nullable();

const optionalText = (max, message) =>
  yup
    .string()
    .trim()
    .transform(emptyToNull)
    .max(max, message)
    .nullable();

const jsonObject = yup
  .object()
  .nullable()
  .transform((value, original) => (original === '' ? null : value));

const pageQueryBase = {
  page: yup.number().integer().min(1).default(1),
  pageSize: yup.number().integer().min(1).max(50).default(20),
};

export const integrationListQuerySchema = yup.object({
  kind: yup.string().trim().oneOf(INTEGRATION_KIND_KEYS).nullable(),
  status: yup.string().trim().oneOf(INTEGRATION_STATUSES).nullable(),
});

export const integrationCreateSchema = yup.object({
  kind: yup
    .string()
    .trim()
    .oneOf(INTEGRATION_KIND_KEYS, 'Choose a known integration kind.')
    .required('Choose an integration kind.'),
  provider: yup
    .string()
    .trim()
    .min(2, 'Choose a provider.')
    .max(100, 'That provider name is too long.')
    .required('Choose a provider.'),
  name: optionalText(120, 'Keep the integration name under 120 characters.'),
});

export const integrationUpdateSchema = yup.object({
  name: optionalText(120, 'Keep the integration name under 120 characters.'),
  settings: jsonObject,
});

export const executionCreateSchema = yup.object({
  clientId: optionalUuid('Choose a client from this workspace.'),
  projectId: optionalUuid('Choose a project from this workspace.'),
  integrationId: optionalUuid('Choose an integration from this workspace.'),
  category: yup
    .string()
    .trim()
    .oneOf(EXECUTION_CATEGORY_KEYS, 'Choose a known action category.')
    .required('Choose an action category.'),
  operation: yup
    .string()
    .trim()
    .min(2, 'Describe the operation.')
    .max(200, 'Keep the operation under 200 characters.')
    .required('Describe the operation.'),
  targetSystem: yup
    .string()
    .trim()
    .min(2, 'Name the target system.')
    .max(100, 'Keep the target system under 100 characters.')
    .required('Name the target system.'),
  payload: jsonObject,
  riskLevel: yup.string().trim().oneOf(RISK_LEVELS).default('medium'),
  requiredPermission: yup
    .string()
    .trim()
    .oneOf(Object.values(PERMISSIONS), 'Choose a known permission.')
    .default(PERMISSIONS.marketingExecute),
  idempotencyKey: optionalText(200, 'Keep the idempotency key under 200 characters.'),
});

export const executionDecisionSchema = yup.object({
  decision: yup
    .string()
    .trim()
    .oneOf(['approved', 'rejected'], 'Choose approve or reject.')
    .required('Choose a decision.'),
  note: optionalText(1000, 'Keep the note under 1000 characters.'),
});

export const executionListQuerySchema = yup.object({
  status: yup.string().trim().oneOf(EXECUTION_STATUSES).nullable(),
  clientId: optionalUuid('Choose a client from this workspace.'),
  ...pageQueryBase,
});

export const workflowStartSchema = yup.object({
  workflowKey: yup
    .string()
    .trim()
    .oneOf(WORKFLOW_KEYS, 'Choose a known workflow.')
    .required('Choose a workflow.'),
  clientId: optionalUuid('Choose a client from this workspace.'),
  projectId: optionalUuid('Choose a project from this workspace.'),
  input: jsonObject,
  idempotencyKey: optionalText(200, 'Keep the idempotency key under 200 characters.'),
});

export const workflowListQuerySchema = yup.object({
  status: yup.string().trim().oneOf(WORKFLOW_RUN_STATUSES).nullable(),
  ...pageQueryBase,
});

export const syncEventListQuerySchema = yup.object({
  ...pageQueryBase,
});
