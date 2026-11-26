'use client';

import Link from 'next/link';
import {
  Activity,
  ArrowUpRight,
  BadgeCheck,
  BookOpen,
  Bot,
  Building2,
  ChevronRight,
  CircleAlert,
  FileText,
  FolderKanban,
  Globe2,
  Inbox,
  Layers,
  LifeBuoy,
  Search,
  Sparkles,
  Target,
  Users,
  Wallet,
} from 'lucide-react';
import styled from 'styled-components';
import { workspaceMedia } from '@/styles/workspaceTheme';
import {
  formatCents,
  formatDateTime,
  formatTokens,
  statusMeta,
} from '@/lib/ai/format';
import { formatValue } from '@/components/workspace/phase2c/meta';
import { formatMoney as formatProposalMoney } from '@/components/workspace/proposals/meta';
import SystemStatus from './SystemStatus';

const Page = styled.div`
  display: flex;
  flex-direction: column;
`;

const Welcome = styled.section`
  display: grid;
  grid-template-columns: minmax(0, 1fr) 320px;
  gap: 24px;
  align-items: start;

  ${workspaceMedia.down('md')} {
    grid-template-columns: 1fr;
  }
`;

const WelcomeCard = styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 14px;
  padding: clamp(20px, 3vw, 30px);
  border-radius: ${({ theme }) => theme.radius.xl};
  border: 1px solid ${({ theme }) => theme.colors.border};
  background: ${({ theme }) => theme.colors.surfaceRaised};
  box-shadow: ${({ theme }) => theme.shadow.card};
`;

const Badge = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 999px;
  border: 1px solid ${({ theme }) => theme.colors.primaryBorder};
  background: ${({ theme }) => theme.colors.primarySoft};
  color: ${({ theme }) => theme.colors.primary};
  font-size: 0.66rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
`;

const WelcomeTitle = styled.h1`
  font-size: clamp(1.65rem, 3.4vw, 2.15rem);
  letter-spacing: -0.03em;
  max-width: 640px;
`;

const WelcomeText = styled.p`
  max-width: 640px;
  font-size: 0.9rem;
  line-height: 1.7;
  color: ${({ theme }) => theme.colors.muted};
`;

const Actions = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 4px;
`;

const PrimaryLink = styled(Link)`
  display: inline-flex;
  align-items: center;
  gap: 7px;
  min-height: 40px;
  padding: 0 16px;
  border-radius: ${({ theme }) => theme.radius.md};
  background: ${({ theme }) => theme.colors.primary};
  color: #FFFFFF;
  font-size: 0.82rem;
  font-weight: 600;
  transition: background-color 0.2s ease;

  &:hover {
    background: ${({ theme }) => theme.colors.primaryHover};
  }
`;

const SecondaryLink = styled(Link)`
  display: inline-flex;
  align-items: center;
  gap: 7px;
  min-height: 40px;
  padding: 0 16px;
  border-radius: ${({ theme }) => theme.radius.md};
  border: 1px solid ${({ theme }) => theme.colors.borderStrong};
  background: ${({ theme }) => theme.colors.surfaceRaised};
  color: ${({ theme }) => theme.colors.textSoft};
  font-size: 0.82rem;
  font-weight: 600;
  transition:
    border-color 0.2s ease,
    background-color 0.2s ease,
    color 0.2s ease;

  &:hover {
    border-color: ${({ theme }) => theme.colors.primaryBorder};
    background: ${({ theme }) => theme.colors.primarySoft};
    color: ${({ theme }) => theme.colors.primary};
  }
`;

const SectionHead = styled.div`
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  margin: 30px 0 12px;
`;

const SectionTitle = styled.h2`
  font-size: 1.02rem;
  letter-spacing: -0.015em;
`;

const SectionSub = styled.p`
  margin-top: 4px;
  font-size: 0.8rem;
  color: ${({ theme }) => theme.colors.muted};
`;

const StatsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;

  ${workspaceMedia.down('md')} {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  ${workspaceMedia.down('xs')} {
    grid-template-columns: 1fr;
  }
`;

