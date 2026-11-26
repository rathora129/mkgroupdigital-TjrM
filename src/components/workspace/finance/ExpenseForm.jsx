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
import { toMinorInput } from '@/components/workspace/proposals/meta';
import { EXPENSE_CATEGORY_LABELS } from './meta';

const schema = yup.object({
  category: yup.string().required('Choose a category.'),
  description: yup
    .string()
    .trim()
    .min(2, 'Describe the expense.')
    .max(300, 'Description is too long.')
    .required('Describe the expense.'),
  amount: yup
    .number()
    .transform((value, original) => (original === '' ? undefined : value))
    .positive('Enter an amount above zero.')
    .required('Enter the amount.'),
  currency: yup
    .string()
    .trim()
    .uppercase()
    .matches(/^[A-Z]{3}$/, 'Use a three-letter currency code.')
    .required('Enter a currency code.'),
  expenseDate: yup.string().required('Choose the expense date.'),
});

function toIsoDate(value) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export default function ExpenseForm({
  projects = [],
  defaultCurrency = 'INR',
  onDone,
  onCancel,
}) {
  const [failure, setFailure] = useState(null);
  const today = new Date().toISOString().slice(0, 10);

  const formik = useFormik({
    initialValues: {
      category: 'software',
      description: '',
      amount: '',
      currency: defaultCurrency,
      expenseDate: today,
      projectId: '',
      vendor: '',
      receiptReference: '',
    },
    validationSchema: schema,
    onSubmit: async (values, helpers) => {
      setFailure(null);
      try {
        const result = await apiRequest('/api/workforce/expenses', {
          method: 'POST',
          body: {
            category: values.category,
            description: values.description.trim(),
            amountCents: toMinorInput(values.amount),
            currency: values.currency.trim().toUpperCase(),
            expenseDate: toIsoDate(values.expenseDate),
            projectId: values.projectId || null,
            vendor: values.vendor.trim() || null,
            receiptReference: values.receiptReference.trim() || null,
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
      <Stack $gap={12}>
        {failure ? <Notice $tone="danger">{failure}</Notice> : null}

        <Grid $cols={2}>
          <Field>
            <Label htmlFor="expense-category">Category</Label>
            <Select
              id="expense-category"
              name="category"
              value={formik.values.category}
              onChange={formik.handleChange}
              disabled={formik.isSubmitting}
            >
              {Object.entries(EXPENSE_CATEGORY_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
          <Field>
            <Label htmlFor="expense-date">Expense date</Label>
            <Input
              id="expense-date"
              name="expenseDate"
              type="date"
              value={formik.values.expenseDate}
              onChange={formik.handleChange}
              disabled={formik.isSubmitting}
            />
            {formik.errors.expenseDate ? (
              <ErrorText>{formik.errors.expenseDate}</ErrorText>
            ) : null}
          </Field>
        </Grid>

        <Field>
          <Label htmlFor="expense-description">Description</Label>
          <Textarea
            id="expense-description"
            name="description"
            value={formik.values.description}
            onChange={formik.handleChange}
            maxLength={300}
            style={{ minHeight: 60 }}
            disabled={formik.isSubmitting}
          />
          {formik.errors.description ? (
            <ErrorText>{formik.errors.description}</ErrorText>
          ) : null}
        </Field>

        <Grid $cols={3}>
          <Field>
            <Label htmlFor="expense-amount">Amount</Label>
            <Input
              id="expense-amount"
              name="amount"
              type="number"
              min="0.01"
              step="0.01"
              value={formik.values.amount}
              onChange={formik.handleChange}
              disabled={formik.isSubmitting}
            />
            {formik.errors.amount ? <ErrorText>{formik.errors.amount}</ErrorText> : null}
          </Field>
          <Field>
            <Label htmlFor="expense-currency">Currency</Label>
            <Input
              id="expense-currency"
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
            <Label htmlFor="expense-project">Project (optional)</Label>
            <Select
              id="expense-project"
              name="projectId"
              value={formik.values.projectId}
              onChange={formik.handleChange}
              disabled={formik.isSubmitting}
            >
              <option value="">No project link</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.reference} · {project.name}
                </option>
              ))}
            </Select>
          </Field>
        </Grid>

        <Grid $cols={2}>
          <Field>
            <Label htmlFor="expense-vendor">Vendor</Label>
            <Input
              id="expense-vendor"
              name="vendor"
              value={formik.values.vendor}
              onChange={formik.handleChange}
              maxLength={160}
              disabled={formik.isSubmitting}
            />
          </Field>
          <Field>
            <Label htmlFor="expense-receipt">Receipt reference</Label>
            <Input
              id="expense-receipt"
              name="receiptReference"
              value={formik.values.receiptReference}
              onChange={formik.handleChange}
              maxLength={200}
              disabled={formik.isSubmitting}
            />
          </Field>
        </Grid>

        <Hint>
          New expenses start as pending approval. A manager or admin records the
          decision, and approved expenses feed the internal finance overview.
        </Hint>

        <Actions>
          <Button type="submit" $variant="primary" disabled={formik.isSubmitting}>
            {formik.isSubmitting ? <Loader2 size={14} className="spin" /> : <Save size={14} />}
            {formik.isSubmitting ? 'Saving…' : 'Record expense'}
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
