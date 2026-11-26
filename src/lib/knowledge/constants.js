// Phase 2E keeps knowledge, documents and memory in the existing PostgreSQL
// database. Retrieval is lexical (core full-text search) so it works without
// extensions, embeddings or an external vector store.

export const KNOWLEDGE_CATEGORIES = [
  {
    key: 'company_profile',
    label: 'Company profile',
    description: 'Who the business is, what it sells and how it is positioned.',
  },
  {
    key: 'services',
    label: 'Services',
    description: 'Service catalogue, deliverables and capability descriptions.',
  },
  {
    key: 'processes',
    label: 'Processes & SOPs',
    description: 'How work is done: steps, owners, handoffs and review points.',
  },
  {
    key: 'brand_voice',
    label: 'Brand voice',
    description: 'Tone, terminology and communication guidelines.',
  },
  {
    key: 'pricing',
    label: 'Pricing & commercial',
    description: 'Approved pricing, discounts and commercial policy.',
  },
  {
    key: 'policies',
    label: 'Business policies',
    description: 'Internal rules, safeguards and escalation requirements.',
  },
  {
    key: 'sales',
    label: 'Sales knowledge',
    description: 'Qualification criteria, objections, discovery notes and playbooks.',
  },
  {
    key: 'marketing',
    label: 'Marketing knowledge',
    description: 'Audience, channels, positioning and approved messaging.',
  },
  {
    key: 'client_specific',
    label: 'Client knowledge',
    description: 'Facts and preferences that apply to one client.',
  },
  {
    key: 'project_specific',
    label: 'Project knowledge',
    description: 'Scope, decisions and delivery notes for one project.',
  },
  {
    key: 'reference',
    label: 'Reference material',
    description: 'General reference documents and background material.',
  },
  {
    key: 'other',
    label: 'Other',
    description: 'Anything that does not fit the categories above.',
  },
];

export const KNOWLEDGE_CATEGORY_KEYS = KNOWLEDGE_CATEGORIES.map(
  (category) => category.key,
);

export const KNOWLEDGE_CATEGORY_LABELS = Object.fromEntries(
  KNOWLEDGE_CATEGORIES.map((category) => [category.key, category.label]),
);

export const KNOWLEDGE_STATUSES = ['draft', 'published', 'archived'];

export const KNOWLEDGE_STATUS_META = {
  draft: { label: 'Draft', tone: 'warning' },
  published: { label: 'Published', tone: 'success' },
  archived: { label: 'Archived', tone: 'neutral' },
};

export const KNOWLEDGE_PROVENANCES = [
  'verified',
  'source_derived',
  'ai_generated',
  'unverified',
];

// Provenance is what lets the AI (and a human) tell a verified company fact
// apart from a summary or an unconfirmed note.
export const KNOWLEDGE_PROVENANCE_META = {
  verified: {
    label: 'Verified',
    tone: 'success',
    description: 'Confirmed by a workspace member as accurate company information.',
  },
  source_derived: {
    label: 'Source-derived',
    tone: 'info',
    description: 'Taken from an uploaded source document without independent verification.',
  },
  ai_generated: {
    label: 'AI-generated summary',
    tone: 'warning',
    description: 'Produced by an AI agent and not verified by a person.',
  },
  unverified: {
    label: 'Unverified',
    tone: 'neutral',
    description: 'Recorded for reference; not confirmed as accurate.',
  },
};

export const KNOWLEDGE_SOURCE_TYPES = [
  'manual',
  'document',
  'import',
  'agent_summary',
];

export const KNOWLEDGE_SOURCE_LABELS = {
  manual: 'Entered manually',
  document: 'Uploaded document',
  import: 'Imported data',
  agent_summary: 'AI-generated summary',
};

export const MEMORY_TYPES = [
  { key: 'workspace', label: 'Workspace', description: 'Shared facts about how this workspace operates.' },
  { key: 'company', label: 'Company', description: 'Durable company-level facts.' },
  { key: 'client', label: 'Client', description: 'Durable facts about one client.' },
  { key: 'project', label: 'Project', description: 'Durable facts about one project.' },
  { key: 'decision', label: 'Business decision', description: 'A decision that was made, with its source.' },
  { key: 'preference', label: 'Operating preference', description: 'How the team prefers work to be done.' },
  { key: 'workflow', label: 'Workflow', description: 'A repeatable sequence the AI should follow.' },
  { key: 'agent', label: 'Agent memory', description: 'Context that only applies to one agent.' },
];

export const MEMORY_TYPE_KEYS = MEMORY_TYPES.map((type) => type.key);

export const MEMORY_TYPE_LABELS = Object.fromEntries(
  MEMORY_TYPES.map((type) => [type.key, type.label]),
);

export const MEMORY_STATUSES = ['active', 'archived', 'superseded'];

export const MEMORY_STATUS_META = {
  active: { label: 'Active', tone: 'success' },
  archived: { label: 'Archived', tone: 'neutral' },
  superseded: { label: 'Superseded', tone: 'warning' },
};

export const MEMORY_CONFIDENCE_LEVELS = ['low', 'medium', 'high'];

