import * as yup from 'yup';
import {
  EXPENSE_CATEGORIES,
  EXPENSE_STATUSES,
  INVOICE_SOURCES,
  INVOICE_STATUSES,
  PAYMENT_METHODS,
} from './transitions';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value) {
  return typeof value === 'string' && UUID_RE.test(value);
}

const emptyToNull = (value) =>
  typeof value === 'string' && value.trim() === '' ? null : value;

const nullableText = (max, message) =>
  yup.string().trim().transform(emptyToNull).max(max, message).nullable();

const requiredText = (max, message) =>
  yup
    .string()
    .trim()
    .min(2, message)
    .max(max, message)
    .required(message);

const uuidField = (message) =>
  yup
    .string()
    .trim()
    .transform(emptyToNull)
    .test('uuid', message, (value) => value === undefined || value === null || isUuid(value))
    .nullable();

const requiredUuid = (message) =>
  yup
    .string()
    .trim()
    .test('uuid', message, (value) => isUuid(value))
    .required(message);

const dateField = (message) =>
  yup
    .date()
    .transform((value, original) => (original === '' ? null : value))
    .typeError(message)
    .nullable();

const requiredDateField = (message) =>
  yup
    .date()
    .transform((value, original) => (original === '' || original === null ? null : value))
    .typeError(message)
    .required(message);

const integerField = ({ min = 0, max = 10_000_000_000, message }) =>
  yup
    .number()
    .transform((value, original) =>
      original === '' || original === null || original === undefined ? 0 : value,
    )
    .integer('Use a whole number.')
    .min(min, message)
    .max(max, 'That value is too large.');

const positiveMoneyField = yup
  .number()
  .transform((value, original) => (original === '' || original === null ? null : value))
  .integer('Use whole minor units.')
  .min(1, 'Amount must be greater than zero.')
  .max(10_000_000_000, 'That amount is too large.')
  .required('Enter an amount.');

const currencyField = yup
  .string()
  .trim()
  .uppercase()
  .matches(/^[A-Z]{3}$/, 'Use a three-letter currency code.')
  .default('INR');

export const invoiceLineSchema = yup.object({
  description: requiredText(300, 'Describe the line item.'),
  quantity: integerField({ min: 1, max: 1_000_000, message: 'Quantity must be at least 1.' }).default(1),
  unitPriceCents: integerField({ min: 0, message: 'Unit price cannot be negative.' }).default(0),
  discountType: yup
    .string()
    .oneOf(['none', 'fixed', 'percent'], 'Choose a valid discount type.')
    .default('none'),
  discountValue: yup
    .number()
    .transform((value, original) => (original === '' || original === null ? 0 : value))
    .integer('Use a whole number.')
    .min(0, 'Discount cannot be negative.')
    .default(0)
    .when('discountType', {
      is: 'percent',
      then: (schema) => schema.max(10_000, 'Percentage discount cannot exceed 100.'),
    }),
  taxScheme: yup
    .string()
    .oneOf(['none', 'cgst_sgst', 'igst'], 'Choose a valid tax scheme.')
    .default('none'),
  taxRateBps: integerField({ min: 0, max: 10_000, message: 'Tax rate cannot be negative.' }).default(0),
});

export const invoiceCreateSchema = yup.object({
  source: yup
    .string()
    .oneOf(INVOICE_SOURCES, 'Choose where this invoice comes from.')
    .default('manual'),
  proposalId: uuidField('Choose an accepted proposal.'),
  engagementId: uuidField('Choose a service engagement.'),
  clientId: uuidField('Choose a client.'),
  projectId: uuidField('Choose a project.'),
  invoiceDate: requiredDateField('Choose the invoice date.'),
  dueDate: dateField('Enter a valid due date.'),
  currency: currencyField,
  notes: nullableText(4_000, 'Notes are too long.'),
  terms: nullableText(4_000, 'Terms are too long.'),
  periodLabel: nullableText(80, 'Period label is too long.'),
  lines: yup.array().of(invoiceLineSchema).max(100, 'An invoice supports up to 100 lines.').default([]),
}).test('source-inputs', 'Check the invoice source details.', function validateSource(value) {
  const input = value || {};
  if (input.source === 'proposal' && !input.proposalId) {
    return this.createError({
      path: 'proposalId',
      message: 'Choose an accepted proposal to invoice.',
    });
  }
  if (input.source === 'engagement' && !input.engagementId) {
    return this.createError({
      path: 'engagementId',
      message: 'Choose a service engagement to invoice.',
    });
  }
  if (input.source === 'manual') {
    if (!input.clientId) {
      return this.createError({ path: 'clientId', message: 'Choose a client.' });
    }
    if (!input.lines || input.lines.length === 0) {
      return this.createError({
        path: 'lines',
        message: 'Add at least one line item.',
      });
    }
  }
  return true;
});

