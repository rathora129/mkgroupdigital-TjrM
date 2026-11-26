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
import ContentForm from './ContentForm';

export default function ContentCreateView({ options }) {
  const router = useRouter();
  return (
    <Page>
      <Header>
        <Eyebrow>
          <Link href="/workspace/marketing/content">Content</Link> · New
        </Eyebrow>
        <Title>Write a content draft</Title>
        <Lead>
          Drafts are internal. Facts that are not confirmed must be flagged for
          verification, not invented.
        </Lead>
      </Header>
      <MarketingNav />
      <Card>
        <ContentForm
          options={options}
          onDone={(result) => {
            router.push(`/workspace/marketing/content/${result.item.id}`);
          }}
          onCancel={() => router.push('/workspace/marketing/content')}
        />
      </Card>
    </Page>
  );
}
