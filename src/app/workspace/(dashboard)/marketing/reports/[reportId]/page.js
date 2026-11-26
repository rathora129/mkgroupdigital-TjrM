import { notFound } from 'next/navigation';
import ReportDetailView from '@/components/workspace/marketing/reports/ReportDetailView';
import { requirePermissionPage } from '@/lib/auth/authorization';
import { hasPermission } from '@/lib/auth/permissions';
import { getReport } from '@/lib/marketing/reporting';
import { isUuid } from '@/lib/marketing/validation';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Marketing report',
};

export default async function MarketingReportDetailPage({ params }) {
  const viewer = await requirePermissionPage('marketing.view');
  const { reportId } = await params;
  if (!isUuid(reportId)) notFound();

  let detail;
  try {
    detail = await getReport(viewer.membership.workspaceId, reportId);
  } catch {
    notFound();
  }

  return (
    <ReportDetailView
      detail={detail}
      canReport={hasPermission(viewer.membership.role, 'marketing.report')}
      timezone={viewer.workspace.timezone || 'UTC'}
    />
  );
}
