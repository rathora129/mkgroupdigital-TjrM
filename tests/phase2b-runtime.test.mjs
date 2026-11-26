import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {
  sql,
  query,
  closeDatabase,
  assertDisposableTestUrl,
} from './support/db.mjs';

// Database-backed Phase 2B runtime checks. These only run against
// PHASE2A_TEST_DATABASE_URL (a disposable database whose name ends in _test).
// The queue is injected, so pg-boss never starts and no provider is called.
const TEST_DATABASE_URL = process.env.PHASE2A_TEST_DATABASE_URL || '';
const skip = TEST_DATABASE_URL
  ? false
  : 'set PHASE2A_TEST_DATABASE_URL to a disposable, migrated database';

let runtime = null;

if (TEST_DATABASE_URL) {
  assertDisposableTestUrl(TEST_DATABASE_URL);
  process.env.DATABASE_URL = TEST_DATABASE_URL;
  process.env.OPENAI_API_KEY = 'phase2b-test-key';
  runtime = await import('@/lib/ai/runtime');
}

after(async () => {
  delete process.env.OPENAI_API_KEY;
  await closeDatabase();
});

async function createWorkspace(roles = ['owner']) {
  const suffix = randomUUID();
  const [workspace] = await query(sql`
    insert into workspaces (name, slug)
    values ('Phase 2B test', ${`p2b-${suffix}`})
    returning id
  `);

  const members = [];
  for (const role of roles) {
    const email = `p2b-${suffix}-${members.length}@example.test`;
    const [user] = await query(sql`
      insert into users (email) values (${email}) returning id
    `);
    await query(sql`
      insert into workspace_memberships (workspace_id, user_id, role)
      values (${workspace.id}, ${user.id}, ${role})
    `);
    members.push({ userId: user.id, email, role });
  }

  return { workspaceId: workspace.id, suffix, members };
}

async function cleanup(fixture) {
  await query(
    sql`delete from audit_logs where workspace_id = ${fixture.workspaceId}`,
  );
  await query(sql`delete from workspaces where id = ${fixture.workspaceId}`);
  for (const member of fixture.members) {
    await query(sql`delete from users where id = ${member.userId}`);
  }
}

function agentData(overrides = {}) {
  return {
    name: `Agent ${randomUUID().slice(0, 8)}`,
    type: 'lead_research',
    instructions: 'Qualify inbound leads using only the supplied details.',
    provider: 'openai',
    model: 'gpt-4o-mini',
    enabled: true,
    toolPermissions: ['read_workspace'],
    allowedWorkflows: ['research'],
    approvalRequired: false,
    ...overrides,
  };
}

function fakeQueue() {
  const jobs = [];
  const enqueue = async (runId) => {
    jobs.push(runId);
    return `job-${jobs.length}-${runId.slice(0, 8)}`;
  };
  enqueue.jobs = jobs;
  return enqueue;
}

async function countRuns(workspaceId) {
  const rows = await query(
    sql`select count(*)::int as value from agent_runs where workspace_id = ${workspaceId}`,
  );
  return rows[0].value;
}

