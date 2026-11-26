import * as yup from 'yup';

export const SERVICE_STATUSES = ['active', 'archived'];

export const BILLING_TYPES = ['one_time', 'monthly', 'both', 'custom'];

const emptyToNull = (value) =>
  typeof value === 'string' && value.trim() === '' ? null : value;

const nullableText = (max, message) =>
  yup
    .string()
    .trim()
    .transform(emptyToNull)
    .max(max, message)
    .nullable();

const nameField = yup
  .string()
  .trim()
  .min(2, 'Name must be at least 2 characters.')
  .max(120, 'Name must be 120 characters or fewer.');

const descriptionField = nullableText(
  2_000,
  'Description must be 2,000 characters or fewer.',
);

const sortOrderField = yup
  .number()
  .transform((value, original) => (original === '' ? 0 : value))
  .integer('Use a whole number.')
  .min(0, 'Order cannot be negative.')
  .max(10_000, 'That order value is too large.');

export const categoryCreateSchema = yup.object({
  name: nameField.required('Category name is required.'),
  description: descriptionField,
  sortOrder: sortOrderField.default(0),
  status: yup
    .string()
    .oneOf(SERVICE_STATUSES, 'Choose a valid status.')
    .default('active'),
});

export const categoryUpdateSchema = yup.object({
  name: nameField,
  description: descriptionField,
  sortOrder: sortOrderField,
  status: yup.string().oneOf(SERVICE_STATUSES, 'Choose a valid status.'),
});

export const serviceCreateSchema = yup.object({
  categoryId: yup
    .string()
    .uuid('Choose a category.')
    .required('Choose a category.'),
  name: nameField.required('Service name is required.'),
  description: descriptionField,
  billingType: yup
    .string()
    .oneOf(BILLING_TYPES, 'Choose a valid billing type.')
    .default('custom'),
  regulated: yup.boolean().default(false),
  reviewProfession: nullableText(
    120,
    'Reviewer must be 120 characters or fewer.',
  ).when('regulated', {
    is: true,
    then: (schema) =>
      schema.required(
        'Identify the qualified professional responsible for review or filing.',
      ),
  }),
  reviewNotes: nullableText(
    1_000,
    'Review notes must be 1,000 characters or fewer.',
  ),
  status: yup
    .string()
    .oneOf(SERVICE_STATUSES, 'Choose a valid status.')
    .default('active'),
  sortOrder: sortOrderField.default(0),
});

export const serviceUpdateSchema = yup.object({
  categoryId: yup.string().uuid('Choose a category.'),
  name: nameField,
  description: descriptionField,
  billingType: yup.string().oneOf(BILLING_TYPES, 'Choose a valid billing type.'),
  regulated: yup.boolean(),
  reviewProfession: nullableText(
    120,
    'Reviewer must be 120 characters or fewer.',
  ),
  reviewNotes: nullableText(
    1_000,
    'Review notes must be 1,000 characters or fewer.',
  ),
  status: yup.string().oneOf(SERVICE_STATUSES, 'Choose a valid status.'),
  sortOrder: sortOrderField,
});

export function isUuid(value) {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}
