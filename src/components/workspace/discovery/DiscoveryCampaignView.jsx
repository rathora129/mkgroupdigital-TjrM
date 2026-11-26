'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  Loader2,
  Pause,
  Pencil,
  Play,
  RefreshCw,
  RotateCcw,
  XCircle,
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
import { ListPager, MetaGrid } from '@/components/workspace/phase2c/ui';
import { formatCents, formatDateTime } from '@/lib/ai/format';
import DiscoveryForm from '@/components/workspace/discovery/DiscoveryForm';
import {
  CAMPAIGN_STATUS_META,
  FREQUENCY_LABELS,
  PROSPECT_STATUS_META,
  PROVIDER_LABELS,
  RUN_STATUS_META,
  TEMPERATURE_META,
  formatCount,
  metaFor,
} from '@/components/workspace/discovery/meta';

function prospectHref(campaignId, page = 1) {
  const params = new URLSearchParams();
  params.set('campaignId', campaignId);
  params.set('status', 'all');
  if (page > 1) params.set('page', String(page));
  return `/workspace/discovery/review?${params.toString()}`;
}

function criteriaSummary(criteria = {}) {
  return [
    criteria.area,
    criteria.city,
    criteria.state,
    criteria.country,
  ]
    .filter(Boolean)
    .join(', ');
}

