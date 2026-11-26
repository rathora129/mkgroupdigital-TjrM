'use client';

import { useState } from 'react';
import { useFormik } from 'formik';
import * as yup from 'yup';
import { Loader2, Save } from 'lucide-react';
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
import { TIMELINE_TYPE_LABELS } from './meta';

const schema = yup.object({
  type: yup
    .string()
    .oneOf(['note', 'meeting', 'call', 'email_manual'])
    .required(),
  title: yup
    .string()
    .trim()
    .min(2, 'Title must be at least 2 characters.')
    .max(200, 'Title must be 200 characters or fewer.')
    .required('Title is required.'),
  body: yup.string().trim().max(8_000, 'Detail is too long.'),
  occurredAt: yup.string(),
});

export default function TimelineEntryForm({ clientId, onDone }) {
  const [failure, setFailure] = useState(null);
  const [notice, setNotice] = useState(null);

  const formik = useFormik({
    initialValues: { type: 'note', title: '', body: '', occurredAt: '' },
    validationSchema: schema,
    onSubmit: async (values, helpers) => {
      setFailure(null);
      setNotice(null);
      try {
        const result = await apiRequest(`/api/workforce/clients/${clientId}/timeline`, {
          method: 'POST',
          body: {
            type: values.type,
            title: values.title.trim(),
            body: values.body.trim() || null,
            occurredAt: values.occurredAt
              ? new Date(values.occurredAt).toISOString()
              : null,
          },
        });
        setNotice('Timeline entry recorded.');
        helpers.resetForm();
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
        {notice ? <Notice $tone="success">{notice}</Notice> : null}

        <Grid $cols={2}>
          <Field>
            <Label htmlFor="timeline-type">Type</Label>
            <Select
              id="timeline-type"
              name="type"
              value={formik.values.type}
              onChange={formik.handleChange}
              disabled={formik.isSubmitting}
            >
              {Object.entries(TIMELINE_TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
          <Field>
            <Label htmlFor="timeline-occurred">When it happened</Label>
            <Input
              id="timeline-occurred"
              name="occurredAt"
              type="datetime-local"
              value={formik.values.occurredAt}
              onChange={formik.handleChange}
              disabled={formik.isSubmitting}
            />
          </Field>
        </Grid>

        <Field>
          <Label htmlFor="timeline-title">Title</Label>
          <Input
            id="timeline-title"
            name="title"
            value={formik.values.title}
            onChange={formik.handleChange}
            placeholder="Kickoff call with the client"
            disabled={formik.isSubmitting}
            required
          />
          {formik.errors.title ? <ErrorText>{formik.errors.title}</ErrorText> : null}
        </Field>

        <Field>
          <Label htmlFor="timeline-body">Notes</Label>
          <Textarea
            id="timeline-body"
            name="body"
            value={formik.values.body}
            onChange={formik.handleChange}
            maxLength={8_000}
            style={{ minHeight: 70 }}
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
            {formik.isSubmitting ? 'Recording…' : 'Record entry'}
          </Button>
        </Actions>
      </Stack>
    </form>
  );
}
