// Local AI worker: consumes agent runs from pg-boss in the existing
// PostgreSQL database. Run it in a separate terminal:
//
//   npm run ai:worker
//
// The web app never performs provider calls inside request handlers.
import crypto from 'node:crypto';
import http from 'node:http';
import { isDatabaseConfigured, closeDb } from '@/db/client';
import {
  AI_QUEUE_NAME,
  DISCOVERY_RUN_QUEUE_NAME,
  DISCOVERY_SCAN_QUEUE_NAME,
  EXECUTION_QUEUE_NAME,
  INTEGRATION_QUEUE_NAME,
  REMINDER_SCAN_QUEUE_NAME,
  RESEARCH_QUEUE_NAME,
  WEBSITE_AUDIT_QUEUE_NAME,
  WORKFLOW_QUEUE_NAME,
  ensureDiscoveryScanSchedule,
  ensureReminderScanSchedule,
  getBoss,
  getQueueCounts,
  stopQueue,
} from '@/lib/ai/queue';
import {
  processAgentJob,
  processDiscoveryRunJob,
  processDiscoveryScanJob,
  processReminderScanJob,
  processResearchJob,
  processWebsiteAuditJob,
} from '@/lib/ai/worker';
import {
  processExecutionRequestJob,
  processWebhookJob,
  processWorkflowRunJob,
} from '@/lib/integrations/worker';

const PORT = Number(process.env.PORT || process.env.AI_WORKER_HEALTH_PORT || 4319);
const HOST =
  process.env.AI_WORKER_HEALTH_HOST ||
  (process.env.PORT ? '0.0.0.0' : '127.0.0.1');
const HEALTH_SECRET = (process.env.AI_WORKER_HEALTH_SECRET || '').trim();
const startedAt = new Date().toISOString();
const stats = {
  processed: 0,
  failed: 0,
  lastJobAt: null,
  lastError: null,
};

let healthServer = null;
let shuttingDown = false;

function isAuthorizedHealthRequest(request) {
  if (!HEALTH_SECRET) return true;
  const authHeader = String(request.headers?.authorization || '');
  const expected = `Bearer ${HEALTH_SECRET}`;
  const actualBuf = Buffer.from(authHeader, 'utf8');
  const expectedBuf = Buffer.from(expected, 'utf8');
  if (actualBuf.length !== expectedBuf.length) return false;
  return crypto.timingSafeEqual(actualBuf, expectedBuf);
}

function log(...args) {
  console.log(`[ai-worker ${new Date().toISOString()}]`, ...args);
}

