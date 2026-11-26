import ProposalCreateView from '@/components/workspace/marketing/website/ProposalCreateView';
import { requirePermissionPage } from '@/lib/auth/authorization';
import { listClientOptions } from '@/lib/marketing/helpers';
import { listWebsitePages } from '@/lib/marketing/website';
import { listMembers } from '@/lib/workspace/service';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'New website change proposal',
};

export default async function NewProposalPage() {
  const viewer = await requirePermissionPage('marketing.manage');
  const workspaceId = viewer.membership.workspaceId;

  const [clients, pages, members] = await Promise.all([
    listClientOptions(workspaceId),
    listWebsitePages(workspaceId, { page: 1, pageSize: 50 }),
    listMembers(workspaceId),
  ]);

  return (
    <ProposalCreateView
      options={{
        clients,
        pages: pages.items,
        members: members.map((member) => ({
          userId: member.userId,
          name: member.name,
          email: member.email,
        })),
      }}
    />
  );
}
