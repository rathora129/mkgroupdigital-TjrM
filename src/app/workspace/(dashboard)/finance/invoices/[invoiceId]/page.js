import { notFound } from 'next/navigation';
import InvoiceDetailView from '@/components/workspace/finance/InvoiceDetailView';
import { requirePermissionPage } from '@/lib/auth/authorization';
import { hasPermission } from '@/lib/auth/permissions';
import { getInvoice, getInvoiceSourceOptions } from '@/lib/billing/service';
import { isUuid } from '@/lib/billing/validation';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Invoice',
};

export default async function InvoiceDetailPage({ params }) {
  const viewer = await requirePermissionPage('invoices.view');
  const { invoiceId } = await params;
  if (!isUuid(invoiceId)) notFound();

  const workspaceId = viewer.membership.workspaceId;
  const role = viewer.membership.role;

  const detail = await getInvoice(workspaceId, invoiceId);
  if (!detail) notFound();

  const options = detail.canEdit ? await getInvoiceSourceOptions(workspaceId) : null;

  return (
    <InvoiceDetailView
      detail={detail}
      options={options}
      permissions={{
        canUpdate: hasPermission(role, 'invoices.update'),
        canSubmit: hasPermission(role, 'invoices.submit'),
        canApprove: hasPermission(role, 'invoices.approve'),
        canIssue: hasPermission(role, 'invoices.issue'),
        canCancel: hasPermission(role, 'invoices.cancel'),
        canRecordPayment: hasPermission(role, 'payments.record'),
      }}
      timezone={viewer.workspace.timezone || 'UTC'}
    />
  );
}
