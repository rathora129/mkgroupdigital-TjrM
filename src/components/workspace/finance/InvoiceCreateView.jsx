'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ReceiptText } from 'lucide-react';
import {
  Card,
  Eyebrow,
  Header,
  Lead,
  Notice,
  Page,
  Title,
} from '@/components/workspace/ai/primitives';
import InvoiceForm from './InvoiceForm';

export default function InvoiceCreateView({ options }) {
  const router = useRouter();

  return (
    <Page>
      <Header>
        <Eyebrow>
          <Link href="/workspace/finance">Finance</Link> ·{' '}
          <Link href="/workspace/finance/invoices">Invoices</Link> · New
        </Eyebrow>
        <Title>Create a draft invoice</Title>
        <Lead>
          Every invoice starts as a draft and copies its own line values.
          Approval, issuance and payment are separate recorded steps.
        </Lead>
      </Header>

      <Notice $tone="info">
        <ReceiptText size={15} />
        <span>
          Accepting a proposal never issues an invoice automatically. Raise the
          invoice here, then submit, approve and issue it through the review
          workflow.
        </span>
      </Notice>

      <Card>
        <InvoiceForm
          options={options}
          onDone={(result) => {
            router.push(`/workspace/finance/invoices/${result.invoice.id}`);
          }}
          onCancel={() => router.push('/workspace/finance/invoices')}
        />
      </Card>
    </Page>
  );
}
