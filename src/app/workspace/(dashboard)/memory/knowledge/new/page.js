import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import {
  Card,
  CardHead,
  CardText,
  CardTitle,
  Eyebrow,
  Header,
  Lead,
  Page,
  Title,
} from '@/components/workspace/ai/primitives';
import KnowledgeEntryForm from '@/components/workspace/knowledge/KnowledgeEntryForm';
import { requirePermissionPage } from '@/lib/auth/authorization';
import { getKnowledgeScopeOptions } from '@/lib/knowledge/service';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'New knowledge entry',
};

export default async function NewKnowledgePage() {
  const viewer = await requirePermissionPage('knowledge.create');
  const scopeOptions = await getKnowledgeScopeOptions(
    viewer.membership.workspaceId,
  );

  return (
    <Page>
      <Link
        href="/workspace/memory/knowledge"
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
      >
        <ArrowLeft size={14} aria-hidden="true" />
        <span style={{ fontSize: '0.78rem', fontWeight: 500 }}>
          Knowledge base
        </span>
      </Link>

      <Header>
        <Eyebrow>Memory & knowledge</Eyebrow>
        <Title>New knowledge entry</Title>
        <Lead>
          Record durable, workspace-scoped knowledge. Identical content is
          rejected, and the first save becomes version 1 of the entry.
        </Lead>
      </Header>

      <Card>
        <CardHead>
          <div>
            <CardTitle>Entry details</CardTitle>
            <CardText>
              Drafts stay out of AI context until published.
            </CardText>
          </div>
        </CardHead>
        <KnowledgeEntryForm scopeOptions={scopeOptions} />
      </Card>
    </Page>
  );
}
