// Integration registry. Provider metadata is server-only: it records which
// credential NAMES the environment must already contain, never the values.
// A provider that is missing a required name is reported as NOT_CONFIGURED.
//
// The AI providers and email transport are existing Phase 2B/2A systems. This
// registry points at them instead of duplicating their configuration.

import { isProviderConfigured } from '@/lib/ai/registry';
import { getEmailDeliveryStatus } from '@/lib/email/send';

const ENV_ONLY = 'environment';
const OAUTH_FUTURE = 'oauth_future';
const BUILTIN = 'builtin';

const DEFINITIONS = [
  // --- AI providers (reuse the Phase 2B registry) --------------------------
  {
    kind: 'ai_provider',
    provider: 'openai',
    label: 'OpenAI',
    description: 'Existing AI runtime provider. Used for agent and content generation.',
    capabilities: ['read'],
    requiredEnvKeys: ['OPENAI_API_KEY'],
    connectionType: ENV_ONLY,
    readOnly: false,
    requiresApproval: false,
    limitations: 'Provider calls run only in the existing AI worker.',
  },
  {
    kind: 'ai_provider',
    provider: 'anthropic',
    label: 'Anthropic',
    description: 'Existing AI runtime provider.',
    capabilities: ['read'],
    requiredEnvKeys: ['ANTHROPIC_API_KEY'],
    connectionType: ENV_ONLY,
    readOnly: false,
    requiresApproval: false,
    limitations: 'Provider calls run only in the existing AI worker.',
  },
  {
    kind: 'ai_provider',
    provider: 'gemini',
    label: 'Google Gemini',
    description: 'Existing AI runtime provider.',
    capabilities: ['read'],
    requiredEnvKeys: ['GEMINI_API_KEY', 'GOOGLE_API_KEY'],
    environmentRequirement: 'any',
    connectionType: ENV_ONLY,
    readOnly: false,
    requiresApproval: false,
    limitations: 'Provider calls run only in the existing AI worker.',
  },

  // --- Email delivery (reuse the Phase 2A/2B transport) --------------------
  {
    kind: 'email',
    provider: 'resend',
    label: 'Resend',
    description: 'Transactional email transport already used for magic links and invitations.',
    capabilities: ['send_message'],
    requiredEnvKeys: ['RESEND_API_KEY', 'AUTH_EMAIL_FROM'],
    connectionType: ENV_ONLY,
    readOnly: false,
    requiresApproval: true,
    limitations:
      'Campaign and customer messaging stays blocked this phase; only existing system emails send.',
  },
  {
    kind: 'email',
    provider: 'smtp',
    label: 'SMTP (Mailpit locally)',
    description: 'Local SMTP transport used by the existing email adapter.',
    capabilities: ['send_message'],
    requiredEnvKeys: ['EMAIL_TRANSPORT', 'SMTP_HOST', 'SMTP_PORT', 'AUTH_EMAIL_FROM'],
    connectionType: ENV_ONLY,
    readOnly: false,
    requiresApproval: true,
    limitations: 'Local Mailpit only; never used for real customer messages.',
  },

  // --- Website CMS --------------------------------------------------------
  {
    kind: 'cms',
    provider: 'wordpress_rest',
    label: 'WordPress REST (future)',
    description: 'Prepare page updates and publishing requests for an authorised CMS.',
    capabilities: ['read', 'propose', 'validate', 'publish_request'],
    requiredEnvKeys: ['WORDPRESS_API_URL', 'WORDPRESS_API_TOKEN'],
    connectionType: OAUTH_FUTURE,
    readOnly: true,
    requiresApproval: true,
    limitations: 'Contract only. No live CMS connection or publishing exists this phase.',
  },
  {
    kind: 'cms',
    provider: 'generic_http',
    label: 'Generic HTTP CMS (future)',
    description: 'Adapter contract for a custom or headless CMS.',
    capabilities: ['read', 'propose', 'validate', 'publish_request'],
    requiredEnvKeys: ['CMS_API_BASE_URL', 'CMS_API_TOKEN'],
    connectionType: OAUTH_FUTURE,
    readOnly: true,
    requiresApproval: true,
    limitations: 'Contract only. No live CMS connection.',
  },

  // --- Analytics ----------------------------------------------------------
  {
    kind: 'analytics',
    provider: 'google_analytics_ga4',
    label: 'Google Analytics 4 (future)',
    description: 'Import website metrics and keep their source and retrieval time.',
    capabilities: ['read', 'import_metrics', 'report'],
    requiredEnvKeys: ['GA4_PROPERTY_ID', 'GA4_SERVICE_ACCOUNT_JSON'],
    connectionType: OAUTH_FUTURE,
    readOnly: true,
    requiresApproval: false,
    limitations: 'Contract only. No analytics calls or OAuth consent exist this phase.',
  },

  // --- Search Console -----------------------------------------------------
  {
    kind: 'search_console',
    provider: 'google_search_console',
    label: 'Google Search Console (future)',
    description: 'Import keyword, impressions, clicks and position data.',
    capabilities: ['read', 'import_metrics', 'report'],
    requiredEnvKeys: ['GSC_SITE_URL', 'GSC_SERVICE_ACCOUNT_JSON'],
    connectionType: OAUTH_FUTURE,
    readOnly: true,
    requiresApproval: false,
    limitations: 'Contract only. No Search Console calls exist this phase.',
  },

  // --- Advertising --------------------------------------------------------
  {
    kind: 'ads',
    provider: 'google_ads',
    label: 'Google Ads (future)',
    description: 'Campaign planning and reporting contracts. Spend stays zero.',
    capabilities: ['read', 'propose', 'report'],
    requiredEnvKeys: [
      'GOOGLE_ADS_DEVELOPER_TOKEN',
      'GOOGLE_ADS_CUSTOMER_ID',
      'GOOGLE_ADS_SERVICE_ACCOUNT_JSON',
    ],
    connectionType: OAUTH_FUTURE,
    readOnly: true,
    requiresApproval: true,
    limitations: 'Planning and reporting only. Activation and spend are blocked.',
  },
  {
    kind: 'ads',
    provider: 'meta_ads',
    label: 'Meta Ads (future)',
    description: 'Campaign planning and reporting contracts. Spend stays zero.',
    capabilities: ['read', 'propose', 'report'],
    requiredEnvKeys: [
      'META_ADS_APP_ID',
      'META_ADS_APP_SECRET',
      'META_ADS_ACCESS_TOKEN',
      'META_ADS_AD_ACCOUNT_ID',
    ],
    connectionType: OAUTH_FUTURE,
    readOnly: true,
    requiresApproval: true,
    limitations: 'Planning and reporting only. Activation and spend are blocked.',
  },

  // --- Social -------------------------------------------------------------
  {
    kind: 'social',
    provider: 'instagram_graph',
    label: 'Instagram Graph (future)',
    description: 'Account, content and publishing capability contracts.',
    capabilities: ['read', 'propose', 'publish_request'],
    requiredEnvKeys: ['META_GRAPH_APP_ID', 'META_GRAPH_APP_SECRET', 'META_GRAPH_ACCESS_TOKEN'],
    connectionType: OAUTH_FUTURE,
    readOnly: true,
    requiresApproval: true,
    limitations: 'Contract only. No posts or scheduled external publishing.',
  },
  {
    kind: 'social',
    provider: 'linkedin',
    label: 'LinkedIn (future)',
    description: 'Account, content and publishing capability contracts.',
    capabilities: ['read', 'propose', 'publish_request'],
    requiredEnvKeys: ['LINKEDIN_CLIENT_ID', 'LINKEDIN_CLIENT_SECRET', 'LINKEDIN_ACCESS_TOKEN'],
    connectionType: OAUTH_FUTURE,
    readOnly: true,
    requiresApproval: true,
    limitations: 'Contract only. No posts or OAuth consent.',
  },

  // --- Lead sources -------------------------------------------------------
  {
    kind: 'lead_source',
    provider: 'inbound_hmac',
    label: 'Inbound lead webhook',
    description: 'Signature-verified inbound webhook that records lead candidates.',
    capabilities: ['receive_event'],
    requiredEnvKeys: ['INTEGRATION_WEBHOOK_SECRET'],
    connectionType: ENV_ONLY,
    readOnly: true,
    requiresApproval: false,
    limitations:
      'Events are recorded for review; leads are never created automatically.',
  },

  // --- File storage -------------------------------------------------------
  {
    kind: 'file_storage',
    provider: 'local_document_store',
    label: 'Local document store',
    description: 'Existing knowledge document ingestion stored inside the database.',
    capabilities: ['store_file', 'read'],
    requiredEnvKeys: [],
    connectionType: BUILTIN,
    readOnly: false,
    requiresApproval: false,
    limitations: 'Local database storage only; no external object storage.',
  },

  // --- Webhooks -----------------------------------------------------------
  {
    kind: 'webhook',
    provider: 'generic_hmac',
    label: 'Generic signed webhook',
    description: 'HMAC-signed inbound webhook and sync event recorder.',
    capabilities: ['receive_event'],
    requiredEnvKeys: ['INTEGRATION_WEBHOOK_SECRET'],
    connectionType: ENV_ONLY,
    readOnly: true,
    requiresApproval: false,
    limitations: 'Inbound only; retries use the existing pg-boss worker.',
  },
];

