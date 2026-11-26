import * as yup from 'yup';

export const RESEARCH_STATUSES = [
  'queued',
  'running',
  'awaiting_approval',
  'completed',
  'failed',
  'cancelled',
];

export const RESEARCH_SUBJECT_TYPES = ['company', 'website', 'industry', 'lead'];

export const RESEARCH_CATEGORIES = [
  'overview',
  'website',
  'services',
  'industry',
  'business_model',
  'requirements',
  'opportunities',
  'risks',
  'next_steps',
];

export const RESEARCH_VERIFICATIONS = [
  'verified',
  'source_derived',
  'ai_analysis',
  'unverified',
];

const emptyToNull = (value) =>
  typeof value === 'string' && value.trim() === '' ? null : value;

const nullableText = (max, message) =>
  yup
    .string()
    .trim()
    .transform(emptyToNull)
    .max(max, message)
    .nullable();

function normalizeWebsite(value) {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

const websiteField = yup
  .string()
  .trim()
  .transform(normalizeWebsite)
  .max(300, 'Website must be 300 characters or fewer.')
  .test('http-url', 'Enter an http or https URL.', (value) => {
    if (!value) return true;
    try {
      const url = new URL(value);
      return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
      return false;
    }
  })
  .nullable();

export const researchCreateSchema = yup
  .object({
    subjectType: yup
      .string()
      .oneOf(RESEARCH_SUBJECT_TYPES, 'Choose a valid subject type.')
      .default('company'),
    companyName: nullableText(
      160,
      'Company name must be 160 characters or fewer.',
    ),
    websiteUrl: websiteField,
    industry: nullableText(120, 'Industry must be 120 characters or fewer.'),
    objective: yup
      .string()
      .trim()
      .min(10, 'Describe the objective in at least 10 characters.')
      .max(4_000, 'Objective must be 4,000 characters or fewer.')
      .required('Describe the research objective.'),
    leadId: yup.string().uuid('Choose a valid lead.').nullable(),
    agentId: yup.string().uuid('Choose a valid agent.').nullable(),
  })
  .test(
    'subject-required',
    'Provide a company name, website or lead to research.',
    (value) =>
      Boolean(value?.companyName || value?.websiteUrl || value?.leadId),
  );

export const researchQuerySchema = yup.object({
  page: yup.number().integer().min(1).default(1),
  pageSize: yup.number().integer().min(1).max(50).default(20),
  status: yup.string().oneOf(RESEARCH_STATUSES),
  subjectType: yup.string().oneOf(RESEARCH_SUBJECT_TYPES),
  leadId: yup.string().uuid(),
  search: yup
    .string()
    .trim()
    .transform(emptyToNull)
    .max(120, 'Search is too long.')
    .nullable(),
});
