// Reusable provider adapter contracts. Provider-specific knowledge lives here,
// not inside marketing, client or project services.
//
// This phase deliberately ships NO live adapter: every live method fails
// safely. The mock adapter is the only executable path and is clearly
// labelled, so an execution can be tested end to end without any network call,
// credential use, advertising spend or publishing.

import { ApiError } from '@/lib/api-error';

export const ADAPTER_CONTRACTS = {
  cms: [
    'retrievePages',
    'prepareContentUpdate',
    'validateContent',
    'submitPublishingRequest',
  ],
  analytics: ['retrieveMetrics'],
  search_console: ['retrieveSearchPerformance'],
  ads: ['planCampaign', 'retrieveReport'],
  social: ['retrieveAccounts', 'preparePost', 'submitPost'],
  email: ['prepareCampaign', 'prepareNotification'],
  lead_source: ['verifySignature', 'parseLead'],
  file_storage: ['listDocuments', 'storeDocument'],
  webhook: ['receiveEvent'],
  ai_provider: ['generate'],
};

export function adapterSupports(kind, operation) {
  return (ADAPTER_CONTRACTS[kind] || []).includes(operation);
}

function notConfigured(kind) {
  return new ApiError(
    503,
    'INTEGRATION_NOT_CONFIGURED',
    `The ${kind} integration is not configured. No external request was made.`,
  );
}

function liveDisabled(kind) {
  return new ApiError(
    409,
    'LIVE_INTEGRATION_DISABLED',
    `Live ${kind} calls are disabled in this environment. Only the labelled mock adapter can run.`,
  );
}

// A live adapter exists so the contract is explicit. Every method refuses:
// either the credentials are missing (NOT_CONFIGURED) or live calls are
// disabled for this phase (LIVE_INTEGRATION_DISABLED). Neither path performs
// a network request.
export function getLiveAdapter(kind, { configured = false } = {}) {
  const methods = {};
  for (const operation of ADAPTER_CONTRACTS[kind] || []) {
    methods[operation] = async () => {
      if (!configured) throw notConfigured(kind);
      throw liveDisabled(kind);
    };
  }
  return { kind, mode: 'live', methods };
}

// The mock adapter is deterministic, offline and always labelled so a record
// created by it can never be mistaken for a real external action.
export function getMockAdapter(kind) {
  const methods = {};
  for (const operation of ADAPTER_CONTRACTS[kind] || []) {
    methods[operation] = async (input = {}) => ({
      mode: 'mock',
      operation,
      kind,
      acceptedAt: new Date().toISOString(),
      summary: `Mock ${kind}.${operation} accepted (no external request was made).`,
      inputDigest: digestOf(input),
    });
  }
  return { kind, mode: 'mock', methods };
}

function digestOf(value) {
  const text = JSON.stringify(value ?? null);
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 31 + text.charCodeAt(index)) | 0;
  }
  return `mock-${Math.abs(hash).toString(16)}`;
}

// ---------------------------------------------------------------------------
// Contract validation helpers. Each returns a normalized payload and throws a
// safe 422 ApiError when the shape is wrong. They never trust caller input.
// ---------------------------------------------------------------------------

function invalid(field, message) {
  return new ApiError(422, 'VALIDATION_FAILED', 'Check the request payload.', {
    [field]: message,
  });
}

function assertObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw invalid(label, `${label} must be an object.`);
  }
}

function boundedString(value, field, { min = 1, max = 2000, required = true } = {}) {
  if (value === undefined || value === null || value === '') {
    if (required) throw invalid(field, `${field} is required.`);
    return null;
  }
  if (typeof value !== 'string') throw invalid(field, `${field} must be text.`);
  const trimmed = value.trim();
  if (trimmed.length < min) throw invalid(field, `${field} is too short.`);
  if (trimmed.length > max) throw invalid(field, `${field} is too long.`);
  return trimmed;
}

