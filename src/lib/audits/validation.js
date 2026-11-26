import * as yup from 'yup';

export const AUDIT_STATUSES = [
  'queued',
  'running',
  'completed',
  'failed',
  'cancelled',
];

export const AUDIT_SEVERITIES = ['critical', 'high', 'medium', 'low', 'info'];

export const AUDIT_CATEGORIES = [
  'technical_seo',
  'on_page_seo',
  'performance',
  'structured_data',
  'accessibility',
  'security',
];

export const AUDIT_CATEGORY_LABELS = {
  technical_seo: 'Technical SEO',
  on_page_seo: 'On-page SEO',
  performance: 'Performance signals',
  structured_data: 'Structured data',
  accessibility: 'Accessibility',
  security: 'Security signals',
};

export const AUDIT_DEFAULT_MAX_PAGES = 5;
export const AUDIT_MAX_PAGES_LIMIT = 10;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value) {
  return typeof value === 'string' && UUID_RE.test(value);
}

const emptyToNull = (value) =>
  typeof value === 'string' && value.trim() === '' ? null : value;

const uuidField = (message) =>
  yup
    .string()
    .trim()
    .transform(emptyToNull)
    .test('uuid', message, (value) => value === undefined || value === null || isUuid(value))
    .nullable();

const dateField = (message) =>
  yup
    .date()
    .transform((value, original) => (original === '' ? null : value))
    .typeError(message)
    .nullable();

const nullableText = (max, message) =>
  yup.string().trim().transform(emptyToNull).max(max, message).nullable();


export function normalizeAuditUrl(value) {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
}

const auditUrlField = yup
  .string()
  .trim()
  .transform(normalizeAuditUrl)
  .max(300, 'The URL must be 300 characters or fewer.')
  .required('Enter the website URL to audit.')
  .test('http-url', 'Enter a full http or https URL.', (value) => {
    if (!value) return true;
    try {
      const url = new URL(value);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
      if (!url.hostname) return false;
      if (url.username || url.password) return false;
      return true;
    } catch {
      return false;
    }
  });

export const websiteAuditCreateSchema = yup.object({
  url: auditUrlField,
  maxPages: yup
    .number()
    .integer('Choose a whole number of pages.')
    .min(1, 'Audit at least one page.')
    .max(
      AUDIT_MAX_PAGES_LIMIT,
      `Audits can scan at most ${AUDIT_MAX_PAGES_LIMIT} pages.`,
    )
    .default(AUDIT_DEFAULT_MAX_PAGES),
  clientId: uuidField('Choose a client in this workspace.'),
  projectId: uuidField('Choose a project in this workspace.'),
  auditDate: dateField('Enter a valid audit date.'),
  notes: nullableText(6_000, 'Notes must be 6,000 characters or fewer.'),
  checklist: yup
    .mixed()
    .nullable()
    .test(
      'checklist-object',
      'Manual checklist must be an object.',
      (value) =>
        value === undefined ||
        value === null ||
        (typeof value === 'object' && !Array.isArray(value)),
    ),
  captureMode: yup
    .string()
    .oneOf(['engine', 'manual'], 'Choose how this audit is captured.')
    .default('engine'),
});

export const websiteAuditQuerySchema = yup.object({
  page: yup.number().integer().min(1).default(1),
  pageSize: yup.number().integer().min(1).max(50).default(20),
  status: yup.string().oneOf(AUDIT_STATUSES),
  domain: yup.string().trim().max(200, 'Domain filter is too long.'),
  search: yup
    .string()
    .trim()
    .transform((value) =>
      typeof value === 'string' && value.trim() === '' ? null : value,
    )
    .max(200, 'Search is too long.')
    .nullable(),
});
