'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Card,
  Eyebrow,
  Header,
  Lead,
  Page,
  Title,
} from '@/components/workspace/ai/primitives';
import MarketingNav from '../MarketingNav';
import ProposalForm from './ProposalForm';

export default function ProposalCreateView({ options }) {
  const router = useRouter();
  return (
    <Page>
      <Header>
        <Eyebrow>
          <Link href="/workspace/marketing/website">Website</Link> · New proposal
        </Eyebrow>
        <Title>Write a website change proposal</Title>
        <Lead>
          The proposal moves through review and approval before anyone edits the
          site. Execution is recorded separately with evidence.
        </Lead>
      </Header>
      <MarketingNav />
      <Card>
        <ProposalForm
          options={options}
          onDone={(result) => {
            router.push(
              `/workspace/marketing/website/proposals/${result.proposal.id}`,
            );
          }}
          onCancel={() => router.push('/workspace/marketing/website')}
        />
      </Card>
    </Page>
  );
}
