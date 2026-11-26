import PageCreateView from '@/components/workspace/marketing/website/PageCreateView';
import { requirePermissionPage } from '@/lib/auth/authorization';
import { listClientOptions } from '@/lib/marketing/helpers';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'New marketing website page',
};

export default async function NewWebsitePagePage() {
  const viewer = await requirePermissionPage('marketing.manage');
  const clients = await listClientOptions(viewer.membership.workspaceId);
  return <PageCreateView options={{ clients }} />;
}
