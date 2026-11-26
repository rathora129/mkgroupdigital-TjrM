import { notFound } from 'next/navigation';
import ContentDetailView from '@/components/workspace/marketing/content/ContentDetailView';
import { requirePermissionPage } from '@/lib/auth/authorization';
import { hasPermission } from '@/lib/auth/permissions';
import { getContentItem } from '@/lib/marketing/content';
import { isUuid } from '@/lib/marketing/validation';

export const dynamic = 'force-dynamic';

export default async function ContentItemPage({ params }) {
  const viewer = await requirePermissionPage('marketing.view');
  const { contentId } = await params;
  if (!isUuid(contentId)) notFound();

  let detail;
  try {
    detail = await getContentItem(viewer.membership.workspaceId, contentId);
  } catch {
    notFound();
  }

  const role = viewer.membership.role;
  return (
    <ContentDetailView
      detail={detail}
      timezone={viewer.workspace.timezone || 'UTC'}
      canManage={hasPermission(role, 'marketing.manage')}
      canApprove={hasPermission(role, 'marketing.approve')}
      canExecute={hasPermission(role, 'marketing.execute')}
    />
  );
}
