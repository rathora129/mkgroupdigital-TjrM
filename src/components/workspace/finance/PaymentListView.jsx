'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Banknote, CircleAlert, Plus, Search } from 'lucide-react';
import {
  Actions,
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
import { formatDate } from '@/lib/ai/format';
import {
  FilterBar,
  FilterField,
  ListPager,
} from '@/components/workspace/phase2c/ui';
import { formatMoney } from '@/components/workspace/proposals/meta';
import { PAYMENT_METHOD_LABELS } from './meta';
import RecordPaymentForm from './RecordPaymentForm';

const LIST_KEYS = ['search', 'clientId', 'method', 'page'];

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
  return text ? `/workspace/finance/payments?${text}` : '/workspace/finance/payments';
}

export default function PaymentListView({
  payments,
  overview,
  payableInvoices,
  clients,
  query,
  canRecord,
  timezone,
}) {
  const router = useRouter();
  const [recording, setRecording] = useState(false);
  const [notice, setNotice] = useState(null);
  const { items, total, page, pages, pageSize } = payments;

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
          <Link href="/workspace/finance">Finance</Link> · Payments
        </Eyebrow>
        <Title>Payments received</Title>
        <Lead>
          Record partial and full payments against issued invoices. Every
          receipt is permanent and updates the outstanding balance atomically.
        </Lead>
      </Header>

      <Notice $tone="info">
        <CircleAlert size={15} />
        <span>
          Totals are shown in {overview.currency}. Payments recorded against
          invoices in other currencies are tracked separately.
        </span>
      </Notice>

      <StatGrid>
        <StatCard>
          <StatLabel>Collected (all time)</StatLabel>
          <StatValue>{formatMoney(overview.collectedCents, overview.currency)}</StatValue>
          <StatNote>{overview.count} receipts recorded</StatNote>
        </StatCard>
        <StatCard>
          <StatLabel>Collected this month</StatLabel>
          <StatValue>{formatMoney(overview.thisMonthCents, overview.currency)}</StatValue>
          <StatNote>Since the start of the month</StatNote>
        </StatCard>
        <StatCard>
          <StatLabel>Open balance</StatLabel>
          <StatValue>{payableInvoices.length}</StatValue>
          <StatNote>Issued invoices with an outstanding balance</StatNote>
        </StatCard>
      </StatGrid>

      <Card>
        <CardHead>
          <div>
            <CardTitle>Payment history</CardTitle>
            <CardText>
              {total} {total === 1 ? 'payment' : 'payments'} match the current
              filters. Showing page {page} of {pages}.
            </CardText>
          </div>
          <Actions>
            {canRecord ? (
              <Button
                type="button"
                $variant="primary"
                onClick={() => setRecording((current) => !current)}
              >
                <Plus size={14} />
                {recording ? 'Close form' : 'Record payment'}
              </Button>
            ) : null}
          </Actions>
        </CardHead>

        {notice ? <Hint>{notice}</Hint> : null}

        {recording ? (
          <div style={{ padding: '4px 0 12px' }}>
            <RecordPaymentForm
              invoices={payableInvoices}
              onDone={() => {
                setRecording(false);
                setNotice('Payment recorded.');
                router.refresh();
              }}
              onCancel={() => setRecording(false)}
            />
          </div>
        ) : null}

        <FilterBar key={JSON.stringify(query)} onSubmit={submitFilters}>
          <FilterField>
            <span>Search</span>
            <input
              type="search"
              name="search"
              defaultValue={query.search || ''}
              placeholder="Receipt, invoice, reference"
            />
          </FilterField>
          <FilterField>
            <span>Client</span>
            <select name="clientId" defaultValue={query.clientId || ''}>
              <option value="">Anyone</option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.companyName}
                </option>
              ))}
            </select>
          </FilterField>
          <FilterField>
            <span>Method</span>
            <select name="method" defaultValue={query.method || ''}>
              <option value="">Any</option>
              {Object.entries(PAYMENT_METHOD_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
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
              onClick={() => router.push('/workspace/finance/payments')}
            >
              Reset
            </Button>
          </Actions>
        </FilterBar>

        {items.length === 0 ? (
          <EmptyState>
            <Banknote size={17} aria-hidden="true" />
            <div>
              <h3>No payments recorded</h3>
              <p>Record a payment against an issued invoice to see it here.</p>
            </div>
          </EmptyState>
        ) : (
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <th>Receipt</th>
                  <th>Invoice</th>
                  <th>Client</th>
                  <th>Date</th>
                  <th>Amount</th>
                  <th>Method</th>
                  <th>Reference</th>
                  <th>Recorded by</th>
                </tr>
              </thead>
              <tbody>
                {items.map((payment) => (
                  <tr key={payment.id}>
                    <td>{payment.reference}</td>
                    <td>
                      <Link href={`/workspace/finance/invoices/${payment.invoiceId}`}>
                        {payment.invoiceReference}
                      </Link>
                    </td>
                    <td>{payment.clientName}</td>
                    <td>{formatDate(payment.paymentDate, timezone)}</td>
                    <td>{formatMoney(payment.amountCents, payment.currency)}</td>
                    <td>{PAYMENT_METHOD_LABELS[payment.method] || payment.method}</td>
                    <td>{payment.transactionReference || '—'}</td>
                    <td>{payment.recordedByName || '—'}</td>
                  </tr>
                ))}
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

      {overview.byMethod.length > 0 ? (
        <Card>
          <CardHead>
            <div>
              <CardTitle>Collected by method</CardTitle>
              <CardText>All recorded receipts in {overview.currency}.</CardText>
            </div>
          </CardHead>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
            {overview.byMethod.map((row) => (
              <div key={row.method}>
                <div style={{ fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: '#64748B' }}>
                  {PAYMENT_METHOD_LABELS[row.method] || row.method}
                </div>
                <div style={{ fontSize: '0.9rem', fontWeight: 600 }}>
                  {formatMoney(row.amountCents, overview.currency)}
                </div>
              </div>
            ))}
          </div>
        </Card>
      ) : null}
    </Page>
  );
}
