import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {
  sql,
  query,
  closeDatabase,
  assertDisposableTestUrl,
} from './support/db.mjs';

// Database-backed Phase 2C research checks. Provider calls are never made:
// the preparation step is injected with a fake page fetcher and a fake queue.
const TEST_DATABASE_URL = process.env.PHASE2A_TEST_DATABASE_URL || '';
const skip = TEST_DATABASE_URL
  ? false
  : 'set PHASE2A_TEST_DATABASE_URL to a disposable, migrated database';

const validation = await import('@/lib/research/validation');
const service = await import('@/lib/research/service');

if (TEST_DATABASE_URL) {
  assertDisposableTestUrl(TEST_DATABASE_URL);
  process.env.DATABASE_URL = TEST_DATABASE_URL;
  process.env.OPENAI_API_KEY = 'phase2c-test-key';
}

after(async () => {
  delete process.env.OPENAI_API_KEY;
  await closeDatabase();
});

async function createFixture({ withAgent = true, approvalRequired = false } = {}) {
  const suffix = randomUUID();
  const [workspace] = await query(sql`
    insert into workspaces (name, slug)
    values ('Phase 2C research', ${`p2c-research-${suffix}`})
    returning id
  `);
  const [user] = await query(sql`
    insert into users (email, name)
    values (${`p2c-research-${suffix}@example.test`}, 'Researcher Person')
    returning id
  `);
  await query(sql`
    insert into workspace_memberships (workspace_id, user_id, role)
    values (${workspace.id}, ${user.id}, 'owner')
  `);

  let agentId = null;
  if (withAgent) {
    const [agent] = await query(sql`
      insert into agents (
        workspace_id, name, type, instructions, provider, model, enabled,
        approval_required, created_by_user_id
      ) values (
        ${workspace.id}, ${`Research Agent ${suffix}`}, 'business_research',
        'Research companies from supplied sources only.', 'openai',
        'gpt-4o-mini', true, ${approvalRequired}, ${user.id}
      )
      returning id
    `);
    agentId = agent.id;
  }

  return { workspaceId: workspace.id, userId: user.id, agentId, suffix };
}

async function cleanup(fixture) {
  await query(
    sql`delete from audit_logs where workspace_id = ${fixture.workspaceId}`,
  );
  await query(sql`delete from workspaces where id = ${fixture.workspaceId}`);
  await query(sql`delete from users where id = ${fixture.userId}`);
}

function fakePage(url = 'https://acme.test/') {
  return async () => ({
    status: 200,
    url,
    redirects: [],
    text: `<!doctype html><html><head><title>Acme Industrial Parts</title>
      <meta name="description" content="Acme distributes industrial valves.">
      </head><body><h1>Acme</h1><p>Acme supplies valves and fittings to
      manufacturers across India.</p></body></html>`,
    decodedBytes: 260,
    truncated: false,
  });
}

async function createJob(fixture, overrides = {}) {
  const payload = await validation.researchCreateSchema.validate({
    subjectType: 'company',
    companyName: 'Acme Industrial',
    websiteUrl: 'acme.test',
    objective: 'Qualify Acme as a website and SEO client.',
    ...overrides,
  });
  const enqueued = [];
  const job = await service.createResearchJob({
    workspaceId: fixture.workspaceId,
    userId: fixture.userId,
    data: payload,
    enqueuePrep: async (researchId) => {
      enqueued.push(researchId);
      return `prep-${researchId}`;
    },
  });
  return { job, enqueued };
}

test('research schemas normalise websites and require a subject', async () => {
  const parsed = await validation.researchCreateSchema.validate({
    companyName: 'Acme',
    websiteUrl: 'acme.test',
    objective: 'Research the company for a sales conversation.',
  });
  assert.equal(parsed.subjectType, 'company');
  assert.equal(parsed.websiteUrl, 'https://acme.test');

  await assert.rejects(
    () =>
      validation.researchCreateSchema.validate({
        objective: 'Research something specific please.',
      }),
    /Provide a company name, website or lead/,
  );

  await assert.rejects(
    () =>
      validation.researchCreateSchema.validate({
        websiteUrl: 'ftp://acme.test',
        objective: 'Research the company for a sales conversation.',
      }),
    /Enter an http or https URL/,
  );

  const defaults = await validation.researchQuerySchema.validate({});
  assert.equal(defaults.page, 1);
  assert.equal(defaults.pageSize, 20);
});

