import FinanceDashboardView from '@/components/workspace/finance/FinanceDashboardView';
import { requirePermissionPage } from '@/lib/auth/authorization';
import { hasPermission } from '@/lib/auth/permissions';
import { getFinanceOverview } from '@/lib/billing/service';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Finance',
};

export default async function FinancePage() {
  const viewer = await requirePermissionPage('finance.view');
  const role = viewer.membership.role;

  const overview = await getFinanceOverview(viewer.membership.workspaceId);

  return (
    <FinanceDashboardView
      overview={overview}
      timezone={viewer.workspace.timezone || 'UTC'}
      canRunAi={hasPermission(role, 'agents.run')}
      canCreateInvoice={hasPermission(role, 'invoices.create')}
      canRecordPayment={hasPermission(role, 'payments.record')}
    />
  );
}
