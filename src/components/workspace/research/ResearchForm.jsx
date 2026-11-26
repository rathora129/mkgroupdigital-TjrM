'use client';

import { useState } from 'react';
import { useFormik } from 'formik';
import * as yup from 'yup';
import { Loader2, Save, X } from 'lucide-react';
import { apiRequest } from '@/lib/ai/client';
import {
  Actions,
  Button,
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
} from '@/components/workspace/ai/primitives';

const SUBJECT_TYPES = [
  { value: 'company', label: 'Company' },
  { value: 'website', label: 'Website' },
  { value: 'industry', label: 'Industry' },
  { value: 'lead', label: 'CRM lead' },
];

const schema = yup
  .object({
    subjectType: yup.string().oneOf(SUBJECT_TYPES.map((item) => item.value)),
    companyName: yup.string().trim().max(160, '160 characters or fewer.'),
    websiteUrl: yup
      .string()
      .trim()
      .max(300, '300 characters or fewer.')
      .test('url', 'Enter an http or https URL.', (value) => {
        if (!value) return true;
        try {
          const url = new URL(
            /^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `https://${value}`,
          );
          return url.protocol === 'http:' || url.protocol === 'https:';
        } catch {
          return false;
        }
      }),
    industry: yup.string().trim().max(120, '120 characters or fewer.'),
    objective: yup
      .string()
      .trim()
      .min(10, 'Describe the objective in at least 10 characters.')
      .max(4_000, '4,000 characters or fewer.')
      .required('Describe the research objective.'),
    leadId: yup.string(),
    agentId: yup.string(),
  })
  .test(
    'subject',
    'Provide a company name, website or CRM lead.',
    (value) =>
      Boolean(value?.companyName || value?.websiteUrl || value?.leadId),
  );

function initialValues(presetLeadId) {
  return {
    subjectType: presetLeadId ? 'lead' : 'company',
    companyName: '',
    websiteUrl: '',
    industry: '',
    objective: '',
    leadId: presetLeadId || '',
    agentId: '',
  };
}

export default function ResearchForm({
  agents,
  leads,
  presetLeadId = null,
  onDone,
  onCancel,
}) {
  const [failure, setFailure] = useState(null);

  const formik = useFormik({
    initialValues: initialValues(presetLeadId),
    validationSchema: schema,
    onSubmit: async (values, helpers) => {
      setFailure(null);
      try {
        const payload = {
          subjectType: values.subjectType,
          companyName: values.companyName.trim() || null,
          websiteUrl: values.websiteUrl.trim() || null,
          industry: values.industry.trim() || null,
          objective: values.objective.trim(),
          leadId: values.leadId || null,
          agentId: values.agentId || null,
        };
        const result = await apiRequest('/api/workforce/research', {
          method: 'POST',
          body: payload,
        });
        onDone?.(result.job);
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

  const disabled = formik.isSubmitting;

  return (
    <form onSubmit={formik.handleSubmit}>
      <Stack $gap={14}>
        {failure ? <Notice $tone="danger">{failure}</Notice> : null}
        {agents.length === 0 ? (
          <Notice $tone="warning">
            No enabled Business Research or Lead Research agent exists. Create
            and enable one in AI Workforce before starting research.
          </Notice>
        ) : null}

        <Grid $cols={2}>
          <Field>
            <Label htmlFor="research-subject-type">Subject type</Label>
            <Select
              id="research-subject-type"
              name="subjectType"
              value={formik.values.subjectType}
              onChange={formik.handleChange}
              disabled={disabled}
            >
              {SUBJECT_TYPES.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field>
            <Label htmlFor="research-agent">Agent</Label>
            <Select
              id="research-agent"
              name="agentId"
              value={formik.values.agentId}
              onChange={formik.handleChange}
              disabled={disabled}
            >
              <option value="">First enabled research agent</option>
              {agents.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.name}
                </option>
              ))}
            </Select>
            <Hint>Runs execute in the background worker.</Hint>
          </Field>
          <Field>
            <Label htmlFor="research-company">Company name</Label>
            <Input
              id="research-company"
              name="companyName"
              value={formik.values.companyName}
              onChange={formik.handleChange}
              disabled={disabled}
            />
            {formik.errors.companyName ? (
              <ErrorText>{formik.errors.companyName}</ErrorText>
            ) : null}
          </Field>
          <Field>
            <Label htmlFor="research-website">Website</Label>
            <Input
              id="research-website"
              name="websiteUrl"
              value={formik.values.websiteUrl}
              onChange={formik.handleChange}
              placeholder="https://example.com"
              disabled={disabled}
            />
            {formik.errors.websiteUrl ? (
              <ErrorText>{formik.errors.websiteUrl}</ErrorText>
            ) : null}
          </Field>
          <Field>
            <Label htmlFor="research-industry">Industry</Label>
            <Input
              id="research-industry"
              name="industry"
              value={formik.values.industry}
              onChange={formik.handleChange}
              disabled={disabled}
            />
            {formik.errors.industry ? (
              <ErrorText>{formik.errors.industry}</ErrorText>
            ) : null}
          </Field>
          <Field>
            <Label htmlFor="research-lead">Link a CRM lead</Label>
            <Select
              id="research-lead"
              name="leadId"
              value={formik.values.leadId}
              onChange={formik.handleChange}
              disabled={disabled}
            >
              <option value="">No lead</option>
              {leads.map((lead) => (
                <option key={lead.id} value={lead.id}>
                  {lead.companyName}
                </option>
              ))}
            </Select>
            <Hint>
              A linked lead supplies its recorded company, website and industry.
            </Hint>
          </Field>
        </Grid>

        <Field>
          <Label htmlFor="research-objective">Objective</Label>
          <Textarea
            id="research-objective"
            name="objective"
            value={formik.values.objective}
            onChange={formik.handleChange}
            placeholder="What should the brief answer? Who is it for?"
            disabled={disabled}
          />
          {formik.errors.objective ? (
            <ErrorText>{formik.errors.objective}</ErrorText>
          ) : null}
          {formik.errors.subject ? (
            <ErrorText>{formik.errors.subject}</ErrorText>
          ) : null}
        </Field>

        <Actions>
          <Button
            type="submit"
            $variant="primary"
            disabled={disabled || agents.length === 0}
          >
            {formik.isSubmitting ? (
              <Loader2 size={15} className="spin" />
            ) : (
              <Save size={15} />
            )}
            Start research
          </Button>
          {onCancel ? (
            <Button
              type="button"
              $variant="ghost"
              onClick={onCancel}
              disabled={disabled}
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
