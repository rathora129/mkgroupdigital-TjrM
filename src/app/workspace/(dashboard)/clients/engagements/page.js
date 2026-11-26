import EngagementListView from '@/components/workspace/clients/EngagementListView';
import { requirePermissionPage } from '@/lib/auth/authorization';
import { hasPermission } from '@/lib/auth/permissions';
import {
  getEngagementsOverview,
  listEngagementLinkOptions,
  listEngagements,
} from '@/lib/clients/engagements';
import { listClientOptions } from '@/lib/clients/service';
import { engagementQuerySchema } from '@/lib/clients/validation';
import { listMembers } from '@/lib/workspace/service';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Service engagements',
};

const DEFAULT_QUERY = { page: 1, pageSize: 20 };

async function parseQuery(params) {
  try {
    return await engagementQuerySchema.validate(params, {
      abortEarly: false,
      stripUnknown: true,
    });
  } catch {
    return { ...DEFAULT_QUERY };
  }
}

export default async function EngagementsPage({ searchParams }) {
  const viewer = await requirePermissionPage('clients.view');
  const params = (await searchParams) || {};
  const query = await parseQuery(params);
  const workspaceId = viewer.membership.workspaceId;

  const [engagements, overview, clients, linkOptions, members] = await Promise.all([
    listEngagements(workspaceId, query),
    getEngagementsOverview(workspaceId),
    listClientOptions(workspaceId),
    listEngagementLinkOptions(workspaceId),
    listMembers(workspaceId),
  ]);

  return (
    <EngagementListView
      engagements={engagements}
      overview={overview}
      clients={clients}
      linkOptions={linkOptions}
      members={members.map((member) => ({
        userId: member.userId,
        name: member.name,
        email: member.email,
      }))}
      query={query}
      canCreate={hasPermission(viewer.membership.role, 'clients.create')}
      canEdit={hasPermission(viewer.membership.role, 'clients.update')}
      timezone={viewer.workspace.timezone || 'UTC'}
    />
  );
}
