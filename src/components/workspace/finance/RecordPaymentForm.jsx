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
import { formatMoney, toMajorInput, toMinorInput } from '@/components/workspace/proposals/meta';
import { PAYMENT_METHOD_LABELS } from './meta';

const schema = yup.object({
  invoiceId: yup.string().required('Choose an invoice.'),
  amount: yup
    .number()
    .transform((value, original) => (original === '' ? undefined : value))
    .positive('Enter an amount above zero.')
    .required('Enter the amount received.'),
  paymentDate: yup.string().required('Choose the payment date.'),
  method: yup.string().required('Choose a payment method.'),
});

function toIsoDate(value) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export default function RecordPaymentForm({
  invoice = null,
  invoices = [],
  onDone,
  onCancel,
}) {
  const [failure, setFailure] = useState(null);
  const locked = Boolean(invoice);
  const today = new Date().toISOString().slice(0, 10);

  const formik = useFormik({
    initialValues: {
      invoiceId: invoice?.id || '',
      amount: invoice ? toMajorInput(invoice.balanceDueCents) : '',
      paymentDate: today,
      method: 'bank_transfer',
      transactionReference: '',
      notes: '',
    },
    validationSchema: schema,
    onSubmit: async (values, helpers) => {
      setFailure(null);
      try {
        const result = await apiRequest('/api/workforce/payments', {
          method: 'POST',
          body: {
            invoiceId: values.invoiceId,
            amountCents: toMinorInput(values.amount),
            paymentDate: toIsoDate(values.paymentDate),
            method: values.method,
            transactionReference: values.transactionReference.trim() || null,
            notes: values.notes.trim() || null,
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

  const selectedInvoice = locked
    ? invoice
    : invoices.find((entry) => entry.id === formik.values.invoiceId);

  return (
    <form onSubmit={formik.handleSubmit}>
      <Stack $gap={12}>
        {failure ? <Notice $tone="danger">{failure}</Notice> : null}

        {locked ? (
          <Hint>
            Recording against {invoice.reference} · outstanding{' '}
            {formatMoney(invoice.balanceDueCents, invoice.currency)}
          </Hint>
        ) : (
          <Field>
            <Label htmlFor="payment-invoice">Invoice</Label>
            <Select
              id="payment-invoice"
              name="invoiceId"
              value={formik.values.invoiceId}
              onChange={formik.handleChange}
              disabled={formik.isSubmitting}
            >
              <option value="">Choose an issued invoice</option>
              {invoices.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.reference} · {entry.clientName} ·{' '}
                  {formatMoney(entry.balanceDueCents, entry.currency)}
                </option>
              ))}
            </Select>
            {formik.errors.invoiceId ? (
              <ErrorText>{formik.errors.invoiceId}</ErrorText>
            ) : null}
            {invoices.length === 0 ? (
              <Hint>No issued invoice currently has an outstanding balance.</Hint>
            ) : null}
            {selectedInvoice ? (
              <Hint>
                Outstanding {formatMoney(selectedInvoice.balanceDueCents, selectedInvoice.currency)}{' '}
                in {selectedInvoice.currency}.
              </Hint>
            ) : null}
          </Field>
        )}

        <Grid $cols={3}>
          <Field>
            <Label htmlFor="payment-amount">
              Amount ({selectedInvoice?.currency || 'INR'})
            </Label>
            <Input
              id="payment-amount"
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
            <Label htmlFor="payment-date">Payment date</Label>
            <Input
              id="payment-date"
              name="paymentDate"
              type="date"
              value={formik.values.paymentDate}
              onChange={formik.handleChange}
              disabled={formik.isSubmitting}
            />
            {formik.errors.paymentDate ? (
              <ErrorText>{formik.errors.paymentDate}</ErrorText>
            ) : null}
          </Field>
          <Field>
            <Label htmlFor="payment-method">Method</Label>
            <Select
              id="payment-method"
              name="method"
              value={formik.values.method}
              onChange={formik.handleChange}
              disabled={formik.isSubmitting}
            >
              {Object.entries(PAYMENT_METHOD_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
        </Grid>

        <Grid $cols={2}>
          <Field>
            <Label htmlFor="payment-reference">Transaction reference</Label>
            <Input
              id="payment-reference"
              name="transactionReference"
              value={formik.values.transactionReference}
              onChange={formik.handleChange}
              maxLength={120}
              placeholder="Bank / UPI reference"
              disabled={formik.isSubmitting}
            />
            {formik.errors.transactionReference ? (
              <ErrorText>{formik.errors.transactionReference}</ErrorText>
            ) : null}
          </Field>
          <Field>
            <Label htmlFor="payment-notes">Notes</Label>
            <Textarea
              id="payment-notes"
              name="notes"
              value={formik.values.notes}
              onChange={formik.handleChange}
              maxLength={2_000}
              style={{ minHeight: 44 }}
              disabled={formik.isSubmitting}
            />
          </Field>
        </Grid>

        <Hint>
          A payment can never exceed the outstanding balance. Recording a payment
          marks the invoice partially paid or paid and keeps the receipt history.
        </Hint>

        <Actions>
          <Button type="submit" $variant="primary" disabled={formik.isSubmitting}>
            {formik.isSubmitting ? <Loader2 size={14} className="spin" /> : <Save size={14} />}
            {formik.isSubmitting ? 'Recording…' : 'Record payment'}
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