export default function DiscoveryCampaignView({
  detail,
  prospects,
  canManage,
  canReview,
  timezone,
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [editing, setEditing] = useState(false);

  const { campaign, runs, stats, readiness } = detail;
  const status = metaFor(CAMPAIGN_STATUS_META, campaign.status);
  const closed = ['cancelled', 'completed'].includes(campaign.status);
  const editable = ['draft', 'paused'].includes(campaign.status);
  const providerConfigured = (readiness?.providers || []).some(
    (provider) => provider.key === campaign.provider && provider.configured,
  );

  function clearMessages() {
    setError(null);
    setNotice(null);
  }

  async function act(path, successMessage, confirmation) {
    if (confirmation && !window.confirm(confirmation)) return;
    setBusy(path);
    clearMessages();
    try {
      await apiRequest(`/api/workforce/discovery/${campaign.id}${path}`, {
        method: 'POST',
      });
      setNotice(successMessage);
      router.refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <Page>
      <Header>
        <Eyebrow>
          <Link href="/workspace/discovery">AI discovery</Link> / Campaign
        </Eyebrow>
        <Title>{campaign.name}</Title>
        <Lead>
          {criteriaSummary(campaign.criteria) || 'No location set'} ·{' '}
          {campaign.criteria?.industry || 'No industry'}
        </Lead>
        <Actions>
          <Badge $tone={status.tone}>{status.label}</Badge>
          <Badge $tone={providerConfigured ? 'success' : 'warning'}>
            {PROVIDER_LABELS[campaign.provider] || campaign.provider}
            {providerConfigured ? '' : ' · not configured'}
          </Badge>
          <Badge $tone="muted">{FREQUENCY_LABELS[campaign.frequency]}</Badge>
        </Actions>
      </Header>

      {!providerConfigured ? (
        <Notice $tone="warning">
          <AlertTriangle size={16} />
          <span>
            The {PROVIDER_LABELS[campaign.provider] || campaign.provider} source is
            not configured. Runs are blocked until its API key is added. Discovery
            never fabricates businesses.
          </span>
        </Notice>
      ) : null}

      {error ? (
        <Notice $tone="danger">
          <XCircle size={16} />
          <span>{error}</span>
        </Notice>
      ) : null}
      {notice ? (
        <Notice $tone="success">
          <CheckCircle2 size={16} />
          <span>{notice}</span>
        </Notice>
      ) : null}

      {canManage ? (
        <Actions>
          {campaign.status === 'draft' ? (
            <Button
              $variant="primary"
              disabled={Boolean(busy) || !providerConfigured}
              onClick={() => act('/start', 'Campaign started.')}
            >
              {busy === '/start' ? <Loader2 size={16} /> : <Play size={16} />} Start
            </Button>
          ) : null}
          {campaign.status === 'active' ? (
            <Button disabled={Boolean(busy)} onClick={() => act('/pause', 'Campaign paused.')}>
              {busy === '/pause' ? <Loader2 size={16} /> : <Pause size={16} />} Pause
            </Button>
          ) : null}
          {campaign.status === 'paused' ? (
            <Button
              disabled={Boolean(busy) || !providerConfigured}
              onClick={() => act('/resume', 'Campaign resumed.')}
            >
              {busy === '/resume' ? <Loader2 size={16} /> : <Play size={16} />} Resume
            </Button>
          ) : null}
          {!closed ? (
            <Button
              disabled={Boolean(busy) || !providerConfigured}
              onClick={() =>
                act(
                  '/run',
                  'Discovery run queued. It will appear below once the worker picks it up.',
                )
              }
            >
              {busy === '/run' ? <Loader2 size={16} /> : <RefreshCw size={16} />} Run now
            </Button>
          ) : null}
          {editable ? (
            <Button onClick={() => setEditing((value) => !value)} disabled={Boolean(busy)}>
              <Pencil size={16} /> Edit targeting
            </Button>
          ) : null}
          {!closed ? (
            <Button
              $variant="danger"
              disabled={Boolean(busy)}
              onClick={() =>
                act(
                  '/cancel',
                  'Campaign cancelled. Discovered prospects are retained.',
                  'Cancel this campaign? Existing prospects and ledgers are kept.',
                )
              }
            >
              {busy === '/cancel' ? <Loader2 size={16} /> : <Ban size={16} />} Cancel
            </Button>
          ) : null}
          {canReview ? (
            <LinkButton href={`/workspace/discovery/review?campaignId=${campaign.id}`}>
              Review queue
            </LinkButton>
          ) : null}
        </Actions>
      ) : null}

      {editing && editable && canManage ? (
        <Card>
          <CardHead>
            <div>
              <CardTitle>Edit targeting</CardTitle>
              <CardText>Changes apply to the next run. Pause the campaign to edit.</CardText>
            </div>
          </CardHead>
          <DiscoveryForm
            campaign={campaign}
            readiness={readiness}
            onDone={() => {
              setEditing(false);
              setNotice('Campaign updated.');
              router.refresh();
            }}
            onCancel={() => setEditing(false)}
          />
        </Card>
      ) : null}

      <StatGrid>
        <StatCard>
          <StatLabel>Prospects</StatLabel>
          <StatValue>{formatCount(stats.prospects)}</StatValue>
          <StatNote>All statuses</StatNote>
        </StatCard>
        <StatCard>
          <StatLabel>Pending review</StatLabel>
          <StatValue>{formatCount(stats.byStatus?.pending_review || 0)}</StatValue>
          <StatNote>Awaiting a human decision</StatNote>
        </StatCard>
        <StatCard>
          <StatLabel>Approved</StatLabel>
          <StatValue>{formatCount(stats.byStatus?.approved || 0)}</StatValue>
          <StatNote>Added to the CRM as leads</StatNote>
        </StatCard>
        <StatCard>
          <StatLabel>Hot / warm</StatLabel>
          <StatValue>
            {formatCount(stats.temperatures?.hot || 0)} /{' '}
            {formatCount(stats.temperatures?.warm || 0)}
          </StatValue>
          <StatNote>{formatCount(stats.temperatures?.cold || 0)} cold</StatNote>
        </StatCard>
      </StatGrid>

      <Card>
        <CardHead>
          <div>
            <CardTitle>Campaign settings</CardTitle>
            <CardText>Targeting, limits and schedule for the next run.</CardText>
          </div>
        </CardHead>
        <MetaGrid>
          <div>
            <dt>Source</dt>
            <dd>{PROVIDER_LABELS[campaign.provider] || campaign.provider}</dd>
          </div>
          <div>
            <dt>Schedule</dt>
            <dd>{FREQUENCY_LABELS[campaign.frequency]}</dd>
          </div>
          <div>
            <dt>Daily qualified limit</dt>
            <dd>{campaign.dailyLimit}</dd>
          </div>
          <div>
            <dt>Max research ops</dt>
            <dd>{campaign.maxResearchOps}</dd>
          </div>
          <div>
            <dt>AI budget</dt>
            <dd>{categoryBudget(campaign.budgetCents)}</dd>
          </div>
          <div>
            <dt>Next run</dt>
            <dd>{campaign.nextRunAt ? formatDateTime(campaign.nextRunAt, timezone) : '—'}</dd>
          </div>
          <div>
            <dt>Start / end</dt>
            <dd>
              {campaign.startDate ? formatDateTime(campaign.startDate, timezone) : '—'} →{' '}
              {campaign.endDate ? formatDateTime(campaign.endDate, timezone) : '—'}
            </dd>
          </div>
          <div>
            <dt>Created by</dt>
            <dd>{campaign.createdByName || campaign.createdByEmail || '—'}</dd>
          </div>
          <div>
            <dt>Industry</dt>
            <dd>{campaign.criteria?.industry || '—'}</dd>
          </div>
          <div>
            <dt>Website filter</dt>
            <dd>{campaign.criteria?.websitePresence || 'any'}</dd>
          </div>
          <div>
            <dt>Services</dt>
            <dd>{(campaign.services || []).join(', ') || '—'}</dd>
          </div>
          <div>
            <dt>Keywords</dt>
            <dd>{campaign.criteria?.keywords || '—'}</dd>
          </div>
          <div>
            <dt>Quality criteria</dt>
            <dd>{campaign.criteria?.qualityCriteria || '—'}</dd>
          </div>
        </MetaGrid>
        {campaign.lastError ? (
          <Notice $tone="danger">
            <AlertTriangle size={16} />
            <span>Last error: {campaign.lastError}</span>
          </Notice>
        ) : null}
      </Card>

      <Card>
        <CardHead>
          <div>
            <CardTitle>Recent runs</CardTitle>
            <CardText>
              Each run records its source usage, duplicates and any provider error.
            </CardText>
          </div>
        </CardHead>
        {runs.length === 0 ? (
          <EmptyState>
            <RotateCcw size={20} />
            <div>
              <h3>No runs yet</h3>
              <p>Use “Run now” or start the campaign to queue the first run.</p>
            </div>
          </EmptyState>
        ) : (
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <th>Started</th>
                  <th>Trigger</th>
                  <th>Status</th>
                  <th>Discovered</th>
                  <th>Duplicates</th>
                  <th>Failed</th>
                  <th>AI cost</th>
                  <th>Error</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => {
                  const runStatus = metaFor(RUN_STATUS_META, run.status);
                  return (
                    <tr key={run.id}>
                      <td>{formatDateTime(run.startedAt, timezone)}</td>
                      <td>{run.trigger}</td>
                      <td>
                        <Badge $tone={runStatus.tone}>{runStatus.label}</Badge>
                      </td>
                      <td>{formatCount(run.discoveredCount)}</td>
                      <td>{formatCount(run.duplicateCount)}</td>
                      <td>{formatCount(run.failedCount)}</td>
                      <td>
                        {run.usage?.costCents != null
                          ? formatCents(run.usage.costCents)
                          : '—'}
                      </td>
                      <td>{run.errorMessage || '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          </TableWrap>
        )}
      </Card>

      <Card>
        <CardHead>
          <div>
            <CardTitle>Prospects</CardTitle>
            <CardText>Every candidate this campaign has discovered.</CardText>
          </div>
          {canReview ? (
            <LinkButton href={prospectHref(campaign.id)}>Open in review queue</LinkButton>
          ) : null}
        </CardHead>

        {prospects.items.length === 0 ? (
          <EmptyState>
            <RotateCcw size={20} />
            <div>
              <h3>No prospects yet</h3>
              <p>
                Prospects appear here after a run completes. Duplicates are recorded
                but never merged automatically.
              </p>
            </div>
          </EmptyState>
        ) : (
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <th>Business</th>
                  <th>Location</th>
                  <th>Industry</th>
                  <th>Score</th>
                  <th>Temperature</th>
                  <th>Status</th>
                  <th>Discovered</th>
                </tr>
              </thead>
              <tbody>
                {prospects.items.map((prospect) => {
                  const temp = metaFor(TEMPERATURE_META, prospect.temperature);
                  const state = metaFor(PROSPECT_STATUS_META, prospect.status);
                  return (
                    <tr key={prospect.id}>
                      <td>
                        {prospect.businessName}
                        {prospect.website ? (
                          <div>
                            <CardText>{prospect.website}</CardText>
                          </div>
                        ) : null}
                      </td>
                      <td>
                        {[prospect.city, prospect.state, prospect.country]
                          .filter(Boolean)
                          .join(', ') || '—'}
                      </td>
                      <td>{prospect.industry || '—'}</td>
                      <td>{prospect.leadScore ?? '—'}</td>
                      <td>
                        <Badge $tone={temp.tone}>{temp.label}</Badge>
                      </td>
                      <td>
                        <Badge $tone={state.tone}>{state.label}</Badge>
                      </td>
                      <td>{formatDateTime(prospect.discoveryDate, timezone)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          </TableWrap>
        )}

        <ListPager
          page={prospects.page}
          pages={prospects.pages}
          total={prospects.total}
          pageSize={prospects.pageSize}
          hrefFor={(page) => prospectHref(campaign.id, page)}
        />
      </Card>
    </Page>
  );
}

function categoryBudget(cents) {
  const value = Number(cents || 0);
  if (!Number.isFinite(value) || value <= 0) return 'No AI budget (scoring off)';
  return formatCents(value);
}
