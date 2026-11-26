import { notFound } from 'next/navigation';
import ResearchDetailView from '@/components/workspace/research/ResearchDetailView';
import { requirePermissionPage } from '@/lib/auth/authorization';
import { hasPermission } from '@/lib/auth/permissions';
import { isUuid } from '@/lib/leads/validation';
import { getResearchJob } from '@/lib/research/service';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Research job',
};

export default async function ResearchDetailPage({ params }) {
  const viewer = await requirePermissionPage('research.view');
  const { researchId } = await params;
  if (!isUuid(researchId)) notFound();

  const detail = await getResearchJob(
    viewer.membership.workspaceId,
    researchId,
  );
  if (!detail) notFound();

  return (
    <ResearchDetailView
      detail={detail}
      canCancel={hasPermission(viewer.membership.role, 'research.create')}
      timezone={viewer.workspace.timezone || 'UTC'}
    />
  );
}
