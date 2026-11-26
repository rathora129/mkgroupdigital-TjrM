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

const optionalText = (max, message) => yup.string().trim().max(max, message);

const schema = yup.object({
  leadId: yup.string(),
  companyName: yup
    .string()
    .trim()
    .min(2, 'Company name must be at least 2 characters.')
    .max(200, 'Company name must be 200 characters or fewer.')
    .required('Company name is required.'),
  primaryContactName: optionalText(160, 'Contact name is too long.'),
  email: yup
    .string()
    .trim()
    .email('Enter a valid email address.')
    .max(254, 'That email is too long.'),
  phone: optionalText(40, 'Phone number is too long.'),
  website: yup
    .string()
    .trim()
    .test(
      'https-url',
      'Enter a full http(s) address.',
      (value) => !value || /^https?:\/\/[^\s]+$/i.test(value),
    )
    .max(300, 'That address is too long.'),
  industry: optionalText(120, 'Industry is too long.'),
  address: optionalText(500, 'Address is too long.'),
  ownerUserId: yup.string(),
  internalNotes: optionalText(4_000, 'Internal notes are too long.'),
});

function textOrNull(value) {
  const trimmed = String(value ?? '').trim();
  return trimmed ? trimmed : null;
}

export default function ClientCreateForm({
  leads = [],
  members = [],
  onDone,
  onCancel,
}) {
  const [failure, setFailure] = useState(null);

  const formik = useFormik({
    initialValues: {
      leadId: '',
      companyName: '',
      primaryContactName: '',
      email: '',
      phone: '',
      website: '',
      industry: '',
      address: '',
      ownerUserId: '',
      internalNotes: '',
    },
    validationSchema: schema,
    onSubmit: async (values, helpers) => {
      setFailure(null);
      try {
        const result = await apiRequest('/api/workforce/clients', {
          method: 'POST',
          body: {
            leadId: values.leadId || null,
            companyName: values.companyName.trim(),
            primaryContactName: textOrNull(values.primaryContactName),
            email: textOrNull(values.email),
            phone: textOrNull(values.phone),
            website: textOrNull(values.website),
            industry: textOrNull(values.industry),
            address: textOrNull(values.address),
            ownerUserId: values.ownerUserId || null,
            internalNotes: textOrNull(values.internalNotes),
          },
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

  function applyLead(event) {
    const leadId = event.target.value;
    formik.handleChange(event);
    const lead = leads.find((entry) => entry.id === leadId);
    if (!lead) return;
    // Only fill blanks so a deliberate edit is never overwritten.
    if (!formik.values.companyName) formik.setFieldValue('companyName', lead.companyName || '');
    if (!formik.values.primaryContactName && lead.contactName) {
      formik.setFieldValue('primaryContactName', lead.contactName);
    }
    if (!formik.values.email && lead.email) formik.setFieldValue('email', lead.email);
    if (!formik.values.phone && lead.phone) formik.setFieldValue('phone', lead.phone);
    if (!formik.values.website && lead.website) formik.setFieldValue('website', lead.website);
    if (!formik.values.industry && lead.industry) {
      formik.setFieldValue('industry', lead.industry);
    }
  }

  return (
    <form onSubmit={formik.handleSubmit}>
      <Stack $gap={14}>
        {failure ? <Notice $tone="danger">{failure}</Notice> : null}

        <Notice $tone="info">
          A client links back to the original lead and never replaces it. Existing
          sales history stays with the lead; duplicate client records are never
          merged automatically.
        </Notice>

        <Field>
          <Label htmlFor="client-lead">Link existing lead (optional)</Label>
          <Select
            id="client-lead"
            name="leadId"
            value={formik.values.leadId}
            onChange={applyLead}
            disabled={formik.isSubmitting}
          >
            <option value="">No lead link</option>
            {leads.map((lead) => (
              <option key={lead.id} value={lead.id}>
                {lead.companyName}
                {lead.contactName ? ` · ${lead.contactName}` : ''}
              </option>
            ))}
          </Select>
          <Hint>Only one client can be linked to a given lead.</Hint>
        </Field>

        <Grid $cols={2}>
          <Field>
            <Label htmlFor="client-company">Company name</Label>
            <Input
              id="client-company"
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
            <Label htmlFor="client-contact">Primary contact</Label>
            <Input
              id="client-contact"
              name="primaryContactName"
              value={formik.values.primaryContactName}
              onChange={formik.handleChange}
              disabled={formik.isSubmitting}
            />
            {formik.errors.primaryContactName ? (
              <ErrorText>{formik.errors.primaryContactName}</ErrorText>
            ) : null}
          </Field>
          <Field>
            <Label htmlFor="client-email">Email</Label>
            <Input
              id="client-email"
              name="email"
              type="email"
              value={formik.values.email}
              onChange={formik.handleChange}
              disabled={formik.isSubmitting}
            />
            {formik.errors.email ? <ErrorText>{formik.errors.email}</ErrorText> : null}
          </Field>
          <Field>
            <Label htmlFor="client-phone">Phone</Label>
            <Input
              id="client-phone"
              name="phone"
              value={formik.values.phone}
              onChange={formik.handleChange}
              disabled={formik.isSubmitting}
            />
            {formik.errors.phone ? <ErrorText>{formik.errors.phone}</ErrorText> : null}
          </Field>
          <Field>
            <Label htmlFor="client-website">Website</Label>
            <Input
              id="client-website"
              name="website"
              value={formik.values.website}
              onChange={formik.handleChange}
              placeholder="https://"
              disabled={formik.isSubmitting}
            />
            {formik.errors.website ? (
              <ErrorText>{formik.errors.website}</ErrorText>
            ) : null}
          </Field>
          <Field>
            <Label htmlFor="client-industry">Industry</Label>
            <Input
              id="client-industry"
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
            <Label htmlFor="client-owner">Relationship owner</Label>
            <Select
              id="client-owner"
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
        </Grid>

        <Field>
          <Label htmlFor="client-address">Address</Label>
          <Textarea
            id="client-address"
            name="address"
            value={formik.values.address}
            onChange={formik.handleChange}
            maxLength={500}
            style={{ minHeight: 60 }}
            disabled={formik.isSubmitting}
          />
        </Field>

        <Field>
          <Label htmlFor="client-notes">Internal notes</Label>
          <Textarea
            id="client-notes"
            name="internalNotes"
            value={formik.values.internalNotes}
            onChange={formik.handleChange}
            maxLength={4_000}
            style={{ minHeight: 70 }}
            placeholder="Never shown to the client."
            disabled={formik.isSubmitting}
          />
          {formik.errors.internalNotes ? (
            <ErrorText>{formik.errors.internalNotes}</ErrorText>
          ) : null}
        </Field>

        <Actions>
          <Button type="submit" $variant="primary" disabled={formik.isSubmitting}>
            {formik.isSubmitting ? (
              <Loader2 size={14} className="spin" />
            ) : (
              <Save size={14} />
            )}
            {formik.isSubmitting ? 'Creating…' : 'Create client'}
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
