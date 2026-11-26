import * as yup from 'yup';
import { normalizeEmailIdentifier } from '@/lib/auth/email-normalization';
import { ROLES } from '@/lib/auth/permissions';

export const DATE_FORMATS = ['DD MMM YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD'];
export const WEEK_STARTS = ['monday', 'sunday'];

const emptyToNull = (value) =>
  typeof value === 'string' && value.trim() === '' ? null : value;

const optionalText = (max) =>
  yup.string().trim().max(max).transform(emptyToNull).nullable();

const httpUrl = yup
  .string()
  .trim()
  .max(500)
  .transform(emptyToNull)
  .nullable()
  .test(
    'http-url',
    'Enter a valid http(s) URL.',
    (value) => value == null || /^https?:\/\/[^\s]+$/i.test(value),
  );

function isValidTimeZone(value) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export const workspaceProfileSchema = yup.object({
  name: yup
    .string()
    .trim()
    .min(2, 'Workspace name must be at least 2 characters.')
    .max(80, 'Workspace name must be 80 characters or fewer.'),
  timezone: yup
    .string()
    .trim()
    .max(64)
    .test('valid-timezone', 'Choose a valid timezone.', (value) =>
      value == null ? true : isValidTimeZone(value),
    ),
  businessEmail: optionalText(254).test(
    'business-email',
    'Enter a valid email address.',
    (value) =>
      value == null || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value),
  ),
  businessPhone: optionalText(40),
  businessAddress: optionalText(500),
  websiteUrl: httpUrl,
  brandColor: yup
    .string()
    .trim()
    .transform(emptyToNull)
    .nullable()
    .test(
      'hex-color',
      'Enter a hex colour such as #4F46E5.',
      (value) => value == null || /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value),
    ),
  logoUrl: httpUrl,
  preferences: yup.object({
    dateFormat: yup.string().oneOf(DATE_FORMATS, 'Choose a valid date format.'),
    weekStart: yup.string().oneOf(WEEK_STARTS, 'Choose a valid week start.'),
  }),
});

export const inviteSchema = yup.object({
  email: yup
    .string()
    .transform((value) =>
      typeof value === 'string' ? value.normalize('NFKC') : value,
    )
    .trim()
    .lowercase()
    .email('Enter a valid email address.')
    // Invitations must store exactly what the sign-in flow will accept,
    // otherwise an invitation could be created that can never be redeemed.
    .test(
      'sign-in-compatible',
      'Enter a valid email address.',
      (value) => normalizeEmailIdentifier(value) !== null,
    )
    .max(254, 'That email address is too long.')
    .required('Email address is required.'),
  role: yup
    .string()
    .oneOf(ROLES, 'Choose a valid role.')
    .default('member'),
});

export const memberRoleSchema = yup.object({
  role: yup
    .string()
    .oneOf(ROLES, 'Choose a valid role.')
    .required('Role is required.'),
});

export const auditQuerySchema = yup.object({
  page: yup.number().integer().min(1).default(1),
  pageSize: yup.number().integer().min(1).max(100).default(25),
  action: yup.string().trim().max(80),
  resourceType: yup.string().trim().max(60),
  actor: yup.string().trim().max(254),
  success: yup.string().oneOf(['true', 'false']),
});
