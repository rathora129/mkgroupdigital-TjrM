import SupportListView from '@/components/workspace/clients/SupportListView';
import { requirePermissionPage } from '@/lib/auth/authorization';
import { hasPermission } from '@/lib/auth/permissions';
import { listEngagementLinkOptions } from '@/lib/clients/engagements';
import { listClientOptions } from '@/lib/clients/service';
import { getTicketsOverview, listTickets } from '@/lib/clients/tickets';
import { ticketQuerySchema } from '@/lib/clients/validation';
import { listMembers } from '@/lib/workspace/service';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Support',
};

const DEFAULT_QUERY = { page: 1, pageSize: 20 };

async function parseQuery(params) {
  try {
    return await ticketQuerySchema.validate(params, {
      abortEarly: false,
      stripUnknown: true,
    });
  } catch {
    return { ...DEFAULT_QUERY };
  }
}

export default async function SupportPage({ searchParams }) {
  const viewer = await requirePermissionPage('tickets.view');
  const params = (await searchParams) || {};
  const query = await parseQuery(params);
  const workspaceId = viewer.membership.workspaceId;

  const [tickets, overview, clients, linkOptions, members] = await Promise.all([
    listTickets(workspaceId, viewer.user.id, query),
    getTicketsOverview(workspaceId),
    listClientOptions(workspaceId),
    listEngagementLinkOptions(workspaceId),
    listMembers(workspaceId),
  ]);

  return (
    <SupportListView
      tickets={tickets}
      overview={overview}
      clients={clients}
      projects={linkOptions.projects}
      members={members.map((member) => ({
        userId: member.userId,
        name: member.name,
        email: member.email,
      }))}
      query={query}
      canCreate={hasPermission(viewer.membership.role, 'tickets.create')}
      timezone={viewer.workspace.timezone || 'UTC'}
    />
  );
}
