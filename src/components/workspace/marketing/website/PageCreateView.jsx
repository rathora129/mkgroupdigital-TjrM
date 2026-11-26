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
import PageForm from './PageForm';

export default function PageCreateView({ options }) {
  const router = useRouter();
  return (
    <Page>
      <Header>
        <Eyebrow>
          <Link href="/workspace/marketing/website">Website</Link> · New page
        </Eyebrow>
        <Title>Track a website page</Title>
        <Lead>
          Record the current content and objective so future proposals preserve
          the original.
        </Lead>
      </Header>
      <MarketingNav />
      <Card>
        <PageForm
          options={options}
          onDone={() => router.push('/workspace/marketing/website')}
          onCancel={() => router.push('/workspace/marketing/website')}
        />
      </Card>
    </Page>
  );
}
