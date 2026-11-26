import Link from 'next/link';
import ClientCreateView from '@/components/workspace/clients/ClientCreateView';
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
import { requirePermissionPage } from '@/lib/auth/authorization';
import { listLeadOptions } from '@/lib/opportunities/service';
import { listMembers } from '@/lib/workspace/service';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'New client',
};

export default async function NewClientPage() {
  const viewer = await requirePermissionPage('clients.create');
  const workspaceId = viewer.membership.workspaceId;

  const [leads, members] = await Promise.all([
    listLeadOptions(workspaceId),
    listMembers(workspaceId),
  ]);

  return (
    <Page>
      <Header>
        <Eyebrow>
          <Link href="/workspace/clients">Clients</Link> · New
        </Eyebrow>
        <Title>Create a client record</Title>
        <Lead>
          Turn a won relationship into a client. The original lead, its
          opportunities and proposals keep their history; nothing is deleted or
          merged.
        </Lead>
      </Header>

      <Card>
        <CardHead>
          <div>
            <CardTitle>Client details</CardTitle>
            <CardText>
              At least a company name is required. Linking a lead keeps the
              connection explicit.
            </CardText>
          </div>
        </CardHead>
        <ClientCreateView
          leads={leads.map((lead) => ({
            id: lead.id,
            companyName: lead.companyName,
            contactName: lead.contactName,
          }))}
          members={members.map((member) => ({
            userId: member.userId,
            name: member.name,
            email: member.email,
          }))}
        />
      </Card>
    </Page>
  );
}
