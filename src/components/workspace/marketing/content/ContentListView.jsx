'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { PenLine, Plus, Search } from 'lucide-react';
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
  Page,
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
import { formatDateTime } from '@/lib/ai/format';
import { CONTENT_TYPE_LABELS } from '@/lib/marketing/constants';
import MarketingNav from '../MarketingNav';
import {
  CONTENT_STATUS_META,
  CONTENT_STATUS_ORDER,
  dateInputValue,
  metaFor,
} from '../meta';

const KEYS = ['status', 'clientId', 'search', 'page'];

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
    ? `/workspace/marketing/content?${text}`
    : '/workspace/marketing/content';
}

export default function ContentListView({
  content,
  query,
  clients,
  canManage,
  timezone,
}) {
  const router = useRouter();
  const { items, total, page, pages, pageSize } = content;

  function submitFilters(event) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    router.push(
      listHref({
        ...query,
        search: String(data.get('search') || '').trim() || undefined,
        clientId: String(data.get('clientId') || '') || undefined,
      }),
    );
  }

  return (
    <Page>
      <Header>
        <Eyebrow>Content workflow</Eyebrow>
        <Title>Content drafts and reviews</Title>
        <Lead>
          Every edit appends a new version. Approval is recorded against a
          specific version, and scheduling is an internal calendar entry — never
          a post.
        </Lead>
      </Header>
      <MarketingNav />

      <Card>
        <CardHead>
          <div>
            <CardTitle>Content</CardTitle>
            <CardText>
              {total} item(s) match the filters. Showing page {page} of {pages}.
            </CardText>
          </div>
          <Actions>
            <LinkButton href="/workspace/marketing/calendar">
              Calendar view
            </LinkButton>
            {canManage ? (
              <LinkButton href="/workspace/marketing/content/new" $primary>
                <Plus size={15} />
                New content
              </LinkButton>
            ) : null}
          </Actions>
        </CardHead>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          <FilterChip href={listHref(query, { status: undefined })} $active={!query.status}>
            All states
          </FilterChip>
          {CONTENT_STATUS_ORDER.map((status) => (
            <FilterChip
              key={status}
              href={listHref(query, { status })}
              $active={query.status === status}
            >
              {CONTENT_STATUS_META[status].label}
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
              placeholder="Title, client or campaign"
            />
          </FilterField>
          <FilterField>
            <span>Client</span>
            <select name="clientId" defaultValue={query.clientId || ''}>
              <option value="">All clients</option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.companyName}
                </option>
              ))}
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
              onClick={() => router.push('/workspace/marketing/content')}
            >
              Reset
            </Button>
          </Actions>
        </FilterBar>

        {items.length === 0 ? (
          <EmptyState>
            <PenLine size={17} aria-hidden="true" />
            <div>
              <h3>No content matches these filters</h3>
              <p>
                Create a draft or an idea. Nothing is generated or published
                automatically.
              </p>
            </div>
          </EmptyState>
        ) : (
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <th>Content</th>
                  <th>Client</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Version</th>
                  <th>Planned date</th>
                  <th>Owner</th>
                  <th>Updated</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const status = metaFor(CONTENT_STATUS_META, item.status);
                  return (
                    <tr key={item.id}>
                      <td>
                        <Link href={`/workspace/marketing/content/${item.id}`}>
                          {item.title}
                        </Link>
                        {item.campaignName ? (
                          <div style={{ fontSize: '0.72rem', color: '#64748B' }}>
                            {item.campaignName}
                          </div>
                        ) : null}
                      </td>
                      <td>{item.clientName}</td>
                      <td>{CONTENT_TYPE_LABELS[item.contentType] || item.contentType}</td>
                      <td>
                        <Badge $tone={status.tone}>{status.label}</Badge>
                      </td>
                      <td>
                        v{item.latestVersion}
                        {item.approvedVersion
                          ? ` · approved v${item.approvedVersion}`
                          : ''}
                      </td>
                      <td>
                        {item.scheduledFor
                          ? dateInputValue(item.scheduledFor)
                          : '—'}
                      </td>
                      <td>{item.ownerName || 'Unassigned'}</td>
                      <td>{formatDateTime(item.updatedAt, timezone)}</td>
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
    </Page>
  );
}
