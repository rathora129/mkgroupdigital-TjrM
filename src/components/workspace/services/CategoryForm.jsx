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

const schema = yup.object({
  name: yup
    .string()
    .trim()
    .min(2, 'Name must be at least 2 characters.')
    .max(120, 'Name must be 120 characters or fewer.')
    .required('Category name is required.'),
  description: yup
    .string()
    .trim()
    .max(2_000, 'Description must be 2,000 characters or fewer.'),
  sortOrder: yup
    .number()
    .transform((value, original) => (original === '' ? 0 : value))
    .integer('Use a whole number.')
    .min(0, 'Order cannot be negative.')
    .max(10_000, 'That order value is too large.'),
  status: yup.string().oneOf(['active', 'archived']).required(),
});

function initialValues(category) {
  return {
    name: category?.name || '',
    description: category?.description || '',
    sortOrder: category?.sortOrder ?? 0,
    status: category?.status || 'active',
  };
}

function textOrNull(value) {
  const trimmed = String(value ?? '').trim();
  return trimmed ? trimmed : null;
}

export default function CategoryForm({
  category = null,
  onDone,
  onCancel,
}) {
  const [failure, setFailure] = useState(null);
  const editing = Boolean(category);

  const formik = useFormik({
    initialValues: initialValues(category),
    validationSchema: schema,
    onSubmit: async (values, helpers) => {
      setFailure(null);
      const payload = {
        name: values.name.trim(),
        description: textOrNull(values.description),
        sortOrder: Number(values.sortOrder || 0),
        status: values.status,
      };

      try {
        const result = editing
          ? await apiRequest(`/api/workforce/service-categories/${category.id}`, {
              method: 'PATCH',
              body: payload,
            })
          : await apiRequest('/api/workforce/service-categories', {
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
            <Label htmlFor={`cat-name-${category?.id || 'new'}`}>
              Category name
            </Label>
            <Input
              id={`cat-name-${category?.id || 'new'}`}
              name="name"
              value={formik.values.name}
              onChange={formik.handleChange}
              disabled={formik.isSubmitting}
              required
            />
            {formik.errors.name ? <ErrorText>{formik.errors.name}</ErrorText> : null}
          </Field>

          <Field>
            <Label htmlFor={`cat-order-${category?.id || 'new'}`}>
              Sort order
            </Label>
            <Input
              id={`cat-order-${category?.id || 'new'}`}
              name="sortOrder"
              type="number"
              min="0"
              step="1"
              value={formik.values.sortOrder}
              onChange={formik.handleChange}
              disabled={formik.isSubmitting}
            />
            {formik.errors.sortOrder ? (
              <ErrorText>{formik.errors.sortOrder}</ErrorText>
            ) : null}
          </Field>
        </Grid>

        <Field>
          <Label htmlFor={`cat-description-${category?.id || 'new'}`}>
            Description
          </Label>
          <Textarea
            id={`cat-description-${category?.id || 'new'}`}
            name="description"
            value={formik.values.description}
            onChange={formik.handleChange}
            maxLength={2_000}
            style={{ minHeight: 70 }}
            disabled={formik.isSubmitting}
          />
          {formik.errors.description ? (
            <ErrorText>{formik.errors.description}</ErrorText>
          ) : null}
        </Field>

        {editing ? (
          <Field>
            <Label htmlFor={`cat-status-${category.id}`}>Status</Label>
            <Select
              id={`cat-status-${category.id}`}
              name="status"
              value={formik.values.status}
              onChange={formik.handleChange}
              disabled={formik.isSubmitting}
            >
              <option value="active">Active</option>
              <option value="archived">Archived</option>
            </Select>
          </Field>
        ) : null}

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
                ? 'Save category'
                : 'Add category'}
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