export const invoiceUpdateSchema = yup.object({
  expectedUpdatedAt: yup.string().trim().required('Reload the invoice before saving.'),
  invoiceDate: requiredDateField('Choose the invoice date.'),
  dueDate: dateField('Enter a valid due date.'),
  currency: currencyField,
  notes: nullableText(4_000, 'Notes are too long.'),
  terms: nullableText(4_000, 'Terms are too long.'),
  lines: yup
    .array()
    .of(invoiceLineSchema)
    .min(1, 'Add at least one line item.')
    .max(100, 'An invoice supports up to 100 lines.'),
});

export const invoiceNoteSchema = yup.object({
  note: nullableText(1_000, 'Note is too long.'),
});

export const invoiceCancelSchema = yup.object({
  cancellationReason: requiredText(500, 'Give a reason for cancelling this invoice.'),
});

export const paymentCreateSchema = yup.object({
  invoiceId: requiredUuid('Choose an invoice.'),
  amountCents: positiveMoneyField,
  paymentDate: requiredDateField('Choose the payment date.'),
  method: yup
    .string()
    .oneOf(PAYMENT_METHODS, 'Choose a payment method.')
    .default('bank_transfer'),
  transactionReference: nullableText(120, 'Transaction reference is too long.'),
  notes: nullableText(2_000, 'Notes are too long.'),
});

export const expenseCreateSchema = yup.object({
  category: yup
    .string()
    .oneOf(EXPENSE_CATEGORIES, 'Choose an expense category.')
    .required('Choose a category.'),
  description: requiredText(300, 'Describe the expense.'),
  amountCents: positiveMoneyField,
  currency: currencyField,
  expenseDate: requiredDateField('Choose the expense date.'),
  projectId: uuidField('Choose a project.'),
  vendor: nullableText(160, 'Vendor is too long.'),
  receiptReference: nullableText(200, 'Receipt reference is too long.'),
});

export const expenseDecisionSchema = yup
  .object({
    status: yup
      .string()
      .oneOf(['approved', 'rejected'], 'Choose approve or reject.')
      .required('Choose a decision.'),
    decisionNotes: nullableText(2_000, 'Decision notes are too long.'),
  })
  .test('rejection-note', 'Give a reason when rejecting an expense.', function check(value) {
    if (value?.status === 'rejected' && !value?.decisionNotes) {
      return this.createError({
        path: 'decisionNotes',
        message: 'Give a reason when rejecting an expense.',
      });
    }
    return true;
  });

export const invoiceQuerySchema = yup.object({
  page: yup.number().integer().min(1).default(1),
  pageSize: yup.number().integer().min(1).max(100).default(20),
  search: nullableText(120, 'Search is too long.'),
  clientId: uuidField('Choose a client.'),
  status: yup.string().oneOf([...INVOICE_STATUSES, 'overdue']),
  source: yup.string().oneOf(INVOICE_SOURCES),
  sort: yup.string().oneOf(['date', 'due', 'total', 'created']).default('date'),
  direction: yup.string().oneOf(['asc', 'desc']).default('desc'),
});

export const paymentQuerySchema = yup.object({
  page: yup.number().integer().min(1).default(1),
  pageSize: yup.number().integer().min(1).max(100).default(20),
  search: nullableText(120, 'Search is too long.'),
  clientId: uuidField('Choose a client.'),
  method: yup.string().oneOf(PAYMENT_METHODS),
});

export const expenseQuerySchema = yup.object({
  page: yup.number().integer().min(1).default(1),
  pageSize: yup.number().integer().min(1).max(100).default(20),
  search: nullableText(120, 'Search is too long.'),
  status: yup.string().oneOf(EXPENSE_STATUSES),
  category: yup.string().oneOf(EXPENSE_CATEGORIES),
  projectId: uuidField('Choose a project.'),
});

export const financeAiSummarySchema = yup.object({
  instruction: nullableText(1_000, 'Instruction is too long.'),
});
