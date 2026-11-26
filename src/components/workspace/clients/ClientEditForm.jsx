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
  Input,
  Label,
  Notice,
  Select,
  Stack,
  Textarea,
} from '@/components/workspace/ai/primitives';
import { CLIENT_STATUS_TRANSITIONS } from '@/lib/clients/transitions';
import { CLIENT_STATUS_META } from './meta';

const optionalText = (max, message) => yup.string().trim().max(max, message);

const schema = yup.object({
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
  status: yup.string().oneOf(['active', 'inactive', 'archived']).required(),
  internalNotes: optionalText(4_000, 'Internal notes are too long.'),
});

function textOrNull(value) {
  const trimmed = String(value ?? '').trim();
  return trimmed ? trimmed : null;
}

export default function ClientEditForm({ client, members = [], onDone, onCancel }) {
  const [failure, setFailure] = useState(null);
  const allowedStatuses = [
    client.status,
    ...(CLIENT_STATUS_TRANSITIONS[client.status] || []),
  ];

  const formik = useFormik({
    initialValues: {
      companyName: client.companyName || '',
      primaryContactName: client.primaryContactName || '',
      email: client.email || '',
      phone: client.phone || '',
      website: client.website || '',
      industry: client.industry || '',
      address: client.address || '',
      ownerUserId: client.ownerUserId || '',
      status: client.status,
      internalNotes: client.internalNotes || '',
    },
    validationSchema: schema,
    onSubmit: async (values, helpers) => {
      setFailure(null);
      try {
        const result = await apiRequest(`/api/workforce/clients/${client.id}`, {
          method: 'PATCH',
          body: {
            expectedUpdatedAt: client.updatedAt,
            companyName: values.companyName.trim(),
            primaryContactName: textOrNull(values.primaryContactName),
            email: textOrNull(values.email),
            phone: textOrNull(values.phone),
            website: textOrNull(values.website),
            industry: textOrNull(values.industry),
            address: textOrNull(values.address),
            ownerUserId: values.ownerUserId || null,
            status: values.status,
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

  return (
    <form onSubmit={formik.handleSubmit}>
      <Stack $gap={14}>
        {failure ? <Notice $tone="danger">{failure}</Notice> : null}

        <Grid $cols={2}>
          <Field>
            <Label htmlFor="edit-company">Company name</Label>
            <Input
              id="edit-company"
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
            <Label htmlFor="edit-contact">Primary contact</Label>
            <Input
              id="edit-contact"
              name="primaryContactName"
              value={formik.values.primaryContactName}
              onChange={formik.handleChange}
              disabled={formik.isSubmitting}
            />
          </Field>
          <Field>
            <Label htmlFor="edit-email">Email</Label>
            <Input
              id="edit-email"
              name="email"
              type="email"
              value={formik.values.email}
              onChange={formik.handleChange}
              disabled={formik.isSubmitting}
            />
            {formik.errors.email ? <ErrorText>{formik.errors.email}</ErrorText> : null}
          </Field>
          <Field>
            <Label htmlFor="edit-phone">Phone</Label>
            <Input
              id="edit-phone"
              name="phone"
              value={formik.values.phone}
              onChange={formik.handleChange}
              disabled={formik.isSubmitting}
            />
          </Field>
          <Field>
            <Label htmlFor="edit-website">Website</Label>
            <Input
              id="edit-website"
              name="website"
              value={formik.values.website}
              onChange={formik.handleChange}
              disabled={formik.isSubmitting}
            />
            {formik.errors.website ? (
              <ErrorText>{formik.errors.website}</ErrorText>
            ) : null}
          </Field>
          <Field>
            <Label htmlFor="edit-industry">Industry</Label>
            <Input
              id="edit-industry"
              name="industry"
              value={formik.values.industry}
              onChange={formik.handleChange}
              disabled={formik.isSubmitting}
            />
          </Field>
          <Field>
            <Label htmlFor="edit-owner">Relationship owner</Label>
            <Select
              id="edit-owner"
              name="ownerUserId"
              value={formik.values.ownerUserId}
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
          <Field>
            <Label htmlFor="edit-status">Status</Label>
            <Select
              id="edit-status"
              name="status"
              value={formik.values.status}
              onChange={formik.handleChange}
              disabled={formik.isSubmitting || allowedStatuses.length <= 1}
            >
              {allowedStatuses.map((status) => (
                <option key={status} value={status}>
                  {CLIENT_STATUS_META[status]?.label || status}
                </option>
              ))}
            </Select>
          </Field>
        </Grid>

        <Field>
          <Label htmlFor="edit-address">Address</Label>
          <Textarea
            id="edit-address"
            name="address"
            value={formik.values.address}
            onChange={formik.handleChange}
            maxLength={500}
            style={{ minHeight: 60 }}
            disabled={formik.isSubmitting}
          />
        </Field>

        <Field>
          <Label htmlFor="edit-notes">Internal notes</Label>
          <Textarea
            id="edit-notes"
            name="internalNotes"
            value={formik.values.internalNotes}
            onChange={formik.handleChange}
            maxLength={4_000}
            style={{ minHeight: 70 }}
            placeholder="Never shown to the client."
            disabled={formik.isSubmitting}
          />
        </Field>

        <Actions>
          <Button type="submit" $variant="primary" disabled={formik.isSubmitting}>
            {formik.isSubmitting ? (
              <Loader2 size={14} className="spin" />
            ) : (
              <Save size={14} />
            )}
            {formik.isSubmitting ? 'Saving…' : 'Save client'}
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
