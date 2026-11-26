import TaskListView from '@/components/workspace/projects/TaskListView';
import { requirePermissionPage } from '@/lib/auth/authorization';
import {
  getProjectsOverview,
  listProjects,
  listTasks,
} from '@/lib/projects/service';
import { taskQuerySchema } from '@/lib/projects/validation';
import { listMembers } from '@/lib/workspace/service';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Tasks',
};

const DEFAULT_QUERY = {
  page: 1,
  pageSize: 50,
  sort: 'created',
  direction: 'desc',
};

async function parseQuery(params) {
  try {
    return await taskQuerySchema.validate(params, {
      abortEarly: false,
      stripUnknown: true,
    });
  } catch {
    return { ...DEFAULT_QUERY };
  }
}

export default async function TasksPage({ searchParams }) {
  const viewer = await requirePermissionPage('tasks.view');
  const params = (await searchParams) || {};
  const query = await parseQuery(params);
  const workspaceId = viewer.membership.workspaceId;

  const [tasks, overview, projectOptions, members] = await Promise.all([
    listTasks(workspaceId, viewer.user.id, query),
    getProjectsOverview(workspaceId),
    listProjects(workspaceId, viewer.user.id, {
      page: 1,
      pageSize: 100,
      sort: 'created',
      direction: 'desc',
    }),
    listMembers(workspaceId),
  ]);

  return (
    <TaskListView
      tasks={tasks}
      overview={overview}
      members={members.map((member) => ({
        userId: member.userId,
        name: member.name,
        email: member.email,
      }))}
      projects={projectOptions.items.map((project) => ({
        id: project.id,
        name: project.name,
        reference: project.reference,
      }))}
      query={query}
      timezone={viewer.workspace.timezone || 'UTC'}
    />
  );
}
