import { PgBoss } from 'pg-boss';

// pg-boss stores its tables in their own schema inside the existing
// PostgreSQL database. It needs a TCP connection, so it is never touched by
// the Neon HTTP query path; the web app only calls send() here.
export const AI_QUEUE_NAME = 'agent-run';
export const RESEARCH_QUEUE_NAME = 'research-prepare';
export const WEBSITE_AUDIT_QUEUE_NAME = 'website-audit';
export const INTEGRATION_QUEUE_NAME = 'integration-event';
export const EXECUTION_QUEUE_NAME = 'execution-request';
export const WORKFLOW_QUEUE_NAME = 'workflow-run';
export const DISCOVERY_RUN_QUEUE_NAME = 'prospect-discovery';
export const DISCOVERY_SCAN_QUEUE_NAME = 'discovery-scan';
export const DISCOVERY_SCAN_CRON = '*/10 * * * *';
export const REMINDER_SCAN_QUEUE_NAME = 'followup-scan';
export const REMINDER_SCAN_CRON = '*/15 * * * *';
export const AI_JOB_RETRY_LIMIT = 2;
export const AI_JOB_MAX_ATTEMPTS = AI_JOB_RETRY_LIMIT + 1;
export const AI_JOB_EXPIRE_SECONDS = 240;
export const PREP_JOB_RETRY_LIMIT = 2;
export const WEBSITE_AUDIT_RETRY_LIMIT = 1;
export const INTEGRATION_JOB_RETRY_LIMIT = 2;
export const INTEGRATION_JOB_MAX_ATTEMPTS = INTEGRATION_JOB_RETRY_LIMIT + 1;
export const EXECUTION_JOB_RETRY_LIMIT = 1;
export const WORKFLOW_JOB_RETRY_LIMIT = 1;
export const WORKFLOW_JOB_MAX_ATTEMPTS = WORKFLOW_JOB_RETRY_LIMIT + 1;
export const DISCOVERY_RUN_RETRY_LIMIT = 2;
export const DISCOVERY_RUN_MAX_ATTEMPTS = DISCOVERY_RUN_RETRY_LIMIT + 1;

const GLOBAL_KEY = '__mkAiQueueBoss';
const ENSURED_QUEUES_KEY = '__mkAiQueueEnsured';

export const ALL_QUEUES = [
  AI_QUEUE_NAME,
  RESEARCH_QUEUE_NAME,
  WEBSITE_AUDIT_QUEUE_NAME,
  INTEGRATION_QUEUE_NAME,
  EXECUTION_QUEUE_NAME,
  WORKFLOW_QUEUE_NAME,
  DISCOVERY_RUN_QUEUE_NAME,
  DISCOVERY_SCAN_QUEUE_NAME,
  REMINDER_SCAN_QUEUE_NAME,
];

// pg-boss relies on session-level features (advisory locks, persistent pools,
// optional LISTEN/NOTIFY) that are unreliable over transaction-mode PgBouncer.
// Prefer a dedicated/unpooled TCP URL when supplied, falling back to DATABASE_URL.
export function getQueueDatabaseUrl() {
  return (
    process.env.QUEUE_DATABASE_URL ||
    process.env.DATABASE_URL_UNPOOLED ||
    process.env.DATABASE_URL ||
    ''
  );
}

export function isQueueConfigured() {
  return Boolean(
    process.env.QUEUE_DATABASE_URL ||
    process.env.DATABASE_URL_UNPOOLED ||
    process.env.DATABASE_URL
  );
}

function getEnsuredSet() {
  if (!globalThis[ENSURED_QUEUES_KEY]) {
    globalThis[ENSURED_QUEUES_KEY] = new Set();
  }
  return globalThis[ENSURED_QUEUES_KEY];
}

async function ensureQueue(boss, name) {
  const ensured = getEnsuredSet();
  if (ensured.has(name)) return;
  await boss.createQueue(name);
  ensured.add(name);
}

async function startQueue({ worker = false } = {}) {
  const connectionString = getQueueDatabaseUrl();
  if (!connectionString) {
    throw new Error('No queue database connection configured');
  }

  const maxPool = Number(process.env.QUEUE_POOL_MAX || (worker ? 4 : 2));
  const boss = new PgBoss({
    connectionString,
    schema: 'pgboss',
    application_name: worker ? 'mk-ai-workforce-worker' : 'mk-ai-workforce-web',
    max: Number.isFinite(maxPool) && maxPool > 0 ? maxPool : 2,
    connectionTimeoutMillis: 10_000,
    supervise: worker,
    schedule: worker,
  });

  boss.on('error', (error) => {
    console.error(`[ai-queue] ${error?.message || 'unknown error'}`);
  });

  await boss.start({ attempts: 3 });

  if (worker) {
    for (const queueName of ALL_QUEUES) {
      await ensureQueue(boss, queueName);
    }
  }

  return boss;
}

export function getBoss({ worker = false } = {}) {
  if (!globalThis[GLOBAL_KEY]) {
    const promise = startQueue({ worker });
    globalThis[GLOBAL_KEY] = promise;
    promise.catch(() => {
      if (globalThis[GLOBAL_KEY] === promise) {
        delete globalThis[GLOBAL_KEY];
      }
      getEnsuredSet().clear();
    });
  }
  return globalThis[GLOBAL_KEY];
}

async function send(queue, data, options) {
  const boss = await getBoss({ worker: false });
  await ensureQueue(boss, queue);
  const jobId = await boss.send(queue, data, options);
  if (!jobId) {
    throw new Error(`The ${queue} queue did not accept the job`);
  }
  return jobId;
}

