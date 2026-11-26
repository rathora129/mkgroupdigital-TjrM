import { generateStructured } from '@/lib/ai/providers';
import {
  estimateCostCents,
  getProviderDefinition,
  isProviderConfigured,
} from '@/lib/ai/registry';
import { getProviderSetting, listAgents } from '@/lib/ai/runtime';

const ENRICHMENT_TIMEOUT_MS = 30_000;

const INSTRUCTIONS = [
  'You screen a business for an agency sales team.',
  'You only receive facts that came from an authorised public source plus the campaign criteria.',
  'Never invent a phone number, email address, person, address, website, revenue, employee count, certification or client.',
  'You may make qualitative judgements. Those judgements are hypotheses that a human must verify before acting.',
  'Return one JSON object and no prose.',
].join('\n');

function clip(value, max) {
  const text = String(value ?? '').trim();
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function clampInt(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.round(number)));
}

function normalizeTemperature(value) {
  return ['hot', 'warm', 'cold'].includes(value) ? value : 'unknown';
}

export async function checkEnrichmentReady(workspaceId) {
  const agents = await listAgents(workspaceId, { enabled: true });
  const agent =
    agents.find((item) => item.type === 'lead_research') ||
    agents.find((item) => item.type === 'business_research') ||
    null;

  if (!agent) {
    return {
      ready: false,
      reason: 'NO_AGENT',
      agent: null,
      message:
        'Create and enable a Lead Research or Business Research agent to score prospects with AI.',
    };
  }

  const definition = getProviderDefinition(agent.provider);
  if (!definition) {
    return {
      ready: false,
      reason: 'PROVIDER_UNSUPPORTED',
      agent,
      message: 'The selected enrichment agent uses a provider that is no longer supported.',
    };
  }

  const setting = await getProviderSetting(workspaceId, agent.provider);
  if (setting && setting.enabled === false) {
    return {
      ready: false,
      reason: 'PROVIDER_DISABLED',
      agent,
      message: `${definition.label} is disabled for this workspace.`,
    };
  }

  if (!isProviderConfigured(agent.provider)) {
    return {
      ready: false,
      reason: 'AI_NOT_CONFIGURED',
      agent,
      message: `${definition.label} is not configured on this server. Discovery still stores listing facts, but AI scoring is skipped.`,
    };
  }

  return {
    ready: true,
    reason: null,
    agent,
    model: agent.model || definition.defaultModel,
    message: `AI enrichment runs through ${agent.name} (${definition.label}).`,
  };
}

export function buildEnrichmentPrompt(campaign, candidate) {
  const criteria = campaign.criteria || {};
  return [
    'Score and prepare one discovered business for an outbound call.',
    '',
    `Campaign: ${campaign.name}`,
    `Target location: ${[criteria.area, criteria.city, criteria.state, criteria.country].filter(Boolean).join(', ') || 'not specified'}`,
    `Target industry: ${criteria.industry || 'not specified'}`,
    `Target business size: ${criteria.businessSize || 'not specified'}`,
    `Website presence: ${criteria.websitePresence || 'any'}`,
    `Services the agency sells: ${(campaign.services || []).join(', ') || 'not specified'}`,
    `Quality criteria: ${criteria.qualityCriteria || 'not specified'}`,
    `Extra keywords: ${criteria.keywords || 'none'}`,
    '',
    'Candidate facts from the authorised source:',
    JSON.stringify(
      {
        businessName: candidate.businessName,
        website: candidate.website,
        phone: candidate.phone,
        address: candidate.address,
        city: candidate.city,
        state: candidate.state,
        country: candidate.country,
        industry: candidate.industry,
        businessStatus: candidate.facts?.businessStatus || null,
        providerTypes: candidate.facts?.providerTypes || [],
        snippet: candidate.facts?.snippet || null,
      },
      null,
      2,
    ),
    '',
    'Return JSON with this exact shape:',
    '{"leadScore": number 0-100, "temperature": "hot|warm|cold", "confidence": number 0-100, "recommendedService": string|null, "reason": string, "pitch": string, "callingApproach": string, "qualificationQuestions": string[], "nextAction": string}',
    'recommendedService must be one of the services the agency sells, or null.',
    'Keep reason, pitch and callingApproach under 600 characters each.',
    'Provide between 3 and 6 qualification questions.',
  ].join('\n');
}

