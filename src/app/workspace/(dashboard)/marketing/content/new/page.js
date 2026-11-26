import ContentCreateView from '@/components/workspace/marketing/content/ContentCreateView';
import { requirePermissionPage } from '@/lib/auth/authorization';
import {
  listClientOptions,
  listProjectOptions,
} from '@/lib/marketing/helpers';
import { listCampaignOptions } from '@/lib/marketing/service';
import { listMembers } from '@/lib/workspace/service';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'New marketing content',
};

export default async function NewContentPage() {
  const viewer = await requirePermissionPage('marketing.manage');
  const workspaceId = viewer.membership.workspaceId;

  const [clients, projects, campaigns, members] = await Promise.all([
    listClientOptions(workspaceId),
    listProjectOptions(workspaceId),
    listCampaignOptions(workspaceId),
    listMembers(workspaceId),
  ]);

  return (
    <ContentCreateView
      options={{
        clients,
        projects,
        campaigns,
        members: members.map((member) => ({
          userId: member.userId,
          name: member.name,
          email: member.email,
        })),
      }}
    />
  );
}
