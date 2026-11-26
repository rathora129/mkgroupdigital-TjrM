'use client';

import { useState } from 'react';
import { useFormik } from 'formik';
import * as yup from 'yup';
import { Loader2, Save, ShieldAlert, X } from 'lucide-react';
import { apiRequest } from '@/lib/ai/client';
import {
  Actions,
  Button,
  CheckLabel,
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
import { BILLING_TYPE_LABELS } from '@/components/workspace/phase2d/meta';

const schema = yup.object({
  categoryId: yup.string().required('Choose a category.'),
  name: yup
    .string()
    .trim()
    .min(2, 'Name must be at least 2 characters.')
    .max(120, 'Name must be 120 characters or fewer.')
    .required('Service name is required.'),
  description: yup
    .string()
    .trim()
    .max(2_000, 'Description must be 2,000 characters or fewer.'),
  billingType: yup
    .string()
    .oneOf(['one_time', 'monthly', 'both', 'custom'])
    .required(),
  regulated: yup.boolean(),
  reviewProfession: yup.string().trim().when('regulated', {
    is: true,
    then: (field) =>
      field
        .required('Identify the qualified professional responsible for review or filing.')
        .max(120, 'Reviewer must be 120 characters or fewer.'),
    otherwise: (field) => field.max(120, 'Reviewer must be 120 characters or fewer.'),
  }),
  reviewNotes: yup
    .string()
    .trim()
    .max(1_000, 'Review notes must be 1,000 characters or fewer.'),
  status: yup.string().oneOf(['active', 'archived']).required(),
});

function initialValues(service, defaultCategoryId) {
  return {
    categoryId: service?.categoryId || defaultCategoryId || '',
    name: service?.name || '',
    description: service?.description || '',
    billingType: service?.billingType || 'custom',
    regulated: Boolean(service?.regulated),
    reviewProfession: service?.reviewProfession || '',
    reviewNotes: service?.reviewNotes || '',
    status: service?.status || 'active',
  };
}

function textOrNull(value) {
  const trimmed = String(value ?? '').trim();
  return trimmed ? trimmed : null;
}

export default function ServiceForm({
  service = null,
  categories = [],
  defaultCategoryId = '',
  onDone,
  onCancel,
}) {
  const [failure, setFailure] = useState(null);
  const editing = Boolean(service);

  const formik = useFormik({
    initialValues: initialValues(service, defaultCategoryId),
    validationSchema: schema,
    onSubmit: async (values, helpers) => {
      setFailure(null);
      const payload = {
        categoryId: values.categoryId,
        name: values.name.trim(),
        description: textOrNull(values.description),
        billingType: values.billingType,
        regulated: values.regulated,
        reviewProfession: values.regulated
          ? textOrNull(values.reviewProfession)
          : null,
        reviewNotes: textOrNull(values.reviewNotes),
        status: values.status,
      };

      try {
        const result = editing
          ? await apiRequest(`/api/workforce/services/${service.id}`, {
              method: 'PATCH',
              body: payload,
            })
          : await apiRequest('/api/workforce/services', {
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
            <Label htmlFor={`svc-category-${service?.id || 'new'}`}>Category</Label>
            <Select
              id={`svc-category-${service?.id || 'new'}`}
              name="categoryId"
              value={formik.values.categoryId}
              onChange={formik.handleChange}
              disabled={formik.isSubmitting}
            >
              <option value="">Choose a category</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </Select>
            {formik.errors.categoryId ? (
              <ErrorText>{formik.errors.categoryId}</ErrorText>
            ) : null}
          </Field>

          <Field>
            <Label htmlFor={`svc-name-${service?.id || 'new'}`}>Service name</Label>
            <Input
              id={`svc-name-${service?.id || 'new'}`}
              name="name"
              value={formik.values.name}
              onChange={formik.handleChange}
              disabled={formik.isSubmitting}
              required
            />
            {formik.errors.name ? <ErrorText>{formik.errors.name}</ErrorText> : null}
          </Field>

          <Field>
            <Label htmlFor={`svc-billing-${service?.id || 'new'}`}>
              Billing type
            </Label>
            <Select
              id={`svc-billing-${service?.id || 'new'}`}
              name="billingType"
              value={formik.values.billingType}
              onChange={formik.handleChange}
              disabled={formik.isSubmitting}
            >
              {Object.entries(BILLING_TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
            <Hint>Billing type is a description. No price is stored here.</Hint>
          </Field>

          <Field>
            <Label htmlFor={`svc-status-${service?.id || 'new'}`}>Status</Label>
            <Select
              id={`svc-status-${service?.id || 'new'}`}
              name="status"
              value={formik.values.status}
              onChange={formik.handleChange}
              disabled={formik.isSubmitting}
            >
              <option value="active">Active</option>
              <option value="archived">Archived</option>
            </Select>
          </Field>
        </Grid>

        <Field>
          <Label htmlFor={`svc-description-${service?.id || 'new'}`}>
            Description
          </Label>
          <Textarea
            id={`svc-description-${service?.id || 'new'}`}
            name="description"
            value={formik.values.description}
            onChange={formik.handleChange}
            maxLength={2_000}
            style={{ minHeight: 72 }}
            disabled={formik.isSubmitting}
          />
          {formik.errors.description ? (
            <ErrorText>{formik.errors.description}</ErrorText>
          ) : null}
        </Field>

        <CheckLabel>
          <input
            type="checkbox"
            name="regulated"
            checked={formik.values.regulated}
            onChange={formik.handleChange}
            disabled={formik.isSubmitting}
          />
          This service needs review, certification, signing or filing by a
          qualified professional.
        </CheckLabel>

        {formik.values.regulated ? (
          <>
            <Notice $tone="warning">
              <ShieldAlert size={15} />
              <span>
                Identify who is responsible. MK Group Digital coordinates the
                work; the qualified professional performs the statutory step.
              </span>
            </Notice>
            <Grid $cols={2}>
              <Field>
                <Label htmlFor={`svc-reviewer-${service?.id || 'new'}`}>
                  Responsible professional
                </Label>
                <Input
                  id={`svc-reviewer-${service?.id || 'new'}`}
                  name="reviewProfession"
                  value={formik.values.reviewProfession}
                  onChange={formik.handleChange}
                  placeholder="CA, CS or the named professional"
                  disabled={formik.isSubmitting}
                />
                {formik.errors.reviewProfession ? (
                  <ErrorText>{formik.errors.reviewProfession}</ErrorText>
                ) : null}
              </Field>
              <Field>
                <Label htmlFor={`svc-review-notes-${service?.id || 'new'}`}>
                  Review notes
                </Label>
                <Input
                  id={`svc-review-notes-${service?.id || 'new'}`}
                  name="reviewNotes"
                  value={formik.values.reviewNotes}
                  onChange={formik.handleChange}
                  placeholder="Who reviews and what they certify"
                  disabled={formik.isSubmitting}
                />
                {formik.errors.reviewNotes ? (
                  <ErrorText>{formik.errors.reviewNotes}</ErrorText>
                ) : null}
              </Field>
            </Grid>
          </>
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
                ? 'Save service'
                : 'Add service'}
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
