'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Plus, Search, Target } from 'lucide-react';
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
import MarketingNav from '../MarketingNav';
import {
  CAMPAIGN_STATUS_META,
  CAMPAIGN_STATUS_ORDER,
  formatMoney,
  metaFor,
} from '../meta';

const KEYS = ['status', 'channel', 'search', 'clientId', 'page'];

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
    ? `/workspace/marketing/campaigns?${text}`
    : '/workspace/marketing/campaigns';
}

export default function CampaignListView({
  campaigns,
  query,
  clients,
  canManage,
  timezone,
}) {
  const router = useRouter();
  const { items, total, page, pages, pageSize } = campaigns;

  function submitFilters(event) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const overrides = {
      search: String(data.get('search') || '').trim() || undefined,
      clientId: String(data.get('clientId') || '') || undefined,
      status: query.status,
      channel: query.channel,
    };
    router.push(listHref(overrides));
  }

  return (
    <Page>
      <Header>
        <Eyebrow>Campaign planning</Eyebrow>
        <Title>Campaign plans</Title>
        <Lead>
          Budgets are estimates for planning only. Approving or scheduling a
          campaign never connects to an ad account, spends money or starts
          delivery.
        </Lead>
      </Header>
      <MarketingNav />

      <Card>
        <CardHead>
          <div>
            <CardTitle>Campaigns</CardTitle>
            <CardText>
              {total} campaign(s) match the filters. Showing page {page} of{' '}
              {pages}.
            </CardText>
          </div>
          <Actions>
            {canManage ? (
              <LinkButton href="/workspace/marketing/campaigns/new" $primary>
                <Plus size={15} />
                New campaign
              </LinkButton>
            ) : null}
          </Actions>
        </CardHead>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          <FilterChip href={listHref(query, { status: undefined })} $active={!query.status}>
            All states
          </FilterChip>
          {CAMPAIGN_STATUS_ORDER.map((status) => (
            <FilterChip
              key={status}
              href={listHref(query, { status })}
              $active={query.status === status}
            >
              {CAMPAIGN_STATUS_META[status].label}
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
              placeholder="Campaign, client or objective"
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
              onClick={() => router.push('/workspace/marketing/campaigns')}
            >
              Reset
            </Button>
          </Actions>
        </FilterBar>

        {items.length === 0 ? (
          <EmptyState>
            <Target size={17} aria-hidden="true" />
            <div>
              <h3>No campaigns match these filters</h3>
              <p>
                Start with a planned campaign for a client with a marketing
                profile.
              </p>
            </div>
          </EmptyState>
        ) : (
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <th>Campaign</th>
                  <th>Client</th>
                  <th>Channel</th>
                  <th>Status</th>
                  <th>Window</th>
                  <th>Budget (estimate)</th>
                  <th>Owner</th>
                  <th>Updated</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const status = metaFor(CAMPAIGN_STATUS_META, item.status);
                  return (
                    <tr key={item.id}>
                      <td>
                        <Link href={`/workspace/marketing/campaigns/${item.id}`}>
                          {item.name}
                        </Link>
                        {item.objective ? (
                          <div style={{ fontSize: '0.72rem', color: '#64748B' }}>
                            {item.objective}
                          </div>
                        ) : null}
                      </td>
                      <td>{item.clientName}</td>
                      <td>{item.channel.replaceAll('_', ' ')}</td>
                      <td>
                        <Badge $tone={status.tone}>{status.label}</Badge>
                      </td>
                      <td>
                        {item.startDate
                          ? new Date(item.startDate).toISOString().slice(0, 10)
                          : '—'}
                        {' → '}
                        {item.endDate
                          ? new Date(item.endDate).toISOString().slice(0, 10)
                          : '—'}
                      </td>
                      <td>{formatMoney(item.budgetEstimate, item.currency)}</td>
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
