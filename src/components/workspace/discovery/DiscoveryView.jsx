'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  CheckCircle2,
  Plus,
  Radar,
  ShieldCheck,
} from 'lucide-react';
import {
  Actions,
  Badge,
  Button,
  Card,
  CardHead,
  CardText,
  CardTitle,
  EmptyState,
  Eyebrow,
  Header,
  Lead,
  LinkButton,
  Notice,
  Page,
  StatCard,
  StatGrid,
  StatLabel,
  StatNote,
  StatValue,
  Table,
  TableWrap,
  Title,
} from '@/components/workspace/ai/primitives';
import {
  FilterBar,
  FilterField,
  ListPager,
} from '@/components/workspace/phase2c/ui';
import { formatDateTime } from '@/lib/ai/format';
import DiscoveryForm from '@/components/workspace/discovery/DiscoveryForm';
import {
  CAMPAIGN_STATUS_META,
  FREQUENCY_LABELS,
  PROVIDER_LABELS,
  RUN_STATUS_META,
  formatCount,
  metaFor,
} from '@/components/workspace/discovery/meta';

const STATUS_OPTIONS = [
  ['', 'All statuses'],
  ['draft', 'Draft'],
  ['active', 'Active'],
  ['paused', 'Paused'],
  ['completed', 'Completed'],
  ['cancelled', 'Cancelled'],
];

function hrefFor(query, page) {
  const params = new URLSearchParams();
  if (query.status) params.set('status', query.status);
  if (query.search) params.set('search', query.search);
  if (query.provider) params.set('provider', query.provider);
  params.set('page', String(page));
  return `/workspace/discovery?${params.toString()}`;
}

