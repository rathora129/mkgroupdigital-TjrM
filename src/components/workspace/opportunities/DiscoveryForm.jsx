'use client';

import { useState } from 'react';
import { useFormik } from 'formik';
import * as yup from 'yup';
import { BadgeCheck, Loader2, Save } from 'lucide-react';
import { apiRequest } from '@/lib/ai/client';
import {
  Button,
  ErrorText,
  Field,
  Grid,
  Hint,
  Label,
  Notice,
  Select,
  Stack,
  Textarea,
} from '@/components/workspace/ai/primitives';
import {
  DISCOVERY_FORM_FIELDS,
  DISCOVERY_STATUS_META,
} from '@/components/workspace/phase2d/meta';

const optionalText = (max) =>
  yup.string().trim().max(max, `Use ${max.toLocaleString('en-US')} characters or fewer.`);

const schema = yup.object({
  status: yup
    .string()
    .oneOf(['draft', 'in_review', 'approved', 'archived'])
    .required(),
  ...Object.fromEntries(
    DISCOVERY_FORM_FIELDS.map((field) => [
      field.key,
      optionalText(field.key === 'internalNotes' ? 5_000 : 4_000),
    ]),
  ),
});

function initialValues(discovery) {
  const values = { status: discovery?.status || 'draft' };
  for (const field of DISCOVERY_FORM_FIELDS) {
    values[field.key] = discovery?.[field.key] || '';
  }
  return values;
}

function textOrNull(value) {
  const trimmed = String(value ?? '').trim();
  return trimmed ? trimmed : null;
}

export default function DiscoveryForm({
  opportunityId,
  discovery,
  canEdit,
  onSaved,
  idPrefix = 'discovery',
}) {
  const [failure, setFailure] = useState(null);
  const [success, setSuccess] = useState(null);

  const formik = useFormik({
    initialValues: initialValues(discovery),
    validationSchema: schema,
    onSubmit: async (values, helpers) => {
      setFailure(null);
      setSuccess(null);
      const payload = { status: values.status };
      for (const field of DISCOVERY_FORM_FIELDS) {
        payload[field.key] = textOrNull(values[field.key]);
      }

      try {
        const result = await apiRequest(
          `/api/workforce/opportunities/${opportunityId}/discovery`,
          { method: 'PUT', body: payload },
        );
        setSuccess(
          `Discovery saved with status ${DISCOVERY_STATUS_META[values.status]?.label || values.status}.`,
        );
        onSaved?.(result);
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
        {success ? (
          <Notice $tone="success">
            <BadgeCheck size={15} />
            {success}
          </Notice>
        ) : null}

        <Field>
          <Label htmlFor={`${idPrefix}-status`}>Discovery status</Label>
          <Select
            id={`${idPrefix}-status`}
            name="status"
            value={formik.values.status}
            onChange={formik.handleChange}
            disabled={!canEdit || formik.isSubmitting}
          >
            <option value="draft">Draft</option>
            <option value="in_review">In review</option>
            <option value="approved">Approved</option>
            <option value="archived">Archived</option>
          </Select>
          <Hint>
            Approval records a completion date. It does not approve a proposal
            or change any financial record.
          </Hint>
        </Field>

        <Grid $cols={2}>
          {DISCOVERY_FORM_FIELDS.map((field) => (
            <Field key={field.key}>
              <Label htmlFor={`${idPrefix}-${field.key}`}>{field.label}</Label>
              <Textarea
                id={`${idPrefix}-${field.key}`}
                name={field.key}
                value={formik.values[field.key]}
                onChange={formik.handleChange}
                disabled={!canEdit || formik.isSubmitting}
                style={{ minHeight: 84 }}
              />
              {formik.errors[field.key] ? (
                <ErrorText>{formik.errors[field.key]}</ErrorText>
              ) : (
                <Hint>{field.hint}</Hint>
              )}
            </Field>
          ))}
        </Grid>

        {canEdit ? (
          <Button
            type="submit"
            $variant="primary"
            disabled={formik.isSubmitting}
            style={{ alignSelf: 'flex-start' }}
          >
            {formik.isSubmitting ? (
              <Loader2 size={14} className="spin" />
            ) : (
              <Save size={14} />
            )}
            {formik.isSubmitting ? 'Saving…' : 'Save discovery'}
          </Button>
        ) : (
          <Hint>
            Your role can view discovery but not change it. Ask a manager or
            workspace admin for the requirements edit permission.
          </Hint>
        )}
      </Stack>
    </form>
  );
}