test('research output parser never trusts unsupported verification labels', () => {
  const fetched = ['https://acme.test/'];
  const parsed = service.parseResearchOutput(
    JSON.stringify({
      summary: 'Acme distributes valves.',
      findings: [
        {
          category: 'overview',
          title: 'Distributor',
          detail: 'Acme distributes industrial valves.',
          verification: 'verified',
          sourceUrl: 'https://acme.test/',
        },
        {
          category: 'opportunities',
          title: 'Upsell',
          detail: 'They may need a product catalogue.',
          verification: 'verified',
          sourceUrl: 'https://not-fetched.example/',
        },
        {
          category: 'industry',
          title: 'Industry',
          detail: 'Industrial distribution.',
          verification: 'made_up',
          sourceUrl: null,
        },
      ],
    }),
    fetched,
  );

  assert.equal(parsed.parser, 'json');
  assert.equal(parsed.findings.length, 3);
  assert.equal(parsed.findings[0].verification, 'verified');
  assert.equal(parsed.findings[1].verification, 'ai_analysis');
  assert.equal(parsed.findings[2].verification, 'unverified');
  assert.deepEqual(parsed.referencedSources, ['https://not-fetched.example/']);

  const fallback = service.parseResearchOutput('Plain prose without JSON.', []);
  assert.equal(fallback.parser, 'text');
  assert.equal(fallback.findings[0].verification, 'ai_analysis');
});

test('research jobs prepare real sources and a linked agent run', { skip }, async () => {
  const fixture = await createFixture();
  try {
    const { job, enqueued } = await createJob(fixture);
    assert.equal(job.status, 'queued');
    assert.equal(enqueued.length, 1);
    assert.ok(job.jobId);

    const runs = [];
    const result = await service.prepareResearchJob(job.id, {
      fetchPage: fakePage(),
      enqueueRun: async (runId) => {
        runs.push(runId);
        return 'ai-job-1';
      },
    });
    assert.equal(result.status, 'started');
    assert.equal(runs.length, 1);

    const detail = await service.getResearchJob(fixture.workspaceId, job.id);
    assert.equal(detail.job.status, 'queued');
    assert.equal(detail.job.runId, runs[0]);
    assert.equal(detail.job.sourceCount, 1);
    assert.equal(detail.sources.length, 1);
    assert.equal(detail.sources[0].kind, 'website');
    assert.equal(detail.sources[0].httpStatus, 200);
    assert.match(detail.sources[0].excerpt, /industrial valves/);

    const [run] = await query(sql`
      select input, status, requested_by_user_id
      from agent_runs where id = ${runs[0]}
    `);
    assert.equal(run.status, 'queued');
    assert.equal(run.requested_by_user_id, fixture.userId);
    const prompt = JSON.stringify(run.input);
    assert.match(prompt, /https:\/\/acme\.test/);
    assert.match(prompt, /verified/);

    const never = await service.prepareResearchJob(job.id, {
      fetchPage: fakePage(),
      enqueueRun: async () => 'unused',
    });
    assert.equal(never.status, 'skipped');
  } finally {
    await cleanup(fixture);
  }
});