export default function DiscoveryView({
  campaigns,
  overview,
  readiness,
  query,
  canManage,
  timezone,
}) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);

  const providers = readiness?.providers || [];
  const configuredProviders = providers.filter((provider) => provider.configured);
  const providerReady = configuredProviders.length > 0;
  const pending = overview?.prospects?.pending || 0;

  return (
    <Page>
      <Header>
        <Eyebrow>Lead acquisition</Eyebrow>
        <Title>AI discovery</Title>
        <Lead>
          Find businesses from authorized sources, enrich them with AI as clearly
          labelled hypotheses, and approve only the prospects you want in the CRM.
          Nothing is invented when a source is not connected.
        </Lead>
      </Header>

      <Actions>
        <LinkButton href="/workspace/discovery/review" $primary={pending > 0}>
          Review queue{pending > 0 ? ` · ${formatCount(pending)}` : ''}
        </LinkButton>
        {canManage ? (
          <Button
            $variant={creating ? 'ghost' : 'primary'}
            onClick={() => setCreating((value) => !value)}
          >
            <Plus size={16} /> New campaign
          </Button>
        ) : null}
      </Actions>

      {!providerReady ? (
        <Notice $tone="warning">
          <AlertTriangle size={16} />
          <span>
            No discovery source is configured yet, so campaigns cannot run. Add an
            API key for {providers.map((provider) => provider.label).join(' or ')}:
            {' '}
            {providers
              .map((provider) => provider.envKeys.join(' or '))
              .join('; ')}
            . Discovery stays blocked rather than returning invented businesses.
          </span>
        </Notice>
      ) : (
        <Notice $tone="success">
          <CheckCircle2 size={16} />
          <span>
            Connected source{configuredProviders.length === 1 ? '' : 's'}:{' '}
            {configuredProviders
              .map((provider) => PROVIDER_LABELS[provider.key] || provider.label)
              .join(', ')}
            . AI enrichment:{' '}
            {readiness?.enrichment?.ready
              ? `ready via ${readiness.enrichment.agentName || 'a research agent'}${
                  readiness.enrichment.model ? ` (${readiness.enrichment.model})` : ''
                }.`
              : readiness?.enrichment?.message ||
                'not available — prospects will be captured without AI scoring.'}
          </span>
        </Notice>
      )}

      <StatGrid>
        <StatCard>
          <StatLabel>Active campaigns</StatLabel>
          <StatValue>{formatCount(overview?.campaigns?.active || 0)}</StatValue>
          <StatNote>
            {formatCount(overview?.campaigns?.total || 0)} total campaigns
          </StatNote>
        </StatCard>
        <StatCard>
          <StatLabel>Pending review</StatLabel>
          <StatValue>{formatCount(pending)}</StatValue>
          <StatNote>Approve, edit, reject or request research</StatNote>
        </StatCard>
        <StatCard>
          <StatLabel>Approved prospects</StatLabel>
          <StatValue>{formatCount(overview?.prospects?.approved || 0)}</StatValue>
          <StatNote>Converted into CRM leads on approval</StatNote>
        </StatCard>
        <StatCard>
          <StatLabel>Last discovery</StatLabel>
          <StatValue>
            {overview?.lastDiscoveredAt
              ? formatDateTime(overview.lastDiscoveredAt, timezone).split(',')[0]
              : '—'}
          </StatValue>
          <StatNote>
            {formatCount(overview?.prospects?.total || 0)} prospects discovered
          </StatNote>
        </StatCard>
      </StatGrid>

      {creating && canManage ? (
        <Card>
          <CardHead>
            <div>
              <CardTitle>New discovery campaign</CardTitle>
              <CardText>
                Describe where to search and what makes a good fit. AI enrichment
                only runs when a research agent is enabled and a budget is set.
              </CardText>
            </div>
          </CardHead>
          <DiscoveryForm
            readiness={readiness}
            onDone={(campaign) => {
              setCreating(false);
              router.push(`/workspace/discovery/${campaign.id}`);
            }}
            onCancel={() => setCreating(false)}
          />
        </Card>
      ) : null}

      <Card>
        <CardHead>
          <div>
            <CardTitle>Campaigns</CardTitle>
            <CardText>
              Scheduled campaigns are picked up by the worker. Each run records its
              usage, duplicates and errors.
            </CardText>
          </div>
        </CardHead>

        <FilterBar action="/workspace/discovery" method="get">
          <FilterField>
            Status
            <select name="status" defaultValue={query.status || ''}>
              {STATUS_OPTIONS.map(([value, label]) => (
                <option key={value || 'all'} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </FilterField>
          <FilterField>
            Search
            <input
              type="search"
              name="search"
              defaultValue={query.search || ''}
              placeholder="Campaign name or error"
            />
          </FilterField>
          <Button type="submit">Filter</Button>
          <LinkButton href="/workspace/discovery">Reset</LinkButton>
        </FilterBar>

        {campaigns.items.length === 0 ? (
          <EmptyState>
            <Radar size={20} />
            <div>
              <h3>No campaigns found</h3>
              <p>
                {canManage
                  ? 'Create a campaign to begin sourcing candidates from a connected provider.'
                  : 'There are no discovery campaigns to show yet.'}
              </p>
            </div>
          </EmptyState>
        ) : (
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <th>Campaign</th>
                  <th>Status</th>
                  <th>Source</th>
                  <th>Schedule</th>
                  <th>Prospects</th>
                  <th>Last run</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {campaigns.items.map((campaign) => {
                  const status = metaFor(CAMPAIGN_STATUS_META, campaign.status);
                  const lastRun = campaign.lastRun;
                  return (
                    <tr key={campaign.id}>
                      <td>
                        <Link href={`/workspace/discovery/${campaign.id}`}>
                          {campaign.name}
                        </Link>
                        <div>
                          <CardText>
                            {campaign.createdByName || campaign.createdByEmail || '—'}
                          </CardText>
                        </div>
                      </td>
                      <td>
                        <Badge $tone={status.tone}>{status.label}</Badge>
                      </td>
                      <td>{PROVIDER_LABELS[campaign.provider] || campaign.provider}</td>
                      <td>{FREQUENCY_LABELS[campaign.frequency] || campaign.frequency}</td>
                      <td>
                        {formatCount(campaign.prospectCount)} total
                        <div>
                          <CardText>
                            {formatCount(campaign.pendingCount)} pending ·{' '}
                            {formatCount(campaign.approvedCount)} approved
                          </CardText>
                        </div>
                      </td>
                      <td>
                        {lastRun ? (
                          <>
                            <Badge $tone={metaFor(RUN_STATUS_META, lastRun.status).tone}>
                              {metaFor(RUN_STATUS_META, lastRun.status).label}
                            </Badge>
                            <div>
                              <CardText>
                                {formatDateTime(lastRun.startedAt, timezone)}
                              </CardText>
                            </div>
                          </>
                        ) : (
                          <span>Not run yet</span>
                        )}
                        {campaign.lastError ? (
                          <div>
                            <CardText>{campaign.lastError}</CardText>
                          </div>
                        ) : null}
                      </td>
                      <td>
                        <LinkButton href={`/workspace/discovery/${campaign.id}`}>
                          Open
                        </LinkButton>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          </TableWrap>
        )}

        <ListPager
          page={campaigns.page}
          pages={campaigns.pages}
          total={campaigns.total}
          pageSize={campaigns.pageSize}
          hrefFor={(page) => hrefFor(query, page)}
        />
      </Card>

      <Card>
        <CardHead>
          <div>
            <CardTitle>How discovery stays honest</CardTitle>
            <CardText>
              Provider facts, source observations and AI hypotheses are stored
              separately. Confidence scores are estimates, not proof.
            </CardText>
          </div>
          <ShieldCheck size={20} />
        </CardHead>
        <CardText>
          Campaigns pause automatically when the source is unreachable. The review
          queue blocks approval when a matching lead already exists, and no outreach
          is sent from this module — you call the shots.
        </CardText>
      </Card>
    </Page>
  );
}
