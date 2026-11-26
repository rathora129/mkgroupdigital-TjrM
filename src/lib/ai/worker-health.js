// The worker publishes a health endpoint (local loopback in dev or Railway
// HTTPS in production). A missing or unreachable worker is reported as
// "not_running" instead of blocking the health response.
const DEFAULT_URL = 'http://127.0.0.1:4319/health';
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);

function defaultTimeoutFor(url) {
  try {
    const parsed = new URL(url);
    return LOOPBACK_HOSTS.has(parsed.hostname) ? 500 : 3000;
  } catch {
    return 500;
  }
}

export async function checkAiWorker() {
  const url = (process.env.AI_WORKER_HEALTH_URL || DEFAULT_URL).trim();
  const configuredTimeout = Number(process.env.AI_WORKER_HEALTH_TIMEOUT_MS);
  const timeout =
    Number.isFinite(configuredTimeout) && configuredTimeout > 0
      ? configuredTimeout
      : defaultTimeoutFor(url);
  const secret = (process.env.AI_WORKER_HEALTH_SECRET || '').trim();

  try {
    const response = await fetch(url, {
      ...(secret ? { headers: { authorization: `Bearer ${secret}` } } : {}),
      signal: AbortSignal.timeout(Math.max(100, timeout)),
      cache: 'no-store',
    });
    if (!response.ok) return { status: 'unhealthy' };

    const data = await response.json().catch(() => null);
    if (!data?.ok) return { status: 'unhealthy' };

    return {
      status: 'running',
      startedAt: data.startedAt || null,
      processed: Number(data.processed || 0),
      failed: Number(data.failed || 0),
      lastJobAt: data.lastJobAt || null,
    };
  } catch {
    return { status: 'not_running' };
  }
}
