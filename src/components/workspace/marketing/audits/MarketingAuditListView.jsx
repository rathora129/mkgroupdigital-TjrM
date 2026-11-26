'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Globe2, Search, ShieldCheck } from 'lucide-react';
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
  FilterChip,
  FilterField,
  ListPager,
} from '@/components/workspace/phase2c/ui';
import { AUDIT_STATUS_META, metaFor } from '@/components/workspace/phase2c/meta';
import { formatDateTime } from '@/lib/ai/format';
import { AUDIT_STATUSES } from '@/lib/audits/validation';
import MarketingNav from '../MarketingNav';

const KEYS = ['status', 'search', 'page'];

function listHref(query, overrides = {}) {
  const merged = { ...query, page: 1, ...overrides };
  const search = new URLSearchParams();
  for (const key of KEYS) {
    const value = merged[key];
    if (value === undefined || value === null || value === '') continue;
    if (key === 'page' && Number(value) <= 1) continue;
    search.set(key, String(value));
  }
  const text = search.toString();
  return text
    ? `/workspace/marketing/audits?${text}`
    : '/workspace/marketing/audits';
}

export default function MarketingAuditListView({
  audits,
  overview,
  findingsOverview,
  query,
  canManage,
  timezone,
}) {
  const router = useRouter();
  const { items, total, page, pages, pageSize } = audits;

  function submitFilters(event) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    router.push(
      listHref({
        ...query,
        search: String(data.get('search') || '').trim() || undefined,
      }),
    );
  }

  return (
    <Page>
      <Header>
        <Eyebrow>SEO findings</Eyebrow>
        <Title>Website audits and SEO findings</Title>
        <Lead>
          Findings are tied to a real website audit. Each one keeps its source —
          verified, manually entered, an AI suggestion or unverified — and can be
          turned into a project task. A finding is never proof the website
          changed.
        </Lead>
      </Header>
      <MarketingNav />

      <Notice $tone="info">
        <span>
          Audits fetch a bounded set of public pages. Verified findings come from
          the local audit engine; AI suggestions and unverified notes are labelled
          and are not measured facts.
        </span>
      </Notice>

      <StatGrid>
        <StatCard>
          <StatLabel>Audits</StatLabel>
          <StatValue>{overview.total}</StatValue>
          <StatNote>{overview.completed} completed</StatNote>
        </StatCard>
        <StatCard>
          <StatLabel>Findings</StatLabel>
          <StatValue>{findingsOverview.total}</StatValue>
          <StatNote>{findingsOverview.openFindings} open or in progress</StatNote>
        </StatCard>
        <StatCard>
          <StatLabel>Verified</StatLabel>
          <StatValue>{findingsOverview.sourceCounts.verified || 0}</StatValue>
          <StatNote>From the audit engine</StatNote>
        </StatCard>
        <StatCard>
          <StatLabel>Unverified / AI</StatLabel>
          <StatValue>
            {(findingsOverview.sourceCounts.unverified || 0) +
              (findingsOverview.sourceCounts.ai_suggestion || 0)}
          </StatValue>
          <StatNote>Not measured facts</StatNote>
        </StatCard>
      </StatGrid>

      <Card>
        <CardHead>
          <div>
            <CardTitle>Audits</CardTitle>
            <CardText>
              {total} {total === 1 ? 'audit' : 'audits'} match the filters. Open an
              audit to manage its findings.
            </CardText>
          </div>
          <Actions>
            <LinkButton href="/workspace/website-audits">
              <ShieldCheck size={15} />
              Queue a website audit
            </LinkButton>
          </Actions>
        </CardHead>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          <FilterChip
            href={listHref(query, { status: undefined })}
            $active={!query.status}
          >
            All
          </FilterChip>
          {AUDIT_STATUSES.map((status) => (
            <FilterChip
              key={status}
              href={listHref(query, { status })}
              $active={query.status === status}
            >
              {metaFor(AUDIT_STATUS_META, status).label}
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
          <Actions>
            <Button type="submit">
              <Search size={14} />
              Apply
            </Button>
            <Button
              type="button"
              $variant="ghost"
              onClick={() => router.push('/workspace/marketing/audits')}
            >
              Reset
            </Button>
          </Actions>
        </FilterBar>

        {items.length === 0 ? (
          <EmptyState>
            <Globe2 size={17} aria-hidden="true" />
            <div>
              <h3>No audits match these filters</h3>
              <p>
                Queue a website audit first. Findings can be added to any audit
                that exists in this workspace.
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
                  <th />
                </tr>
              </thead>
              <tbody>
                {items.map((audit) => {
                  const status = metaFor(AUDIT_STATUS_META, audit.status);
                  return (
                    <tr key={audit.id}>
                      <td>
                        <Link href={`/workspace/marketing/audits/${audit.id}`}>
                          {audit.domain}
                        </Link>
                        <div style={{ fontSize: '0.72rem', color: '#64748B' }}>
                          {audit.normalizedUrl}
                        </div>
                      </td>
                      <td>
                        <Badge $tone={status.tone}>{status.label}</Badge>
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
                      <td>
                        <Link href={`/workspace/marketing/audits/${audit.id}`}>
                          Findings
                        </Link>
                      </td>
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

      <CardText>
        {canManage
          ? 'Your role can add and update findings and convert them into tasks.'
          : 'Your role can review findings but cannot edit them.'}
      </CardText>
    </Page>
  );
}
