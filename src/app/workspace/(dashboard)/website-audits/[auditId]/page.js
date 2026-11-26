import { notFound } from 'next/navigation';
import AuditDetailView from '@/components/workspace/audits/AuditDetailView';
import { requirePermissionPage } from '@/lib/auth/authorization';
import { hasPermission } from '@/lib/auth/permissions';
import { getWebsiteAudit } from '@/lib/audits/service';
import { isUuid } from '@/lib/leads/validation';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Website audit',
};

export default async function WebsiteAuditDetailPage({ params }) {
  const viewer = await requirePermissionPage('audits.view');
  const { auditId } = await params;
  if (!isUuid(auditId)) notFound();

  const detail = await getWebsiteAudit(
    viewer.membership.workspaceId,
    auditId,
  );
  if (!detail) notFound();

  return (
    <AuditDetailView
      detail={detail}
      canCancel={hasPermission(viewer.membership.role, 'audits.cancel')}
      timezone={viewer.workspace.timezone || 'UTC'}
    />
  );
}
