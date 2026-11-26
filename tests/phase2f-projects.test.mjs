import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {
  sql,
  query,
  closeDatabase,
  assertDisposableTestUrl,
} from './support/db.mjs';

// Phase 2F-C.1 — projects, tasks and deliverables integration coverage.
const TEST_DATABASE_URL = process.env.PHASE2A_TEST_DATABASE_URL || '';
const skip = TEST_DATABASE_URL
  ? false
  : 'set PHASE2A_TEST_DATABASE_URL to a disposable, migrated database';

if (TEST_DATABASE_URL) {
  assertDisposableTestUrl(TEST_DATABASE_URL);
  process.env.DATABASE_URL = TEST_DATABASE_URL;
}

const projects = await import('@/lib/projects/service');
const projectValidation = await import('@/lib/projects/validation');
const proposalsService = await import('@/lib/proposals/service');
const proposalValidation = await import('@/lib/proposals/validation');
const opportunities = await import('@/lib/opportunities/service');
const opportunityValidation = await import('@/lib/opportunities/validation');
const leads = await import('@/lib/leads/service');
const leadValidation = await import('@/lib/leads/validation');
const clientsService = await import('@/lib/clients/service');
const clientValidation = await import('@/lib/clients/validation');

after(async () => {
  await closeDatabase();
});

async function createWorkspace(label) {
  const suffix = randomUUID();
  const [workspace] = await query(sql`
    insert into workspaces (name, slug)
    values (${`Phase 2F ${label}`}, ${`p2f-proj-${label}-${suffix}`})
    returning id
  `);
  const users = {};
  for (const [key, role] of [
    ['owner', 'owner'],
    ['member', 'member'],
  ]) {
    const [user] = await query(sql`
      insert into users (email, name)
      values (${`p2f-proj-${label}-${key}-${suffix}@example.test`}, ${`${key} person`})
      returning id
    `);
    await query(sql`
      insert into workspace_memberships (workspace_id, user_id, role)
      values (${workspace.id}, ${user.id}, ${role})
    `);
    users[key] = user.id;
  }
  return {
    workspaceId: workspace.id,
    ownerId: users.owner,
    memberId: users.member,
    userIds: Object.values(users),
  };
}

async function createFixture() {
  const main = await createWorkspace('main');
  const other = await createWorkspace('other');
  return {
    ...main,
    otherWorkspaceId: other.workspaceId,
    otherOwnerId: other.ownerId,
    otherUserIds: other.userIds,
  };
}

async function cleanup(fixture) {
  await query(sql`
    delete from audit_logs
    where workspace_id in (${fixture.workspaceId}, ${fixture.otherWorkspaceId})
  `);
  await query(sql`
    delete from workspaces
    where id in (${fixture.workspaceId}, ${fixture.otherWorkspaceId})
  `);
  for (const userId of [...fixture.userIds, ...fixture.otherUserIds]) {
    await query(sql`delete from users where id = ${userId}`);
  }
}

async function makeAcceptedProposal(fixture, unitPriceCents = 250_000) {
  const leadData = await leadValidation.leadCreateSchema.validate({
    companyName: `Acme ${randomUUID().slice(0, 6)}`,
    email: `lead-${randomUUID().slice(0, 8)}@acme.test`,
  });
  const lead = await leads.createLead({
    workspaceId: fixture.workspaceId,
    userId: fixture.ownerId,
    data: leadData,
  });

  const opportunityData =
    await opportunityValidation.opportunityCreateSchema.validate({
      leadId: lead.lead.id,
      title: `Opportunity ${randomUUID().slice(0, 8)}`,
    });
  const opportunity = await opportunities.createOpportunity({
    workspaceId: fixture.workspaceId,
    userId: fixture.ownerId,
    data: opportunityData,
  });

  const proposal = await proposalsService.createProposal({
    workspaceId: fixture.workspaceId,
    userId: fixture.ownerId,
    data: await proposalValidation.proposalCreateSchema.validate({
      opportunityId: opportunity.opportunity.id,
      prefill: false,
    }),
  });

  const versionData = await proposalValidation.versionContentSchema.validate({
    expectedUpdatedAt: new Date(proposal.currentVersion.updatedAt).toISOString(),
    currency: 'INR',
    validityDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10),
    items: [
      {
        name: 'Implementation',
        quantity: 1,
        unitPriceCents,
        billingType: 'one_time',
        kind: 'included',
        taxScheme: 'cgst_sgst',
        taxRateBps: 1_800,
      },
    ],
  });
  await proposalsService.saveDraftContent({
    workspaceId: fixture.workspaceId,
    userId: fixture.ownerId,
    proposalId: proposal.proposal.id,
    data: versionData,
  });
  await proposalsService.submitProposal({
    workspaceId: fixture.workspaceId,
    userId: fixture.ownerId,
    proposalId: proposal.proposal.id,
  });
  await proposalsService.decideProposal({
    workspaceId: fixture.workspaceId,
    userId: fixture.ownerId,
    proposalId: proposal.proposal.id,
    decision: 'approved',
  });
  await proposalsService.markProposalSent({
    workspaceId: fixture.workspaceId,
    userId: fixture.ownerId,
    proposalId: proposal.proposal.id,
  });
  const accepted = await proposalsService.recordProposalResponse({
    workspaceId: fixture.workspaceId,
    userId: fixture.ownerId,
    proposalId: proposal.proposal.id,
    response: 'accepted',
  });
  return { lead: lead.lead, accepted };
}

