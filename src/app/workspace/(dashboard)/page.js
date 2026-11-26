import OverviewDashboard from '@/components/workspace/OverviewDashboard';
import { requireMemberPage } from '@/lib/auth/authorization';
import { hasPermission } from '@/lib/auth/permissions';
import { getAiOverview } from '@/lib/ai/runtime';
import { getLeadOverview } from '@/lib/leads/service';
import { getOpportunityOverview } from '@/lib/opportunities/service';
import { getProposalOverview } from '@/lib/proposals/service';
import { getResearchOverview } from '@/lib/research/service';
import { getWebsiteAuditOverview } from '@/lib/audits/service';
import { getProjectsOverview } from '@/lib/projects/service';
import { getClientsOverview } from '@/lib/clients/service';
import { getFinanceOverview } from '@/lib/billing/service';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: { absolute: 'Overview | MK AI Workforce' },
};

export default async function WorkspaceOverviewPage() {
  const viewer = await requireMemberPage();
  const role = viewer.membership.role;
  const workspaceId = viewer.membership.workspaceId;

  const canViewAi = hasPermission(role, 'agents.view');
  const canViewLeads = hasPermission(role, 'leads.view');
  const canViewOpportunities = hasPermission(role, 'opportunities.view');
  const canViewServices = hasPermission(role, 'services.view');
  const canViewProposals = hasPermission(role, 'proposals.view');
  const canViewResearch = hasPermission(role, 'research.view');
  const canViewAudits = hasPermission(role, 'audits.view');
  const canViewProjects = hasPermission(role, 'projects.view');
  const canViewClients = hasPermission(role, 'clients.view');
  const canViewFinance = hasPermission(role, 'finance.view');
  const canViewMemory = hasPermission(role, 'knowledge.view');

  const [
    overview,
    leadOverview,
    opportunityOverview,
    proposalOverview,
    researchOverview,
    auditOverview,
    projectOverview,
    clientOverview,
    financeOverview,
  ] = await Promise.all([
    canViewAi ? getAiOverview(workspaceId) : Promise.resolve(null),
    canViewLeads
      ? getLeadOverview(workspaceId, viewer.user.id)
      : Promise.resolve(null),
    canViewOpportunities
      ? getOpportunityOverview(workspaceId)
      : Promise.resolve(null),
    canViewProposals ? getProposalOverview(workspaceId) : Promise.resolve(null),
    canViewResearch ? getResearchOverview(workspaceId) : Promise.resolve(null),
    canViewAudits
      ? getWebsiteAuditOverview(workspaceId)
      : Promise.resolve(null),
    canViewProjects ? getProjectsOverview(workspaceId) : Promise.resolve(null),
    canViewClients ? getClientsOverview(workspaceId) : Promise.resolve(null),
    canViewFinance ? getFinanceOverview(workspaceId) : Promise.resolve(null),
  ]);

  return (
    <OverviewDashboard
      userName={viewer.user.name}
      overview={overview}
      leadOverview={leadOverview}
      opportunityOverview={opportunityOverview}
      proposalOverview={proposalOverview}
      researchOverview={researchOverview}
      auditOverview={auditOverview}
      projectOverview={projectOverview}
      clientOverview={clientOverview}
      financeOverview={financeOverview}
      canViewAi={canViewAi}
      canViewLeads={canViewLeads}
      canViewOpportunities={canViewOpportunities}
      canViewServices={canViewServices}
      canViewProposals={canViewProposals}
      canViewResearch={canViewResearch}
      canViewAudits={canViewAudits}
      canViewProjects={canViewProjects}
      canViewClients={canViewClients}
      canViewFinance={canViewFinance}
      canViewMemory={canViewMemory}
      canReview={hasPermission(role, 'approvals.review')}
      canViewAudit={hasPermission(role, 'audit.view')}
      timezone={viewer.workspace.timezone || 'UTC'}
    />
  );
}
