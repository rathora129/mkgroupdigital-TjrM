import { ProviderError, RETRYABLE_CODES } from './errors';
import {
  getModelDefinition,
  getProviderApiKey,
  getProviderDefinition,
} from './registry';

const DEFAULT_TIMEOUT_MS = 60_000;
const MAX_TIMEOUT_MS = 120_000;
const DEFAULT_MAX_TOKENS = 2048;
const MAX_OUTPUT_TOKENS = 8192;

function resolveMaxTokens(maxTokens) {
  const parsed = Number(maxTokens);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_MAX_TOKENS;
  return Math.min(Math.round(parsed), MAX_OUTPUT_TOKENS);
}

function mapHttpError(provider, status, body) {
  const detail =
    (body && (body.error?.message || body.message)) || `HTTP ${status}`;
  if (status === 401 || status === 403) {
    return new ProviderError(
      'auth',
      `${provider} rejected the configured credentials (${status}).`,
      { status },
    );
  }
  if (status === 404) {
    return new ProviderError('model_not_found', `${provider}: ${detail}`, {
      status,
    });
  }
  if (status === 429) {
    return new ProviderError(
      'rate_limited',
      `${provider} rate limit reached. The run will be retried.`,
      { status, retryable: true },
    );
  }
  if (status === 400 || status === 422) {
    return new ProviderError('invalid_request', `${provider}: ${detail}`, {
      status,
    });
  }
  if (status >= 500) {
    return new ProviderError(
      'provider_error',
      `${provider} returned a server error (${status}).`,
      { status, retryable: true },
    );
  }
  return new ProviderError('provider_error', `${provider}: ${detail}`, {
    status,
  });
}

async function readBody(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function requestJson({ url, init, provider, fetchImpl, signal, timeoutMs }) {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, Math.min(Number(timeoutMs) || DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS));

  const onAbort = () => controller.abort();
  signal?.addEventListener('abort', onAbort, { once: true });

  try {
    const response = await fetchImpl(url, { ...init, signal: controller.signal });
    const body = await readBody(response);
    if (!response.ok) {
      throw mapHttpError(provider, response.status, body);
    }
    return body;
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    if (signal?.aborted) {
      throw new ProviderError('cancelled', 'The run was cancelled.', {
        retryable: false,
      });
    }
    if (timedOut || error?.name === 'AbortError') {
      throw new ProviderError(
        'timeout',
        `${provider} did not respond in time.`,
        { retryable: true },
      );
    }
    throw new ProviderError(
      'network',
      `${provider} could not be reached.`,
      { retryable: true },
    );
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

function openAiTools(tools) {
  return tools.map((tool) => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters || { type: 'object', properties: {} },
    },
  }));
}

function anthropicTools(tools) {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    input_schema: tool.parameters || { type: 'object', properties: {} },
  }));
}

function geminiTools(tools) {
  return [
    {
      functionDeclarations: tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters || { type: 'object', properties: {} },
      })),
    },
  ];
}

function openAiMessages(instructions, input, messages) {
  if (!Array.isArray(messages) || messages.length === 0) {
    return [
      { role: 'system', content: instructions },
      { role: 'user', content: input },
    ];
  }
  const result = [{ role: 'system', content: instructions }];
  for (const msg of messages) {
    if (msg.role === 'user') {
      result.push({ role: 'user', content: String(msg.content || '') });
    } else if (msg.role === 'assistant') {
      const entry = { role: 'assistant', content: msg.content || null };
      if (Array.isArray(msg.toolCalls) && msg.toolCalls.length) {
        entry.tool_calls = msg.toolCalls.map((call, idx) => ({
          id: call.id || `call_${idx}`,
          type: 'function',
          function: {
            name: call.name,
            arguments:
              typeof call.arguments === 'string'
                ? call.arguments
                : JSON.stringify(call.arguments || {}),
          },
        }));
      }
      result.push(entry);
    } else if (msg.role === 'tool') {
      result.push({
        role: 'tool',
        tool_call_id: msg.toolCallId || `call_${msg.index || 0}`,
        content:
          typeof msg.content === 'string'
            ? msg.content
            : JSON.stringify(msg.content ?? null),
      });
    }
  }
  return result;
}