test(
  'agent CRUD enforces workspace isolation and unique names',
  { skip },
  async () => {
    const fixture = await createWorkspace();
    const other = await createWorkspace();
    try {
      const agent = await runtime.createAgent({
        workspaceId: fixture.workspaceId,
        userId: fixture.members[0].userId,
        data: agentData({ name: 'Shared Name' }),
      });

      assert.equal(agent.name, 'Shared Name');
      assert.equal(agent.enabled, true);

      await assert.rejects(
        () =>
          runtime.createAgent({
            workspaceId: fixture.workspaceId,
            userId: fixture.members[0].userId,
            data: agentData({ name: 'Shared Name' }),
          }),
        (error) => error.code === 'AGENT_NAME_TAKEN' && error.status === 409,
      );

      assert.equal(
        await runtime.getAgent(other.workspaceId, agent.id),
        null,
        'another workspace must not read this agent',
      );

      const updated = await runtime.updateAgent({
        workspaceId: fixture.workspaceId,
        agentId: agent.id,
        userId: fixture.members[0].userId,
        data: { description: 'Updated', approvalRequired: true },
      });
      assert.equal(updated.description, 'Updated');
      assert.equal(updated.approvalRequired, true);

      const listed = await runtime.listAgents(fixture.workspaceId);
      assert.equal(listed.length, 1);

      await runtime.archiveAgent({
        workspaceId: fixture.workspaceId,
        agentId: agent.id,
        userId: fixture.members[0].userId,
      });
      assert.equal(await runtime.getAgent(fixture.workspaceId, agent.id), null);
      assert.equal((await runtime.listAgents(fixture.workspaceId)).length, 0);

      const actions = await query(sql`
        select action from audit_logs
        where workspace_id = ${fixture.workspaceId}
        order by created_at
      `);
      const names = actions.map((row) => row.action);
      assert.ok(names.includes('agent.create'));
      assert.ok(names.includes('agent.update'));
      assert.ok(names.includes('agent.archive'));
    } finally {
      await cleanup(other);
      await cleanup(fixture);
    }
  },
);

test(
  'run creation refuses unconfigured providers and disabled agents',
  { skip },
  async () => {
    const fixture = await createWorkspace();
    const userId = fixture.members[0].userId;
    const enqueue = fakeQueue();
    try {
      const agent = await runtime.createAgent({
        workspaceId: fixture.workspaceId,
        userId,
        data: agentData({ approvalRequired: false }),
      });

      const savedKey = process.env.OPENAI_API_KEY;
      delete process.env.OPENAI_API_KEY;
      try {
        await assert.rejects(
          () =>
            runtime.createAgentRun({
              workspaceId: fixture.workspaceId,
              agentId: agent.id,
              userId,
              input: 'Do the task',
              enqueue,
            }),
          (error) =>
            error.code === 'AI_NOT_CONFIGURED' && error.status === 409,
        );
      } finally {
        process.env.OPENAI_API_KEY = savedKey;
      }

      assert.equal(await countRuns(fixture.workspaceId), 0);

      await runtime.updateAgent({
        workspaceId: fixture.workspaceId,
        agentId: agent.id,
        userId,
        data: { enabled: false },
      });

      await assert.rejects(
        () =>
          runtime.createAgentRun({
            workspaceId: fixture.workspaceId,
            agentId: agent.id,
            userId,
            input: 'Do the task',
            enqueue,
          }),
        (error) => error.code === 'AGENT_DISABLED',
      );
    } finally {
      await cleanup(fixture);
    }
  },
);

test(
  'approval-required runs wait, then approval queues them',
  { skip },
  async () => {
    const fixture = await createWorkspace();
    const userId = fixture.members[0].userId;
    const enqueue = fakeQueue();
    try {
      const agent = await runtime.createAgent({
        workspaceId: fixture.workspaceId,
        userId,
        data: agentData({ approvalRequired: true }),
      });

      const { run } = await runtime.createAgentRun({
        workspaceId: fixture.workspaceId,
        agentId: agent.id,
        userId,
        input: 'Prepare a lead brief',
        enqueue,
      });
      assert.equal(run.status, 'awaiting_approval');
      assert.equal(enqueue.jobs.length, 0);

      const pending = await runtime.listApprovals(fixture.workspaceId, {
        status: 'pending',
      });
      assert.equal(pending.total, 1);
      const approval = pending.items[0];
      assert.equal(approval.runId, run.id);
      assert.equal(approval.agentName, agent.name);

      const decided = await runtime.decideApproval({
        workspaceId: fixture.workspaceId,
        approvalId: approval.id,
        userId,
        decision: 'approve',
        note: 'Looks safe',
        enqueue,
      });
      assert.equal(decided.approval.status, 'approved');
      assert.equal(decided.run.status, 'queued');
      assert.equal(enqueue.jobs[0], run.id);

      const stored = await runtime.getRun(fixture.workspaceId, run.id);
      assert.equal(stored.run.status, 'queued');
      assert.ok(stored.run.jobId);

      await assert.rejects(
        () =>
          runtime.decideApproval({
            workspaceId: fixture.workspaceId,
            approvalId: approval.id,
            userId,
            decision: 'reject',
            enqueue,
          }),
        (error) => error.code === 'ALREADY_DECIDED',
      );

      const logs = await runtime.getRunLogs(fixture.workspaceId, run.id);
      assert.ok(logs.some((log) => /waiting for human approval/.test(log.message)));
      assert.ok(logs.some((log) => /approved/.test(log.message)));
    } finally {
      await cleanup(fixture);
    }
  },
);

