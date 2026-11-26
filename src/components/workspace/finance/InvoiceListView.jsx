'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  CircleAlert,
  Plus,
  ReceiptText,
  Search,
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
import { formatDate, formatDateTime } from '@/lib/ai/format';
import {
  FilterBar,
  FilterChip,
  FilterField,
  ListPager,
} from '@/components/workspace/phase2c/ui';
import { formatMoney } from '@/components/workspace/proposals/meta';
import {
  INVOICE_SOURCE_LABELS,
  INVOICE_STATUS_META,
  metaFor,
} from './meta';

const STATUS_ORDER = [
  'draft',
  'pending_approval',
  'approved',
  'issued',
  'partially_paid',
  'paid',
  'overdue',
  'cancelled',
];

const LIST_KEYS = [
  'search',
  'status',
  'clientId',
  'source',
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
    if (key === 'sort' && value === 'date') continue;
    if (key === 'direction' && value === 'desc') continue;
    search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `/workspace/finance/invoices?${text}` : '/workspace/finance/invoices';
}

export default function InvoiceListView({
  invoices,
  overview,
  clients,
  query,
  canCreate,
  timezone,
}) {
  const router = useRouter();
  const { items, total, page, pages, pageSize } = invoices;

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
        <Eyebrow>
          <Link href="/workspace/finance">Finance</Link> · Invoices
        </Eyebrow>
        <Title>Invoices</Title>
        <Lead>
          Draft, approve and issue client invoices, then record payments against
          the outstanding balance. Issued documents keep their own frozen line
          values and never change retroactively.
        </Lead>
      </Header>

      <Notice $tone="info">
        <CircleAlert size={15} />
        <span>
          Figures on this page are shown in {overview.currency}. Amounts in other
          currencies are kept separate and are not summed together.
        </span>
      </Notice>

      <StatGrid>
        <StatCard>
          <StatLabel>Outstanding</StatLabel>
          <StatValue>{formatMoney(overview.outstandingCents, overview.currency)}</StatValue>
          <StatNote>Issued or partially paid, not yet collected</StatNote>
        </StatCard>
        <StatCard>
          <StatLabel>Overdue</StatLabel>
          <StatValue>{formatMoney(overview.overdueCents, overview.currency)}</StatValue>
          <StatNote>{overview.overdueCount} past due invoices</StatNote>
        </StatCard>
        <StatCard>
          <StatLabel>Collected this month</StatLabel>
          <StatValue>
            {formatMoney(overview.collectedThisMonthCents, overview.currency)}
          </StatValue>
          <StatNote>Payments recorded since the 1st</StatNote>
        </StatCard>
        <StatCard>
          <StatLabel>In progress</StatLabel>
          <StatValue>{formatMoney(overview.draftTotalCents, overview.currency)}</StatValue>
          <StatNote>Drafts, pending approval and approved but unissued</StatNote>
        </StatCard>
      </StatGrid>

      <Card>
        <CardHead>
          <div>
            <CardTitle>All invoices</CardTitle>
            <CardText>
              {total} {total === 1 ? 'invoice' : 'invoices'} match the current
              filters. Showing page {page} of {pages}.
            </CardText>
          </div>
          <Actions>
            {canCreate ? (
              <LinkButton href="/workspace/finance/invoices/new" $primary>
                <Plus size={15} />
                New invoice
              </LinkButton>
            ) : null}
          </Actions>
        </CardHead>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          <FilterChip href={listHref(query, { status: undefined })} $active={!query.status}>
            All invoices
          </FilterChip>
          {STATUS_ORDER.map((status) => (
            <FilterChip
              key={status}
              href={listHref(query, { status })}
              $active={query.status === status}
            >
              {INVOICE_STATUS_META[status].label}
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
              placeholder="Reference, client, notes"
            />
          </FilterField>
          <FilterField>
            <span>Client</span>
            <select name="clientId" defaultValue={query.clientId || ''}>
              <option value="">Anyone</option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.reference} · {client.companyName}
                </option>
              ))}
            </select>
          </FilterField>
          <FilterField>
            <span>Source</span>
            <select name="source" defaultValue={query.source || ''}>
              <option value="">Any</option>
              {Object.entries(INVOICE_SOURCE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </FilterField>
          <FilterField>
            <span>Sort by</span>
            <select name="sort" defaultValue={query.sort || 'date'}>
              <option value="date">Invoice date</option>
              <option value="due">Due date</option>
              <option value="total">Total</option>
              <option value="created">Created</option>
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
              onClick={() => router.push('/workspace/finance/invoices')}
            >
              Reset
            </Button>
          </Actions>
        </FilterBar>

        {items.length === 0 ? (
          <EmptyState>
            <ReceiptText size={17} aria-hidden="true" />
            <div>
              <h3>No invoices match these filters</h3>
              <p>
                Create a draft invoice from an accepted proposal, an active
                engagement, or a manual client entry.
              </p>
            </div>
          </EmptyState>
        ) : (
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <th>Invoice</th>
                  <th>Client</th>
                  <th>Status</th>
                  <th>Source</th>
                  <th>Invoice date</th>
                  <th>Due</th>
                  <th>Total</th>
                  <th>Balance</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const status = metaFor(INVOICE_STATUS_META, item.displayStatus);
                  return (
                    <tr key={item.id}>
                      <td>
                        <Link href={`/workspace/finance/invoices/${item.id}`}>
                          {item.reference}
                        </Link>
                        {item.projectReference ? (
                          <div style={{ fontSize: '0.72rem', color: '#64748B' }}>
                            {item.projectReference}
                          </div>
                        ) : null}
                      </td>
                      <td>{item.clientName || '—'}</td>
                      <td>
                        <Badge $tone={status.tone}>{status.label}</Badge>
                        {item.isDueSoon ? (
                          <div style={{ fontSize: '0.7rem', color: '#B45309' }}>
                            Due within 7 days
                          </div>
                        ) : null}
                      </td>
                      <td>{INVOICE_SOURCE_LABELS[item.source] || item.source}</td>
                      <td>{formatDate(item.invoiceDate, timezone)}</td>
                      <td>{formatDate(item.dueDate, timezone)}</td>
                      <td>{formatMoney(item.totalCents, item.currency)}</td>
                      <td>{formatMoney(item.balanceDueCents, item.currency)}</td>
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
        <CircleAlert size={12} aria-hidden="true" /> Overdue is derived from an
        unpaid past-due invoice and is never stored. The last update was{' '}
        {formatDateTime(new Date(), timezone)}.
      </Hint>
    </Page>
  );
}
