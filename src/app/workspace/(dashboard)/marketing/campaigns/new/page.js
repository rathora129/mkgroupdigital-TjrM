import CampaignCreateView from '@/components/workspace/marketing/campaigns/CampaignCreateView';
import { requirePermissionPage } from '@/lib/auth/authorization';
import { listClientOptions, listProjectOptions } from '@/lib/marketing/helpers';
import { listMembers } from '@/lib/workspace/service';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'New marketing campaign',
};

export default async function NewCampaignPage() {
  const viewer = await requirePermissionPage('marketing.manage');
  const workspaceId = viewer.membership.workspaceId;

  const [clients, projects, members] = await Promise.all([
    listClientOptions(workspaceId),
    listProjectOptions(workspaceId),
    listMembers(workspaceId),
  ]);

  return (
    <CampaignCreateView
      options={{
        clients,
        projects,
        members: members.map((member) => ({
          userId: member.userId,
          name: member.name,
          email: member.email,
        })),
      }}
    />
  );
}