export function parseEnrichment(data) {
  if (!data || typeof data !== 'object') return null;
  const questions = Array.isArray(data.qualificationQuestions)
    ? data.qualificationQuestions
        .map((item) => clip(item, 300))
        .filter(Boolean)
        .slice(0, 6)
    : [];

  return {
    leadScore: clampInt(data.leadScore, 0, 100, null),
    temperature: normalizeTemperature(data.temperature),
    confidence: clampInt(data.confidence, 0, 100, null),
    recommendedService: data.recommendedService
      ? clip(data.recommendedService, 200)
      : null,
    reason: data.reason ? clip(data.reason, 2_000) : null,
    pitch: data.pitch ? clip(data.pitch, 2_000) : null,
    callingApproach: data.callingApproach
      ? clip(data.callingApproach, 2_000)
      : null,
    qualificationQuestions: questions,
    nextAction: data.nextAction ? clip(data.nextAction, 500) : null,
  };
}

export function hypothesesFor(enrichment) {
  if (!enrichment) return [];
  const hypotheses = [];
  if (enrichment.leadScore !== null) {
    hypotheses.push({
      source: 'ai_analysis',
      statement: `AI suggested a lead score of ${enrichment.leadScore}/100 with ${enrichment.temperature} temperature.`,
      confidence: enrichment.confidence,
    });
  }
  if (enrichment.reason) {
    hypotheses.push({
      source: 'ai_analysis',
      statement: enrichment.reason,
      confidence: enrichment.confidence,
    });
  }
  if (enrichment.recommendedService) {
    hypotheses.push({
      source: 'ai_analysis',
      statement: `AI suggested the service “${enrichment.recommendedService}”.`,
      confidence: enrichment.confidence,
    });
  }
  return hypotheses;
}

export async function enrichCandidate({
  campaign,
  candidate,
  readiness,
  budgetRemainingCents,
  generate,
}) {
  if (!readiness?.ready) {
    return {
      enrichment: null,
      usage: null,
      reason: readiness?.reason || 'NOT_READY',
      message: readiness?.message || 'AI enrichment is not available.',
    };
  }
  if (!Number.isFinite(budgetRemainingCents) || budgetRemainingCents <= 0) {
    return {
      enrichment: null,
      usage: null,
      reason: 'BUDGET_EXHAUSTED',
      message: 'The campaign AI budget is exhausted.',
    };
  }

  const agent = readiness.agent;
  const generateFn = generate || generateStructured;

  try {
    const result = await generateFn({
      provider: agent.provider,
      model: agent.model || readiness.model,
      instructions: INSTRUCTIONS,
      input: buildEnrichmentPrompt(campaign, candidate),
      timeoutMs: ENRICHMENT_TIMEOUT_MS,
    });

    const data = result?.data && typeof result.data === 'object' ? result.data : result;
    const enrichment = parseEnrichment(data);
    if (!enrichment) {
      return {
        enrichment: null,
        usage: null,
        reason: 'INVALID_OUTPUT',
        message: 'The enrichment agent did not return a usable result.',
      };
    }

    const usage = result?.usage || {};
    const inputTokens = Number(usage.promptTokens || 0);
    const outputTokens = Number(usage.completionTokens || 0);
    const costCents = estimateCostCents(
      agent.provider,
      agent.model || readiness.model,
      { promptTokens: inputTokens, completionTokens: outputTokens },
    );

    return {
      enrichment,
      reason: null,
      message: null,
      usage: {
        provider: agent.provider,
        model: agent.model || readiness.model,
        inputTokens,
        outputTokens,
        costCents,
      },
    };
  } catch (error) {
    return {
      enrichment: null,
      usage: null,
      reason: error?.code || 'AI_ERROR',
      message: error?.message || 'AI enrichment failed.',
    };
  }
}
