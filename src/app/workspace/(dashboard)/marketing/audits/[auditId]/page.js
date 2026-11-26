import { notFound } from 'next/navigation';
import MarketingAuditDetailView from '@/components/workspace/marketing/audits/MarketingAuditDetailView';
import { requirePermissionPage } from '@/lib/auth/authorization';
import { hasPermission } from '@/lib/auth/permissions';
import { getWebsiteAudit } from '@/lib/audits/service';
import { listProjectOptions } from '@/lib/marketing/helpers';
import { listAuditFindings } from '@/lib/marketing/seo';
import { isUuid } from '@/lib/marketing/validation';
import { listMembers } from '@/lib/workspace/service';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Marketing audit findings',
};

export default async function MarketingAuditDetailPage({ params }) {
  const viewer = await requirePermissionPage('audits.view');
  const { auditId } = await params;
  if (!isUuid(auditId)) notFound();

  const workspaceId = viewer.membership.workspaceId;
  const detail = await getWebsiteAudit(workspaceId, auditId);
  if (!detail) notFound();

  const [findings, members, projects] = await Promise.all([
    listAuditFindings(workspaceId, auditId),
    listMembers(workspaceId),
    listProjectOptions(workspaceId, detail.audit.clientId || null),
  ]);

  return (
    <MarketingAuditDetailView
      audit={detail.audit}
      findings={findings.items}
      statusCounts={findings.statusCounts}
      sourceCounts={findings.sourceCounts}
      members={members.map((member) => ({
        userId: member.userId,
        name: member.name,
        email: member.email,
      }))}
      projects={projects}
      canManage={hasPermission(viewer.membership.role, 'marketing.manage')}
      timezone={viewer.workspace.timezone || 'UTC'}
    />
  );
}
