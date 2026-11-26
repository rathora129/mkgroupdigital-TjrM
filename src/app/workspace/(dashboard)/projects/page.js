import ProjectListView from '@/components/workspace/projects/ProjectListView';
import { requirePermissionPage } from '@/lib/auth/authorization';
import { hasPermission } from '@/lib/auth/permissions';
import { getProjectsOverview, listProjects } from '@/lib/projects/service';
import { projectQuerySchema } from '@/lib/projects/validation';
import { listMembers } from '@/lib/workspace/service';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Projects',
};

const DEFAULT_QUERY = {
  page: 1,
  pageSize: 20,
  sort: 'created',
  direction: 'desc',
};

async function parseQuery(params) {
  try {
    return await projectQuerySchema.validate(params, {
      abortEarly: false,
      stripUnknown: true,
    });
  } catch {
    return { ...DEFAULT_QUERY };
  }
}

export default async function ProjectsPage({ searchParams }) {
  const viewer = await requirePermissionPage('projects.view');
  const params = (await searchParams) || {};
  const query = await parseQuery(params);
  const workspaceId = viewer.membership.workspaceId;

  const [projects, overview, members] = await Promise.all([
    listProjects(workspaceId, viewer.user.id, query),
    getProjectsOverview(workspaceId),
    listMembers(workspaceId),
  ]);

  return (
    <ProjectListView
      projects={projects}
      overview={overview}
      members={members.map((member) => ({
        userId: member.userId,
        name: member.name,
        email: member.email,
      }))}
      query={query}
      canCreate={hasPermission(viewer.membership.role, 'projects.create')}
      timezone={viewer.workspace.timezone || 'UTC'}
    />
  );
}