test(
  'rejection cancels the run and approval without execution',
  { skip },
  async () => {
    const fixture = await createWorkspace();
    const userId = fixture.members[0].userId;
    const enqueue = fakeQueue();
    try {
      const agent = await runtime.createAgent({
        workspaceId: fixture.workspaceId,
        userId,
        data: agentData({ approvalRequired: true }),
      });
      const { run } = await runtime.createAgentRun({
        workspaceId: fixture.workspaceId,
        agentId: agent.id,
        userId,
        input: 'Draft a notice',
        enqueue,
      });
      const pending = await runtime.listApprovals(fixture.workspaceId, {
        status: 'pending',
      });

      const decided = await runtime.decideApproval({
        workspaceId: fixture.workspaceId,
        approvalId: pending.items[0].id,
        userId,
        decision: 'reject',
        note: 'Not appropriate',
        enqueue,
      });

      assert.equal(decided.approval.status, 'rejected');
      assert.equal(decided.run.status, 'cancelled');
      assert.match(decided.run.errorMessage, /Rejected/);
      assert.equal(enqueue.jobs.length, 0);
    } finally {
      await cleanup(fixture);
    }
  },
);

test(
  'approval of an unconfigured provider fails the run honestly',
  { skip },
  async () => {
    const fixture = await createWorkspace();
    const userId = fixture.members[0].userId;
    try {
      const agent = await runtime.createAgent({
        workspaceId: fixture.workspaceId,
        userId,
        data: agentData({ approvalRequired: true }),
      });
      const { run } = await runtime.createAgentRun({
        workspaceId: fixture.workspaceId,
        agentId: agent.id,
        userId,
        input: 'Draft something',
        enqueue: async () => 'should-not-be-used',
      });

      const pending = await runtime.listApprovals(fixture.workspaceId, {
        status: 'pending',
      });

      const savedKey = process.env.OPENAI_API_KEY;
      delete process.env.OPENAI_API_KEY;
      let result;
      try {
        result = await runtime.decideApproval({
          workspaceId: fixture.workspaceId,
          approvalId: pending.items[0].id,
          userId,
          decision: 'approve',
          enqueue: async () => 'should-not-be-used',
        });
      } finally {
        process.env.OPENAI_API_KEY = savedKey;
      }

      assert.equal(result.approval.status, 'approved');
      assert.equal(result.queued, false);
      assert.match(result.error, /not configured/i);

      const stored = await runtime.getRun(fixture.workspaceId, run.id);
      assert.equal(stored.run.status, 'failed');
      assert.match(stored.run.errorMessage, /not configured/i);
    } finally {
      await cleanup(fixture);
    }
  },
);

test(
  'budgets are enforced at agent and workspace level',
  { skip },
  async () => {
    const fixture = await createWorkspace();
    const userId = fixture.members[0].userId;
    try {
      const agent = await runtime.createAgent({
        workspaceId: fixture.workspaceId,
        userId,
        data: agentData({ monthlyTokenLimit: 0 }),
      });

      await assert.rejects(
        () =>
          runtime.createAgentRun({
            workspaceId: fixture.workspaceId,
            agentId: agent.id,
            userId,
            input: 'Do work',
            enqueue: async () => 'job',
          }),
        (error) =>
          error.code === 'BUDGET_EXCEEDED' &&
          error.status === 429 &&
          error.details?.scope === 'agent',
      );

      await runtime.updateWorkspaceAiLimits({
        workspaceId: fixture.workspaceId,
        userId,
        changes: { monthlyTokenLimit: 0, monthlyBudgetCents: null },
      });

      await assert.rejects(
        () =>
          runtime.createAgentRun({
            workspaceId: fixture.workspaceId,
            agentId: agent.id,
            userId,
            input: 'Do work',
            enqueue: async () => 'job',
          }),
        (error) =>
          error.code === 'BUDGET_EXCEEDED' &&
          error.details?.scope === 'workspace',
      );
    } finally {
      await cleanup(fixture);
    }
  },
);