const StatCard = styled(Link)`
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 16px;
  border-radius: ${({ theme }) => theme.radius.lg};
  border: 1px solid ${({ theme }) => theme.colors.border};
  background: ${({ theme }) => theme.colors.surfaceRaised};
  box-shadow: ${({ theme }) => theme.shadow.card};
  transition:
    border-color 0.2s ease,
    transform 0.2s ease;

  &:hover {
    border-color: ${({ theme }) => theme.colors.primaryBorder};
    transform: translateY(-1px);
  }
`;

const StatTop = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 0.78rem;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textSoft};

  svg {
    color: ${({ theme }) => theme.colors.faint};
  }
`;

const StatValue = styled.p`
  font-size: 1.25rem;
  font-weight: 700;
  letter-spacing: -0.02em;
  line-height: 1.2;
  color: ${({ theme }) => theme.colors.text};
`;

const StatNote = styled.p`
  font-size: 0.72rem;
  color: ${({ theme }) => theme.colors.muted};
`;

const TwoCol = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr);
  gap: 16px;
  align-items: start;

  ${workspaceMedia.down('md')} {
    grid-template-columns: 1fr;
  }
`;

const Panel = styled.section`
  display: flex;
  flex-direction: column;
  min-width: 0;
  gap: 14px;
  padding: 20px;
  border-radius: ${({ theme }) => theme.radius.lg};
  border: 1px solid ${({ theme }) => theme.colors.border};
  background: ${({ theme }) => theme.colors.surfaceRaised};
  box-shadow: ${({ theme }) => theme.shadow.card};
`;

const PanelTop = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;

  h2 {
    font-size: 0.92rem;
    font-weight: 600;
  }
`;

const PanelLink = styled(Link)`
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 0.76rem;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.primary};
  white-space: nowrap;

  &:hover {
    color: ${({ theme }) => theme.colors.primaryHover};
  }
`;

const EmptyState = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 16px;
  border-radius: ${({ theme }) => theme.radius.md};
  border: 1px dashed ${({ theme }) => theme.colors.borderStrong};
  background: ${({ theme }) => theme.colors.surface};

  h3 {
    font-size: 0.84rem;
    font-weight: 600;
    color: ${({ theme }) => theme.colors.textSoft};
  }

  p {
    margin-top: 4px;
    font-size: 0.78rem;
    line-height: 1.6;
    color: ${({ theme }) => theme.colors.muted};
  }
`;

const EmptyIcon = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  flex-shrink: 0;
  border-radius: 9px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  background: ${({ theme }) => theme.colors.surfaceRaised};
  color: ${({ theme }) => theme.colors.muted};
`;

const StatusBadge = styled.span`
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 999px;
  border: 1px solid
    ${({ theme, $tone }) =>
      $tone === 'success'
        ? theme.colors.success
        : $tone === 'danger'
          ? theme.colors.danger
          : $tone === 'warning'
            ? theme.colors.warning
            : $tone === 'info'
              ? theme.colors.primaryBorder
              : theme.colors.border};
  background: ${({ theme, $tone }) =>
    $tone === 'success'
      ? theme.colors.successSoft
      : $tone === 'danger'
        ? theme.colors.dangerSoft
        : $tone === 'warning'
          ? theme.colors.warningSoft
          : $tone === 'info'
            ? theme.colors.primarySoft
            : theme.colors.surface};
  color: ${({ theme, $tone }) =>
    $tone === 'success'
      ? theme.colors.success
      : $tone === 'danger'
        ? theme.colors.danger
        : $tone === 'warning'
          ? theme.colors.warning
          : $tone === 'info'
            ? theme.colors.primary
            : theme.colors.muted};
  font-size: 0.64rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  white-space: nowrap;
`;

const RunScroll = styled.div`
  min-width: 0;
  overflow-x: auto;
