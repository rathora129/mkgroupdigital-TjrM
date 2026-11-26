'use client';

import { useState } from 'react';
import { useFormik } from 'formik';
import * as yup from 'yup';
import { Loader2, Save, X } from 'lucide-react';
import { apiRequest } from '@/lib/ai/client';
import {
  LEAD_PRIORITIES,
  LEAD_SOURCES,
} from '@/lib/leads/validation';
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
import {
  LEAD_SOURCE_LABELS,
  toDatetimeLocal,
} from '@/components/workspace/phase2c/meta';

const optionalText = (max, message) =>
  yup.string().trim().max(max, message);

const schema = yup.object({
  leadId: yup.string(),
  title: yup
    .string()
    .trim()
    .min(2, 'Title must be at least 2 characters.')
    .max(200, 'Title must be 200 characters or fewer.')
    .required('Opportunity title is required.'),
  priority: yup.string().oneOf(LEAD_PRIORITIES).required(),
  source: yup.string().oneOf(LEAD_SOURCES).required(),
  expectedValue: yup
    .number()
    .transform((value, original) => (original === '' ? null : value))
    .integer('Use whole currency units.')
    .min(0, 'Expected value cannot be negative.')
    .nullable(),
  currency: yup
    .string()
    .trim()
    .uppercase()
    .matches(/^[A-Z]{3}$/, 'Use a three-letter currency code.')
    .required('Enter a currency code.'),
  expectedCloseDate: yup.string(),
  nextFollowUpAt: yup.string(),
  ownerUserId: yup.string(),
  summary: optionalText(5_000, 'Summary must be 5,000 characters or fewer.'),
});