function anthropicMessages(input, messages) {
  if (!Array.isArray(messages) || messages.length === 0) {
    return [{ role: 'user', content: input }];
  }
  const result = [];
  let pendingTools = [];
  const flushTools = () => {
    if (pendingTools.length) {
      result.push({ role: 'user', content: pendingTools });
      pendingTools = [];
    }
  };
  for (const msg of messages) {
    if (msg.role === 'tool') {
      pendingTools.push({
        type: 'tool_result',
        tool_use_id: msg.toolCallId || msg.name,
        content:
          typeof msg.content === 'string'
            ? msg.content
            : JSON.stringify(msg.content ?? null),
      });
      continue;
    }
    flushTools();
    if (msg.role === 'user') {
      result.push({ role: 'user', content: String(msg.content || '') });
    } else if (msg.role === 'assistant') {
      if (Array.isArray(msg.rawContent)) {
        result.push({ role: 'assistant', content: msg.rawContent });
      } else {
        result.push({ role: 'assistant', content: String(msg.content || '') });
      }
    }
  }
  flushTools();
  return result;
}

function geminiContents(input, messages) {
  if (!Array.isArray(messages) || messages.length === 0) {
    return [{ role: 'user', parts: [{ text: input }] }];
  }
  const result = [];
  let pendingToolParts = [];
  const flushToolParts = () => {
    if (pendingToolParts.length) {
      result.push({ role: 'user', parts: pendingToolParts });
      pendingToolParts = [];
    }
  };
  for (const msg of messages) {
    if (msg.role === 'tool') {
      let responseObj;
      if (msg.content && typeof msg.content === 'object') {
        responseObj = msg.content;
      } else {
        try {
          responseObj = JSON.parse(String(msg.content || '{}'));
        } catch {
          responseObj = { result: String(msg.content || '') };
        }
      }
      pendingToolParts.push({
        functionResponse: {
          name: msg.name,
          response: responseObj,
        },
      });
      continue;
    }
    flushToolParts();
    if (msg.role === 'user') {
      result.push({ role: 'user', parts: [{ text: String(msg.content || '') }] });
    } else if (msg.role === 'assistant') {
      // Preserve raw model content verbatim (including thoughtSignature on
      // functionCall parts required by Gemini 3/4 multi-turn tool calling).
      if (msg.rawContent && Array.isArray(msg.rawContent.parts)) {
        result.push(msg.rawContent);
      } else {
        result.push({ role: 'model', parts: [{ text: String(msg.content || '') }] });
      }
    }
  }
  flushToolParts();
  return result;
}

async function callOpenAi({
  apiKey,
  model,
  instructions,
  input,
  messages,
  tools,
  json,
  maxTokens,
  fetchImpl,
  signal,
  timeoutMs,
}) {
  const body = {
    model,
    messages: openAiMessages(instructions, input, messages),
    temperature: 0.2,
    max_tokens: resolveMaxTokens(maxTokens),
  };
  if (json) body.response_format = { type: 'json_object' };
  if (tools.length) body.tools = openAiTools(tools);

  const data = await requestJson({
    url: 'https://api.openai.com/v1/chat/completions',
    init: {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    },
    provider: 'OpenAI',
    fetchImpl,
    signal,
    timeoutMs,
  });

  const message = data?.choices?.[0]?.message || {};
  return {
    text: typeof message.content === 'string' ? message.content : '',
    toolCalls: (message.tool_calls || []).map((call) => ({
      ...(call.id ? { id: call.id } : {}),
      name: call.function?.name || '',
      arguments: call.function?.arguments || '',
    })),
    usage: {
      promptTokens: Number(data?.usage?.prompt_tokens || 0),
      completionTokens: Number(data?.usage?.completion_tokens || 0),
    },
  };
}

async function callAnthropic({
  apiKey,
  model,
  instructions,
  input,
  messages,
  tools,
  json,
  maxTokens,
  fetchImpl,
  signal,
  timeoutMs,
}) {
  const system = json
    ? `${instructions}\n\nRespond with a single valid JSON object and no prose.`
    : instructions;
  const body = {
    model,
    max_tokens: resolveMaxTokens(maxTokens),
    temperature: 0.2,
    system,
    messages: anthropicMessages(input, messages),
  };
  if (tools.length) body.tools = anthropicTools(tools);

  const data = await requestJson({
    url: 'https://api.anthropic.com/v1/messages',
    init: {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    },
    provider: 'Anthropic',
    fetchImpl,
    signal,
    timeoutMs,
  });

  const blocks = Array.isArray(data?.content) ? data.content : [];
  return {
    text: blocks
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n')
      .trim(),
    toolCalls: blocks
      .filter((block) => block.type === 'tool_use')
      .map((block) => ({
        ...(block.id ? { id: block.id } : {}),
        name: block.name || '',
        arguments: JSON.stringify(block.input || {}),
      })),
    rawContent: blocks,
    usage: {
      promptTokens: Number(data?.usage?.input_tokens || 0),
      completionTokens: Number(data?.usage?.output_tokens || 0),
    },
  };
}