`;

const RunTable = styled.table`
  width: 100%;
  border-collapse: collapse;

  th {
    padding: 8px 10px;
    text-align: left;
    font-size: 0.66rem;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: ${({ theme }) => theme.colors.muted};
    border-bottom: 1px solid ${({ theme }) => theme.colors.border};
    white-space: nowrap;
  }

  td {
    padding: 9px 10px;
    font-size: 0.78rem;
    color: ${({ theme }) => theme.colors.textSoft};
    border-bottom: 1px solid ${({ theme }) => theme.colors.border};
  }

  tr:last-child td {
    border-bottom: 0;
  }

  a {
    color: ${({ theme }) => theme.colors.primary};
    font-weight: 600;
  }
`;

const ModuleGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 12px;
`;

const ModuleCard = styled(Link)`
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 14px;
  border-radius: ${({ theme }) => theme.radius.md};
  border: 1px solid ${({ theme }) => theme.colors.border};
  background: ${({ theme }) => theme.colors.surfaceRaised};

  strong {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    font-size: 0.84rem;
    color: ${({ theme }) => theme.colors.textSoft};
  }

  span {
    font-size: 0.74rem;
    line-height: 1.55;
    color: ${({ theme }) => theme.colors.muted};
  }

  &:hover {
    border-color: ${({ theme }) => theme.colors.primaryBorder};
  }
`;

