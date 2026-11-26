import * as yup from 'yup';
import { AGENT_TYPE_KEYS, AGENT_TOOL_PERMISSIONS, AGENT_WORKFLOWS } from './agent-types';
import { PROVIDER_KEYS } from './registry';

const TOOL_KEYS = AGENT_TOOL_PERMISSIONS.map((tool) => tool.key);
const WORKFLOW_KEYS = AGENT_WORKFLOWS.map((flow) => flow.key);

export const RUN_STATUSES = [
  'queued',
  'running',
  'completed',
  'failed',
  'cancelled',
  'awaiting_approval',
];

const emptyToNull = (value) =>
  typeof value === 'string' && value.trim() === '' ? null : value;

const optionalLimit = yup
  .number()
  .transform((value, original) => (original === '' ? null : value))
  .integer('Use a whole number.')
  .min(0, 'Limits cannot be negative.')
  .max(1_000_000_000, 'That limit is too large.')
  .nullable();

const nameField = yup
  .string()
  .trim()
  .min(2, 'Agent name must be at least 2 characters.')
  .max(80, 'Agent name must be 80 characters or fewer.');

const instructionsField = yup
  .string()
  .trim()
  .min(20, 'Instructions must be at least 20 characters.')
  .max(8_000, 'Instructions must be 8,000 characters or fewer.');

const descriptionField = yup
  .string()
  .trim()
  .transform(emptyToNull)
  .max(500, 'Description must be 500 characters or fewer.')
  .nullable();

const providerField = yup.string().oneOf(PROVIDER_KEYS, 'Choose a supported provider.');

const modelField = yup
  .string()
  .trim()
  .min(2, 'Enter a model identifier.')
  .max(120, 'Model identifier is too long.');

const listField = (allowed) =>
  yup
    .array()
    .of(yup.string().oneOf(allowed, 'Choose from the listed options.'))
    .max(50)
    .default([]);

export const agentCreateSchema = yup.object({
  name: nameField.required('Agent name is required.'),
  description: descriptionField,
  type: yup
    .string()
    .oneOf(AGENT_TYPE_KEYS, 'Choose a valid agent type.')
    .default('custom'),
  instructions: instructionsField.required('Instructions are required.'),
  provider: providerField.required('Choose a provider.'),
  model: modelField.required('Choose a model.'),
  enabled: yup.boolean().default(true),
  toolPermissions: listField(TOOL_KEYS),
  allowedWorkflows: listField(WORKFLOW_KEYS),
  monthlyTokenLimit: optionalLimit,
  monthlyBudgetCents: optionalLimit,
  approvalRequired: yup.boolean().default(false),
});

export const agentUpdateSchema = yup.object({
  name: nameField,
  description: descriptionField,
  type: yup.string().oneOf(AGENT_TYPE_KEYS, 'Choose a valid agent type.'),
  instructions: instructionsField,
  provider: providerField,
  model: modelField,
  enabled: yup.boolean(),
  toolPermissions: listField(TOOL_KEYS),
  allowedWorkflows: listField(WORKFLOW_KEYS),
  monthlyTokenLimit: optionalLimit,
  monthlyBudgetCents: optionalLimit,
  approvalRequired: yup.boolean(),
});

export const runCreateSchema = yup.object({
  agentId: yup.string().uuid('Choose a valid agent.').required('Choose an agent.'),
  input: yup
    .string()
    .trim()
    .min(1, 'Describe what the agent should do.')
    .max(20_000, 'Input must be 20,000 characters or fewer.')
    .required('Run input is required.'),
  idempotencyKey: yup
    .string()
    .trim()
    .transform(emptyToNull)
    .max(200, 'Idempotency key is too long.')
    .matches(/^[A-Za-z0-9._:-]*$/, 'Use letters, numbers, dot, dash, underscore or colon.')
    .nullable(),
  contextRefs: yup
    .object({
      clientId: yup.string().uuid('Choose a valid client.').nullable(),
      projectId: yup.string().uuid('Choose a valid project.').nullable(),
      leadId: yup.string().uuid('Choose a valid lead.').nullable(),
      opportunityId: yup.string().uuid('Choose a valid opportunity.').nullable(),
      proposalId: yup.string().uuid('Choose a valid proposal.').nullable(),
      ticketId: yup.string().uuid('Choose a valid ticket.').nullable(),
    })
    .nullable()
    .default(null),
});

export const approvalDecisionSchema = yup.object({
  decision: yup
    .string()
    .oneOf(['approve', 'reject'], 'Choose approve or reject.')
    .required('A decision is required.'),
  note: yup
    .string()
    .trim()
    .transform(emptyToNull)
    .max(500, 'Decision note must be 500 characters or fewer.')
    .nullable(),
});

export const providerPatchSchema = yup.object({
  enabled: yup.boolean(),
  defaultModel: yup
    .string()
    .trim()
    .transform(emptyToNull)
    .min(2)
    .max(120, 'Model identifier is too long.')
    .nullable(),
});

export const aiLimitsSchema = yup.object({
  monthlyTokenLimit: optionalLimit,
  monthlyBudgetCents: optionalLimit,
});

export const runQuerySchema = yup.object({
  page: yup.number().integer().min(1).default(1),
  pageSize: yup.number().integer().min(1).max(50).default(20),
  status: yup.string().oneOf(RUN_STATUSES),
  agentId: yup.string().uuid(),
});

export const approvalQuerySchema = yup.object({
  page: yup.number().integer().min(1).default(1),
  pageSize: yup.number().integer().min(1).max(50).default(20),
  status: yup.string().oneOf(['pending', 'approved', 'rejected', 'cancelled']),
});
