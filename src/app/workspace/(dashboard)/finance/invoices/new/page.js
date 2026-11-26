import InvoiceCreateView from '@/components/workspace/finance/InvoiceCreateView';
import { requirePermissionPage } from '@/lib/auth/authorization';
import { getInvoiceSourceOptions } from '@/lib/billing/service';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'New invoice',
};

export default async function NewInvoicePage() {
  const viewer = await requirePermissionPage('invoices.create');
  const options = await getInvoiceSourceOptions(viewer.membership.workspaceId);

  return <InvoiceCreateView options={options} />;
}
