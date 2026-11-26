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
import CampaignForm from './CampaignForm';

export default function CampaignCreateView({ options }) {
  const router = useRouter();
  return (
    <Page>
      <Header>
        <Eyebrow>
          <Link href="/workspace/marketing/campaigns">Campaigns</Link> · New
        </Eyebrow>
        <Title>Plan a campaign</Title>
        <Lead>
          Every campaign begins as planned or draft. Budget values are estimates
          and no ad platform is contacted.
        </Lead>
      </Header>
      <MarketingNav />
      <Card>
        <CampaignForm
          options={options}
          onDone={(result) => {
            router.push(`/workspace/marketing/campaigns/${result.campaign.id}`);
          }}
          onCancel={() => router.push('/workspace/marketing/campaigns')}
        />
      </Card>
    </Page>
  );
}