async function createProjectFor(fixture) {
  const { lead, accepted } = await makeAcceptedProposal(fixture);
  const data = await projectValidation.projectCreateSchema.validate({
    proposalId: accepted.proposal.id,
    name: 'Delivery project',
    ownerUserId: fixture.ownerId,
    memberUserIds: [fixture.memberId],
  });
  const detail = await projects.createProject({
    workspaceId: fixture.workspaceId,
    userId: fixture.ownerId,
    data,
  });
  return { lead, accepted, detail };
}

async function makeClient(fixture, leadId) {
  const data = await clientValidation.clientCreateSchema.validate({
    companyName: `Client ${randomUUID().slice(0, 8)}`,
    ...(leadId ? { leadId } : {}),
  });
  const detail = await clientsService.createClient({
    workspaceId: fixture.workspaceId,
    userId: fixture.ownerId,
    data,
  });
  return detail.client;
}

function nowIso() {
  return new Date().toISOString().slice(0, 10);
}

test('project lifecycle links client, tasks, milestones and deliverables', { skip }, async () => {
  const fixture = await createFixture();
  try {
    const { lead, accepted, detail } = await createProjectFor(fixture);
    const project = detail.project;
    assert.match(project.reference, /^PRJ-\d{4,}$/);
    assert.equal(project.status, 'not_started');
    assert.equal(project.acceptedValueCents, accepted.currentVersion.grandTotalCents);

    // A client created from the same lead is linked by update, not merge.
    const client = await makeClient(fixture, lead.id);
    const fresh = await projects.getProject(fixture.workspaceId, project.id);
    const updated = await projects.updateProject({
      workspaceId: fixture.workspaceId,
      userId: fixture.ownerId,
      projectId: project.id,
      data: await projectValidation.projectUpdateSchema.validate({
        expectedUpdatedAt: new Date(fresh.project.updatedAt).toISOString(),
        name: fresh.project.name,
        clientId: client.id,
        ownerUserId: fixture.ownerId,
        priority: 'high',
      }),
    });
    assert.equal(updated.project.clientId, client.id);
    assert.equal(updated.project.priority, 'high');

    // Task creation with assignment and a forward-only status transition.
    const taskDetail = await projects.createTask({
      workspaceId: fixture.workspaceId,
      userId: fixture.ownerId,
      projectId: project.id,
      data: await projectValidation.taskCreateSchema.validate({
        title: 'Build landing page',
        status: 'todo',
        ownerUserId: fixture.memberId,
        priority: 'high',
      }),
    });
    const task = taskDetail.task;
    assert.equal(task.status, 'todo');
    assert.equal(task.ownerUserId, fixture.memberId);

    const inProgress = await projects.updateTask({
      workspaceId: fixture.workspaceId,
      userId: fixture.ownerId,
      taskId: task.id,
      data: await projectValidation.taskUpdateSchema.validate({
        expectedUpdatedAt: new Date(task.updatedAt).toISOString(),
        title: task.title,
        status: 'in_progress',
        ownerUserId: fixture.memberId,
      }),
    });
    assert.equal(inProgress.task.status, 'in_progress');

    const completedTask = await projects.updateTask({
      workspaceId: fixture.workspaceId,
      userId: fixture.ownerId,
      taskId: task.id,
      data: await projectValidation.taskUpdateSchema.validate({
        expectedUpdatedAt: new Date(inProgress.task.updatedAt).toISOString(),
        title: task.title,
        status: 'completed',
      }),
    });
    assert.equal(completedTask.task.status, 'completed');
    assert.ok(completedTask.task.completedAt);

    // Milestone and deliverable creation.
    const withMilestone = await projects.createMilestone({
      workspaceId: fixture.workspaceId,
      userId: fixture.ownerId,
      projectId: project.id,
      data: await projectValidation.milestoneCreateSchema.validate({
        title: 'Discovery sign-off',
        targetDate: nowIso(),
      }),
    });
    assert.ok(withMilestone.milestones.some((entry) => entry.title === 'Discovery sign-off'));

    const withDeliverable = await projects.createDeliverable({
      workspaceId: fixture.workspaceId,
      userId: fixture.ownerId,
      projectId: project.id,
      data: await projectValidation.deliverableCreateSchema.validate({
        title: 'Design system',
        targetDate: nowIso(),
      }),
    });
    assert.ok(withDeliverable.deliverables.some((entry) => entry.title === 'Design system'));

    // Forward-only project status transitions.
    const planning = await projects.changeProjectStatus({
      workspaceId: fixture.workspaceId,
      userId: fixture.ownerId,
      projectId: project.id,
      status: 'planning',
    });
    assert.equal(planning.project.status, 'planning');
    const starting = await projects.changeProjectStatus({
      workspaceId: fixture.workspaceId,
      userId: fixture.ownerId,
      projectId: project.id,
      status: 'in_progress',
    });
    assert.equal(starting.project.status, 'in_progress');

    const rows = await query(sql`
      select action from audit_logs where workspace_id = ${fixture.workspaceId}
    `);
    const actions = new Set(rows.map((row) => row.action));
    for (const expected of [
      'project.create',
      'task.create',
      'project.milestone_update',
      'project.deliverable_update',
      'project.status_change',
    ]) {
      assert.ok(actions.has(expected), `missing audit action ${expected}`);
    }
  } finally {
    await cleanup(fixture);
  }
});