async function callGemini({
  apiKey,
  model,
  instructions,
  input,
  messages,
  tools,
  json,
  maxTokens,
  fetchImpl,
  signal,
  timeoutMs,
}) {
  const body = {
    systemInstruction: { parts: [{ text: instructions }] },
    contents: geminiContents(input, messages),
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: resolveMaxTokens(maxTokens),
    },
  };
  if (json) body.generationConfig.responseMimeType = 'application/json';
  if (tools.length) body.tools = geminiTools(tools);

  const data = await requestJson({
    url: `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    init: {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify(body),
    },
    provider: 'Gemini',
    fetchImpl,
    signal,
    timeoutMs,
  });

  const candidate = data?.candidates?.[0];
  const parts = candidate?.content?.parts || [];
  const candidateTokens = Number(data?.usageMetadata?.candidatesTokenCount || 0);
  const thoughtTokens = Number(data?.usageMetadata?.thoughtsTokenCount || 0);

  return {
    text: parts
      .filter((part) => !part.thought && typeof part.text === 'string')
      .map((part) => part.text)
      .join('\n')
      .trim(),
    toolCalls: parts
      .filter((part) => part.functionCall)
      .map((part) => ({
        name: part.functionCall.name || '',
        arguments: JSON.stringify(part.functionCall.args || {}),
      })),
    ...(candidate?.content ? { rawContent: candidate.content } : {}),
    usage: {
      promptTokens: Number(data?.usageMetadata?.promptTokenCount || 0),
      completionTokens: candidateTokens + thoughtTokens,
    },
  };
}

const ADAPTERS = {
  openai: callOpenAi,
  anthropic: callAnthropic,
  gemini: callGemini,
};

export function supportsProvider(provider) {
  return Boolean(ADAPTERS[provider]);
}

export async function generateText({
  provider,
  model,
  instructions,
  input = '',
  messages = null,
  tools = [],
  json = false,
  maxTokens = DEFAULT_MAX_TOKENS,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  signal,
  fetchImpl = globalThis.fetch,
}) {
  const definition = getProviderDefinition(provider);
  if (!definition) {
    throw new ProviderError(
      'unknown_provider',
      `Unknown AI provider "${provider}".`,
    );
  }
  if (!getModelDefinition(provider, model)) {
    // Still allowed: providers ship models faster than the pricing table.
    if (!model || typeof model !== 'string' || model.length > 120) {
      throw new ProviderError('invalid_request', 'A valid model is required.');
    }
  }

  const apiKey = getProviderApiKey(provider);
  if (!apiKey) {
    throw new ProviderError(
      'not_configured',
      `${definition.label} is not configured on this server. Add ${definition.envKeys[0]} to enable AI execution.`,
    );
  }

  if (!instructions || !String(instructions).trim()) {
    throw new ProviderError(
      'invalid_request',
      'Agent instructions are empty.',
    );
  }
  const hasMessages = Array.isArray(messages) && messages.length > 0;
  if (!hasMessages && (!input || !String(input).trim())) {
    throw new ProviderError('invalid_request', 'Run input is empty.');
  }

  return ADAPTERS[provider]({
    apiKey,
    model,
    instructions: String(instructions),
    input: String(input || ''),
    messages,
    tools,
    json,
    maxTokens,
    fetchImpl,
    signal,
    timeoutMs,
  });
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function generateWithRetry(options, policy = {}) {
  const retries = Number.isInteger(policy.retries) ? policy.retries : 2;
  const baseDelayMs = Number(policy.baseDelayMs ?? 750);
  const wait = policy.sleep || sleep;

  let attempt = 0;
  for (;;) {
    try {
      return await generateText(options);
    } catch (error) {
      const retryable =
        error instanceof ProviderError && RETRYABLE_CODES.has(error.code);
      if (!retryable || attempt >= retries || options.signal?.aborted) {
        throw error;
      }
      const delay = Math.min(baseDelayMs * 2 ** attempt, 8_000);
      attempt += 1;
      await wait(delay);
    }
  }
}

export async function generateStructured(options, policy) {
  const result = await generateWithRetry({ ...options, json: true }, policy);
  let data;
  try {
    data = JSON.parse(result.text);
  } catch {
    throw new ProviderError(
      'invalid_output',
      'The provider did not return valid JSON.',
      { retryable: true },
    );
  }
  return { ...result, data };
}
