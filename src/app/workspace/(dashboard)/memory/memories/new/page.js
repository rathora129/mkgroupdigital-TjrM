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
import MemoryForm from '@/components/workspace/knowledge/MemoryForm';
import { listAgents } from '@/lib/ai/runtime';
import { requirePermissionPage } from '@/lib/auth/authorization';
import { getKnowledgeScopeOptions } from '@/lib/knowledge/service';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'New memory',
};

export default async function NewMemoryPage() {
  const viewer = await requirePermissionPage('memories.create');
  const workspaceId = viewer.membership.workspaceId;
  const [scopeOptions, agents] = await Promise.all([
    getKnowledgeScopeOptions(workspaceId),
    listAgents(workspaceId),
  ]);

  return (
    <Page>
      <Link
        href="/workspace/memory/memories"
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
      >
        <ArrowLeft size={14} aria-hidden="true" />
        <span style={{ fontSize: '0.78rem', fontWeight: 500 }}>AI memories</span>
      </Link>

      <Header>
        <Eyebrow>Memory & knowledge</Eyebrow>
        <Title>New memory</Title>
        <Lead>
          Add one durable fact with a source and confidence level. Client, project
          and agent memories are only supplied to matching AI runs.
        </Lead>
      </Header>

      <Card>
        <CardHead>
          <div>
            <CardTitle>Memory details</CardTitle>
            <CardText>
              An active memory with the same key and type already existing is
              rejected; update that memory instead.
            </CardText>
          </div>
        </CardHead>
        <MemoryForm
          scopeOptions={{
            clients: scopeOptions.clients,
            projects: scopeOptions.projects,
            agents: agents.map((agent) => ({ id: agent.id, name: agent.name })),
          }}
        />
      </Card>
    </Page>
  );
}
