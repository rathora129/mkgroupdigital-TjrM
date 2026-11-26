import LeadsView from '@/components/workspace/leads/LeadsView';
import { requirePermissionPage } from '@/lib/auth/authorization';
import { hasPermission } from '@/lib/auth/permissions';
import { getLeadOverview, leadAccessFor, listLeads } from '@/lib/leads/service';
import { leadQuerySchema } from '@/lib/leads/validation';
import { listMembers } from '@/lib/workspace/service';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Leads',
};

const DEFAULT_QUERY = {
  page: 1,
  pageSize: 20,
  archived: 'active',
  sort: 'created',
  direction: 'desc',
};

async function parseQuery(params) {
  try {
    return await leadQuerySchema.validate(params, {
      abortEarly: false,
      stripUnknown: true,
    });
  } catch {
    return { ...DEFAULT_QUERY };
  }
}

export default async function LeadsPage({ searchParams }) {
  const viewer = await requirePermissionPage('leads.view');
  const params = (await searchParams) || {};
  const query = await parseQuery(params);
  const workspaceId = viewer.membership.workspaceId;
  const role = viewer.membership.role;

  const [leads, overview, members] = await Promise.all([
    listLeads(workspaceId, viewer.user.id, query, leadAccessFor(viewer)),
    getLeadOverview(workspaceId, viewer.user.id, leadAccessFor(viewer)),
    hasPermission(role, 'leads.assign')
      ? listMembers(workspaceId)
      : Promise.resolve([]),
  ]);

  return (
    <LeadsView
      leads={leads}
      overview={overview}
      members={members}
      query={query}
      canCreate={hasPermission(role, 'leads.create')}
      canAssign={hasPermission(role, 'leads.assign')}
      canImport={hasPermission(role, 'leads.import')}
      timezone={viewer.workspace.timezone || 'UTC'}
    />
  );
}
