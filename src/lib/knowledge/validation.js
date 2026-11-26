import * as yup from 'yup';
import {
  KNOWLEDGE_CATEGORY_KEYS,
  KNOWLEDGE_PROVENANCES,
  KNOWLEDGE_SOURCE_TYPES,
  KNOWLEDGE_STATUSES,
  MEMORY_CONFIDENCE_LEVELS,
  MEMORY_STATUSES,
  MEMORY_TYPE_KEYS,
  RETRIEVAL_LIMITS,
} from './constants';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value) {
  return typeof value === 'string' && UUID_RE.test(value);
}

const emptyToNull = (value) =>
  typeof value === 'string' && value.trim() === '' ? null : value;

const nullableText = (max, message) =>
  yup.string().trim().transform(emptyToNull).max(max, message).nullable();

const uuidField = (message) =>
  yup
    .string()
    .trim()
    .transform(emptyToNull)
    .test(
      'uuid',
      message,
      (value) => value === undefined || value === null || isUuid(value),
    )
    .nullable();

const tagsField = yup
  .array()
  .of(yup.string().trim().min(1).max(40, 'Tags must be 40 characters or fewer.'))
  .max(20, 'Use 20 tags or fewer.')
  .default([]);

const tagsUpdateField = yup
  .array()
  .of(yup.string().trim().min(1).max(40, 'Tags must be 40 characters or fewer.'))
  .max(20, 'Use 20 tags or fewer.');

const titleField = yup
  .string()
  .trim()
  .min(3, 'Title must be at least 3 characters.')
  .max(200, 'Title must be 200 characters or fewer.');

const contentField = yup
  .string()
  .trim()
  .min(10, 'Content must be at least 10 characters.')
  .max(200_000, 'Content must be 200,000 characters or fewer.');

const categoryField = yup
  .string()
  .oneOf(KNOWLEDGE_CATEGORY_KEYS, 'Choose a valid category.');

const provenanceField = yup
  .string()
  .oneOf(KNOWLEDGE_PROVENANCES, 'Choose a valid provenance.');

const statusField = yup
  .string()
  .oneOf(KNOWLEDGE_STATUSES, 'Choose a valid status.');

const sourceTypeField = yup
  .string()
  .oneOf(KNOWLEDGE_SOURCE_TYPES, 'Choose a valid source type.');

const changeNoteField = nullableText(
  300,
  'Change note must be 300 characters or fewer.',
);

export const knowledgeEntryCreateSchema = yup.object({
  category: categoryField.default('other'),
  title: titleField.required('Title is required.'),
  summary: nullableText(600, 'Summary must be 600 characters or fewer.'),
  content: contentField.required('Content is required.'),
  tags: tagsField,
  sourceType: sourceTypeField.default('manual'),
  sourceReference: nullableText(
    300,
    'Source reference must be 300 characters or fewer.',
  ),
  provenance: provenanceField.default('unverified'),
  status: statusField.default('draft'),
  clientId: uuidField('Choose a client from this workspace.'),
  projectId: uuidField('Choose a project from this workspace.'),
  changeNote: changeNoteField,
});

export const knowledgeEntryUpdateSchema = yup
  .object({
    category: categoryField,
    title: titleField,
    summary: nullableText(600, 'Summary must be 600 characters or fewer.'),
    content: contentField,
    tags: tagsUpdateField,
    provenance: provenanceField,
    status: statusField,
    clientId: uuidField('Choose a client from this workspace.'),
    projectId: uuidField('Choose a project from this workspace.'),
    changeNote: changeNoteField,
    expectedVersion: yup
      .number()
      .transform((value, original) => (original === '' ? null : value))
      .integer()
      .min(1)
      .nullable(),
  })
  .test(
    'not-empty',
    'Provide at least one field to update.',
    (value) =>
      Object.keys(value || {}).filter((key) => key !== 'expectedVersion')
        .length > 0,
  );

const pageField = yup
  .number()
  .transform((value, original) => (original === '' ? 1 : value))
  .integer()
  .min(1)
  .max(10_000)
  .default(1);

const pageSizeField = yup
  .number()
  .transform((value, original) => (original === '' ? 20 : value))
  .integer()
  .min(1)
  .max(50)
  .default(20);

export const knowledgeQuerySchema = yup.object({
  q: yup.string().trim().max(RETRIEVAL_LIMITS.maxQueryChars).default(''),
  category: yup
    .string()
    .oneOf(['any', ...KNOWLEDGE_CATEGORY_KEYS], 'Choose a valid category.')
    .default('any'),
  status: yup
    .string()
    .oneOf(['any', ...KNOWLEDGE_STATUSES], 'Choose a valid status.')
    .default('any'),
  clientId: uuidField('Choose a client from this workspace.'),
  projectId: uuidField('Choose a project from this workspace.'),
  page: pageField,
  pageSize: pageSizeField,
  sort: yup
    .string()
    .oneOf(['recent', 'updated', 'title'], 'Choose a valid sort.')
    .default('recent'),
});