async function startWorker() {
  if (!isDatabaseConfigured()) {
    throw new Error('DATABASE_URL is not configured');
  }

  const boss = await getBoss({ worker: true });
  log(`connected; consuming queue "${AI_QUEUE_NAME}"`);

  await boss.work(AI_QUEUE_NAME, { batchSize: 1 }, async (jobs) => {
    const results = [];

    for (const job of jobs) {
      stats.lastJobAt = new Date().toISOString();
      try {
        const result = await processAgentJob(job);
        if (result.status === 'completed') stats.processed += 1;
        if (result.status === 'failed') stats.failed += 1;
        log(`job ${job.id}: ${result.status}${result.reason ? ` (${result.reason})` : ''}`);
        results.push(result);
      } catch (error) {
        stats.failed += 1;
        stats.lastError = error?.message || 'unknown error';
        log(`job ${job.id}: retryable failure — ${stats.lastError}`);
        throw error;
      }
    }

    return results;
  });

  log('worker registered');

  await boss.work(RESEARCH_QUEUE_NAME, { batchSize: 1 }, async (jobs) => {
    const results = [];

    for (const job of jobs) {
      stats.lastJobAt = new Date().toISOString();
      try {
        const result = await processResearchJob(job);
        if (result.status === 'started' || result.status === 'completed') {
          stats.processed += 1;
        }
        if (result.status === 'failed') stats.failed += 1;
        log(
          `research job ${job.id}: ${result.status}${result.reason ? ` (${result.reason})` : ''}`,
        );
        results.push(result);
      } catch (error) {
        stats.failed += 1;
        stats.lastError = error?.message || 'unknown error';
        log(`research job ${job.id}: retryable failure — ${stats.lastError}`);
        throw error;
      }
    }

    return results;
  });

  log(`research queue "${RESEARCH_QUEUE_NAME}" registered`);

  await boss.work(WEBSITE_AUDIT_QUEUE_NAME, { batchSize: 1 }, async (jobs) => {
    const results = [];

    for (const job of jobs) {
      stats.lastJobAt = new Date().toISOString();
      try {
        const result = await processWebsiteAuditJob(job);
        if (result.status === 'completed') stats.processed += 1;
        if (result.status === 'failed') stats.failed += 1;
        log(
          `audit job ${job.id}: ${result.status}${result.reason ? ` (${result.reason})` : ''}`,
        );
        results.push(result);
      } catch (error) {
        stats.failed += 1;
        stats.lastError = error?.message || 'unknown error';
        log(`audit job ${job.id}: retryable failure — ${stats.lastError}`);
        throw error;
      }
    }

    return results;
  });

  log(`website audit queue "${WEBSITE_AUDIT_QUEUE_NAME}" registered`);

  await boss.work(INTEGRATION_QUEUE_NAME, { batchSize: 1 }, async (jobs) => {
    const results = [];
    for (const job of jobs) {
      stats.lastJobAt = new Date().toISOString();
      try {
        const result = await processWebhookJob(job);
        if (result.status === 'processed') stats.processed += 1;
        if (result.status === 'failed') stats.failed += 1;
        log(`webhook job ${job.id}: ${result.status}${result.reason ? ` (${result.reason})` : ''}`);
        results.push(result);
      } catch (error) {
        stats.failed += 1;
        stats.lastError = error?.message || 'unknown error';
        log(`webhook job ${job.id}: retryable failure — ${stats.lastError}`);
        throw error;
      }
    }
    return results;
  });
  log(`integration queue "${INTEGRATION_QUEUE_NAME}" registered`);

  await boss.work(EXECUTION_QUEUE_NAME, { batchSize: 1 }, async (jobs) => {
    const results = [];
    for (const job of jobs) {
      stats.lastJobAt = new Date().toISOString();
      try {
        const result = await processExecutionRequestJob(job);
        if (result.status === 'completed') stats.processed += 1;
        if (result.status === 'failed') stats.failed += 1;
        log(`execution job ${job.id}: ${result.status}${result.reason ? ` (${result.reason})` : ''}`);
        results.push(result);
      } catch (error) {
        stats.failed += 1;
        stats.lastError = error?.message || 'unknown error';
        log(`execution job ${job.id}: retryable failure — ${stats.lastError}`);
        throw error;
      }
    }
    return results;
  });
  log(`execution queue "${EXECUTION_QUEUE_NAME}" registered`);

  await boss.work(WORKFLOW_QUEUE_NAME, { batchSize: 1 }, async (jobs) => {
    const results = [];
    for (const job of jobs) {
      stats.lastJobAt = new Date().toISOString();
      try {
        const result = await processWorkflowRunJob(job);
        if (result.status === 'completed') stats.processed += 1;
        if (result.status === 'failed') stats.failed += 1;
        log(`workflow job ${job.id}: ${result.status}${result.reason ? ` (${result.reason})` : ''}`);
        results.push(result);
      } catch (error) {
        stats.failed += 1;
        stats.lastError = error?.message || 'unknown error';
        log(`workflow job ${job.id}: retryable failure — ${stats.lastError}`);
        throw error;
      }
    }
    return results;
  });
  log(`workflow queue "${WORKFLOW_QUEUE_NAME}" registered`);

  await boss.work(DISCOVERY_RUN_QUEUE_NAME, { batchSize: 1 }, async (jobs) => {
    const results = [];
    for (const job of jobs) {
      stats.lastJobAt = new Date().toISOString();
      try {
        const result = await processDiscoveryRunJob(job);
        if (result.status === 'completed') stats.processed += 1;
        if (result.status === 'failed') stats.failed += 1;
        log(
          `discovery run ${job.id}: ${result.status}${result.reason ? ` (${result.reason})` : ''}`,
        );
        results.push(result);
      } catch (error) {
        stats.failed += 1;
        stats.lastError = error?.message || 'unknown error';
        log(`discovery run ${job.id}: retryable failure — ${stats.lastError}`);
        throw error;
      }
    }
    return results;
  });
  log(`discovery run queue "${DISCOVERY_RUN_QUEUE_NAME}" registered`);

  await boss.work(DISCOVERY_SCAN_QUEUE_NAME, { batchSize: 1 }, async (jobs) => {
    const results = [];
    for (const job of jobs) {
      stats.lastJobAt = new Date().toISOString();
      try {
        const result = await processDiscoveryScanJob(job);
        log(
          `discovery scan: ${result.due} due, ${result.enqueued} enqueued, ${result.failed} failed`,
        );
        results.push(result);
      } catch (error) {
        stats.lastError = error?.message || 'unknown error';
        log(`discovery scan failed — ${stats.lastError}`);
        throw error;
      }
    }
    return results;
  });
  log(`discovery scan queue "${DISCOVERY_SCAN_QUEUE_NAME}" registered`);

  await boss.work(REMINDER_SCAN_QUEUE_NAME, { batchSize: 1 }, async (jobs) => {
    const results = [];
    for (const job of jobs) {
      stats.lastJobAt = new Date().toISOString();
      try {
        const result = await processReminderScanJob(job);
        log(
          `follow-up scan: ${result.scanned} scanned, ${result.reminders} reminders, ${result.escalated} escalated`,
        );
        results.push(result);
      } catch (error) {
        stats.lastError = error?.message || 'unknown error';
        log(`follow-up scan failed — ${stats.lastError}`);
        throw error;
      }
    }
    return results;
  });
  log(`follow-up scan queue "${REMINDER_SCAN_QUEUE_NAME}" registered`);

  try {
    await ensureDiscoveryScanSchedule();
    log('discovery scan scheduled every 10 minutes');
  } catch (error) {
    log(`discovery scan schedule could not be created: ${error?.message || error}`);
  }

  try {
    await ensureReminderScanSchedule();
    log('follow-up reminder scan scheduled every 15 minutes');
  } catch (error) {
    log(`follow-up scan schedule could not be created: ${error?.message || error}`);
  }

  healthServer = http.createServer(async (request, response) => {
    const pathname = String(request.url || '/').split('?')[0];

    if (pathname === '/healthz') {
      response.writeHead(shuttingDown ? 503 : 200, {
        'content-type': 'application/json',
        'cache-control': 'no-store',
      });
      response.end(JSON.stringify({ ok: !shuttingDown }));
      return;
    }

    if (pathname !== '/health') {
      response.writeHead(404, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ ok: false, error: 'not found' }));
      return;
    }

    if (!isAuthorizedHealthRequest(request)) {
      response.writeHead(401, {
        'content-type': 'application/json',
        'cache-control': 'no-store',
      });
      response.end(JSON.stringify({ ok: false, error: 'unauthorized' }));
      return;
    }

    let queue = null;
    try {
      queue = await getQueueCounts();
    } catch {
      queue = null;
    }

    response.writeHead(shuttingDown ? 503 : 200, {
      'content-type': 'application/json',
      'cache-control': 'no-store',
    });
    response.end(
      JSON.stringify({
        ok: !shuttingDown,
        startedAt,
        processed: stats.processed,
        failed: stats.failed,
        lastJobAt: stats.lastJobAt,
        hasError: Boolean(stats.lastError),
        queue,
      }),
    );
  });

  healthServer.listen(PORT, HOST, () => {
    log(`health endpoint on http://${HOST}:${PORT}/health`);
  });
}

async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  log(`received ${signal}; finishing current job`);

  if (healthServer) {
    await new Promise((resolve) => healthServer.close(resolve));
    healthServer = null;
  }

  await stopQueue({ graceful: true });
  await closeDb();
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

startWorker().catch(async (error) => {
  console.error(`[ai-worker] failed to start: ${error?.message || error}`);
  await stopQueue({ graceful: false }).catch(() => {});
  await closeDb().catch(() => {});
  process.exit(1);
});
