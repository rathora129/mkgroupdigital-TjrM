import ClientListView from '@/components/workspace/clients/ClientListView';
import { requirePermissionPage } from '@/lib/auth/authorization';
import { hasPermission } from '@/lib/auth/permissions';
import { getClientsOverview, listClients } from '@/lib/clients/service';
import { clientQuerySchema } from '@/lib/clients/validation';
import { listMembers } from '@/lib/workspace/service';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Clients',
};

const DEFAULT_QUERY = {
  page: 1,
  pageSize: 20,
  sort: 'created',
  direction: 'desc',
};

async function parseQuery(params) {
  try {
    return await clientQuerySchema.validate(params, {
      abortEarly: false,
      stripUnknown: true,
    });
  } catch {
    return { ...DEFAULT_QUERY };
  }
}

export default async function ClientsPage({ searchParams }) {
  const viewer = await requirePermissionPage('clients.view');
  const params = (await searchParams) || {};
  const query = await parseQuery(params);
  const workspaceId = viewer.membership.workspaceId;

  const [clients, overview, members] = await Promise.all([
    listClients(workspaceId, viewer.user.id, query),
    getClientsOverview(workspaceId),
    listMembers(workspaceId),
  ]);

  return (
    <ClientListView
      clients={clients}
      overview={overview}
      members={members.map((member) => ({
        userId: member.userId,
        name: member.name,
        email: member.email,
      }))}
      query={query}
      canCreate={hasPermission(viewer.membership.role, 'clients.create')}
      timezone={viewer.workspace.timezone || 'UTC'}
    />
  );
}