export async function enqueueAgentRun(runId) {
  return send(
    AI_QUEUE_NAME,
    { runId },
    {
      retryLimit: AI_JOB_RETRY_LIMIT,
      retryDelay: 10,
      retryBackoff: true,
      expireInSeconds: AI_JOB_EXPIRE_SECONDS,
      deleteAfterSeconds: 86_400,
    },
  );
}

export async function enqueueResearchJob(researchId) {
  return send(
    RESEARCH_QUEUE_NAME,
    { researchId },
    {
      retryLimit: PREP_JOB_RETRY_LIMIT,
      retryDelay: 20,
      retryBackoff: true,
      expireInSeconds: 120,
      deleteAfterSeconds: 86_400,
    },
  );
}

export async function enqueueWebsiteAudit(auditId) {
  return send(
    WEBSITE_AUDIT_QUEUE_NAME,
    { auditId },
    {
      retryLimit: WEBSITE_AUDIT_RETRY_LIMIT,
      retryDelay: 30,
      retryBackoff: true,
      expireInSeconds: 300,
      deleteAfterSeconds: 86_400,
    },
  );
}

export async function enqueueWebhookEvent(webhookEventId) {
  return send(
    INTEGRATION_QUEUE_NAME,
    { webhookEventId },
    {
      retryLimit: INTEGRATION_JOB_RETRY_LIMIT,
      retryDelay: 20,
      retryBackoff: true,
      expireInSeconds: 120,
      deleteAfterSeconds: 86_400,
      singletonKey: webhookEventId,
    },
  );
}

export async function enqueueExecution(executionRequestId) {
  return send(
    EXECUTION_QUEUE_NAME,
    { executionRequestId },
    {
      retryLimit: EXECUTION_JOB_RETRY_LIMIT,
      retryDelay: 20,
      retryBackoff: true,
      expireInSeconds: 120,
      deleteAfterSeconds: 86_400,
      singletonKey: executionRequestId,
    },
  );
}

export async function enqueueWorkflowRun(runId) {
  return send(
    WORKFLOW_QUEUE_NAME,
    { runId },
    {
      retryLimit: WORKFLOW_JOB_RETRY_LIMIT,
      retryDelay: 20,
      retryBackoff: true,
      expireInSeconds: 120,
      deleteAfterSeconds: 86_400,
      singletonKey: runId,
    },
  );
}

// The run row is created before the job is enqueued. Using the run id as the
// singleton key makes a repeated send idempotent instead of double-discovering.
export async function enqueueDiscoveryRun(runId, { campaignId } = {}) {
  return send(
    DISCOVERY_RUN_QUEUE_NAME,
    { runId, campaignId },
    {
      retryLimit: DISCOVERY_RUN_RETRY_LIMIT,
      retryDelay: 30,
      retryBackoff: true,
      expireInSeconds: 240,
      deleteAfterSeconds: 86_400,
      singletonKey: runId,
    },
  );
}

// The scan job is a pg-boss cron entry. Calling schedule() again updates the
// existing entry, so a worker restart does not create duplicate schedules.
export async function ensureDiscoveryScanSchedule() {
  const boss = await getBoss();
  await boss.schedule(DISCOVERY_SCAN_QUEUE_NAME, DISCOVERY_SCAN_CRON, {});
}

export async function ensureReminderScanSchedule() {
  const boss = await getBoss();
  await boss.schedule(REMINDER_SCAN_QUEUE_NAME, REMINDER_SCAN_CRON, {});
}

async function countsFor(boss, queueName) {
  const queue = await boss.getQueue(queueName);
  if (!queue) return null;
  return {
    queued: queue.queuedCount,
    ready: queue.readyCount,
    active: queue.activeCount,
    failed: queue.failedCount,
    total: queue.totalCount,
  };
}

export async function getQueueCounts() {
  const boss = await getBoss();
  const [
    agentRuns,
    research,
    websiteAudits,
    integrationEvents,
    executions,
    workflows,
    discoveryRuns,
    discoveryScan,
    reminderScan,
  ] = await Promise.all([
    countsFor(boss, AI_QUEUE_NAME),
    countsFor(boss, RESEARCH_QUEUE_NAME),
    countsFor(boss, WEBSITE_AUDIT_QUEUE_NAME),
    countsFor(boss, INTEGRATION_QUEUE_NAME),
    countsFor(boss, EXECUTION_QUEUE_NAME),
    countsFor(boss, WORKFLOW_QUEUE_NAME),
    countsFor(boss, DISCOVERY_RUN_QUEUE_NAME),
    countsFor(boss, DISCOVERY_SCAN_QUEUE_NAME),
    countsFor(boss, REMINDER_SCAN_QUEUE_NAME),
  ]);
  return {
    agentRuns,
    research,
    websiteAudits,
    integrationEvents,
    executions,
    workflows,
    discoveryRuns,
    discoveryScan,
    reminderScan,
  };
}

export async function stopQueue({ graceful = true } = {}) {
  const promise = globalThis[GLOBAL_KEY];
  delete globalThis[GLOBAL_KEY];
  getEnsuredSet().clear();
  if (!promise) return;

  try {
    const boss = await promise;
    await boss.stop({
      graceful,
      timeout: graceful ? 30_000 : 1_000,
    });
  } catch {
    // Shutdown must not mask the original failure that triggered it.
  }
}