function hasEnv(name) {
  const value = process.env[name];
  return typeof value === 'string' && value.trim() !== '';
}

function emailsByTransport(provider) {
  const status = getEmailDeliveryStatus();
  if (provider === 'smtp') return status.configured && status.transport === 'smtp';
  return status.configured && status.transport !== 'smtp';
}

export function providerConfigured(definition) {
  if (!definition) return false;
  if (definition.connectionType === BUILTIN) return true;
  if (definition.kind === 'ai_provider') return isProviderConfigured(definition.provider);
  if (definition.kind === 'email') return emailsByTransport(definition.provider);

  const required = definition.requiredEnvKeys || [];
  if (required.length === 0) return false;
  // `environmentRequirement: 'any'` covers providers that accept one of
  // several keys (Gemini accepts GEMINI_API_KEY or GOOGLE_API_KEY).
  if (definition.environmentRequirement === 'any') {
    return required.some((name) => hasEnv(name));
  }
  return required.every((name) => hasEnv(name));
}

export function listProviderDefinitions(kind) {
  return DEFINITIONS.filter((item) => !kind || item.kind === kind).map((item) => ({
    ...item,
  }));
}

export function getProviderDefinition(kind, provider) {
  return (
    DEFINITIONS.find((item) => item.kind === kind && item.provider === provider) ||
    null
  );
}

export function isKnownProvider(kind, provider) {
  return Boolean(getProviderDefinition(kind, provider));
}

export function providerPublicView(definition) {
  return {
    kind: definition.kind,
    provider: definition.provider,
    label: definition.label,
    description: definition.description,
    capabilities: definition.capabilities,
    requiredEnvKeys: definition.requiredEnvKeys,
    connectionType: definition.connectionType,
    readOnly: definition.readOnly,
    requiresApproval: definition.requiresApproval,
    limitations: definition.limitations,
    configured: providerConfigured(definition),
  };
}
