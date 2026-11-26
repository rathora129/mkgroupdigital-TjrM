'use client';

import { useState } from 'react';
import { useFormik } from 'formik';
import * as yup from 'yup';
import { Loader2, Save, X } from 'lucide-react';
import {
  AGENT_TOOL_PERMISSIONS,
  AGENT_TYPES,
  AGENT_WORKFLOWS,
  getAgentType,
} from '@/lib/ai/agent-types';
import { apiRequest } from '@/lib/ai/client';
import {
  Actions,
  Button,
  CheckGrid,
  CheckLabel,
  ErrorText,
  Field,
  Grid,
  Hint,
  Input,
  Label,
  Notice,
  Select,
  Stack,
  Textarea,
} from './primitives';

const schema = yup.object({
  name: yup
    .string()
    .trim()
    .min(2, 'At least 2 characters.')
    .max(80, '80 characters or fewer.')
    .required('Agent name is required.'),
  description: yup.string().trim().max(500, '500 characters or fewer.'),
  type: yup
    .string()
    .oneOf(AGENT_TYPES.map((type) => type.key))
    .required(),
  instructions: yup
    .string()
    .trim()
    .min(20, 'At least 20 characters.')
    .max(8000, '8,000 characters or fewer.')
    .required('Instructions are required.'),
  provider: yup.string().required('Choose a provider.'),
  model: yup
    .string()
    .trim()
    .min(2, 'Enter a model identifier.')
    .max(120, '120 characters or fewer.')
    .required('Choose a model.'),
  monthlyTokenLimit: yup
    .number()
    .transform((value, original) => (original === '' ? null : value))
    .integer('Whole numbers only.')
    .min(0, 'Cannot be negative.')
    .nullable(),
  monthlyBudgetCents: yup
    .number()
    .transform((value, original) => (original === '' ? null : value))
    .integer('Whole numbers only.')
    .min(0, 'Cannot be negative.')
    .nullable(),
});

function initialValues(agent, providers) {
  const fallbackProvider =
    providers.find((provider) => provider.configured)?.key ||
    providers[0]?.key ||
    'openai';
  const provider = agent?.provider || fallbackProvider;
  const providerMeta = providers.find((item) => item.key === provider);
  const type = agent?.type || 'custom';

  return {
    name: agent?.name || '',
    description: agent?.description || '',
    type,
    instructions: agent?.instructions || getAgentType(type).defaultInstructions,
    provider,
    model: agent?.model || providerMeta?.defaultModel || '',
    enabled: agent?.enabled ?? true,
    approvalRequired:
      agent?.approvalRequired ??
      Boolean(getAgentType(type).reviewNote),
    toolPermissions: agent?.toolPermissions || [],
    allowedWorkflows: agent?.allowedWorkflows || [],
    monthlyTokenLimit:
      agent?.monthlyTokenLimit == null ? '' : String(agent.monthlyTokenLimit),
    monthlyBudgetCents:
      agent?.monthlyBudgetCents == null ? '' : String(agent.monthlyBudgetCents),
  };
}

function toggle(list, value) {
  return list.includes(value)
    ? list.filter((item) => item !== value)
    : [...list, value];
}

