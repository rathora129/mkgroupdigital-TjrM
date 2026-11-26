'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CircleAlert, Globe2, Plus, Search, X } from 'lucide-react';
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
import AuditForm from './AuditForm';
import {
  FilterBar,
  FilterChip,
  FilterField,
  ListPager,
} from '@/components/workspace/phase2c/ui';
import {
  AUDIT_STATUS_META,
  metaFor,
} from '@/components/workspace/phase2c/meta';

const FILTERS = [
  { key: undefined, label: 'All' },
  { key: 'queued', label: 'Queued' },
  { key: 'running', label: 'Running' },
  { key: 'completed', label: 'Completed' },
  { key: 'failed', label: 'Failed' },
  { key: 'cancelled', label: 'Cancelled' },
];

const LIST_KEYS = ['search', 'status', 'domain', 'page'];

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
  return text ? `/workspace/website-audits?${text}` : '/workspace/website-audits';
}

export default function AuditsView({
  audits,
  overview,
  query,
  canCreate,
  timezone,
}) {
  const router = useRouter();
  const [showCreate, setShowCreate] = useState(false);
  const [failure, setFailure] = useState(null);
  const { items, total, page, pages, pageSize } = audits;

  function submitFilters(event) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    router.push(
      listHref({
        status: query.status,
        search: String(data.get('search') ?? '').trim() || undefined,
        domain: String(data.get('domain') ?? '').trim() || undefined,
      }),
    );
  }

  function handleCreated(audit) {
    setFailure(null);
    router.push(`/workspace/website-audits/${audit.id}`);
  }

  return (
    <Page>
      <Header>
        <Eyebrow>Website audits</Eyebrow>
        <Title>Real, bounded website audits</Title>
        <Lead>
          Each audit fetches a small number of public pages from the submitted
          domain and reports what it actually observed: technical SEO, on-page
          SEO, performance signals, structured data, accessibility and security
          signals.
        </Lead>
      </Header>

      {failure ? (
        <Notice $tone="danger">
          <CircleAlert size={15} />
          {failure}
        </Notice>
      ) : null}

      <Notice $tone="info">
        <span>
          Scores come from a documented heuristic penalty model applied to the
          findings. This is not PageSpeed Insights, Lighthouse or a Core Web
          Vitals measurement, and no such metric is claimed.
        </span>
      </Notice>

      <StatGrid>
        <StatCard>
          <StatLabel>Audits</StatLabel>
          <StatValue>{overview.total}</StatValue>
          <StatNote>{overview.completed} completed</StatNote>
        </StatCard>
        <StatCard>
          <StatLabel>Active</StatLabel>
          <StatValue>{overview.active}</StatValue>
          <StatNote>Queued or running</StatNote>
        </StatCard>
        <StatCard>
          <StatLabel>Average score</StatLabel>
          <StatValue>
            {overview.averageScore == null ? '—' : `${overview.averageScore}/100`}
          </StatValue>
          <StatNote>Completed audits only</StatNote>
        </StatCard>
        <StatCard>
          <StatLabel>Last requested</StatLabel>
          <StatValue style={{ fontSize: '0.9rem' }}>
            {overview.lastCreatedAt
              ? formatDateTime(overview.lastCreatedAt, timezone)
              : 'No audits yet'}
          </StatValue>
          <StatNote>Workspace-scoped</StatNote>
        </StatCard>
      </StatGrid>

      <Card>
        <CardHead>
          <div>
            <CardTitle>Audits</CardTitle>
            <CardText>
              {total} {total === 1 ? 'audit' : 'audits'} match the current
              filters. Showing page {page} of {pages}.
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
                {showCreate ? 'Close form' : 'New audit'}
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
            <CardTitle style={{ marginBottom: 12 }}>Queue a website audit</CardTitle>
            <AuditForm
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
              placeholder="URL or domain"
            />
          </FilterField>
          <FilterField>
            <span>Domain</span>
            <input
              type="search"
              name="domain"
              defaultValue={query.domain || ''}
              placeholder="example.com"
            />
          </FilterField>
          <Actions>
            <Button type="submit">
              <Search size={14} />
              Apply
            </Button>
            <Button
              type="button"
              $variant="ghost"
              onClick={() => router.push('/workspace/website-audits')}
            >
              Reset
            </Button>
          </Actions>
        </FilterBar>

        {items.length === 0 ? (
          <EmptyState>
            <Globe2 size={17} aria-hidden="true" />
            <div>
              <h3>No audits yet</h3>
              <p>
                Submit a public website to queue an audit. The background worker
                fetches it safely and stores findings, pages and logs.
              </p>
            </div>
          </EmptyState>
        ) : (
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <th>Website</th>
                  <th>Status</th>
                  <th>Score</th>
                  <th>Pages</th>
                  <th>Requested by</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {items.map((audit) => {
                  const status = metaFor(AUDIT_STATUS_META, audit.status);
                  return (
                    <tr key={audit.id}>
                      <td>
                        <Link href={`/workspace/website-audits/${audit.id}`}>
                          {audit.domain}
                        </Link>
                        <div style={{ fontSize: '0.72rem', color: '#64748B' }}>
                          {audit.normalizedUrl}
                        </div>
                      </td>
                      <td>
                        <Badge $tone={status.tone}>{status.label}</Badge>
                        {audit.cancelRequested &&
                        audit.status !== 'cancelled' ? (
                          <>
                            {' '}
                            <Badge $tone="warning">Cancelling</Badge>
                          </>
                        ) : null}
                      </td>
                      <td>
                        {audit.overallScore == null
                          ? '—'
                          : `${audit.overallScore}/100`}
                      </td>
                      <td>
                        {audit.pagesScanned || 0} / {audit.maxPages}
                      </td>
                      <td>
                        {audit.requestedByName ||
                          audit.requestedByEmail ||
                          'Unknown'}
                      </td>
                      <td>{formatDateTime(audit.createdAt, timezone)}</td>
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
        Crawling uses a conservative page limit, a small delay between requests,
        robots.txt checks, response-size caps and timeouts. Open audits can be
        cancelled from their detail page.
      </Hint>
    </Page>
  );
}
