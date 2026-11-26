import { AI_JOB_MAX_ATTEMPTS } from './queue';
import { executeAgentRun } from './runtime';
import { finalizeResearchForRun, prepareResearchJob } from '@/lib/research/service';
import { runWebsiteAuditJob } from '@/lib/audits/service';
import { runDiscoveryPipeline, runDiscoveryScan } from '@/lib/discovery/service';
import { runFollowUpReminderScan } from '@/lib/sales/reminders';

// pg-boss calls this with an array of jobs. A retryable result is thrown so
// pg-boss schedules the next attempt; everything else settles the job.
export async function processAgentJob(job, deps = {}) {
  const runId = job?.data?.runId;
  if (!runId) return { status: 'skipped', reason: 'missing-run-id' };

  const result = await executeAgentRun(runId, {
    signal: job.signal,
    maxAttempts: AI_JOB_MAX_ATTEMPTS,
    ...deps,
  });

  if (result.status === 'retry') {
    throw new Error(result.reason || 'Retryable execution failure');
  }

  // A run may be the synthesis step of a research job. Link the finished
  // output back so the research record reflects reality, never a guess.
  if (['completed', 'failed', 'cancelled'].includes(result.status)) {
    try {
      await finalizeResearchForRun(runId);
    } catch {
      console.error('[worker] research finalisation failed');
    }
  }

  return result;
}

export async function processResearchJob(job) {
  const researchId = job?.data?.researchId;
  if (!researchId) return { status: 'skipped', reason: 'missing-research-id' };
  return prepareResearchJob(researchId);
}

export async function processWebsiteAuditJob(job) {
  const auditId = job?.data?.auditId;
  if (!auditId) return { status: 'skipped', reason: 'missing-audit-id' };
  return runWebsiteAuditJob(auditId);
}

export async function processDiscoveryRunJob(job) {
  const runId = job?.data?.runId;
  if (!runId) return { status: 'skipped', reason: 'missing-run-id' };
  return runDiscoveryPipeline(runId, { signal: job.signal });
}

export async function processDiscoveryScanJob() {
  return runDiscoveryScan();
}

export async function processReminderScanJob() {
  return runFollowUpReminderScan();
}
