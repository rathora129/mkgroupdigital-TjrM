'use client';

import { useState } from 'react';
import { useFormik } from 'formik';
import * as yup from 'yup';
import { Loader2, Save, X } from 'lucide-react';
import { apiRequest } from '@/lib/ai/client';
import {
  LEAD_PRIORITIES,
  LEAD_SOURCES,
  LEAD_STATUSES,
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
import { LEAD_SOURCE_LABELS, toDatetimeLocal } from '@/components/workspace/phase2c/meta';

const optionalText = (max, message) =>
  yup.string().trim().max(max, message);

const schema = yup.object({
  companyName: yup
    .string()
    .trim()
    .min(1, 'Company name is required.')
    .max(160, 'Company name must be 160 characters or fewer.')
    .required('Company name is required.'),
  contactName: optionalText(160, 'Contact name must be 160 characters or fewer.'),
  email: yup
    .string()
    .trim()
    .max(200, 'Email must be 200 characters or fewer.')
    .test('email', 'Enter a valid email address.', (value) =>
      !value || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value),
    ),
  phone: optionalText(60, 'Phone must be 60 characters or fewer.'),
  website: optionalText(300, 'Website must be 300 characters or fewer.'),
  industry: optionalText(120, 'Industry must be 120 characters or fewer.'),
  businessType: optionalText(120, 'Business type must be 120 characters or fewer.'),
  location: optionalText(160, 'Location must be 160 characters or fewer.'),
  country: optionalText(120, 'Country must be 120 characters or fewer.'),
  source: yup.string().oneOf(LEAD_SOURCES).required(),
  estimatedValue: yup
    .number()
    .transform((value, original) => (original === '' ? null : value))
    .integer('Use whole currency units.')
    .min(0, 'Estimated value cannot be negative.')
    .nullable(),
  currency: yup
    .string()
    .trim()
    .uppercase()
    .matches(/^[A-Z]{3}$/, 'Use a three-letter currency code.')
    .required('Enter a currency code.'),
  assignedUserId: yup.string(),
  priority: yup.string().oneOf(LEAD_PRIORITIES).required(),
  status: yup.string().oneOf(LEAD_STATUSES).required(),
  nextFollowUpAt: yup.string(),
  notes: optionalText(5_000, 'Notes must be 5,000 characters or fewer.'),
});

function initialValues(lead) {
  return {
    companyName: lead?.companyName || '',
    contactName: lead?.contactName || '',
    email: lead?.email || '',
    phone: lead?.phone || '',
    website: lead?.website || '',
    industry: lead?.industry || '',
    businessType: lead?.businessType || '',
    location: lead?.location || '',
    country: lead?.country || '',
    source: lead?.source || 'other',
    estimatedValue:
      lead?.estimatedValueCents == null ? '' : String(lead.estimatedValueCents),
    currency: lead?.currency || 'INR',
    assignedUserId: lead?.assignedUserId || '',
    priority: lead?.priority || 'medium',
    status: lead?.status || 'new',
    nextFollowUpAt: lead?.nextFollowUpAt
      ? toDatetimeLocal(lead.nextFollowUpAt)
      : '',
    notes: lead?.notes || '',
  };
}

function textOrNull(value) {
  const trimmed = String(value ?? '').trim();
  return trimmed ? trimmed : null;
}