test(
  'idempotency keys reuse the original run',
  { skip },
  async () => {
    const fixture = await createWorkspace();
    const userId = fixture.members[0].userId;
    const enqueue = fakeQueue();
    try {
      const agent = await runtime.createAgent({
        workspaceId: fixture.workspaceId,
        userId,
        data: agentData(),
      });

      const first = await runtime.createAgentRun({
        workspaceId: fixture.workspaceId,
        agentId: agent.id,
        userId,
        input: 'Do work',
        idempotencyKey: 'phase2b-key-1',
        enqueue,
      });
      const second = await runtime.createAgentRun({
        workspaceId: fixture.workspaceId,
        agentId: agent.id,
        userId,
        input: 'Do work again',
        idempotencyKey: 'phase2b-key-1',
        enqueue,
      });

      assert.equal(first.reused, false);
      assert.equal(second.reused, true);
      assert.equal(second.run.id, first.run.id);
      assert.equal(await countRuns(fixture.workspaceId), 1);
      assert.equal(enqueue.jobs.length, 1);
    } finally {
      await cleanup(fixture);
    }
  },
);

test(
  'queued runs cancel safely and finished runs refuse cancellation',
  { skip },
  async () => {
    const fixture = await createWorkspace();
    const userId = fixture.members[0].userId;
    try {
      const agent = await runtime.createAgent({
        workspaceId: fixture.workspaceId,
        userId,
        data: agentData(),
      });
      const { run } = await runtime.createAgentRun({
        workspaceId: fixture.workspaceId,
        agentId: agent.id,
        userId,
        input: 'Do work',
        enqueue: async () => 'job-1',
      });

      const cancelled = await runtime.cancelAgentRun({
        workspaceId: fixture.workspaceId,
        runId: run.id,
        userId,
      });
      assert.equal(cancelled.run.status, 'cancelled');
      assert.equal(cancelled.deferred, false);

      await assert.rejects(
        () =>
          runtime.cancelAgentRun({
            workspaceId: fixture.workspaceId,
            runId: run.id,
            userId,
          }),
        (error) => error.code === 'RUN_FINISHED',
      );

      // Execute must skip a cancelled run rather than calling the provider.
      let called = false;
      const result = await runtime.executeAgentRun(run.id, {
        generate: async () => {
          called = true;
          return { text: 'x', usage: {} };
        },
      });
      assert.equal(result.status, 'skipped');
      assert.equal(called, false);
    } finally {
      await cleanup(fixture);
    }
  },
);

