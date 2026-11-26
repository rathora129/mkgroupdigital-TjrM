'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Building2,
  CalendarClock,
  LifeBuoy,
  Plus,
  Search,
  Users,
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
  LinkButton,
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
import {
  FilterBar,
  FilterChip,
  FilterField,
  ListPager,
  MetaGrid,
} from '@/components/workspace/phase2c/ui';
import { CLIENT_STATUS_META, metaFor } from './meta';

const STATUS_ORDER = ['active', 'inactive', 'archived'];
const LIST_KEYS = ['search', 'status', 'owner', 'sort', 'direction', 'page'];

function listHref(query, overrides = {}) {
  const merged = { ...query, page: 1, ...overrides };
  const search = new URLSearchParams();
  for (const key of LIST_KEYS) {
    const value = merged[key];
    if (value === undefined || value === null || value === '') continue;
    if (key === 'page' && Number(value) <= 1) continue;
    if (key === 'sort' && value === 'created') continue;
    if (key === 'direction' && value === 'desc') continue;
    search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `/workspace/clients?${text}` : '/workspace/clients';
}

export default function ClientListView({
  clients,
  overview,
  members,
  query,
  canCreate,
  timezone,
}) {
  const router = useRouter();
  const { items, total, page, pages, pageSize } = clients;

  function submitFilters(event) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const overrides = {};
    for (const key of LIST_KEYS) {
      if (key === 'page') continue;
      const value = String(data.get(key) ?? '').trim();
      overrides[key] = value || undefined;
    }
    router.push(listHref(overrides));
  }

  return (
    <Page>
      <Header>
        <Eyebrow>Client relationships</Eyebrow>
        <Title>Clients and ongoing service</Title>
        <Lead>
          One consolidated record per relationship, linked to the originating
          lead, proposals, delivery projects, service engagements and support
          tickets. Duplicate records are never merged automatically.
        </Lead>
      </Header>

      <StatGrid>
        <StatCard>
          <StatLabel>Active clients</StatLabel>
          <StatValue>{overview.active}</StatValue>
          <StatNote>
            {overview.inactive} inactive · {overview.archived} archived ·{' '}
            {overview.newThisMonth} new this month
          </StatNote>
        </StatCard>
        <StatCard>
          <StatLabel>Active engagements</StatLabel>
          <StatValue>{overview.activeEngagements}</StatValue>
          <StatNote>{overview.upcomingRenewals} renew within 30 days</StatNote>
        </StatCard>
        <StatCard>
          <StatLabel>Open tickets</StatLabel>
          <StatValue>{overview.openTickets}</StatValue>
          <StatNote>{overview.overdueTickets} past their due date</StatNote>
        </StatCard>
        <StatCard>
          <StatLabel>Total relationships</StatLabel>
          <StatValue>{overview.total}</StatValue>
          <StatNote>Every status, including archived records</StatNote>
        </StatCard>
      </StatGrid>

      <Card>
        <CardHead>
          <div>
            <CardTitle>Clients</CardTitle>
            <CardText>
              {total} {total === 1 ? 'client' : 'clients'} match the current
              filters. Showing page {page} of {pages}.
            </CardText>
          </div>
          <Actions>
            {canCreate ? (
              <LinkButton href="/workspace/clients/new" $primary>
                <Plus size={15} />
                New client
              </LinkButton>
            ) : null}
          </Actions>
        </CardHead>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          <FilterChip href={listHref(query, { status: undefined })} $active={!query.status}>
            All statuses
          </FilterChip>
          {STATUS_ORDER.map((status) => (
            <FilterChip
              key={status}
              href={listHref(query, { status })}
              $active={query.status === status}
            >
              {CLIENT_STATUS_META[status].label}
            </FilterChip>
          ))}
        </div>

        <FilterBar key={JSON.stringify(query)} onSubmit={submitFilters}>
          <input type="hidden" name="status" value={query.status || ''} />
          <FilterField>
            <span>Search</span>
            <input
              type="search"
              name="search"
              defaultValue={query.search || ''}
              placeholder="Reference, company, contact, email"
            />
          </FilterField>
          <FilterField>
            <span>Owner</span>
            <select name="owner" defaultValue={query.owner || ''}>
              <option value="">Anyone</option>
              <option value="me">Owned by me</option>
              <option value="unassigned">Unassigned</option>
              {members.map((member) => (
                <option key={member.userId} value={member.userId}>
                  {member.name || member.email}
                </option>
              ))}
            </select>
          </FilterField>
          <FilterField>
            <span>Sort by</span>
            <select name="sort" defaultValue={query.sort || 'created'}>
              <option value="created">Created</option>
              <option value="updated">Updated</option>
              <option value="name">Company name</option>
            </select>
          </FilterField>
          <FilterField>
            <span>Direction</span>
            <select name="direction" defaultValue={query.direction || 'desc'}>
              <option value="desc">Descending</option>
              <option value="asc">Ascending</option>
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
              onClick={() => router.push('/workspace/clients')}
            >
              Reset
            </Button>
          </Actions>
        </FilterBar>

        {items.length === 0 ? (
          <EmptyState>
            <Building2 size={17} aria-hidden="true" />
            <div>
              <h3>No clients match these filters</h3>
              <p>
                A client is created explicitly from a won relationship. Links to
                the original lead stay intact; nothing is merged automatically.
              </p>
            </div>
          </EmptyState>
        ) : (
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <th>Client</th>
                  <th>Primary contact</th>
                  <th>Status</th>
                  <th>Owner</th>
                  <th>Projects</th>
                  <th>Engagements</th>
                  <th>Open tickets</th>
                  <th>Updated</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const status = metaFor(CLIENT_STATUS_META, item.status);
                  return (
                    <tr key={item.id}>
                      <td>
                        <Link href={`/workspace/clients/${item.id}`}>
                          {item.companyName}
                        </Link>
                        <div style={{ fontSize: '0.72rem', color: '#64748B' }}>
                          {item.reference}
                        </div>
                      </td>
                      <td>
                        {item.primaryContactName || '—'}
                        {item.email ? (
                          <div style={{ fontSize: '0.72rem', color: '#64748B' }}>
                            {item.email}
                          </div>
                        ) : null}
                      </td>
                      <td>
                        <Badge $tone={status.tone}>{status.label}</Badge>
                      </td>
                      <td>{item.ownerName || item.ownerEmail || 'Unassigned'}</td>
                      <td>{item.projectCount}</td>
                      <td>{item.activeEngagements} active</td>
                      <td>
                        {item.openTickets > 0 ? (
                          <span style={{ color: '#B45309' }}>{item.openTickets}</span>
                        ) : (
                          '0'
                        )}
                      </td>
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

      <Card>
        <CardHead>
          <div>
            <CardTitle>Relationship operations</CardTitle>
            <CardText>
              Service engagements and support tickets are separate from sales
              pipeline and billing amounts.
            </CardText>
          </div>
          <Users size={16} aria-hidden="true" />
        </CardHead>
        <MetaGrid>
          <div>
            <dt>Active engagements</dt>
            <dd>{overview.activeEngagements}</dd>
          </div>
          <div>
            <dt>Renewals in 30 days</dt>
            <dd>{overview.upcomingRenewals}</dd>
          </div>
          <div>
            <dt>Open tickets</dt>
            <dd>{overview.openTickets}</dd>
          </div>
          <div>
            <dt>Overdue tickets</dt>
            <dd>{overview.overdueTickets}</dd>
          </div>
        </MetaGrid>
        <Actions>
          <LinkButton href="/workspace/clients/engagements">
            <CalendarClock size={14} />
            Service engagements
          </LinkButton>
          <LinkButton href="/workspace/support">
            <LifeBuoy size={14} />
            Support queue
          </LinkButton>
        </Actions>
      </Card>

      <Hint>
        A client record is a relationship, not revenue. Commercial and cash
        figures stay on the finance side and are never inferred here.
      </Hint>
    </Page>
  );
}
