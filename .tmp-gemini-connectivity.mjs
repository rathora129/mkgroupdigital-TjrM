import { generateText } from '@/lib/ai/providers';
import { getProviderDefinition, isProviderConfigured } from '@/lib/ai/registry';

const provider = 'gemini';
const model = 'gemini-2.0-flash';
const definition = getProviderDefinition(provider);

if (!isProviderConfigured(provider)) {
  console.log(JSON.stringify({ ok: false, stage: 'config', error: 'provider not configured' }, null, 2));
  process.exit(2);
}

const startedAt = Date.now();
try {
  const result = await generateText({
    provider,
    model,
    instructions: 'You are a connectivity check. Reply with the single word: connected.',
    input: 'Connectivity check. Reply with the single word: connected.',
    timeoutMs: 30_000,
  });
  console.log(JSON.stringify({
    ok: true,
    provider: definition.label,
    model,
    durationMs: Date.now() - startedAt,
    responseText: result.text,
    toolCalls: result.toolCalls.length,
    usage: result.usage,
  }, null, 2));
} catch (error) {
  console.log(JSON.stringify({
    ok: false,
    provider: definition.label,
    model,
    durationMs: Date.now() - startedAt,
    errorName: error?.name ?? null,
    errorCode: error?.code ?? null,
    httpStatus: error?.status ?? null,
    retryable: error?.retryable ?? null,
    message: error?.message ?? String(error),
  }, null, 2));
  process.exitCode = 1;
}
