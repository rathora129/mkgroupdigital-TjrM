'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { BadgeCheck, CircleAlert, FileText, Filter, Plus, Search } from 'lucide-react';
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
  Notice,
  Page,
  Row,
  StatCard,
  StatGrid,
  StatLabel,
  StatNote,
  StatValue,
  Table,
  TableWrap,
  Title,
} from '@/components/workspace/ai/primitives';
import { formatDate, formatDateTime } from '@/lib/ai/format';
import {
  FilterBar,
  FilterChip,
  FilterField,
  ListPager,
} from '@/components/workspace/phase2c/ui';
import { formatMoney, statusMeta } from './meta';

const STATUS_ORDER = [
  'draft',
  'internal_review',
  'approved',
  'sent',
  'accepted',
  'rejected',
];

const LIST_KEYS = [
  'search',
  'status',
  'owner',
  'validity',
  'sort',
  'direction',
  'page',
];

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
  return text ? `/workspace/proposals?${text}` : '/workspace/proposals';
}

export default function ProposalListView({
  proposals,
  overview,
  owners,
  query,
  canCreate,
  timezone,
}) {
  const router = useRouter();
  const { items, total, page, pages, pageSize } = proposals;

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
        <Eyebrow>Proposals and quotations</Eyebrow>
        <Title>Proposal workspace</Title>
        <Lead>
          Draft, review, approve and send client proposals. Each proposal keeps a
          version history, deterministic pricing and an approval record. Values
          shown here are proposal amounts, never received revenue.
        </Lead>
      </Header>

      <Notice $tone="info">
        <FileText size={15} />
        <span>
          Approved versions are immutable. Create a revision to change a sent or
          approved proposal; the earlier version stays intact.
        </span>
      </Notice>

      <StatGrid>
        <StatCard>
          <StatLabel>Total proposals</StatLabel>
          <StatValue>{overview.total}</StatValue>
          <StatNote>
            {overview.draft} draft · {overview.internalReview} awaiting review
          </StatNote>
        </StatCard>
        <StatCard>
          <StatLabel>Approved or sent</StatLabel>
          <StatValue>{overview.approved + overview.sent}</StatValue>
          <StatNote>
            {formatMoney(overview.proposalValueCents, overview.currency)} proposal
            value · not revenue received
          </StatNote>
        </StatCard>
        <StatCard>
          <StatLabel>Accepted</StatLabel>
          <StatValue>{overview.accepted}</StatValue>
          <StatNote>
            {formatMoney(overview.acceptedValueCents, overview.currency)} accepted
            value
          </StatNote>
        </StatCard>
        <StatCard>
          <StatLabel>Recurring (monthly)</StatLabel>
          <StatValue>
            {formatMoney(overview.recurringMonthlyCents, overview.currency)}
          </StatValue>
          <StatNote>
            {overview.expiring} expiring soon · {overview.expired} expired
          </StatNote>
        </StatCard>
      </StatGrid>

      <Card>
        <CardHead>
          <div>
            <CardTitle>Proposals</CardTitle>
            <CardText>
              {total} {total === 1 ? 'proposal' : 'proposals'} match the current
              filters. Showing page {page} of {pages}.
            </CardText>
          </div>
          <Actions>
            {canCreate ? (
              <LinkButton href="/workspace/proposals/new" $variant="primary">
                <Plus size={15} />
                New proposal
              </LinkButton>
            ) : null}
          </Actions>
        </CardHead>

        <Row>
          <Filter size={14} aria-hidden="true" />
          <span style={{ fontSize: '0.76rem', color: '#64748B' }}>
            Filter by status
          </span>
        </Row>

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
              {statusMeta(status).label}
            </FilterChip>
          ))}
        </div>

        <FilterBar key={JSON.stringify(query)} onSubmit={submitFilters}>
          <input type="hidden" name="status" value={query.status || ''} />
          <input type="hidden" name="validity" value={query.validity || ''} />
          <FilterField>
            <span>Search</span>
            <input
              type="search"
              name="search"
              defaultValue={query.search || ''}
              placeholder="Reference, title, company"
            />
          </FilterField>
          <FilterField>
            <span>Owner</span>
            <select name="owner" defaultValue={query.owner || ''}>
              <option value="">Anyone</option>
              <option value="me">Owned by me</option>
              <option value="unassigned">Unassigned</option>
              {owners.map((owner) => (
                <option key={owner.userId} value={owner.userId}>
                  {owner.name || owner.email}
                </option>
              ))}
            </select>
          </FilterField>
          <FilterField>
            <span>Validity</span>
            <select name="validity" defaultValue={query.validity || ''}>
              <option value="">Any</option>
              <option value="expiring">Expiring in 14 days</option>
              <option value="expired">Expired</option>
            </select>
          </FilterField>
          <FilterField>
            <span>Sort by</span>
            <select name="sort" defaultValue={query.sort || 'created'}>
              <option value="created">Created</option>
              <option value="updated">Updated</option>
              <option value="validity">Validity date</option>
              <option value="value">Contract value</option>
              <option value="status">Status</option>
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
              onClick={() => router.push('/workspace/proposals')}
            >
              Reset
            </Button>
          </Actions>
        </FilterBar>

        {items.length === 0 ? (
          <EmptyState>
            <BadgeCheck size={17} aria-hidden="true" />
            <div>
              <h3>No proposals match these filters</h3>
              <p>
                Create a proposal from an opportunity. Confirmed requirements and
                approved discovery prefill the first draft, and prices always
                start at zero for a human to set.
              </p>
            </div>
          </EmptyState>
        ) : (
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <th>Proposal</th>
                  <th>Opportunity</th>
                  <th>Status</th>
                  <th>Version</th>
                  <th>One-time total</th>
                  <th>Monthly</th>
                  <th>Valid until</th>
                  <th>Owner</th>
                  <th>Updated</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const status = statusMeta(item.displayStatus);
                  const currency = item.versionCurrency || item.currency || 'INR';
                  return (
                    <tr key={item.id}>
                      <td>
                        <Link href={`/workspace/proposals/${item.id}`}>
                          {item.title}
                        </Link>
                        <div style={{ fontSize: '0.72rem', color: '#64748B' }}>
                          {item.reference}
                          {item.companyName ? ` · ${item.companyName}` : ''}
                        </div>
                      </td>
                      <td>
                        <Link href={`/workspace/opportunities/${item.opportunityId}`}>
                          {item.opportunityTitle}
                        </Link>
                        <div style={{ fontSize: '0.72rem', color: '#64748B' }}>
                          {item.opportunityStage}
                        </div>
                      </td>
                      <td>
                        <Badge $tone={status.tone}>{status.label}</Badge>
                        {item.displayStatus === 'expired' ? (
                          <div style={{ fontSize: '0.7rem', color: '#64748B' }}>
                            Validity elapsed
                          </div>
                        ) : null}
                      </td>
                      <td>v{item.versionNumber}</td>
                      <td>{formatMoney(item.oneTimeTotalCents, currency)}</td>
                      <td>{formatMoney(item.recurringMonthlyCents, currency)}</td>
                      <td>{formatDate(item.validityDate, timezone)}</td>
                      <td>{item.salesOwnerName || item.salesOwnerEmail || 'Unassigned'}</td>
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

      <Hint>
        <CircleAlert size={12} aria-hidden="true" /> Proposal and accepted values
        are commercial documents, not invoices or collected revenue. Marking a
        proposal as sent never emails the client and never changes the
        opportunity stage.
      </Hint>
    </Page>
  );
}
