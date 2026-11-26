'use client';

import { useState } from 'react';
import { useFormik } from 'formik';
import * as yup from 'yup';
import { Loader2, Play, X } from 'lucide-react';
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
} from '@/components/workspace/ai/primitives';

const schema = yup.object({
  url: yup
    .string()
    .trim()
    .required('Enter the website URL to audit.')
    .max(300, 'The URL must be 300 characters or fewer.')
    .test('http-url', 'Enter a full http or https URL.', (value) => {
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
  maxPages: yup
    .number()
    .integer('Choose a whole number of pages.')
    .min(1, 'Audit at least one page.')
    .max(10, 'Audits can scan at most 10 pages.')
    .required(),
});

export default function AuditForm({ onDone, onCancel }) {
  const [failure, setFailure] = useState(null);

  const formik = useFormik({
    initialValues: { url: '', maxPages: '5' },
    validationSchema: schema,
    onSubmit: async (values, helpers) => {
      setFailure(null);
      try {
        const result = await apiRequest('/api/workforce/website-audits', {
          method: 'POST',
          body: {
            url: values.url.trim(),
            maxPages: Number(values.maxPages),
          },
        });
        onDone?.(result.audit);
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
            <Label htmlFor="audit-url">Website URL</Label>
            <Input
              id="audit-url"
              name="url"
              value={formik.values.url}
              onChange={formik.handleChange}
              placeholder="https://example.com"
              disabled={formik.isSubmitting}
              required
            />
            {formik.errors.url ? (
              <ErrorText>{formik.errors.url}</ErrorText>
            ) : null}
          </Field>
          <Field>
            <Label htmlFor="audit-pages">Maximum pages</Label>
            <Select
              id="audit-pages"
              name="maxPages"
              value={formik.values.maxPages}
              onChange={formik.handleChange}
              disabled={formik.isSubmitting}
            >
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((count) => (
                <option key={count} value={String(count)}>
                  {count} {count === 1 ? 'page' : 'pages'}
                </option>
              ))}
            </Select>
            <Hint>
              The crawler stays on the submitted domain and respects robots.txt.
            </Hint>
          </Field>
        </Grid>

        <Hint>
          Only external, public http/https URLs can be audited. Localhost,
          private network addresses and cloud metadata endpoints are rejected
          before any request is made.
        </Hint>

        <Actions>
          <Button
            type="submit"
            $variant="primary"
            disabled={formik.isSubmitting}
          >
            {formik.isSubmitting ? (
              <Loader2 size={15} className="spin" />
            ) : (
              <Play size={15} />
            )}
            Queue audit
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