export function validateCmsContentPayload(payload) {
  assertObject(payload, 'payload');
  return {
    pageReference: boundedString(payload.pageReference, 'pageReference', { max: 500 }),
    title: boundedString(payload.title, 'title', { max: 200 }),
    body: boundedString(payload.body, 'body', { max: 20_000 }),
    changeSummary: boundedString(payload.changeSummary, 'changeSummary', {
      required: false,
      max: 1000,
    }),
  };
}

export function validateAnalyticsQuery(payload) {
  assertObject(payload, 'payload');
  const start = boundedString(payload.dateFrom, 'dateFrom', { max: 10 });
  const end = boundedString(payload.dateTo, 'dateTo', { max: 10 });
  const isoDate = /^\d{4}-\d{2}-\d{2}$/;
  if (!isoDate.test(start) || !isoDate.test(end)) {
    throw invalid('dateFrom', 'Use YYYY-MM-DD dates.');
  }
  if (start > end) throw invalid('dateTo', 'dateTo must be on or after dateFrom.');
  return {
    dateFrom: start,
    dateTo: end,
    metrics: Array.isArray(payload.metrics)
      ? payload.metrics.slice(0, 20).map((item) => boundedString(item, 'metrics', { max: 100 }))
      : ['sessions'],
    source: 'google_analytics_ga4',
  };
}

export function validateSearchConsoleQuery(payload) {
  assertObject(payload, 'payload');
  const query = boundedString(payload.query, 'query', { required: false, max: 200 });
  const start = boundedString(payload.dateFrom, 'dateFrom', { max: 10 });
  const end = boundedString(payload.dateTo, 'dateTo', { max: 10 });
  return { query, dateFrom: start, dateTo: end, source: 'google_search_console' };
}

export function validateAdsPlan(payload) {
  assertObject(payload, 'payload');
  const plannedBudgetMinor = Number(payload.plannedBudgetMinor ?? 0);
  if (!Number.isInteger(plannedBudgetMinor) || plannedBudgetMinor < 0) {
    throw invalid('plannedBudgetMinor', 'Use a whole non-negative minor amount.');
  }
  // `planned` is a plan, never spend. `actualSpendMinor` is always zero here.
  return {
    platform: boundedString(payload.platform, 'platform', { max: 50 }),
    campaignName: boundedString(payload.campaignName, 'campaignName', { max: 200 }),
    plannedBudgetMinor,
    actualSpendMinor: 0,
    currency: boundedString(payload.currency || 'INR', 'currency', { max: 3 }),
  };
}

export function validateSocialPost(payload) {
  assertObject(payload, 'payload');
  return {
    platform: boundedString(payload.platform, 'platform', { max: 50 }),
    caption: boundedString(payload.caption, 'caption', { max: 5000 }),
    scheduledFor: boundedString(payload.scheduledFor, 'scheduledFor', {
      required: false,
      max: 40,
    }),
    externalPublishing: false,
  };
}

export function validateEmailCampaign(payload) {
  assertObject(payload, 'payload');
  return {
    subject: boundedString(payload.subject, 'subject', { max: 200 }),
    audience: boundedString(payload.audience, 'audience', { max: 200 }),
    body: boundedString(payload.body, 'body', { max: 20_000 }),
    externalSending: false,
  };
}

export function validateLeadPayload(payload) {
  assertObject(payload, 'payload');
  const lead = payload.lead;
  assertObject(lead, 'lead');
  return {
    name: boundedString(lead.name, 'name', { max: 200 }),
    email: boundedString(lead.email, 'email', { required: false, max: 320 }),
    phone: boundedString(lead.phone, 'phone', { required: false, max: 40 }),
    company: boundedString(lead.company, 'company', { required: false, max: 200 }),
    message: boundedString(lead.message, 'message', { required: false, max: 5000 }),
    externalId: boundedString(lead.externalId, 'externalId', { required: false, max: 200 }),
  };
}
