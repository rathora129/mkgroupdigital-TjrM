'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  BadgeCheck,
  CircleAlert,
  Plus,
  Search,
  Sparkles,
  X,
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
  Hint,
  Lead,
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
import { formatDateTime } from '@/lib/ai/format';
import ResearchForm from './ResearchForm';
import {
  FilterBar,
  FilterChip,
  FilterField,
  ListPager,
} from '@/components/workspace/phase2c/ui';
import {
  RESEARCH_STATUS_META,
  RESEARCH_SUBJECT_LABELS,
  metaFor,
} from '@/components/workspace/phase2c/meta';

const FILTERS = [
  { key: undefined, label: 'All' },
  { key: 'awaiting_approval', label: 'Awaiting approval' },
  { key: 'queued', label: 'Queued' },
  { key: 'running', label: 'Running' },
  { key: 'completed', label: 'Completed' },
  { key: 'failed', label: 'Failed' },
  { key: 'cancelled', label: 'Cancelled' },
];

const LIST_KEYS = ['search', 'status', 'subjectType', 'leadId', 'page'];

function listHref(query, overrides = {}) {
  const merged = { ...query, page: 1, ...overrides };
  const search = new URLSearchParams();
  for (const key of LIST_KEYS) {
    const value = merged[key];
    if (value === undefined || value === null || value === '') continue;
    if (key === 'page' && Number(value) <= 1) continue;
    search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `/workspace/research?${text}` : '/workspace/research';
}

export default function ResearchView({
  jobs,
  overview,
  agents,
  leads,
  query,
  canCreate,
  runtimeConfigured,
  presetLeadId,
  presetLeadName,
  timezone,
}) {
  const router = useRouter();
  const [showCreate, setShowCreate] = useState(Boolean(presetLeadId));
  const [failure, setFailure] = useState(null);
  const { items, total, page, pages, pageSize } = jobs;

  function submitFilters(event) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const overrides = {};
    for (const key of ['search', 'subjectType']) {
      const value = String(data.get(key) ?? '').trim();
      overrides[key] = value || undefined;
    }
    overrides.leadId = query.leadId;
    router.push(listHref(overrides));
  }

  function handleCreated(job) {
    setFailure(null);
    router.push(`/workspace/research/${job.id}`);
  }

  return (
    <Page>
      <Header>
        <Eyebrow>Business research</Eyebrow>
        <Title>Evidence-based research briefs</Title>
        <Lead>
          Research runs fetch one supplied website and any linked CRM record,
          then ask a configured agent for a structured brief. Findings are
          labelled verified, source-derived, AI analysis or unverified; nothing
          is presented as fact without a source.
        </Lead>
      </Header>

      {!runtimeConfigured ? (
        <Notice $tone="warning">
          <CircleAlert size={15} />
          <span>
            <strong>AI execution is not configured on this server.</strong> You
            can prepare a research job, but it will be marked failed with
            AI_NOT_CONFIGURED until an operator adds a provider key to the
            environment.
          </span>
        </Notice>
      ) : null}

      {presetLeadId ? (
        <Notice $tone="info">
          <span>
            Starting research for{' '}
            <strong>{presetLeadName || 'the selected lead'}</strong>. The lead
            record will be attached as a research source.
          </span>
        </Notice>
      ) : null}

      {failure ? (
        <Notice $tone="danger">
          <CircleAlert size={15} />
          {failure}
        </Notice>
      ) : null}

      <StatGrid>
        <StatCard>
          <StatLabel>Research jobs</StatLabel>
          <StatValue>{overview.total}</StatValue>
          <StatNote>{overview.completed} completed</StatNote>
        </StatCard>
        <StatCard>
          <StatLabel>Active</StatLabel>
          <StatValue>{overview.active}</StatValue>
          <StatNote>Queued, running or awaiting approval</StatNote>
        </StatCard>
        <StatCard>
          <StatLabel>Awaiting approval</StatLabel>
          <StatValue>{overview.byStatus.awaiting_approval || 0}</StatValue>
          <StatNote>Review in the approvals queue</StatNote>
        </StatCard>
        <StatCard>
          <StatLabel>Last requested</StatLabel>
          <StatValue style={{ fontSize: '0.9rem' }}>
            {overview.lastCreatedAt
              ? formatDateTime(overview.lastCreatedAt, timezone)
              : 'No runs yet'}
          </StatValue>
          <StatNote>Workspace-scoped</StatNote>
        </StatCard>
      </StatGrid>

      <Card>
        <CardHead>
          <div>
            <CardTitle>Research jobs</CardTitle>
            <CardText>
              {total} {total === 1 ? 'job' : 'jobs'} match the current filters.
              Showing page {page} of {pages}.
            </CardText>
          </div>
          <Actions>
            {canCreate ? (
              <Button
                type="button"
                $variant="primary"
                onClick={() => setShowCreate((current) => !current)}
              >
                {showCreate ? <X size={15} /> : <Plus size={15} />}
                {showCreate ? 'Close form' : 'New research'}
              </Button>
            ) : null}
          </Actions>
        </CardHead>

        {showCreate && canCreate ? (
          <div
            style={{
              padding: 16,
              border: '1px solid #E5EAF1',
              borderRadius: 12,
              background: '#FFFFFF',
            }}
          >
            <CardTitle style={{ marginBottom: 12 }}>Start research</CardTitle>
            <ResearchForm
              agents={agents}
              leads={leads}
              presetLeadId={presetLeadId}
              onDone={handleCreated}
              onCancel={() => setShowCreate(false)}
            />
          </div>
        ) : null}

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {FILTERS.map((filter) => (
            <FilterChip
              key={filter.key || 'all'}
              href={listHref(query, { status: filter.key })}
              $active={(query.status || undefined) === filter.key}
            >
              {filter.label}
            </FilterChip>
          ))}
        </div>

        <FilterBar key={JSON.stringify(query)} onSubmit={submitFilters}>
          <FilterField>
            <span>Search</span>
            <input
              type="search"
              name="search"
              defaultValue={query.search || ''}
              placeholder="Company, website, objective"
            />
          </FilterField>
          <FilterField>
            <span>Subject</span>
            <select name="subjectType" defaultValue={query.subjectType || ''}>
              <option value="">Any subject</option>
              <option value="company">Company</option>
              <option value="website">Website</option>
              <option value="industry">Industry</option>
              <option value="lead">CRM lead</option>
            </select>
          </FilterField>
          <Actions>
            <Button type="submit">
              <Search size={14} />
              Apply
            </Button>
            <Button
              type="button"
              $variant="ghost"
              onClick={() => router.push('/workspace/research')}
            >
              Reset
            </Button>
          </Actions>
        </FilterBar>

        {items.length === 0 ? (
          <EmptyState>
            <Sparkles size={17} aria-hidden="true" />
            <div>
              <h3>No research jobs yet</h3>
              <p>
                Start a job with a company, website or CRM lead. The brief
                appears here with its sources, findings and verification status.
              </p>
            </div>
          </EmptyState>
        ) : (
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <th>Subject</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Findings</th>
                  <th>Sources</th>
                  <th>Requested by</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {items.map((job) => {
                  const status = metaFor(RESEARCH_STATUS_META, job.status);
                  const subject =
                    job.companyName || job.websiteUrl || 'Linked CRM lead';
                  return (
                    <tr key={job.id}>
                      <td>
                        <Link href={`/workspace/research/${job.id}`}>
                          {subject}
                        </Link>
                        <div style={{ fontSize: '0.72rem', color: '#64748B' }}>
                          {job.objective.length > 90
                            ? `${job.objective.slice(0, 90)}…`
                            : job.objective}
                        </div>
                      </td>
                      <td>
                        {RESEARCH_SUBJECT_LABELS[job.subjectType] ||
                          job.subjectType}
                      </td>
                      <td>
                        <Badge $tone={status.tone}>{status.label}</Badge>
                      </td>
                      <td>{job.output?.findingCount ?? '—'}</td>
                      <td>{job.sourceCount}</td>
                      <td>
                        {job.requestedByName ||
                          job.requestedByEmail ||
                          'Unknown'}
                      </td>
                      <td>{formatDateTime(job.createdAt, timezone)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          </TableWrap>
        )}

        <ListPager
          page={page}
          pages={pages}
          total={total}
          pageSize={pageSize}
          hrefFor={(target) => listHref(query, { page: target })}
        />
      </Card>

      <Hint>
        <BadgeCheck size={13} style={{ verticalAlign: '-2px' }} /> A completed
        job stores its findings and source references. A research brief is a
        draft for a person to verify, not a guarantee about the business.
      </Hint>
    </Page>
  );
}