test('invalid task transitions are rejected without changing state', { skip }, async () => {
  const fixture = await createFixture();
  try {
    const { detail } = await createProjectFor(fixture);
    const taskDetail = await projects.createTask({
      workspaceId: fixture.workspaceId,
      userId: fixture.ownerId,
      projectId: detail.project.id,
      data: await projectValidation.taskCreateSchema.validate({
        title: 'Guarded task',
      }),
    });
    const task = taskDetail.task;

    const updateData = await projectValidation.taskUpdateSchema.validate({
      expectedUpdatedAt: new Date(task.updatedAt).toISOString(),
      title: task.title,
      status: 'completed',
    });

    await assert.rejects(
      () =>
        projects.updateTask({
          workspaceId: fixture.workspaceId,
          userId: fixture.ownerId,
          taskId: task.id,
          data: updateData,
        }),
      (error) => error.code === 'INVALID_STATE' && error.status === 409,
    );

    const reloaded = await projects.getTask(fixture.workspaceId, task.id);
    assert.equal(reloaded.task.status, 'todo');
  } finally {
    await cleanup(fixture);
  }
});

test('project creation requires an accepted proposal and is unique per proposal', { skip }, async () => {
  const fixture = await createFixture();
  try {
    const { accepted } = await createProjectFor(fixture);
    const data = await projectValidation.projectCreateSchema.validate({
      proposalId: accepted.proposal.id,
    });
    await assert.rejects(
      () =>
        projects.createProject({
          workspaceId: fixture.workspaceId,
          userId: fixture.ownerId,
          data,
        }),
      (error) => error.code === 'PROJECT_EXISTS' && error.status === 409,
    );
  } finally {
    await cleanup(fixture);
  }
});

test('projects and tasks never cross workspace boundaries', { skip }, async () => {
  const fixture = await createFixture();
  try {
    const { detail } = await createProjectFor(fixture);
    const projectId = detail.project.id;

    assert.equal(
      await projects.getProject(fixture.otherWorkspaceId, projectId),
      null,
    );

    const crossTask = await projectValidation.taskCreateSchema.validate({
      title: 'Cross workspace',
    });
    await assert.rejects(
      () =>
        projects.createTask({
          workspaceId: fixture.otherWorkspaceId,
          userId: fixture.otherOwnerId,
          projectId,
          data: crossTask,
        }),
      (error) => error.status === 404 || error.status === 422,
    );

    const crossMilestone =
      await projectValidation.milestoneCreateSchema.validate({
        title: 'Cross workspace milestone',
      });
    await assert.rejects(
      () =>
        projects.createMilestone({
          workspaceId: fixture.otherWorkspaceId,
          userId: fixture.otherOwnerId,
          projectId,
          data: crossMilestone,
        }),
      (error) => error.status === 404 || error.status === 422,
    );

    assert.equal(
      await projects.changeProjectStatus({
        workspaceId: fixture.otherWorkspaceId,
        userId: fixture.otherOwnerId,
        projectId,
        status: 'planning',
      }),
      null,
    );
  } finally {
    await cleanup(fixture);
  }
});
