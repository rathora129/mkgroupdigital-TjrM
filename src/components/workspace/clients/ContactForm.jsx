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
  CheckLabel,
  Field,
  Grid,
  Input,
  Label,
  Notice,
  Stack,
  Textarea,
} from '@/components/workspace/ai/primitives';

const optionalText = (max, message) => yup.string().trim().max(max, message);

const schema = yup.object({
  name: yup
    .string()
    .trim()
    .min(2, 'Contact name must be at least 2 characters.')
    .max(160, 'Contact name must be 160 characters or fewer.')
    .required('Contact name is required.'),
  title: optionalText(120, 'Title is too long.'),
  email: yup
    .string()
    .trim()
    .email('Enter a valid email address.')
    .max(254, 'That email is too long.'),
  phone: optionalText(40, 'Phone number is too long.'),
  isPrimary: yup.boolean(),
  notes: optionalText(2_000, 'Notes are too long.'),
});

function textOrNull(value) {
  const trimmed = String(value ?? '').trim();
  return trimmed ? trimmed : null;
}

export default function ContactForm({ clientId, contact = null, onDone, onCancel }) {
  const [failure, setFailure] = useState(null);
  const editing = Boolean(contact);

  const formik = useFormik({
    initialValues: {
      name: contact?.name || '',
      title: contact?.title || '',
      email: contact?.email || '',
      phone: contact?.phone || '',
      isPrimary: Boolean(contact?.isPrimary),
      notes: contact?.notes || '',
    },
    validationSchema: schema,
    onSubmit: async (values, helpers) => {
      setFailure(null);
      const payload = {
        name: values.name.trim(),
        title: textOrNull(values.title),
        email: textOrNull(values.email),
        phone: textOrNull(values.phone),
        isPrimary: Boolean(values.isPrimary),
        notes: textOrNull(values.notes),
      };
      try {
        const result = editing
          ? await apiRequest(
              `/api/workforce/clients/${clientId}/contacts/${contact.id}`,
              { method: 'PATCH', body: payload },
            )
          : await apiRequest(`/api/workforce/clients/${clientId}/contacts`, {
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
      <Stack $gap={12}>
        {failure ? <Notice $tone="danger">{failure}</Notice> : null}

        <Grid $cols={2}>
          <Field>
            <Label htmlFor="contact-name">Name</Label>
            <Input
              id="contact-name"
              name="name"
              value={formik.values.name}
              onChange={formik.handleChange}
              disabled={formik.isSubmitting}
              required
            />
            {formik.errors.name ? <ErrorText>{formik.errors.name}</ErrorText> : null}
          </Field>
          <Field>
            <Label htmlFor="contact-title">Role or title</Label>
            <Input
              id="contact-title"
              name="title"
              value={formik.values.title}
              onChange={formik.handleChange}
              disabled={formik.isSubmitting}
            />
          </Field>
          <Field>
            <Label htmlFor="contact-email">Email</Label>
            <Input
              id="contact-email"
              name="email"
              type="email"
              value={formik.values.email}
              onChange={formik.handleChange}
              disabled={formik.isSubmitting}
            />
            {formik.errors.email ? <ErrorText>{formik.errors.email}</ErrorText> : null}
          </Field>
          <Field>
            <Label htmlFor="contact-phone">Phone</Label>
            <Input
              id="contact-phone"
              name="phone"
              value={formik.values.phone}
              onChange={formik.handleChange}
              disabled={formik.isSubmitting}
            />
          </Field>
        </Grid>

        <Field>
          <Label htmlFor="contact-notes">Notes</Label>
          <Textarea
            id="contact-notes"
            name="notes"
            value={formik.values.notes}
            onChange={formik.handleChange}
            maxLength={2_000}
            style={{ minHeight: 60 }}
            disabled={formik.isSubmitting}
          />
        </Field>

        <CheckLabel>
          <input
            type="checkbox"
            name="isPrimary"
            checked={formik.values.isPrimary}
            onChange={formik.handleChange}
            disabled={formik.isSubmitting}
          />
          Primary contact for this client
        </CheckLabel>

        <Actions>
          <Button type="submit" $variant="primary" disabled={formik.isSubmitting}>
            {formik.isSubmitting ? (
              <Loader2 size={14} className="spin" />
            ) : (
              <Save size={14} />
            )}
            {formik.isSubmitting ? 'Saving…' : editing ? 'Save contact' : 'Add contact'}
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
