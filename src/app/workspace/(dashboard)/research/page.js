import ResearchView from '@/components/workspace/research/ResearchView';
import { requirePermissionPage } from '@/lib/auth/authorization';
import { hasPermission } from '@/lib/auth/permissions';
import { listAgents } from '@/lib/ai/runtime';
import { configuredProviderKeys } from '@/lib/ai/registry';
import { getLead, listLeads } from '@/lib/leads/service';
import { isUuid } from '@/lib/leads/validation';
import {
  getResearchOverview,
  listResearchJobs,
} from '@/lib/research/service';
import { researchQuerySchema } from '@/lib/research/validation';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Business research',
};

const DEFAULT_QUERY = { page: 1, pageSize: 20 };

async function parseQuery(params) {
  try {
    return await researchQuerySchema.validate(params, {
      abortEarly: false,
      stripUnknown: true,
    });
  } catch {
    return { ...DEFAULT_QUERY };
  }
}

export default async function ResearchPage({ searchParams }) {
  const viewer = await requirePermissionPage('research.view');
  const params = (await searchParams) || {};
  const query = await parseQuery(params);
  const workspaceId = viewer.membership.workspaceId;
  const role = viewer.membership.role;
  const canCreate = hasPermission(role, 'research.create');

  const presetLeadId =
    typeof params.lead === 'string' && isUuid(params.lead) ? params.lead : null;

  const [jobs, overview, agents, leads, presetLead] = await Promise.all([
    listResearchJobs(workspaceId, query),
    getResearchOverview(workspaceId),
    canCreate
      ? listAgents(workspaceId, { enabled: true }).then((rows) =>
          rows.filter(
            (agent) =>
              agent.type === 'business_research' ||
              agent.type === 'lead_research',
          ),
        )
      : Promise.resolve([]),
    canCreate
      ? listLeads(workspaceId, viewer.user.id, {
          page: 1,
          pageSize: 100,
          archived: 'active',
          sort: 'company',
          direction: 'asc',
        })
      : Promise.resolve({ items: [] }),
    presetLeadId ? getLead(workspaceId, presetLeadId) : Promise.resolve(null),
  ]);

  return (
    <ResearchView
      jobs={jobs}
      overview={overview}
      agents={agents}
      leads={leads.items}
      query={query}
      canCreate={canCreate}
      runtimeConfigured={configuredProviderKeys().length > 0}
      presetLeadId={presetLead ? presetLeadId : null}
      presetLeadName={presetLead?.lead?.companyName || null}
      timezone={viewer.workspace.timezone || 'UTC'}
    />
  );
}
