'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CircleAlert, Loader2, Lock, ReceiptText } from 'lucide-react';
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
  EmptyState,
  Eyebrow,
  ErrorText,
  Field,
  Header,
  Hint,
  Input,
  Label,
  Lead,
  Notice,
  Page,
  Stack,
  Table,
  TableWrap,
  Textarea,
  Title,
} from '@/components/workspace/ai/primitives';
import { formatDate, formatDateTime } from '@/lib/ai/format';
import { formatMoney } from '@/components/workspace/proposals/meta';
import {
  INVOICE_ACTION_LABELS,
  INVOICE_SOURCE_LABELS,
  INVOICE_STATUS_META,
  PAYMENT_METHOD_LABELS,
  metaFor,
} from './meta';
import InvoiceForm from './InvoiceForm';
import RecordPaymentForm from './RecordPaymentForm';

const ACTION_PERMISSIONS = {
  submit: 'canSubmit',
  approve: 'canApprove',
  issue: 'canIssue',
  cancel: 'canCancel',
};

export default function InvoiceDetailView({
  detail,
  options,
  permissions,
  timezone,
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelError, setCancelError] = useState(null);
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(null);
  const [failure, setFailure] = useState(null);
  const [notice, setNotice] = useState(null);

  const invoice = detail.invoice;
  const status = metaFor(INVOICE_STATUS_META, invoice.displayStatus);
  const allowed = detail.actions.filter(
    (action) => permissions?.[ACTION_PERMISSIONS[action]] !== false,
  );

  async function runAction(action) {
    setFailure(null);
    setNotice(null);
    setBusy(action);
    try {
      if (action === 'cancel') {
        if (cancelReason.trim().length < 2) {
          setCancelError('Give a reason for cancelling this invoice.');
          return;
        }
        await apiRequest(`/api/workforce/invoices/${invoice.id}/cancel`, {
          method: 'POST',
          body: { cancellationReason: cancelReason.trim() },
        });
        setCancelling(false);
        setCancelReason('');
        setCancelError(null);
        setNotice('Invoice cancelled.');
      } else {
        await apiRequest(`/api/workforce/invoices/${invoice.id}/${action}`, {
          method: 'POST',
        });
        setNotice(
          action === 'submit'
            ? 'Invoice submitted for approval.'
            : action === 'approve'
              ? 'Invoice approved.'
              : 'Invoice issued.',
        );
      }
      router.refresh();
    } catch (error) {
      setFailure(error.message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <Page>
      <Header>
        <Eyebrow>
          <Link href="/workspace/finance">Finance</Link> ·{' '}
          <Link href="/workspace/finance/invoices">Invoices</Link> · {invoice.reference}
        </Eyebrow>
        <Title>
          {invoice.reference}{' '}
          <Badge $tone={status.tone}>{status.label}</Badge>
        </Title>
        <Lead>
          {detail.client.companyName} · {INVOICE_SOURCE_LABELS[invoice.source]}{' '}
          · {formatMoney(invoice.totalCents, invoice.currency)}
        </Lead>
      </Header>

      {invoice.isOverdue ? (
        <Notice $tone="warning">
          <CircleAlert size={15} />
          <span>
            This invoice is past its due date with an outstanding balance of{' '}
            {formatMoney(invoice.balanceDueCents, invoice.currency)}.
          </span>
        </Notice>
      ) : null}

      {notice ? <Notice $tone="success">{notice}</Notice> : null}
      {failure ? <Notice $tone="danger">{failure}</Notice> : null}

      <Card>
        <CardHead>
          <div>
            <CardTitle>Invoice details</CardTitle>
            <CardText>
              Draft invoices can be edited. Once submitted, the document is
              locked and moves only through the approval and issuance workflow.
            </CardText>
          </div>
          <Actions>
            {detail.canEdit && permissions?.canUpdate !== false ? (
              <Button
                type="button"
                $variant="ghost"
                onClick={() => {
                  setEditing((current) => !current);
                  setRecording(false);
                }}
              >
                {editing ? 'Close editor' : 'Edit draft'}
              </Button>
            ) : null}
            {allowed.map((action) => (
              <Button
                key={action}
                type="button"
                $variant={action === 'cancel' ? 'ghost' : 'primary'}
                onClick={() => (action === 'cancel' ? setCancelling(true) : runAction(action))}
                disabled={Boolean(busy)}
              >
                {busy === action ? <Loader2 size={14} className="spin" /> : null}
                {INVOICE_ACTION_LABELS[action]}
              </Button>
            ))}
          </Actions>
        </CardHead>

        {cancelling ? (
          <div
            style={{
              display: 'grid',
              gap: 8,
              padding: 12,
              marginBottom: 12,
              border: '1px solid #FECACA',
              borderRadius: 10,
              background: '#FEF2F2',
            }}
          >
            <Field>
              <Label htmlFor="cancel-reason">Reason for cancelling</Label>
              <Textarea
                id="cancel-reason"
                value={cancelReason}
                onChange={(event) => setCancelReason(event.target.value)}
                maxLength={500}
                style={{ minHeight: 60 }}
              />
              {cancelError ? <ErrorText>{cancelError}</ErrorText> : null}
            </Field>
            <Actions>
              <Button
                type="button"
                $variant="danger"
                onClick={() => runAction('cancel')}
                disabled={Boolean(busy)}
              >
                {busy === 'cancel' ? <Loader2 size={14} className="spin" /> : null}
                Confirm cancellation
              </Button>
              <Button
                type="button"
                $variant="ghost"
                onClick={() => {
                  setCancelling(false);
                  setCancelError(null);
                }}
                disabled={Boolean(busy)}
              >
                Keep invoice
              </Button>
            </Actions>
          </div>
        ) : null}

        {editing ? (
          <div style={{ padding: '4px 0 12px' }}>
            <InvoiceForm
              invoice={{ ...invoice, lines: detail.lines }}
              options={options}
              onDone={() => {
                setEditing(false);
                setNotice('Draft saved.');
                router.refresh();
              }}
              onCancel={() => setEditing(false)}
            />
          </div>
        ) : null}

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
            gap: '10px 18px',
          }}
        >
          <Field>
            <Label>Client</Label>
            <span>
              <Link href={`/workspace/clients/${detail.client.id}`}>
                {detail.client.companyName}
              </Link>
            </span>
          </Field>
          <Field>
            <Label>Invoice date</Label>
            <span>{formatDate(invoice.invoiceDate, timezone)}</span>
          </Field>
          <Field>
            <Label>Due date</Label>
            <span>{formatDate(invoice.dueDate, timezone)}</span>
          </Field>
          <Field>
            <Label>Project</Label>
            <span>
              {detail.project ? (
                <Link href={`/workspace/projects/${detail.project.id}`}>
                  {detail.project.reference}
                </Link>
              ) : (
                'No project link'
              )}
            </span>
          </Field>
          <Field>
            <Label>Proposal</Label>
            <span>
              {detail.proposal ? (
                <Link href={`/workspace/proposals/${detail.proposal.id}`}>
                  {detail.proposal.reference}
                </Link>
              ) : (
                '—'
              )}
            </span>
          </Field>
          <Field>
            <Label>Engagement</Label>
            <span>
              {detail.engagement ? (
                <Link href="/workspace/clients/engagements">
                  {detail.engagement.name}
                </Link>
              ) : (
                '—'
              )}
            </span>
          </Field>
        </div>

        {invoice.notes ? (
          <>
            <Divider />
            <Label>Notes</Label>
            <p style={{ margin: '4px 0 0', whiteSpace: 'pre-wrap' }}>{invoice.notes}</p>
          </>
        ) : null}
        {invoice.terms ? (
          <>
            <Divider />
            <Label>Payment terms</Label>
            <p style={{ margin: '4px 0 0', whiteSpace: 'pre-wrap' }}>{invoice.terms}</p>
          </>
        ) : null}
        {invoice.cancellationReason ? (
          <>
            <Divider />
            <Label>Cancellation reason</Label>
            <p style={{ margin: '4px 0 0', whiteSpace: 'pre-wrap' }}>
              {invoice.cancellationReason}
            </p>
          </>
        ) : null}
      </Card>

      <Card>
        <CardHead>
          <div>
            <CardTitle>Line items</CardTitle>
            <CardText>
              Totals are rebuilt from the stored line values in integer minor
              units.
            </CardText>
          </div>
          <ReceiptText size={16} aria-hidden="true" />
        </CardHead>

        {detail.lines.length === 0 ? (
          <CardText>This invoice has no line items.</CardText>
        ) : (
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <th>Description</th>
                  <th>Qty</th>
                  <th>Unit price</th>
                  <th>Discount</th>
                  <th>Tax</th>
                  <th>Line total</th>
                </tr>
              </thead>
              <tbody>
                {detail.lines.map((line) => (
                  <tr key={line.id}>
                    <td>{line.description}</td>
                    <td>{line.quantity}</td>
                    <td>{formatMoney(line.unitPriceCents, invoice.currency)}</td>
                    <td>{formatMoney(line.lineDiscountCents, invoice.currency)}</td>
                    <td>
                      {line.taxScheme === 'none'
                        ? '—'
                        : `${(line.taxRateBps / 100).toFixed(2)}% ${line.taxScheme === 'igst' ? 'IGST' : 'CGST+SGST'}`}
                    </td>
                    <td>{formatMoney(line.lineTotalCents, invoice.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
        )}

        <Divider />
        <div
          style={{
            display: 'grid',
            gap: 6,
            justifyItems: 'end',
            fontSize: '0.82rem',
          }}
        >
          <span>Subtotal: {formatMoney(invoice.subtotalCents, invoice.currency)}</span>
          <span>Discount: {formatMoney(invoice.discountCents, invoice.currency)}</span>
          {invoice.igstCents > 0 ? (
            <span>IGST: {formatMoney(invoice.igstCents, invoice.currency)}</span>
          ) : null}
          {invoice.cgstCents > 0 || invoice.sgstCents > 0 ? (
            <>
              <span>CGST: {formatMoney(invoice.cgstCents, invoice.currency)}</span>
              <span>SGST: {formatMoney(invoice.sgstCents, invoice.currency)}</span>
            </>
          ) : null}
          <strong>Total: {formatMoney(invoice.totalCents, invoice.currency)}</strong>
          <span>Paid: {formatMoney(invoice.amountPaidCents, invoice.currency)}</span>
          <strong>Balance due: {formatMoney(invoice.balanceDueCents, invoice.currency)}</strong>
        </div>
      </Card>

      <Card>
        <CardHead>
          <div>
            <CardTitle>Payments</CardTitle>
            <CardText>
              Each recorded payment is a permanent receipt and cannot be deleted.
            </CardText>
          </div>
          <Actions>
            {detail.canRecordPayment && permissions?.canRecordPayment !== false ? (
              <Button
                type="button"
                $variant="primary"
                onClick={() => {
                  setRecording((current) => !current);
                  setEditing(false);
                }}
              >
                {recording ? 'Close form' : 'Record payment'}
              </Button>
            ) : null}
          </Actions>
        </CardHead>

        {recording ? (
          <div style={{ padding: '4px 0 12px' }}>
            <RecordPaymentForm
              invoice={invoice}
              onDone={() => {
                setRecording(false);
                setNotice('Payment recorded.');
                router.refresh();
              }}
              onCancel={() => setRecording(false)}
            />
          </div>
        ) : null}

        {detail.payments.length === 0 ? (
          <EmptyState>
            <Lock size={17} aria-hidden="true" />
            <div>
              <h3>No payments recorded</h3>
              <p>
                Payments can be recorded once the invoice is issued and has an
                outstanding balance.
              </p>
            </div>
          </EmptyState>
        ) : (
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <th>Receipt</th>
                  <th>Date</th>
                  <th>Amount</th>
                  <th>Method</th>
                  <th>Reference</th>
                  <th>Recorded by</th>
                </tr>
              </thead>
              <tbody>
                {detail.payments.map((payment) => (
                  <tr key={payment.id}>
                    <td>{payment.reference}</td>
                    <td>{formatDate(payment.paymentDate, timezone)}</td>
                    <td>{formatMoney(payment.amountCents, invoice.currency)}</td>
                    <td>{PAYMENT_METHOD_LABELS[payment.method] || payment.method}</td>
                    <td>{payment.transactionReference || '—'}</td>
                    <td>{payment.recordedByName || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
        )}
      </Card>

      <Stack $gap={6}>
        <Hint>
          <CircleAlert size={12} aria-hidden="true" /> Issued invoices keep their
          own line values. Changes after issuance require a cancellation and a
          new document; recorded payments are never removed.
        </Hint>
        <Hint>
          Last updated {formatDateTime(invoice.updatedAt, timezone)}
          {invoice.issuedAt
            ? ` · issued ${formatDateTime(invoice.issuedAt, timezone)}`
            : ''}
          {invoice.approvedAt
            ? ` · approved ${formatDateTime(invoice.approvedAt, timezone)}`
            : ''}
        </Hint>
      </Stack>
    </Page>
  );
}
