'use client';

import {
  CalendarClock,
  ClipboardCheck,
  FileText,
  Gauge,
  Globe2,
  Megaphone,
  PenLine,
  Target,
  Users,
} from 'lucide-react';
import {
  Badge,
  Card,
  CardHead,
  CardText,
  CardTitle,
  Eyebrow,
  Header,
  Hint,
  Lead,
  LinkButton,
  Page,
  StatCard,
  StatGrid,
  StatLabel,
  StatNote,
  StatValue,
  Title,
} from '@/components/workspace/ai/primitives';
import { formatDateTime } from '@/lib/ai/format';
import { LogList, MetaGrid, TwoCol } from '@/components/workspace/phase2c/ui';
import MarketingNav from './MarketingNav';
import {
  CAMPAIGN_STATUS_META,
  CONTENT_STATUS_META,
  PROPOSAL_STATUS_META,
} from './meta';

const WORKFLOW = [
  'Planned',
  'Draft',
  'Awaiting review',
  'Approved',
  'Scheduled',
  'Executed',
];

export default function MarketingDashboardView({ dashboard, overview, timezone }) {
  const campaigns = overview?.campaigns || {};
  const content = overview?.content || {};
  const website = overview?.website || {};
  const metrics = overview?.metrics || { total: 0, sourceCounts: {} };
  const statusCounts = dashboard.statusCounts || {};

  return (
    <Page>
      <Header>
        <Eyebrow>Marketing &amp; website execution</Eyebrow>
        <Title>Marketing control room</Title>
        <Lead>
          Planning, drafting, review, scheduling and recorded execution are
          always separate states. Nothing here publishes to a live website,
          social network or ad platform.
        </Lead>
      </Header>
      <MarketingNav />

      <StatGrid>
        <StatCard>
          <StatLabel>Active clients</StatLabel>
          <StatValue>{dashboard.activeClients}</StatValue>
          <StatNote>Marketing profiles marked active</StatNote>
        </StatCard>
        <StatCard>
          <StatLabel>Active campaigns</StatLabel>
          <StatValue>{dashboard.activeCampaigns}</StatValue>
          <StatNote>Planned through scheduled · never live ads</StatNote>
        </StatCard>
        <StatCard>
          <StatLabel>Awaiting review</StatLabel>
          <StatValue>{dashboard.pendingApprovals}</StatValue>
          <StatNote>
            {dashboard.contentAwaitingReview} content ·{' '}
            {dashboard.websiteProposalsAwaitingReview} website changes
          </StatNote>
        </StatCard>
        <StatCard>
          <StatLabel>Open marketing tasks</StatLabel>
          <StatValue>{dashboard.openMarketingTasks}</StatValue>
          <StatNote>{dashboard.overdueMarketingTasks} past due date</StatNote>
        </StatCard>
      </StatGrid>

      <Card>
        <CardHead>
          <div>
            <CardTitle>State model</CardTitle>
            <CardText>
              A record advances one deliberate step at a time. A draft is never
              shown as published, and approval is not execution.
            </CardText>
          </div>
          <Megaphone size={16} aria-hidden="true" />
        </CardHead>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {WORKFLOW.map((step, index) => (
            <Badge key={step} $tone={index === 5 ? 'success' : 'default'}>
              {index + 1}. {step}
            </Badge>
          ))}
        </div>
        <MetaGrid>
          <div>
            <dt>Campaigns planned</dt>
            <dd>{statusCounts.campaigns?.planned || 0}</dd>
          </div>
          <div>
            <dt>Content approved</dt>
            <dd>{statusCounts.content?.approved || 0}</dd>
          </div>
          <div>
            <dt>Content scheduled (internal)</dt>
            <dd>{dashboard.scheduledContent}</dd>
          </div>
          <div>
            <dt>Website changes executing</dt>
            <dd>{dashboard.websiteProposalsExecuting}</dd>
          </div>
        </MetaGrid>
        <Hint>
          Scheduled content is a calendar entry, not a post. Executed website
          changes are recorded manually with evidence; this system never edits a
          live site.
        </Hint>
      </Card>

      <TwoCol>
        <Card>
          <CardHead>
            <div>
              <CardTitle>Campaign states</CardTitle>
              <CardText>Planning-only pipeline across all clients.</CardText>
            </div>
            <Target size={16} aria-hidden="true" />
          </CardHead>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {Object.entries(CAMPAIGN_STATUS_META).map(([key, meta]) => (
              <Badge key={key} $tone={meta.tone}>
                {meta.label}: {campaigns.statusCounts?.[key] || 0}
              </Badge>
            ))}
          </div>
        </Card>
        <Card>
          <CardHead>
            <div>
              <CardTitle>Content states</CardTitle>
              <CardText>Drafts, reviews and internal scheduling.</CardText>
            </div>
            <PenLine size={16} aria-hidden="true" />
          </CardHead>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {Object.entries(CONTENT_STATUS_META).map(([key, meta]) => (
              <Badge key={key} $tone={meta.tone}>
                {meta.label}: {content.statusCounts?.[key] || 0}
              </Badge>
            ))}
          </div>
        </Card>
      </TwoCol>

      <TwoCol>
        <Card>
          <CardHead>
            <div>
              <CardTitle>Website change proposals</CardTitle>
              <CardText>
                Proposal → review → approval → manual execution evidence.
              </CardText>
            </div>
            <Globe2 size={16} aria-hidden="true" />
          </CardHead>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {Object.entries(PROPOSAL_STATUS_META).map(([key, meta]) => (
              <Badge key={key} $tone={meta.tone}>
                {meta.label}: {website.statusCounts?.[key] || 0}
              </Badge>
            ))}
          </div>
          <Hint>
            {website.pageCount || 0} page(s) in inventory. Executed proposals
            require recorded evidence.
          </Hint>
        </Card>
        <Card>
          <CardHead>
            <div>
              <CardTitle>Recorded performance</CardTitle>
              <CardText>
                Every metric keeps its source label: manual, imported,
                calculated or AI estimate.
              </CardText>
            </div>
            <Gauge size={16} aria-hidden="true" />
          </CardHead>
          <MetaGrid>
            <div>
              <dt>Recorded metrics</dt>
              <dd>{metrics.total || 0}</dd>
            </div>
            <div>
              <dt>Reports</dt>
              <dd>{dashboard.reports}</dd>
            </div>
            <div>
              <dt>Manual entries</dt>
              <dd>{metrics.sourceCounts?.manual || 0}</dd>
            </div>
            <div>
              <dt>AI estimates</dt>
              <dd>{metrics.sourceCounts?.ai_estimate || 0}</dd>
            </div>
          </MetaGrid>
        </Card>
      </TwoCol>

      <Card>
        <CardHead>
          <div>
            <CardTitle>Recent marketing activity</CardTitle>
            <CardText>
              Audit entries written by this module. Sensitive values are never
              stored.
            </CardText>
          </div>
          <ClipboardCheck size={16} aria-hidden="true" />
        </CardHead>
        {dashboard.recentActivity.length === 0 ? (
          <Hint>No marketing activity has been recorded yet.</Hint>
        ) : (
          <LogList>
            {dashboard.recentActivity.map((entry) => (
              <li key={entry.id}>
                <time>{formatDateTime(entry.createdAt, timezone)}</time>
                <em data-level="info">{entry.action}</em>
                <p>
                  {entry.actorName || 'Unknown actor'} · {entry.resourceType}
                </p>
              </li>
            ))}
          </LogList>
        )}
      </Card>

      <Card>
        <CardHead>
          <div>
            <CardTitle>Jump into a workflow</CardTitle>
            <CardText>
              Clients and projects are shared with the rest of the workspace;
              marketing records link to them rather than duplicating them.
            </CardText>
          </div>
        </CardHead>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <LinkButton href="/workspace/marketing/clients">
            <Users size={14} />
            Client marketing setup
          </LinkButton>
          <LinkButton href="/workspace/marketing/campaigns">
            <Target size={14} />
            Campaign plans
          </LinkButton>
          <LinkButton href="/workspace/marketing/content">
            <PenLine size={14} />
            Content drafts
          </LinkButton>
          <LinkButton href="/workspace/marketing/calendar">
            <CalendarClock size={14} />
            Content calendar
          </LinkButton>
          <LinkButton href="/workspace/marketing/website">
            <Globe2 size={14} />
            Website changes
          </LinkButton>
          <LinkButton href="/workspace/marketing/reports">
            <FileText size={14} />
            Performance reports
          </LinkButton>
        </div>
      </Card>
    </Page>
  );
}