export default function OverviewDashboard({
  userName,
  overview,
  leadOverview,
  opportunityOverview,
  proposalOverview,
  researchOverview,
  auditOverview,
  projectOverview,
  clientOverview,
  financeOverview,
  canViewAi,
  canViewLeads,
  canViewOpportunities,
  canViewServices,
  canViewProposals,
  canViewResearch,
  canViewAudits,
  canViewProjects,
  canViewClients,
  canViewFinance,
  canViewMemory,
  canReview,
  canViewAudit,
  timezone,
}) {
  const firstName = String(userName || '').trim().split(/\s+/)[0] || null;
  const recentRuns = overview?.recentRuns || [];
  const hasBusinessModules =
    canViewLeads ||
    canViewOpportunities ||
    canViewServices ||
    canViewProposals ||
    canViewResearch ||
    canViewAudits ||
    canViewProjects ||
    canViewClients ||
    canViewFinance;

  return (
    <Page>
      <Welcome aria-labelledby="welcome-title">
        <WelcomeCard>
          <Badge>
            <Sparkles size={12} aria-hidden="true" />
            Phase 2H · Integration &amp; Automation
          </Badge>
          <WelcomeTitle id="welcome-title">
            {firstName ? `Welcome back, ${firstName}` : 'Welcome to your workspace'}
          </WelcomeTitle>
          <WelcomeText>
            Integrations, approvals and automations now share one audited
            operational layer. External actions stay disabled until credentials
            exist, and every consequential action still needs an explicit human
            approval before the worker touches it.
          </WelcomeText>
          <Actions>
            {canViewAi ? (
              <>
                <PrimaryLink href="/workspace/ai-workforce">
                  Open AI Workforce
                  <ChevronRight size={15} aria-hidden="true" />
                </PrimaryLink>
                <SecondaryLink href="/workspace/ai-workforce/runs">
                  Agent runs
                </SecondaryLink>
              </>
            ) : canViewLeads ? (
              <PrimaryLink href="/workspace/leads">
                Open leads
                <ChevronRight size={15} aria-hidden="true" />
              </PrimaryLink>
            ) : (
              <SecondaryLink href="/workspace/settings">
                Open settings
              </SecondaryLink>
            )}
          </Actions>
        </WelcomeCard>

        <SystemStatus />
      </Welcome>

      {hasBusinessModules ? (
        <>
          <SectionHead>
            <div>
              <SectionTitle>Business modules</SectionTitle>
              <SectionSub>
                Live counts from this workspace. Only modules your role can view
                are shown.
              </SectionSub>
            </div>
          </SectionHead>

          <StatsGrid>
            {canViewLeads && leadOverview ? (
              <StatCard href="/workspace/leads">
                <StatTop>
                  <span>Active leads</span>
                  <Users size={16} strokeWidth={1.8} aria-hidden="true" />
                </StatTop>
                <StatValue>{leadOverview.total}</StatValue>
                <StatNote>
                  {leadOverview.followUpsOverdue} overdue follow-up
                  {leadOverview.followUpsOverdue === 1 ? '' : 's'}
                </StatNote>
              </StatCard>
            ) : null}
            {canViewLeads && leadOverview ? (
              <StatCard href="/workspace/leads?assigned=me">
                <StatTop>
                  <span>Assigned to me</span>
                  <Users size={16} strokeWidth={1.8} aria-hidden="true" />
                </StatTop>
                <StatValue>{leadOverview.assignedToMe}</StatValue>
                <StatNote>{leadOverview.archived} archived lead(s)</StatNote>
              </StatCard>
            ) : null}
            {canViewOpportunities && opportunityOverview ? (
              <StatCard href="/workspace/opportunities">
                <StatTop>
                  <span>Open opportunities</span>
                  <Target size={16} strokeWidth={1.8} aria-hidden="true" />
                </StatTop>
                <StatValue>{opportunityOverview.open}</StatValue>
                <StatNote>
                  {opportunityOverview.closingSoon} closing in 30 days ·{' '}
                  {opportunityOverview.overdueFollowUps} overdue follow-up(s)
                </StatNote>
              </StatCard>
            ) : null}
            {canViewOpportunities && opportunityOverview ? (
              <StatCard href="/workspace/opportunities">
                <StatTop>
                  <span>Pipeline value</span>
                  <Target size={16} strokeWidth={1.8} aria-hidden="true" />
                </StatTop>
                <StatValue>
                  {formatValue(
                    opportunityOverview.pipelineValueCents,
                    opportunityOverview.pipelineCurrency,
                  )}
                </StatValue>
                <StatNote>
                  Expected open value
                  {opportunityOverview.pipelineCurrencies > 1
                    ? ` · ${opportunityOverview.pipelineCurrencies} currencies`
                    : ''}{' '}
                  · not received revenue
                </StatNote>
              </StatCard>
            ) : null}
            {canViewServices ? (
              <StatCard href="/workspace/services">
                <StatTop>
                  <span>Service catalogue</span>
                  <Layers size={16} strokeWidth={1.8} aria-hidden="true" />
                </StatTop>
                <StatValue>Open</StatValue>
                <StatNote>Categories, services and regulated review</StatNote>
              </StatCard>
            ) : null}
            {canViewProposals && proposalOverview ? (
              <StatCard href="/workspace/proposals">
                <StatTop>
                  <span>Proposals</span>
                  <FileText size={16} strokeWidth={1.8} aria-hidden="true" />
                </StatTop>
                <StatValue>{proposalOverview.total}</StatValue>
                <StatNote>
                  {proposalOverview.draft} draft · {proposalOverview.internalReview}{' '}
                  awaiting review · {proposalOverview.approved + proposalOverview.sent}{' '}
                  approved or sent
                </StatNote>
              </StatCard>
            ) : null}
            {canViewProposals && proposalOverview ? (
              <StatCard href="/workspace/proposals">
                <StatTop>
                  <span>Proposal value</span>
                  <FileText size={16} strokeWidth={1.8} aria-hidden="true" />
                </StatTop>
                <StatValue>
                  {formatProposalMoney(
                    proposalOverview.proposalValueCents,
                    proposalOverview.currency,
                  )}
                </StatValue>
                <StatNote>
                  Approved and sent · not revenue received ·{' '}
                  {proposalOverview.expiring} expiring soon
                </StatNote>
              </StatCard>
            ) : null}
            {canViewProposals && proposalOverview ? (
              <StatCard href="/workspace/proposals?status=accepted">
                <StatTop>
                  <span>Accepted proposals</span>
                  <FileText size={16} strokeWidth={1.8} aria-hidden="true" />
                </StatTop>
                <StatValue>{proposalOverview.accepted}</StatValue>
                <StatNote>
                  {formatProposalMoney(
                    proposalOverview.acceptedValueCents,
                    proposalOverview.currency,
                  )}{' '}
                  accepted value · monthly{' '}
                  {formatProposalMoney(
                    proposalOverview.recurringMonthlyCents,
                    proposalOverview.currency,
                  )}
                </StatNote>
              </StatCard>
            ) : null}
            {canViewResearch && researchOverview ? (
              <StatCard href="/workspace/research">
                <StatTop>
                  <span>Research jobs</span>
                  <Search size={16} strokeWidth={1.8} aria-hidden="true" />
                </StatTop>
                <StatValue>{researchOverview.active}</StatValue>
                <StatNote>
                  {researchOverview.completed} completed ·{' '}
                  {researchOverview.total} total
                </StatNote>
              </StatCard>
            ) : null}
            {canViewAudits && auditOverview ? (
              <StatCard href="/workspace/website-audits">
                <StatTop>
                  <span>Website audits</span>
                  <Globe2 size={16} strokeWidth={1.8} aria-hidden="true" />
                </StatTop>
                <StatValue>
                  {auditOverview.averageScore == null
                    ? '—'
                    : `${auditOverview.averageScore}/100`}
                </StatValue>
                <StatNote>
                  {auditOverview.completed} completed · {auditOverview.active}{' '}
                  active
                </StatNote>
              </StatCard>
            ) : null}
            {canViewProjects && projectOverview ? (
              <StatCard href="/workspace/projects">
                <StatTop>
                  <span>Active projects</span>
                  <FolderKanban size={16} strokeWidth={1.8} aria-hidden="true" />
                </StatTop>
                <StatValue>{projectOverview.active}</StatValue>
                <StatNote>
                  {projectOverview.overdueTasks} overdue tasks ·{' '}
                  {projectOverview.upcomingMilestones} milestones due soon
                </StatNote>
              </StatCard>
            ) : null}
            {canViewClients && clientOverview ? (
              <StatCard href="/workspace/clients">
                <StatTop>
                  <span>Clients</span>
                  <Building2 size={16} strokeWidth={1.8} aria-hidden="true" />
                </StatTop>
                <StatValue>{clientOverview.total}</StatValue>
                <StatNote>
                  {clientOverview.activeEngagements} active engagements ·{' '}
                  {clientOverview.openTickets} open tickets
                </StatNote>
              </StatCard>
            ) : null}
            {canViewClients && clientOverview ? (
              <StatCard href="/workspace/support">
                <StatTop>
                  <span>Support</span>
                  <LifeBuoy size={16} strokeWidth={1.8} aria-hidden="true" />
                </StatTop>
                <StatValue>{clientOverview.openTickets}</StatValue>
                <StatNote>
                  {clientOverview.overdueTickets} overdue ·{' '}
                  {clientOverview.upcomingRenewals} renewals in 30 days
                </StatNote>
              </StatCard>
            ) : null}
            {canViewFinance && financeOverview ? (
              <StatCard href="/workspace/finance">
                <StatTop>
                  <span>Outstanding</span>
                  <Wallet size={16} strokeWidth={1.8} aria-hidden="true" />
                </StatTop>
                <StatValue>
                  {formatProposalMoney(
                    financeOverview.totals.outstandingCents,
                    financeOverview.totals.currency,
                  )}
                </StatValue>
                <StatNote>
                  {formatProposalMoney(
                    financeOverview.totals.overdueCents,
                    financeOverview.totals.currency,
                  )}{' '}
                  overdue ·{' '}
                  {formatProposalMoney(
                    financeOverview.totals.collectedCents,
                    financeOverview.totals.currency,
                  )}{' '}
                  collected
                </StatNote>
              </StatCard>
            ) : null}
          </StatsGrid>
        </>
      ) : null}

      {canViewAi && overview ? (
        <>
          <SectionHead>
            <div>
              <SectionTitle>AI workforce</SectionTitle>
              <SectionSub>
                Real counts from this workspace for the current calendar month
                (UTC).
              </SectionSub>
            </div>
            <PanelLink href="/workspace/ai-workforce">
              Manage agents <ChevronRight size={13} />
            </PanelLink>
          </SectionHead>

          <StatsGrid>
            <StatCard href="/workspace/ai-workforce">
              <StatTop>
                <span>Agents</span>
                <Bot size={16} strokeWidth={1.8} aria-hidden="true" />
              </StatTop>
              <StatValue>
                {overview.agents.enabled} / {overview.agents.total}
              </StatValue>
              <StatNote>Enabled / total configured</StatNote>
            </StatCard>
            <StatCard href="/workspace/ai-workforce/runs">
              <StatTop>
                <span>Runs this month</span>
                <Activity size={16} strokeWidth={1.8} aria-hidden="true" />
              </StatTop>
              <StatValue>{overview.usage.runs}</StatValue>
              <StatNote>
                {overview.usage.completed} completed · {overview.usage.open} open
              </StatNote>
            </StatCard>
            <StatCard href="/workspace/ai-workforce/runs">
              <StatTop>
                <span>Tokens</span>
                <Sparkles size={16} strokeWidth={1.8} aria-hidden="true" />
              </StatTop>
              <StatValue>{formatTokens(overview.usage.tokens)}</StatValue>
              <StatNote>
                {overview.usage.tokenLimit
                  ? `Workspace limit ${formatTokens(overview.usage.tokenLimit)}`
                  : 'No workspace token limit'}
              </StatNote>
            </StatCard>
            <StatCard href="/workspace/ai-workforce">
              <StatTop>
                <span>Estimated cost</span>
                <BadgeCheck size={16} strokeWidth={1.8} aria-hidden="true" />
              </StatTop>
              <StatValue>{formatCents(overview.usage.costCents)}</StatValue>
              <StatNote>
                {overview.usage.budgetLimitCents
                  ? `Workspace limit ${formatCents(overview.usage.budgetLimitCents)}`
                  : 'No workspace budget limit'}
              </StatNote>
            </StatCard>
          </StatsGrid>

          <SectionHead>
            <div>
              <SectionTitle>Execution</SectionTitle>
              <SectionSub>
                {overview.runtimeConfigured
                  ? 'AI execution is configured on this server.'
                  : 'AI execution is not configured on this server.'}
              </SectionSub>
            </div>
          </SectionHead>

          <TwoCol>
            <Panel aria-labelledby="recent-runs-title">
              <PanelTop>
                <h2 id="recent-runs-title">Recent runs</h2>
                <PanelLink href="/workspace/ai-workforce/runs">
                  All runs <ChevronRight size={13} />
                </PanelLink>
              </PanelTop>

              {recentRuns.length === 0 ? (
                <EmptyState>
                  <EmptyIcon>
                    <Inbox size={17} aria-hidden="true" />
                  </EmptyIcon>
                  <div>
                    <h3>No runs yet</h3>
                    <p>
                      Open an enabled agent and submit a task. Runs appear here
                      with their live status and recorded usage.
                    </p>
                  </div>
                </EmptyState>
              ) : (
                <RunScroll>
                <RunTable>
                  <thead>
                    <tr>
                      <th>Agent</th>
                      <th>Status</th>
                      <th>Tokens</th>
                      <th>Cost</th>
                      <th>Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentRuns.map((run) => {
                      const meta = statusMeta(run.status);
                      return (
                        <tr key={run.id}>
                          <td>
                            <Link
                              href={`/workspace/ai-workforce/runs/${run.id}`}
                            >
                              {run.agentName}
                            </Link>
                          </td>
                          <td>
                            <StatusBadge $tone={meta.tone}>
                              {meta.label}
                            </StatusBadge>
                          </td>
                          <td>
                            {formatTokens(
                              run.promptTokens + run.completionTokens,
                            )}
                          </td>
                          <td>{formatCents(run.costEstimateCents)}</td>
                          <td>{formatDateTime(run.createdAt, timezone)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </RunTable>
                </RunScroll>
              )}
            </Panel>

            <Panel aria-labelledby="approvals-panel-title">
              <PanelTop>
                <h2 id="approvals-panel-title">Approvals</h2>
                {canReview ? (
                  <PanelLink href="/workspace/approvals">
                    Open queue <ChevronRight size={13} />
                  </PanelLink>
                ) : null}
              </PanelTop>

              {overview.pendingApprovals > 0 ? (
                <EmptyState>
                  <EmptyIcon>
                    <BadgeCheck size={17} aria-hidden="true" />
                  </EmptyIcon>
                  <div>
                    <h3>
                      {overview.pendingApprovals} run
                      {overview.pendingApprovals === 1 ? '' : 's'} awaiting a
                      decision
                    </h3>
                    <p>
                      {canReview
                        ? 'Review the run and approve or reject it. Approval queues the run for execution.'
                        : 'A reviewer must approve these runs before they execute. Your role cannot decide approvals.'}
                    </p>
                  </div>
                </EmptyState>
              ) : (
                <EmptyState>
                  <EmptyIcon>
                    <BadgeCheck size={17} aria-hidden="true" />
                  </EmptyIcon>
                  <div>
                    <h3>Queue is clear</h3>
                    <p>
                      Runs that require human approval appear here until a
                      reviewer decides.
                    </p>
                  </div>
                </EmptyState>
              )}

              {!overview.runtimeConfigured ? (
                <EmptyState>
                  <EmptyIcon>
                    <CircleAlert size={17} aria-hidden="true" />
                  </EmptyIcon>
                  <div>
                    <h3>AI execution is not configured</h3>
                    <p>
                      No provider credential exists on this server. Agents and
                      approvals can be prepared, but runs will fail until an
                      operator adds a key to the environment.
                    </p>
                  </div>
                </EmptyState>
              ) : null}
            </Panel>
          </TwoCol>
        </>
      ) : (
        <>
          <SectionHead>
            <div>
              <SectionTitle>Workspace</SectionTitle>
              <SectionSub>
                AI workforce data is available to roles with agent access.
              </SectionSub>
            </div>
          </SectionHead>
        </>
      )}

      <SectionHead>
        <div>
          <SectionTitle>Quick links</SectionTitle>
        </div>
      </SectionHead>

      <ModuleGrid>
        {canViewLeads ? (
          <ModuleCard href="/workspace/leads">
            <strong>
              <span
                style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}
              >
                <Users size={15} strokeWidth={1.8} aria-hidden="true" />
                Leads
              </span>
              <ArrowUpRight size={14} aria-hidden="true" />
            </strong>
            <span>Pipeline, owners, follow-ups and duplicate review.</span>
          </ModuleCard>
        ) : null}
        {canViewOpportunities ? (
          <ModuleCard href="/workspace/opportunities">
            <strong>
              <span
                style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}
              >
                <Target size={15} strokeWidth={1.8} aria-hidden="true" />
                Opportunities
              </span>
              <ArrowUpRight size={14} aria-hidden="true" />
            </strong>
            <span>Stages, expected value, discovery and requirements.</span>
          </ModuleCard>
        ) : null}
        {canViewServices ? (
          <ModuleCard href="/workspace/services">
            <strong>
              <span
                style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}
              >
                <Layers size={15} strokeWidth={1.8} aria-hidden="true" />
                Service catalogue
              </span>
              <ArrowUpRight size={14} aria-hidden="true" />
            </strong>
            <span>Categories, services and regulated professional review.</span>
          </ModuleCard>
        ) : null}
        {canViewProposals ? (
          <ModuleCard href="/workspace/proposals">
            <strong>
              <span
                style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}
              >
                <FileText size={15} strokeWidth={1.8} aria-hidden="true" />
                Proposals
              </span>
              <ArrowUpRight size={14} aria-hidden="true" />
            </strong>
            <span>Versioned proposals, approvals, responses and printing.</span>
          </ModuleCard>
        ) : null}
        {canViewProjects ? (
          <ModuleCard href="/workspace/projects">
            <strong>
              <span
                style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}
              >
                <FolderKanban size={15} strokeWidth={1.8} aria-hidden="true" />
                Projects
              </span>
              <ArrowUpRight size={14} aria-hidden="true" />
            </strong>
            <span>Delivery projects, tasks, milestones and deliverables.</span>
          </ModuleCard>
        ) : null}
        {canViewClients ? (
          <ModuleCard href="/workspace/clients">
            <strong>
              <span
                style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}
              >
                <Building2 size={15} strokeWidth={1.8} aria-hidden="true" />
                Clients
              </span>
              <ArrowUpRight size={14} aria-hidden="true" />
            </strong>
            <span>Client profiles, contacts, engagement history and timeline.</span>
          </ModuleCard>
        ) : null}
        {canViewClients ? (
          <ModuleCard href="/workspace/support">
            <strong>
              <span
                style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}
              >
                <LifeBuoy size={15} strokeWidth={1.8} aria-hidden="true" />
                Support
              </span>
              <ArrowUpRight size={14} aria-hidden="true" />
            </strong>
            <span>Client support tickets with internal and client replies.</span>
          </ModuleCard>
        ) : null}
        {canViewFinance ? (
          <ModuleCard href="/workspace/finance">
            <strong>
              <span
                style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}
              >
                <Wallet size={15} strokeWidth={1.8} aria-hidden="true" />
                Finance
              </span>
              <ArrowUpRight size={14} aria-hidden="true" />
            </strong>
            <span>Invoices, payments, expenses and currency-safe totals.</span>
          </ModuleCard>
        ) : null}
        {canViewResearch ? (
          <ModuleCard href="/workspace/research">
            <strong>
              <span
                style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}
              >
                <Search size={15} strokeWidth={1.8} aria-hidden="true" />
                Business research
              </span>
              <ArrowUpRight size={14} aria-hidden="true" />
            </strong>
            <span>Research briefs with labelled verification and sources.</span>
          </ModuleCard>
        ) : null}
        {canViewAudits ? (
          <ModuleCard href="/workspace/website-audits">
            <strong>
              <span
                style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}
              >
                <Globe2 size={15} strokeWidth={1.8} aria-hidden="true" />
                Website audits
              </span>
              <ArrowUpRight size={14} aria-hidden="true" />
            </strong>
            <span>Bounded, safe audits with findings and historical scores.</span>
          </ModuleCard>
        ) : null}
        {canViewAi ? (
          <ModuleCard href="/workspace/ai-workforce">
            <strong>
              <span
                style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}
              >
                <Bot size={15} strokeWidth={1.8} aria-hidden="true" />
                AI workforce
              </span>
              <ArrowUpRight size={14} aria-hidden="true" />
            </strong>
            <span>Agent roles, providers, models, limits and guardrails.</span>
          </ModuleCard>
        ) : null}
        {canViewMemory ? (
          <ModuleCard href="/workspace/memory">
            <strong>
              <span
                style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}
              >
                <BookOpen size={15} strokeWidth={1.8} aria-hidden="true" />
                Memory &amp; knowledge
              </span>
              <ArrowUpRight size={14} aria-hidden="true" />
            </strong>
            <span>
              Workspace knowledge, document ingestion and versioned AI memory.
            </span>
          </ModuleCard>
        ) : null}
        {canReview ? (
          <ModuleCard href="/workspace/approvals">
            <strong>
              <span
                style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}
              >
                <BadgeCheck size={15} strokeWidth={1.8} aria-hidden="true" />
                Approvals
              </span>
              <ArrowUpRight size={14} aria-hidden="true" />
            </strong>
            <span>Review sensitive runs before they execute.</span>
          </ModuleCard>
        ) : null}
        {canViewAudit ? (
          <ModuleCard href="/workspace/audit">
            <strong>
              <span
                style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}
              >
                <Activity size={15} strokeWidth={1.8} aria-hidden="true" />
                Audit log
              </span>
              <ArrowUpRight size={14} aria-hidden="true" />
            </strong>
            <span>Workspace-scoped record of sensitive actions.</span>
          </ModuleCard>
        ) : null}
        <ModuleCard href="/workspace/settings">
          <strong>
            <span
              style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}
            >
              <Sparkles size={15} strokeWidth={1.8} aria-hidden="true" />
              Settings
            </span>
            <ArrowUpRight size={14} aria-hidden="true" />
          </strong>
          <span>Workspace profile, members, invitations and preferences.</span>
        </ModuleCard>
      </ModuleGrid>
    </Page>
  );
}