test(
  'worker execution records output, usage and cost',
  { skip },
  async () => {
    const fixture = await createWorkspace();
    const userId = fixture.members[0].userId;
    try {
      const agent = await runtime.createAgent({
        workspaceId: fixture.workspaceId,
        userId,
        data: agentData({ model: 'gpt-4o' }),
      });
      const { run } = await runtime.createAgentRun({
        workspaceId: fixture.workspaceId,
        agentId: agent.id,
        userId,
        input: 'Summarise the lead',
        enqueue: async () => 'job-1',
      });

      let seen = null;
      const result = await runtime.executeAgentRun(run.id, {
        generate: async (options) => {
          seen = options;
          return {
            text: 'Lead brief: strong fit.',
            toolCalls: [],
            usage: { promptTokens: 100_000, completionTokens: 50_000 },
          };
        },
      });

      assert.equal(result.status, 'completed');
      assert.equal(seen.provider, 'openai');
      assert.equal(seen.model, 'gpt-4o');
      assert.ok(seen.instructions.includes('Never claim to be a licensed'));

      const detail = await runtime.getRunDetail(fixture.workspaceId, run.id);
      assert.equal(detail.run.status, 'completed');
      assert.equal(detail.run.output.text, 'Lead brief: strong fit.');
      assert.equal(detail.run.promptTokens, 100_000);
      assert.equal(detail.run.completionTokens, 50_000);
      assert.equal(detail.run.costEstimateCents, 75);
      assert.ok(detail.run.durationMs >= 0);
      assert.ok(detail.run.completedAt);
      assert.ok(detail.logs.some((log) => log.message === 'Run completed.'));

      const usage = await runtime.getWorkspaceUsage(fixture.workspaceId);
      assert.equal(usage.runs, 1);
      assert.equal(usage.completed, 1);
      assert.equal(usage.tokens, 150_000);
      assert.equal(usage.costCents, 75);
      assert.equal(usage.byAgent[0].tokens, 150_000);

      const agentUsage = await runtime.getAgentUsage(
        fixture.workspaceId,
        agent.id,
      );
      assert.equal(agentUsage.tokens, 150_000);

      const overview = await runtime.getAiOverview(fixture.workspaceId);
      assert.equal(overview.agents.total, 1);
      assert.equal(overview.usage.tokens, 150_000);
      assert.equal(overview.recentRuns.length, 1);
      assert.equal(overview.runtimeConfigured, true);
    } finally {
      await cleanup(fixture);
    }
  },
);

test(
  'retryable provider errors requeue, permanent errors fail the run',
  { skip },
  async () => {
    const { ProviderError } = await import('@/lib/ai/errors');
    const fixture = await createWorkspace();
    const userId = fixture.members[0].userId;
    try {
      const agent = await runtime.createAgent({
        workspaceId: fixture.workspaceId,
        userId,
        data: agentData(),
      });

      const first = await runtime.createAgentRun({
        workspaceId: fixture.workspaceId,
        agentId: agent.id,
        userId,
        input: 'Retry me',
        enqueue: async () => 'job-1',
      });
      const retry = await runtime.executeAgentRun(first.run.id, {
        maxAttempts: 3,
        generate: async () => {
          throw new ProviderError('rate_limited', 'slow down', {
            retryable: true,
          });
        },
      });
      assert.equal(retry.status, 'retry');

      let stored = await runtime.getRun(fixture.workspaceId, first.run.id);
      assert.equal(stored.run.status, 'queued');
      assert.equal(stored.run.attempts, 1);

      const second = await runtime.createAgentRun({
        workspaceId: fixture.workspaceId,
        agentId: agent.id,
        userId,
        input: 'Fail me',
        enqueue: async () => 'job-2',
      });
      const failed = await runtime.executeAgentRun(second.run.id, {
        maxAttempts: 3,
        generate: async () => {
          throw new ProviderError('invalid_request', 'bad request');
        },
      });
      assert.equal(failed.status, 'failed');

      stored = await runtime.getRun(fixture.workspaceId, second.run.id);
      assert.equal(stored.run.status, 'failed');
      assert.equal(stored.run.errorMessage, 'bad request');
      assert.ok(
        (await runtime.getRunLogs(fixture.workspaceId, second.run.id)).some(
          (log) => log.level === 'error',
        ),
      );
    } finally {
      await cleanup(fixture);
    }
  },
);

test(
  'a disabled provider stops new runs and worker execution',
  { skip },
  async () => {
    const fixture = await createWorkspace();
    const userId = fixture.members[0].userId;
    try {
      const agent = await runtime.createAgent({
        workspaceId: fixture.workspaceId,
        userId,
        data: agentData(),
      });

      await runtime.updateProviderSetting({
        workspaceId: fixture.workspaceId,
        provider: 'openai',
        userId,
        changes: { enabled: false },
      });

      await assert.rejects(
        () =>
          runtime.createAgentRun({
            workspaceId: fixture.workspaceId,
            agentId: agent.id,
            userId,
            input: 'Do work',
            enqueue: async () => 'job',
          }),
        (error) => error.code === 'PROVIDER_DISABLED',
      );
    } finally {
      await cleanup(fixture);
    }
  },
);