export default function AgentForm({
  agent = null,
  providers,
  onDone,
  onCancel,
}) {
  const [failure, setFailure] = useState(null);
  const editing = Boolean(agent);

  const formik = useFormik({
    initialValues: initialValues(agent, providers),
    validationSchema: schema,
    onSubmit: async (values, helpers) => {
      setFailure(null);
      helpers.setStatus(null);

      const payload = {
        name: values.name,
        description: values.description || null,
        type: values.type,
        instructions: values.instructions,
        provider: values.provider,
        model: values.model,
        enabled: Boolean(values.enabled),
        approvalRequired: Boolean(values.approvalRequired),
        toolPermissions: values.toolPermissions,
        allowedWorkflows: values.allowedWorkflows,
        monthlyTokenLimit:
          values.monthlyTokenLimit === '' ? null : Number(values.monthlyTokenLimit),
        monthlyBudgetCents:
          values.monthlyBudgetCents === ''
            ? null
            : Number(values.monthlyBudgetCents),
      };

      try {
        const data = await apiRequest(
          editing
            ? `/api/workforce/ai/agents/${agent.id}`
            : '/api/workforce/ai/agents',
          { method: editing ? 'PATCH' : 'POST', body: payload },
        );
        onDone?.(data.agent);
      } catch (error) {
        if (error.code === 'VALIDATION_FAILED' && error.details) {
          helpers.setErrors(error.details);
        }
        setFailure(error.message);
      } finally {
        helpers.setSubmitting(false);
      }
    },
  });

  const providerMeta = providers.find(
    (provider) => provider.key === formik.values.provider,
  );

  function onTypeChange(event) {
    const nextType = event.target.value;
    const currentDefault = getAgentType(formik.values.type).defaultInstructions;
    formik.setFieldValue('type', nextType);
    if (
      !formik.values.instructions.trim() ||
      formik.values.instructions === currentDefault
    ) {
      formik.setFieldValue('instructions', getAgentType(nextType).defaultInstructions);
    }
  }

  function onProviderChange(event) {
    const nextProvider = event.target.value;
    const meta = providers.find((provider) => provider.key === nextProvider);
    const currentDefault = providerMeta?.defaultModel;
    formik.setFieldValue('provider', nextProvider);
    if (!formik.values.model.trim() || formik.values.model === currentDefault) {
      formik.setFieldValue('model', meta?.defaultModel || '');
    }
  }

  const typeMeta = getAgentType(formik.values.type);

  return (
    <form onSubmit={formik.handleSubmit}>
      <Stack $gap={16}>
        {failure ? <Notice $tone="danger">{failure}</Notice> : null}
        {typeMeta.reviewNote ? (
          <Notice $tone="warning">{typeMeta.reviewNote}</Notice>
        ) : null}

        <Grid $cols={2}>
          <Field>
            <Label htmlFor="agent-name">Agent name</Label>
            <Input
              id="agent-name"
              name="name"
              value={formik.values.name}
              onChange={formik.handleChange}
              onBlur={formik.handleBlur}
              maxLength={80}
              disabled={formik.isSubmitting}
            />
            {formik.touched.name && formik.errors.name ? (
              <ErrorText>{formik.errors.name}</ErrorText>
            ) : null}
          </Field>

          <Field>
            <Label htmlFor="agent-type">Agent type</Label>
            <Select
              id="agent-type"
              name="type"
              value={formik.values.type}
              onChange={onTypeChange}
              onBlur={formik.handleBlur}
              disabled={formik.isSubmitting}
            >
              {AGENT_TYPES.map((type) => (
                <option key={type.key} value={type.key}>
                  {type.label}
                </option>
              ))}
            </Select>
            <Hint>{typeMeta.description}</Hint>
          </Field>
        </Grid>

        <Field>
          <Label htmlFor="agent-description">Description</Label>
          <Input
            id="agent-description"
            name="description"
            value={formik.values.description}
            onChange={formik.handleChange}
            maxLength={500}
            disabled={formik.isSubmitting}
          />
          {formik.errors.description ? (
            <ErrorText>{formik.errors.description}</ErrorText>
          ) : null}
        </Field>

        <Field>
          <Label htmlFor="agent-instructions">Instructions</Label>
          <Textarea
            id="agent-instructions"
            name="instructions"
            value={formik.values.instructions}
            onChange={formik.handleChange}
            onBlur={formik.handleBlur}
            rows={7}
            maxLength={8000}
            disabled={formik.isSubmitting}
          />
          <Hint>
            Safety guardrails are added by the server. Instructions cannot
            remove the requirement for human review of regulated output.
          </Hint>
          {formik.touched.instructions && formik.errors.instructions ? (
            <ErrorText>{formik.errors.instructions}</ErrorText>
          ) : null}
        </Field>

        <Grid $cols={2}>
          <Field>
            <Label htmlFor="agent-provider">Provider</Label>
            <Select
              id="agent-provider"
              name="provider"
              value={formik.values.provider}
              onChange={onProviderChange}
              disabled={formik.isSubmitting}
            >
              {providers.map((provider) => (
                <option key={provider.key} value={provider.key}>
                  {provider.label}
                  {provider.configured ? '' : ' — not configured'}
                </option>
              ))}
            </Select>
            {providerMeta && !providerMeta.configured ? (
              <Hint>
                No server credential is configured, so runs will be refused
                until the operator adds one.
              </Hint>
            ) : null}
          </Field>

          <Field>
            <Label htmlFor="agent-model">Model</Label>
            <Input
              id="agent-model"
              name="model"
              list="agent-model-options"
              value={formik.values.model}
              onChange={formik.handleChange}
              onBlur={formik.handleBlur}
              disabled={formik.isSubmitting}
            />
            <datalist id="agent-model-options">
              {(providerMeta?.models || []).map((model) => (
                <option key={model.id} value={model.id}>
                  {model.label}
                </option>
              ))}
            </datalist>
            {formik.touched.model && formik.errors.model ? (
              <ErrorText>{formik.errors.model}</ErrorText>
            ) : null}
          </Field>
        </Grid>

        <Grid $cols={2}>
          <Field>
            <Label htmlFor="agent-token-limit">Monthly token limit</Label>
            <Input
              id="agent-token-limit"
              name="monthlyTokenLimit"
              type="number"
              min="0"
              value={formik.values.monthlyTokenLimit}
              onChange={formik.handleChange}
              placeholder="No limit"
              disabled={formik.isSubmitting}
            />
            <Hint>Leave empty for no agent-level token limit.</Hint>
          </Field>

          <Field>
            <Label htmlFor="agent-budget-limit">Monthly budget (cents)</Label>
            <Input
              id="agent-budget-limit"
              name="monthlyBudgetCents"
              type="number"
              min="0"
              value={formik.values.monthlyBudgetCents}
              onChange={formik.handleChange}
              placeholder="No limit"
              disabled={formik.isSubmitting}
            />
            <Hint>Estimated cost in cents. 500 = $5.00.</Hint>
          </Field>
        </Grid>

        <CheckGrid>
          <CheckLabel>
            <input
              type="checkbox"
              checked={formik.values.enabled}
              onChange={() =>
                formik.setFieldValue('enabled', !formik.values.enabled)
              }
              disabled={formik.isSubmitting}
            />
            <span>Agent enabled</span>
          </CheckLabel>
          <CheckLabel>
            <input
              type="checkbox"
              checked={formik.values.approvalRequired}
              onChange={() =>
                formik.setFieldValue(
                  'approvalRequired',
                  !formik.values.approvalRequired,
                )
              }
              disabled={formik.isSubmitting}
            />
            <span>Require human approval before every run</span>
          </CheckLabel>
        </CheckGrid>

        <Stack $gap={8}>
          <Label>Tool permissions</Label>
          <CheckGrid>
            {AGENT_TOOL_PERMISSIONS.map((tool) => (
              <CheckLabel key={tool.key}>
                <input
                  type="checkbox"
                  checked={formik.values.toolPermissions.includes(tool.key)}
                  onChange={() =>
                    formik.setFieldValue(
                      'toolPermissions',
                      toggle(formik.values.toolPermissions, tool.key),
                    )
                  }
                  disabled={formik.isSubmitting}
                />
                <span>{tool.label}</span>
              </CheckLabel>
            ))}
          </CheckGrid>
          <Hint>
            Recorded as the agent&apos;s declared permissions. No tool executes
            automatically in this phase.
          </Hint>
        </Stack>

        <Stack $gap={8}>
          <Label>Allowed workflows</Label>
          <CheckGrid>
            {AGENT_WORKFLOWS.map((flow) => (
              <CheckLabel key={flow.key}>
                <input
                  type="checkbox"
                  checked={formik.values.allowedWorkflows.includes(flow.key)}
                  onChange={() =>
                    formik.setFieldValue(
                      'allowedWorkflows',
                      toggle(formik.values.allowedWorkflows, flow.key),
                    )
                  }
                  disabled={formik.isSubmitting}
                />
                <span>{flow.label}</span>
              </CheckLabel>
            ))}
          </CheckGrid>
        </Stack>

        <Actions>
          <Button
            type="submit"
            $variant="primary"
            disabled={formik.isSubmitting || !formik.dirty}
          >
            {formik.isSubmitting ? (
              <Loader2 size={15} className="spin" />
            ) : (
              <Save size={15} />
            )}
            {editing ? 'Save changes' : 'Create agent'}
          </Button>
          {onCancel ? (
            <Button
              type="button"
              $variant="ghost"
              onClick={onCancel}
              disabled={formik.isSubmitting}
            >
              <X size={15} />
              Cancel
            </Button>
          ) : null}
        </Actions>
      </Stack>
    </form>
  );
}
