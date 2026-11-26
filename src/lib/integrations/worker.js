import { processWebhookEvent } from './webhooks';
import { processExecutionJob } from './execution';
import { processWorkflowJob } from '@/lib/automation/service';

// Thin wrappers so scripts/ai-worker.mjs stays a registration file and the
// business logic stays testable in plain Node.
export async function processWebhookJob(job) {
  const webhookEventId = job?.data?.webhookEventId;
  if (!webhookEventId) return { status: 'skipped', reason: 'missing-webhook-event-id' };
  return processWebhookEvent(webhookEventId);
}

export async function processExecutionRequestJob(job) {
  const executionRequestId = job?.data?.executionRequestId;
  if (!executionRequestId) {
    return { status: 'skipped', reason: 'missing-execution-request-id' };
  }
  return processExecutionJob(executionRequestId);
}

export async function processWorkflowRunJob(job) {
  const runId = job?.data?.runId;
  if (!runId) return { status: 'skipped', reason: 'missing-workflow-run-id' };
  return processWorkflowJob(runId);
}
