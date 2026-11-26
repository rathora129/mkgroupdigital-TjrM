// Provider metadata is server-only. Credentials are never stored in the
// database or sent to the browser; this registry only reports whether the
// environment already supplies a key.

const PROVIDERS = {
  openai: {
    key: 'openai',
    label: 'OpenAI',
    envKeys: ['OPENAI_API_KEY'],
    defaultModel: 'gpt-4o-mini',
    supportsJson: true,
    supportsTools: true,
    models: [
      { id: 'gpt-4o-mini', label: 'GPT-4o mini', inputCentsPerMillion: 15, outputCentsPerMillion: 60 },
      { id: 'gpt-4.1-mini', label: 'GPT-4.1 mini', inputCentsPerMillion: 40, outputCentsPerMillion: 160 },
      { id: 'gpt-4o', label: 'GPT-4o', inputCentsPerMillion: 250, outputCentsPerMillion: 1000 },
    ],
  },
  anthropic: {
    key: 'anthropic',
    label: 'Anthropic',
    envKeys: ['ANTHROPIC_API_KEY'],
    defaultModel: 'claude-3-5-haiku-latest',
    supportsJson: false,
    supportsTools: true,
    models: [
      { id: 'claude-3-5-haiku-latest', label: 'Claude 3.5 Haiku', inputCentsPerMillion: 80, outputCentsPerMillion: 400 },
      { id: 'claude-3-5-sonnet-latest', label: 'Claude 3.5 Sonnet', inputCentsPerMillion: 300, outputCentsPerMillion: 1500 },
    ],
  },
  gemini: {
    key: 'gemini',
    label: 'Google Gemini',
    envKeys: ['GEMINI_API_KEY', 'GOOGLE_API_KEY'],
    defaultModel: 'gemini-3.5-flash-lite',
    supportsJson: true,
    supportsTools: true,
    models: [
      { id: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash-Lite', inputCentsPerMillion: 30, outputCentsPerMillion: 250 },
      // Promo pricing through Dec 31, 2026 ($0.75 / $3.75 per 1M); standard is $1.50 / $7.50 from Jan 1, 2027.
      { id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash', inputCentsPerMillion: 75, outputCentsPerMillion: 375 },
      { id: 'gemini-4-hydrogen', label: 'Gemini 4 Hydrogen', inputCentsPerMillion: 150, outputCentsPerMillion: 750 },
    ],
  },
};

// Legacy Gemini model IDs that Google shut down or retired; mapped transparently
// to supported replacements so existing DB agent rows continue executing safely.
export const DEPRECATED_MODEL_MAP = {
  gemini: {
    'gemini-2.0-flash': 'gemini-3.5-flash-lite',
    'gemini-2.0-flash-001': 'gemini-3.5-flash-lite',
    'gemini-2.0-flash-exp': 'gemini-3.5-flash-lite',
    'gemini-2.0-flash-lite': 'gemini-3.5-flash-lite',
    'gemini-1.5-flash': 'gemini-3.5-flash-lite',
    'gemini-1.5-pro': 'gemini-3.8-flash',
    'gemini-2.5-flash': 'gemini-3.5-flash-lite',
    'gemini-2.5-pro': 'gemini-3.8-flash',
  },
};

export function resolveProviderModel(providerKey, modelId) {
  const definition = PROVIDERS[providerKey];
  if (!definition) {
    return { model: modelId, replacedFrom: null };
  }
  const normalized = typeof modelId === 'string' ? modelId.trim() : '';
  if (!normalized) {
    return { model: definition.defaultModel, replacedFrom: null };
  }
  const replacement = DEPRECATED_MODEL_MAP[providerKey]?.[normalized];
  if (replacement) {
    return { model: replacement, replacedFrom: normalized };
  }
  return { model: normalized, replacedFrom: null };
}

export const PROVIDER_KEYS = Object.keys(PROVIDERS);

export function getProviderDefinition(key) {
  return PROVIDERS[key] || null;
}

export function getProviderApiKey(key) {
  const definition = PROVIDERS[key];
  if (!definition) return null;
  for (const envKey of definition.envKeys) {
    const value = process.env[envKey];
    if (value && value.trim()) return value.trim();
  }
  return null;
}

export function isProviderConfigured(key) {
  return Boolean(getProviderApiKey(key));
}

export function configuredProviderKeys() {
  return PROVIDER_KEYS.filter((key) => isProviderConfigured(key));
}

export function getModelDefinition(providerKey, modelId) {
  const definition = PROVIDERS[providerKey];
  if (!definition) return null;
  return definition.models.find((model) => model.id === modelId) || null;
}

// Unknown models are allowed (providers add them faster than this table), but
// the cost then stays 0 and the UI marks usage as unpriced.
export function estimateCostCents(providerKey, modelId, usage = {}) {
  const model = getModelDefinition(providerKey, modelId);
  if (!model) return 0;
  const input = Number(usage.promptTokens || 0);
  const output = Number(usage.completionTokens || 0);
  const cents =
    (input / 1_000_000) * model.inputCentsPerMillion +
    (output / 1_000_000) * model.outputCentsPerMillion;
  return Math.max(0, Math.round(cents));
}

export function listProviderMetadata() {
  return PROVIDER_KEYS.map((key) => {
    const { envKeys, ...definition } = PROVIDERS[key];
    return {
      ...definition,
      configured: isProviderConfigured(key),
    };
  });
}