// The close date is a calendar date, not an instant: both directions go
// through UTC so a picked day never shifts across time zones.
function dateInput(value) {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

function initialValues(opportunity, fixedLeadId) {
  return {
    leadId: opportunity?.leadId || fixedLeadId || '',
    title: opportunity?.title || '',
    priority: opportunity?.priority || 'medium',
    source: opportunity?.source || 'other',
    expectedValue:
      opportunity?.expectedValueCents == null
        ? ''
        : String(opportunity.expectedValueCents),
    currency: opportunity?.currency || 'INR',
    expectedCloseDate: dateInput(opportunity?.expectedCloseDate),
    nextFollowUpAt: toDatetimeLocal(opportunity?.nextFollowUpAt),
    ownerUserId: opportunity?.ownerUserId || '',
    summary: opportunity?.summary || '',
  };
}

function textOrNull(value) {
  const trimmed = String(value ?? '').trim();
  return trimmed ? trimmed : null;
}

export default function OpportunityForm({
  opportunity = null,
  leadOptions = [],
  members = [],
  canAssign = false,
  fixedLeadId = '',
  onDone,
  onCancel,
}) {
  const [failure, setFailure] = useState(null);
  const editing = Boolean(opportunity);
  const lockedLeadId = opportunity?.leadId || fixedLeadId || '';
  const leadLocked = Boolean(lockedLeadId);

  const formik = useFormik({
    initialValues: initialValues(opportunity, fixedLeadId),
    validationSchema: schema,
    onSubmit: async (values, helpers) => {
      setFailure(null);
      helpers.setStatus(null);

      const payload = {
        title: values.title.trim(),
        priority: values.priority,
        source: values.source,
        expectedValueCents:
          values.expectedValue === '' ? null : Number(values.expectedValue),
        currency: values.currency.trim().toUpperCase(),
        expectedCloseDate: values.expectedCloseDate
          ? new Date(`${values.expectedCloseDate}T00:00:00.000Z`).toISOString()
          : null,
        nextFollowUpAt: values.nextFollowUpAt
          ? new Date(values.nextFollowUpAt).toISOString()
          : null,
        summary: textOrNull(values.summary),
      };

      if (!editing) {
        payload.leadId = values.leadId || lockedLeadId;
        if (canAssign) {
          payload.ownerUserId = values.ownerUserId || null;
        }
        if (!payload.leadId) {
          helpers.setFieldError('leadId', 'Choose a lead.');
          helpers.setSubmitting(false);
          return;
        }
      }

      try {
        const result = editing
          ? await apiRequest(`/api/workforce/opportunities/${opportunity.id}`, {
              method: 'PATCH',
              body: payload,
            })
          : await apiRequest('/api/workforce/opportunities', {
              method: 'POST',
              body: payload,
            });
        onDone?.(result);
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

  const selectedLead = leadOptions.find((lead) => lead.id === lockedLeadId);

  return (
    <form onSubmit={formik.handleSubmit}>
      <Stack $gap={14}>
        {failure ? <Notice $tone="danger">{failure}</Notice> : null}

        <Grid $cols={2}>
          <Field>
            <Label htmlFor="opp-lead">Lead</Label>
            {leadLocked ? (
              <>
                <Input
                  id="opp-lead"
                  value={
                    selectedLead?.companyName || opportunity?.companyName || 'Linked lead'
                  }
                  disabled
                  readOnly
                />
                <Hint>
                  Every opportunity belongs to this lead. Create another
                  opportunity for the same lead from its detail page.
                </Hint>
              </>
            ) : (
              <>
                <Select
                  id="opp-lead"
                  name="leadId"
                  value={formik.values.leadId}
                  onChange={formik.handleChange}
                  disabled={formik.isSubmitting}
                >
                  <option value="">Choose a lead</option>
                  {leadOptions.map((lead) => (
                    <option key={lead.id} value={lead.id}>
                      {lead.companyName}
                      {lead.archivedAt ? ' (archived)' : ''}
                    </option>
                  ))}
                </Select>
                {formik.errors.leadId ? (
                  <ErrorText>{formik.errors.leadId}</ErrorText>
                ) : null}
              </>
            )}
          </Field>

          <Field>
            <Label htmlFor="opp-title">Opportunity title</Label>
            <Input
              id="opp-title"
              name="title"
              value={formik.values.title}
              onChange={formik.handleChange}
              placeholder="E-commerce rebuild and growth retainer"
              disabled={formik.isSubmitting}
              required
            />
            {formik.errors.title ? (
              <ErrorText>{formik.errors.title}</ErrorText>
            ) : null}
          </Field>

          <Field>
            <Label htmlFor="opp-priority">Priority</Label>
            <Select
              id="opp-priority"
              name="priority"
              value={formik.values.priority}
              onChange={formik.handleChange}
              disabled={formik.isSubmitting}
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </Select>
          </Field>

          <Field>
            <Label htmlFor="opp-source">Lead source</Label>
            <Select
              id="opp-source"
              name="source"
              value={formik.values.source}
              onChange={formik.handleChange}
              disabled={formik.isSubmitting}
            >
              {LEAD_SOURCES.map((source) => (
                <option key={source} value={source}>
                  {LEAD_SOURCE_LABELS[source] || source}
                </option>
              ))}
            </Select>
          </Field>

          <Field>
            <Label htmlFor="opp-value">Expected deal value</Label>
            <Input
              id="opp-value"
              name="expectedValue"
              type="number"
              min="0"
              step="1"
              value={formik.values.expectedValue}
              onChange={formik.handleChange}
              placeholder="Whole currency units"
              disabled={formik.isSubmitting}
            />
            {formik.errors.expectedValue ? (
              <ErrorText>{formik.errors.expectedValue}</ErrorText>
            ) : null}
          </Field>

          <Field>
            <Label htmlFor="opp-currency">Currency</Label>
            <Input
              id="opp-currency"
              name="currency"
              value={formik.values.currency}
              onChange={formik.handleChange}
              maxLength={3}
              disabled={formik.isSubmitting}
            />
            {formik.errors.currency ? (
              <ErrorText>{formik.errors.currency}</ErrorText>
            ) : null}
          </Field>

          <Field>
            <Label htmlFor="opp-close">Expected close date</Label>
            <Input
              id="opp-close"
              name="expectedCloseDate"
              type="date"
              value={formik.values.expectedCloseDate}
              onChange={formik.handleChange}
              disabled={formik.isSubmitting}
            />
          </Field>

          <Field>
            <Label htmlFor="opp-followup">Next follow-up</Label>
            <Input
              id="opp-followup"
              name="nextFollowUpAt"
              type="datetime-local"
              value={formik.values.nextFollowUpAt}
              onChange={formik.handleChange}
              disabled={formik.isSubmitting}
            />
          </Field>

          {!editing && canAssign ? (
            <Field>
              <Label htmlFor="opp-owner">Sales owner</Label>
              <Select
                id="opp-owner"
                name="ownerUserId"
                value={formik.values.ownerUserId}
                onChange={formik.handleChange}
                disabled={formik.isSubmitting}
              >
                <option value="">Me (default)</option>
                {members.map((member) => (
                  <option key={member.userId} value={member.userId}>
                    {member.name || member.email}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}
        </Grid>

        <Field>
          <Label htmlFor="opp-summary">Opportunity summary</Label>
          <Textarea
            id="opp-summary"
            name="summary"
            value={formik.values.summary}
            onChange={formik.handleChange}
            maxLength={5_000}
            style={{ minHeight: 90 }}
            placeholder="What the client needs and why this opportunity exists."
            disabled={formik.isSubmitting}
          />
          {formik.errors.summary ? (
            <ErrorText>{formik.errors.summary}</ErrorText>
          ) : null}
        </Field>

        <Hint>
          Stage changes use a controlled pipeline. Saving here never converts
          the lead into a client.
        </Hint>

        <Actions>
          <Button type="submit" $variant="primary" disabled={formik.isSubmitting}>
            {formik.isSubmitting ? (
              <Loader2 size={14} className="spin" />
            ) : (
              <Save size={14} />
            )}
            {formik.isSubmitting
              ? 'Saving…'
              : editing
                ? 'Save changes'
                : 'Create opportunity'}
          </Button>
          {onCancel ? (
            <Button
              type="button"
              $variant="ghost"
              onClick={onCancel}
              disabled={formik.isSubmitting}
            >
              <X size={14} />
              Cancel
            </Button>
          ) : null}
        </Actions>
      </Stack>
    </form>
  );
}