export default function LeadForm({
  lead = null,
  members = [],
  canAssign = false,
  onDone,
  onCancel,
}) {
  const [failure, setFailure] = useState(null);
  const editing = Boolean(lead);

  const formik = useFormik({
    initialValues: initialValues(lead),
    validationSchema: schema,
    onSubmit: async (values, helpers) => {
      setFailure(null);
      helpers.setStatus(null);

      const payload = {
        companyName: values.companyName.trim(),
        contactName: textOrNull(values.contactName),
        email: textOrNull(values.email),
        phone: textOrNull(values.phone),
        website: textOrNull(values.website),
        industry: textOrNull(values.industry),
        businessType: textOrNull(values.businessType),
        location: textOrNull(values.location),
        country: textOrNull(values.country),
        source: values.source,
        estimatedValueCents:
          values.estimatedValue === '' ? null : Number(values.estimatedValue),
        currency: values.currency.trim().toUpperCase(),
        priority: values.priority,
        nextFollowUpAt: values.nextFollowUpAt
          ? new Date(values.nextFollowUpAt).toISOString()
          : null,
        notes: textOrNull(values.notes),
      };

      if (!editing) {
        payload.status = values.status;
        if (canAssign) {
          payload.assignedUserId = values.assignedUserId || null;
        }
      }

      try {
        const result = editing
          ? await apiRequest(`/api/workforce/leads/${lead.id}`, {
              method: 'PATCH',
              body: payload,
            })
          : await apiRequest('/api/workforce/leads', {
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

  return (
    <form onSubmit={formik.handleSubmit}>
      <Stack $gap={14}>
        {failure ? <Notice $tone="danger">{failure}</Notice> : null}

        <Grid $cols={2}>
          <Field>
            <Label htmlFor="lead-company">Company name</Label>
            <Input
              id="lead-company"
              name="companyName"
              value={formik.values.companyName}
              onChange={formik.handleChange}
              disabled={formik.isSubmitting}
              required
            />
            {formik.errors.companyName ? (
              <ErrorText>{formik.errors.companyName}</ErrorText>
            ) : null}
          </Field>
          <Field>
            <Label htmlFor="lead-contact">Contact name</Label>
            <Input
              id="lead-contact"
              name="contactName"
              value={formik.values.contactName}
              onChange={formik.handleChange}
              disabled={formik.isSubmitting}
            />
            {formik.errors.contactName ? (
              <ErrorText>{formik.errors.contactName}</ErrorText>
            ) : null}
          </Field>
          <Field>
            <Label htmlFor="lead-email">Email</Label>
            <Input
              id="lead-email"
              name="email"
              type="email"
              value={formik.values.email}
              onChange={formik.handleChange}
              disabled={formik.isSubmitting}
            />
            {formik.errors.email ? (
              <ErrorText>{formik.errors.email}</ErrorText>
            ) : null}
          </Field>
          <Field>
            <Label htmlFor="lead-phone">Phone</Label>
            <Input
              id="lead-phone"
              name="phone"
              value={formik.values.phone}
              onChange={formik.handleChange}
              disabled={formik.isSubmitting}
            />
            {formik.errors.phone ? (
              <ErrorText>{formik.errors.phone}</ErrorText>
            ) : null}
          </Field>
          <Field>
            <Label htmlFor="lead-website">Website</Label>
            <Input
              id="lead-website"
              name="website"
              value={formik.values.website}
              onChange={formik.handleChange}
              placeholder="https://example.com"
              disabled={formik.isSubmitting}
            />
            {formik.errors.website ? (
              <ErrorText>{formik.errors.website}</ErrorText>
            ) : null}
          </Field>
          <Field>
            <Label htmlFor="lead-industry">Industry</Label>
            <Input
              id="lead-industry"
              name="industry"
              value={formik.values.industry}
              onChange={formik.handleChange}
              disabled={formik.isSubmitting}
            />
            {formik.errors.industry ? (
              <ErrorText>{formik.errors.industry}</ErrorText>
            ) : null}
          </Field>
          <Field>
            <Label htmlFor="lead-business-type">Business type</Label>
            <Input
              id="lead-business-type"
              name="businessType"
              value={formik.values.businessType}
              onChange={formik.handleChange}
              placeholder="Manufacturer, distributor, agency…"
              disabled={formik.isSubmitting}
            />
            {formik.errors.businessType ? (
              <ErrorText>{formik.errors.businessType}</ErrorText>
            ) : null}
          </Field>
          <Field>
            <Label htmlFor="lead-location">Location</Label>
            <Input
              id="lead-location"
              name="location"
              value={formik.values.location}
              onChange={formik.handleChange}
              disabled={formik.isSubmitting}
            />
            {formik.errors.location ? (
              <ErrorText>{formik.errors.location}</ErrorText>
            ) : null}
          </Field>
          <Field>
            <Label htmlFor="lead-country">Country</Label>
            <Input
              id="lead-country"
              name="country"
              value={formik.values.country}
              onChange={formik.handleChange}
              disabled={formik.isSubmitting}
            />
            {formik.errors.country ? (
              <ErrorText>{formik.errors.country}</ErrorText>
            ) : null}
          </Field>
          <Field>
            <Label htmlFor="lead-source">Source</Label>
            <Select
              id="lead-source"
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
            <Label htmlFor="lead-value">Estimated value</Label>
            <Input
              id="lead-value"
              name="estimatedValue"
              type="number"
              min="0"
              step="1"
              value={formik.values.estimatedValue}
              onChange={formik.handleChange}
              disabled={formik.isSubmitting}
              placeholder="Optional"
            />
            <Hint>Stored in whole units of the lead currency.</Hint>
            {formik.errors.estimatedValue ? (
              <ErrorText>{formik.errors.estimatedValue}</ErrorText>
            ) : null}
          </Field>
          <Field>
            <Label htmlFor="lead-currency">Currency</Label>
            <Input
              id="lead-currency"
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
            <Label htmlFor="lead-priority">Priority</Label>
            <Select
              id="lead-priority"
              name="priority"
              value={formik.values.priority}
              onChange={formik.handleChange}
              disabled={formik.isSubmitting}
            >
              {LEAD_PRIORITIES.map((priority) => (
                <option key={priority} value={priority}>
                  {priority.charAt(0).toUpperCase() + priority.slice(1)}
                </option>
              ))}
            </Select>
          </Field>
          {!editing ? (
            <Field>
              <Label htmlFor="lead-status">Starting status</Label>
              <Select
                id="lead-status"
                name="status"
                value={formik.values.status}
                onChange={formik.handleChange}
                disabled={formik.isSubmitting}
              >
                {LEAD_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {status.charAt(0).toUpperCase() + status.slice(1)}
                  </option>
                ))}
              </Select>
              <Hint>Later changes follow the pipeline rules and are recorded.</Hint>
            </Field>
          ) : null}
          {!editing && canAssign ? (
            <Field>
              <Label htmlFor="lead-assignee">Assignee</Label>
              <Select
                id="lead-assignee"
                name="assignedUserId"
                value={formik.values.assignedUserId}
                onChange={formik.handleChange}
                disabled={formik.isSubmitting}
              >
                <option value="">Unassigned</option>
                {members.map((member) => (
                  <option key={member.userId} value={member.userId}>
                    {member.name || member.email}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}
          <Field>
            <Label htmlFor="lead-follow-up">Next follow-up</Label>
            <Input
              id="lead-follow-up"
              name="nextFollowUpAt"
              type="datetime-local"
              value={formik.values.nextFollowUpAt}
              onChange={formik.handleChange}
              disabled={formik.isSubmitting}
            />
            <Hint>Leave blank when no follow-up is scheduled.</Hint>
          </Field>
        </Grid>

        <Field>
          <Label htmlFor="lead-notes">Notes</Label>
          <Textarea
            id="lead-notes"
            name="notes"
            value={formik.values.notes}
            onChange={formik.handleChange}
            disabled={formik.isSubmitting}
            placeholder="Context, requirements, next steps…"
          />
          {formik.errors.notes ? (
            <ErrorText>{formik.errors.notes}</ErrorText>
          ) : null}
        </Field>

        <Actions>
          <Button type="submit" $variant="primary" disabled={formik.isSubmitting}>
            {formik.isSubmitting ? (
              <Loader2 size={15} className="spin" />
            ) : (
              <Save size={15} />
            )}
            {editing ? 'Save changes' : 'Create lead'}
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
