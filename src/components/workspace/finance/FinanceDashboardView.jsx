'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Banknote,
  CircleAlert,
  Loader2,
  Receipt,
  ReceiptText,
  Sparkles,
} from 'lucide-react';
import { apiRequest } from '@/lib/ai/client';
import {
  Actions,
  Badge,
  Button,
  Card,
  CardHead,
  CardText,
  CardTitle,
  Divider,
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
import { formatMoney } from '@/components/workspace/proposals/meta';
import { TwoCol } from '@/components/workspace/phase2c/ui';
import { INVOICE_STATUS_META, PAYMENT_METHOD_LABELS, metaFor } from './meta';

export default function FinanceDashboardView({
  overview,
  timezone,
  canRunAi,
  canCreateInvoice,
  canRecordPayment,
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [aiNotice, setAiNotice] = useState(null);
  const [aiError, setAiError] = useState(null);
  const totals = overview.totals;

  async function requestSummary() {
    setAiNotice(null);
    setAiError(null);
    setBusy(true);
    try {
      const result = await apiRequest('/api/workforce/finance/ai-summary', {
        method: 'POST',
        body: {},
      });
      setAiNotice(
        `Summary queued as run ${result.run.id} (${result.run.status}). Review it in Agents.`,
      );
      router.refresh();
    } catch (error) {
      setAiError(error.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Page>
      <Header>
        <Eyebrow>Financial operations</Eyebrow>
        <Title>Finance overview</Title>
        <Lead>
          Distinguish proposal pipeline from accepted value, invoiced revenue,
          collected cash and outstanding receivables. Figures are grouped by
          currency and never mixed together.
        </Lead>
      </Header>

      <Notice $tone="info">
        <CircleAlert size={15} />
        <span>
          Headline figures are shown in {totals.currency} as of{' '}
          {formatDateTime(overview.asOf, timezone)}. Proposal pipeline is not
          revenue until an invoice is issued.
        </span>
      </Notice>

      <StatGrid>
        <StatCard>
          <StatLabel>Proposal pipeline</StatLabel>
          <StatValue>{formatMoney(totals.pipelineCents, totals.currency)}</StatValue>
          <StatNote>{totals.pipelineCount} open proposals · not revenue</StatNote>
        </StatCard>
        <StatCard>
          <StatLabel>Accepted (one-time)</StatLabel>
          <StatValue>{formatMoney(totals.approvedOneTimeCents, totals.currency)}</StatValue>
          <StatNote>
            {totals.approvedCount} accepted ·{' '}
            {formatMoney(totals.approvedRecurringMonthlyCents, totals.currency)}/mo recurring
          </StatNote>
        </StatCard>
        <StatCard>
          <StatLabel>Invoiced</StatLabel>
          <StatValue>{formatMoney(totals.invoicedCents, totals.currency)}</StatValue>
          <StatNote>{totals.invoiceCount} issued invoices</StatNote>
        </StatCard>
        <StatCard>
          <StatLabel>Collected</StatLabel>
          <StatValue>{formatMoney(totals.collectedCents, totals.currency)}</StatValue>
          <StatNote>{totals.paymentCount} payments recorded</StatNote>
        </StatCard>
        <StatCard>
          <StatLabel>Outstanding</StatLabel>
          <StatValue>{formatMoney(totals.outstandingCents, totals.currency)}</StatValue>
          <StatNote>Unpaid balance on issued invoices</StatNote>
        </StatCard>
        <StatCard>
          <StatLabel>Overdue</StatLabel>
          <StatValue>{formatMoney(totals.overdueCents, totals.currency)}</StatValue>
          <StatNote>{totals.overdueCount} past due invoices</StatNote>
        </StatCard>
        <StatCard>
          <StatLabel>Approved expenses</StatLabel>
          <StatValue>{formatMoney(totals.approvedExpenseCents, totals.currency)}</StatValue>
          <StatNote>Internal costs · not tax advice</StatNote>
        </StatCard>
      </StatGrid>

      <Card>
        <CardHead>
          <div>
            <CardTitle>Quick actions</CardTitle>
            <CardText>Jump into the invoice, payment and expense workflows.</CardText>
          </div>
        </CardHead>
        <Actions>
          <LinkButton href="/workspace/finance/invoices">Invoices</LinkButton>
          {canCreateInvoice ? (
            <LinkButton href="/workspace/finance/invoices/new" $primary>
              <ReceiptText size={14} />
              New invoice
            </LinkButton>
          ) : null}
          <LinkButton href="/workspace/finance/payments">
            <Banknote size={14} />
            Payments
          </LinkButton>
          <LinkButton href="/workspace/finance/expenses">
            <Receipt size={14} />
            Expenses
          </LinkButton>
        </Actions>
      </Card>

      {overview.byCurrency.length > 1 ? (
        <Card>
          <CardHead>
            <div>
              <CardTitle>By currency</CardTitle>
              <CardText>
                Currencies are never summed. Each row is an independent ledger.
              </CardText>
            </div>
          </CardHead>
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <th>Currency</th>
                  <th>Pipeline</th>
                  <th>Invoiced</th>
                  <th>Collected</th>
                  <th>Outstanding</th>
                  <th>Overdue</th>
                </tr>
              </thead>
              <tbody>
                {overview.byCurrency.map((row) => (
                  <tr key={row.currency}>
                    <td>{row.currency}</td>
                    <td>{formatMoney(row.pipelineCents, row.currency)}</td>
                    <td>{formatMoney(row.invoicedCents, row.currency)}</td>
                    <td>{formatMoney(row.collectedCents, row.currency)}</td>
                    <td>{formatMoney(row.outstandingCents, row.currency)}</td>
                    <td>{formatMoney(row.overdueCents, row.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
        </Card>
      ) : null}

      <Card>
        <CardHead>
          <div>
            <CardTitle>Invoice status</CardTitle>
            <CardText>Counts of every invoice regardless of currency.</CardText>
          </div>
        </CardHead>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
            gap: 10,
          }}
        >
          {Object.entries(INVOICE_STATUS_META)
            .filter(([key]) => key !== 'overdue')
            .map(([key, meta]) => (
              <div key={key}>
                <div
                  style={{
                    fontSize: '0.68rem',
                    fontWeight: 700,
                    letterSpacing: '0.05em',
                    textTransform: 'uppercase',
                    color: '#64748B',
                  }}
                >
                  {meta.label}
                </div>
                <div style={{ fontSize: '0.9rem', fontWeight: 600 }}>
                  {overview.statusCounts[key] || 0}
                </div>
              </div>
            ))}
        </div>
      </Card>

      <TwoCol>
        <Card>
          <CardHead>
            <div>
              <CardTitle>Recent invoices</CardTitle>
              <CardText>Latest by invoice date.</CardText>
            </div>
            <Link href="/workspace/finance/invoices">View all</Link>
          </CardHead>
          {overview.recentInvoices.length === 0 ? (
            <CardText>No invoices yet.</CardText>
          ) : (
            <TableWrap>
              <Table>
                <thead>
                  <tr>
                    <th>Invoice</th>
                    <th>Status</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {overview.recentInvoices.map((item) => {
                    const status = metaFor(INVOICE_STATUS_META, item.displayStatus);
                    return (
                      <tr key={item.id}>
                        <td>
                          <Link href={`/workspace/finance/invoices/${item.id}`}>
                            {item.reference}
                          </Link>
                          <div style={{ fontSize: '0.72rem', color: '#64748B' }}>
                            {item.clientName}
                          </div>
                        </td>
                        <td>
                          <Badge $tone={status.tone}>{status.label}</Badge>
                        </td>
                        <td>{formatMoney(item.totalCents, item.currency)}</td>
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
              <CardTitle>Recent payments</CardTitle>
              <CardText>Latest recorded receipts.</CardText>
            </div>
            <Link href="/workspace/finance/payments">View all</Link>
          </CardHead>
          {overview.recentPayments.length === 0 ? (
            <CardText>No payments recorded yet.</CardText>
          ) : (
            <TableWrap>
              <Table>
                <thead>
                  <tr>
                    <th>Receipt</th>
                    <th>Date</th>
                    <th>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {overview.recentPayments.map((payment) => (
                    <tr key={payment.id}>
                      <td>
                        {payment.reference}
                        <div style={{ fontSize: '0.72rem', color: '#64748B' }}>
                          {payment.invoiceReference} · {payment.clientName}
                        </div>
                      </td>
                      <td>{formatDate(payment.paymentDate, timezone)}</td>
                      <td>
                        {formatMoney(payment.amountCents, payment.currency)}
                        <div style={{ fontSize: '0.7rem', color: '#64748B' }}>
                          {PAYMENT_METHOD_LABELS[payment.method] || payment.method}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </TableWrap>
          )}
        </Card>
      </TwoCol>

      {canRunAi ? (
        <Card>
          <CardHead>
            <div>
              <CardTitle>AI finance summary</CardTitle>
              <CardText>
                Drafts an internal narrative from the figures above. It cannot
                record payments, change totals, approve invoices or make tax
                decisions.
              </CardText>
            </div>
            <Sparkles size={16} aria-hidden="true" />
          </CardHead>
          {aiNotice ? <Notice $tone="success">{aiNotice}</Notice> : null}
          {aiError ? <Notice $tone="danger">{aiError}</Notice> : null}
          <Divider />
          <Actions>
            <Button type="button" $variant="primary" onClick={requestSummary} disabled={busy}>
              {busy ? <Loader2 size={14} className="spin" /> : <Sparkles size={14} />}
              {busy ? 'Queuing…' : 'Draft finance summary'}
            </Button>
          </Actions>
        </Card>
      ) : null}

      <Hint>
        <CircleAlert size={12} aria-hidden="true" /> Figures summarise records in
        this workspace only. They are internal operational totals, not statutory
        filings or tax classifications.
      </Hint>
      {canRecordPayment ? null : (
        <Hint>
          Your role can view finance but cannot record payments. Ask a manager or
          admin to record receipts.
        </Hint>
      )}
    </Page>
  );
}