export const MEMORY_CONFIDENCE_META = {
  low: { label: 'Low confidence', tone: 'warning' },
  medium: { label: 'Medium confidence', tone: 'neutral' },
  high: { label: 'High confidence', tone: 'success' },
};

// Only plain-text formats can be decoded safely without an extraction library
// or an external storage provider. PDF, DOCX and similar binary formats are
// reported as unsupported rather than silently mangled.
export const DOCUMENT_FORMATS = [
  { format: 'text', extensions: ['.txt'], mimeTypes: ['text/plain'] },
  { format: 'markdown', extensions: ['.md', '.markdown'], mimeTypes: ['text/markdown', 'text/x-markdown', 'text/plain'] },
  { format: 'csv', extensions: ['.csv'], mimeTypes: ['text/csv', 'application/csv', 'text/plain'] },
  { format: 'json', extensions: ['.json'], mimeTypes: ['application/json', 'text/json', 'text/plain'] },
];

export const DOCUMENT_EXTENSIONS = DOCUMENT_FORMATS.flatMap(
  (entry) => entry.extensions,
);

export const MAX_DOCUMENT_BYTES = 1024 * 1024;
export const MAX_DOCUMENT_TEXT_BYTES = 512 * 1024;
export const DOCUMENT_REQUEST_LIMIT_BYTES = MAX_DOCUMENT_BYTES + 64 * 1024;

export const CHUNK_TARGET_CHARS = 1200;
export const CHUNK_OVERLAP_CHARS = 150;
export const MAX_CHUNKS_PER_DOCUMENT = 400;
export const MAX_KNOWLEDGE_CONTENT_CHARS = 200_000;

export const RETRIEVAL_LIMITS = {
  maxResults: 25,
  defaultResults: 10,
  maxChunkResults: 20,
  maxQueryChars: 200,
  minQueryChars: 2,
};

// Bounded context keeps a run from being flooded with irrelevant material.
export const CONTEXT_BUDGET = {
  maxKnowledgeEntries: 6,
  maxKnowledgeChunks: 8,
  maxMemories: 6,
  maxEntityRecords: 4,
  knowledgeChars: 4_800,
  memoryChars: 1_800,
  entityChars: 1_800,
  totalChars: 9_000,
};

const BASE_PROFILE = {
  categories: ['company_profile', 'services', 'policies'],
  memoryTypes: ['workspace', 'company'],
  entities: [],
};

export const AGENT_CONTEXT_PROFILES = {
  business_research: {
    categories: ['company_profile', 'services', 'marketing'],
    memoryTypes: ['company', 'workspace', 'decision'],
    entities: ['lead', 'opportunity'],
  },
  lead_research: {
    categories: ['company_profile', 'services', 'pricing', 'sales'],
    memoryTypes: ['company', 'client', 'decision', 'preference'],
    entities: ['lead', 'opportunity'],
  },
  website_audit: {
    categories: ['company_profile', 'services', 'brand_voice', 'marketing'],
    memoryTypes: ['company', 'client'],
    entities: ['lead', 'client'],
  },
  seo_analysis: {
    categories: ['services', 'marketing', 'brand_voice'],
    memoryTypes: ['company', 'client', 'decision'],
    entities: ['client', 'project'],
  },
  sales_assistant: {
    categories: ['company_profile', 'services', 'pricing', 'sales', 'policies'],
    memoryTypes: ['company', 'client', 'decision', 'preference'],
    entities: ['lead', 'opportunity', 'proposal'],
  },
  proposal_generator: {
    categories: ['company_profile', 'services', 'pricing', 'policies', 'sales'],
    memoryTypes: ['company', 'client', 'decision'],
    entities: ['opportunity', 'proposal', 'client'],
  },
  project_assistant: {
    categories: ['processes', 'project_specific', 'client_specific'],
    memoryTypes: ['project', 'client', 'decision', 'workflow'],
    entities: ['project', 'client'],
  },
  accounting_assistant: {
    categories: ['pricing', 'policies'],
    memoryTypes: ['decision', 'preference', 'company'],
    entities: ['client', 'project'],
  },
  compliance_assistant: {
    categories: ['policies', 'processes'],
    memoryTypes: ['decision', 'company', 'workspace'],
    entities: ['client', 'project'],
  },
  documentation_assistant: {
    categories: ['processes', 'company_profile', 'policies'],
    memoryTypes: ['workspace', 'company', 'workflow'],
    entities: ['project', 'client'],
  },
  industrial_research: {
    categories: ['company_profile', 'services', 'marketing'],
    memoryTypes: ['company', 'client', 'decision'],
    entities: ['lead', 'opportunity'],
  },
  customer_support: {
    categories: ['policies', 'services', 'pricing', 'client_specific'],
    memoryTypes: ['client', 'preference', 'decision'],
    entities: ['client', 'ticket'],
  },
  custom: BASE_PROFILE,
};

export function contextProfileFor(agentType) {
  return AGENT_CONTEXT_PROFILES[agentType] || BASE_PROFILE;
}

export const ENTITY_TYPES = ['lead', 'opportunity', 'proposal', 'project', 'client', 'ticket'];