test('completed runs finalise findings and a linked lead timeline', { skip }, async () => {
  const fixture = await createFixture();
  try {
    const leadService = await import('@/lib/leads/service');
    const leadValidation = await import('@/lib/leads/validation');
    const leadPayload = await leadValidation.leadCreateSchema.validate({
      companyName: 'Acme Industrial',
      website: 'https://acme.test',
      industry: 'Industrial distribution',
    });
    const { lead } = await leadService.createLead({
      workspaceId: fixture.workspaceId,
      userId: fixture.userId,
      data: leadPayload,
    });

    const { job } = await createJob(fixture, {
      subjectType: 'lead',
      companyName: null,
      websiteUrl: null,
      leadId: lead.id,
    });

    const runIds = [];
    const prep = await service.prepareResearchJob(job.id, {
      fetchPage: fakePage(),
      enqueueRun: async (runId) => {
        runIds.push(runId);
        return 'ai-job-2';
      },
    });
    assert.equal(prep.status, 'started', JSON.stringify(prep));

    const output = {
      text: JSON.stringify({
        summary: 'Acme distributes industrial valves across India.',
        findings: [
          {
            category: 'overview',
            title: 'Industrial distributor',
            detail: 'Acme supplies valves and fittings to manufacturers.',
            verification: 'verified',
            sourceUrl: 'https://acme.test/',
          },
          {
            category: 'opportunities',
            title: 'Product catalogue',
            detail: 'A structured catalogue would help discovery.',
            verification: 'ai_analysis',
            sourceUrl: null,
          },
        ],
      }),
    };
    await query(sql`
      update agent_runs
      set status = 'completed', output = ${JSON.stringify(output)}::jsonb,
          completed_at = now()
      where id = ${runIds[0]}
    `);

    const finalized = await service.finalizeResearchForRun(runIds[0]);
    assert.equal(finalized.status, 'completed');
    assert.equal(finalized.findings, 2);

    const detail = await service.getResearchJob(fixture.workspaceId, job.id);
    assert.equal(detail.job.status, 'completed');
    assert.equal(detail.job.output.findingCount, 2);
    assert.equal(detail.findings.length, 2);
    assert.equal(detail.sources.length, 2);
    assert.deepEqual(
      detail.sources.map((source) => source.kind).sort(),
      ['lead_record', 'website'],
    );

    const timeline = await query(sql`
      select type, body, metadata from lead_activities
      where workspace_id = ${fixture.workspaceId} and lead_id = ${lead.id}
      order by created_at asc
    `);
    const researchEvent = timeline.find((row) => row.type === 'research_completed');
    assert.ok(researchEvent);
    assert.equal(researchEvent.metadata.researchId, job.id);

    const again = await service.finalizeResearchForRun(runIds[0]);
    assert.equal(again.unchanged, true);

    const audits = await query(sql`
      select action from audit_logs
      where workspace_id = ${fixture.workspaceId} and resource_id = ${job.id}
    `);
    assert.ok(audits.some((row) => row.action === 'research.completed'));
  } finally {
    await cleanup(fixture);
  }
});

test('research reports AI_NOT_CONFIGURED honestly', { skip }, async () => {
  const fixture = await createFixture();
  const key = process.env.OPENAI_API_KEY;
  try {
    delete process.env.OPENAI_API_KEY;
    await assert.rejects(
      () =>
        service.createResearchJob({
          workspaceId: fixture.workspaceId,
          userId: fixture.userId,
          data: {
            subjectType: 'company',
            companyName: 'Unconfigured Co',
            websiteUrl: null,
            industry: null,
            objective: 'Research this company for qualification.',
            leadId: null,
            agentId: null,
          },
          enqueuePrep: async () => 'unused',
        }),
      (error) => error.code === 'AI_NOT_CONFIGURED',
    );

    const [row] = await query(sql`
      select count(*)::int as total from research_jobs
      where workspace_id = ${fixture.workspaceId}
    `);
    assert.equal(row.total, 0);
  } finally {
    if (key) process.env.OPENAI_API_KEY = key;
    await cleanup(fixture);
  }
});

test('research needs an enabled agent and stays workspace scoped', { skip }, async () => {
  const noAgent = await createFixture({ withAgent: false });
  const withAgent = await createFixture();
  const other = await createFixture();
  try {
    await assert.rejects(
      () => createJob(noAgent),
      (error) => error.code === 'AGENT_NOT_CONFIGURED',
    );

    const { job } = await createJob(withAgent);
    assert.equal(
      await service.getResearchJob(other.workspaceId, job.id),
      null,
    );

    const otherList = await service.listResearchJobs(
      other.workspaceId,
      await validation.researchQuerySchema.validate({}),
    );
    assert.equal(otherList.total, 0);

    const mine = await service.listResearchJobs(
      withAgent.workspaceId,
      await validation.researchQuerySchema.validate({ status: 'queued' }),
    );
    assert.equal(mine.total, 1);

    const cancelled = await service.cancelResearchJob({
      workspaceId: withAgent.workspaceId,
      userId: withAgent.userId,
      researchId: job.id,
    });
    assert.equal(cancelled.status, 'cancelled');

    await assert.rejects(
      () =>
        service.cancelResearchJob({
          workspaceId: withAgent.workspaceId,
          userId: withAgent.userId,
          researchId: job.id,
        }),
      (error) => error.code === 'RESEARCH_FINISHED',
    );

    assert.equal(
      await service.cancelResearchJob({
        workspaceId: other.workspaceId,
        userId: other.userId,
        researchId: job.id,
      }),
      null,
    );
  } finally {
    await cleanup(noAgent);
    await cleanup(withAgent);
    await cleanup(other);
  }
});
