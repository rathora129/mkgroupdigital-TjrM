import ReportsView from '@/components/workspace/marketing/reports/ReportsView';
import { requirePermissionPage } from '@/lib/auth/authorization';
import { hasPermission } from '@/lib/auth/permissions';
import { listClientOptions } from '@/lib/marketing/helpers';
import {
  getMetricsOverview,
  listMetrics,
  listReports,
} from '@/lib/marketing/reporting';
import {
  metricQuerySchema,
  reportQuerySchema,
} from '@/lib/marketing/validation';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Marketing performance',
};

async function parseQueries(params) {
  try {
    const reportQuery = await reportQuerySchema.validate(params, {
      abortEarly: false,
      stripUnknown: true,
    });
    const metricQuery = await metricQuerySchema.validate(
      { ...params, page: 1, pageSize: 20 },
      { abortEarly: false, stripUnknown: true },
    );
    return { reportQuery, metricQuery };
  } catch {
    return {
      reportQuery: { page: 1, pageSize: 20 },
      metricQuery: { page: 1, pageSize: 20 },
    };
  }
}

export default async function MarketingReportsPage({ searchParams }) {
  const viewer = await requirePermissionPage('marketing.view');
  const params = (await searchParams) || {};
  const workspaceId = viewer.membership.workspaceId;
  const { reportQuery, metricQuery } = await parseQueries(params);

  const [metrics, metricsOverview, reports, clients] = await Promise.all([
    listMetrics(workspaceId, metricQuery),
    getMetricsOverview(workspaceId),
    listReports(workspaceId, reportQuery),
    listClientOptions(workspaceId),
  ]);

  return (
    <ReportsView
      metrics={metrics}
      metricsOverview={metricsOverview}
      reports={reports}
      query={reportQuery}
      clients={clients}
      canManage={hasPermission(viewer.membership.role, 'marketing.manage')}
      canReport={hasPermission(viewer.membership.role, 'marketing.report')}
      timezone={viewer.workspace.timezone || 'UTC'}
    />
  );
}