export const knowledgeSearchSchema = yup.object({
  q: yup
    .string()
    .trim()
    .min(
      RETRIEVAL_LIMITS.minQueryChars,
      'Enter at least two characters to search.',
    )
    .max(RETRIEVAL_LIMITS.maxQueryChars, 'That search is too long.')
    .required('Enter a search term.'),
  category: yup
    .string()
    .oneOf(['any', ...KNOWLEDGE_CATEGORY_KEYS], 'Choose a valid category.')
    .default('any'),
  clientId: uuidField('Choose a client from this workspace.'),
  projectId: uuidField('Choose a project from this workspace.'),
  includeChunks: yup.boolean().default(true),
  limit: yup
    .number()
    .transform((value, original) => (original === '' ? 10 : value))
    .integer()
    .min(1)
    .max(RETRIEVAL_LIMITS.maxResults)
    .default(10),
});

export const documentUploadSchema = yup.object({
  title: nullableText(200, 'Title must be 200 characters or fewer.'),
  category: categoryField.default('reference'),
  provenance: provenanceField.default('source_derived'),
  status: statusField.default('published'),
  tags: tagsField,
  clientId: uuidField('Choose a client from this workspace.'),
  projectId: uuidField('Choose a project from this workspace.'),
  changeNote: changeNoteField,
});

export const documentQuerySchema = yup.object({
  q: yup.string().trim().max(RETRIEVAL_LIMITS.maxQueryChars).default(''),
  status: yup
    .string()
    .oneOf(['any', 'processing', 'processed', 'failed'], 'Choose a valid status.')
    .default('any'),
  page: pageField,
  pageSize: pageSizeField,
});

const memoryKeyField = yup
  .string()
  .trim()
  .min(3, 'Key must be at least 3 characters.')
  .max(160, 'Key must be 160 characters or fewer.');

const memoryContentField = yup
  .string()
  .trim()
  .min(10, 'Content must be at least 10 characters.')
  .max(8_000, 'Content must be 8,000 characters or fewer.');

const memoryTypeField = yup
  .string()
  .oneOf(MEMORY_TYPE_KEYS, 'Choose a valid memory type.');

export const memoryCreateSchema = yup
  .object({
    memoryType: memoryTypeField.required('Choose a memory type.'),
    key: memoryKeyField.required('Key is required.'),
    content: memoryContentField.required('Content is required.'),
    sourceType: yup
      .string()
      .oneOf(['manual', 'document', 'import', 'agent_summary'], 'Choose a valid source type.')
      .default('manual'),
    sourceReference: nullableText(
      300,
      'Source reference must be 300 characters or fewer.',
    ),
    sourceEntryId: uuidField('Choose a knowledge entry from this workspace.'),
    clientId: uuidField('Choose a client from this workspace.'),
    projectId: uuidField('Choose a project from this workspace.'),
    agentId: uuidField('Choose an agent from this workspace.'),
    confidence: yup
      .string()
      .oneOf(MEMORY_CONFIDENCE_LEVELS, 'Choose a confidence level.')
      .default('medium'),
    verified: yup.boolean().default(false),
    supersedesId: uuidField('Choose a memory from this workspace.'),
    changeNote: changeNoteField,
  })
  .test('memory-scope', function scopeTest(value) {
    if (!value) return true;
    if (value.memoryType === 'client' && !value.clientId) {
      return this.createError({ path: 'clientId', message: 'Choose a client for client memory.' });
    }
    if (value.memoryType === 'project' && !value.projectId) {
      return this.createError({ path: 'projectId', message: 'Choose a project for project memory.' });
    }
    if (value.memoryType === 'agent' && !value.agentId) {
      return this.createError({ path: 'agentId', message: 'Choose an agent for agent memory.' });
    }
    return true;
  });

export const memoryUpdateSchema = yup
  .object({
    key: memoryKeyField,
    content: memoryContentField,
    confidence: yup
      .string()
      .oneOf(MEMORY_CONFIDENCE_LEVELS, 'Choose a confidence level.'),
    verified: yup.boolean(),
    status: yup
      .string()
      .oneOf(MEMORY_STATUSES, 'Choose a valid status.'),
    sourceReference: nullableText(
      300,
      'Source reference must be 300 characters or fewer.',
    ),
    changeNote: changeNoteField,
    expectedVersion: yup
      .number()
      .transform((value, original) => (original === '' ? null : value))
      .integer()
      .min(1)
      .nullable(),
  })
  .test(
    'not-empty',
    'Provide at least one field to update.',
    (value) =>
      Object.keys(value || {}).filter((key) => key !== 'expectedVersion')
        .length > 0,
  );

export const memoryQuerySchema = yup.object({
  q: yup.string().trim().max(RETRIEVAL_LIMITS.maxQueryChars).default(''),
  memoryType: yup
    .string()
    .oneOf(['any', ...MEMORY_TYPE_KEYS], 'Choose a valid memory type.')
    .default('any'),
  status: yup
    .string()
    .oneOf(['any', ...MEMORY_STATUSES], 'Choose a valid status.')
    .default('active'),
  clientId: uuidField('Choose a client from this workspace.'),
  projectId: uuidField('Choose a project from this workspace.'),
  page: pageField,
  pageSize: pageSizeField,
});

export const versionQuerySchema = yup.object({
  page: pageField,
  pageSize: pageSizeField,
});

export const memoryVersionsQuerySchema = versionQuerySchema;
