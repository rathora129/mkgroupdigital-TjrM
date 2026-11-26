import InvoiceListView from '@/components/workspace/finance/InvoiceListView';
import { requirePermissionPage } from '@/lib/auth/authorization';
import { hasPermission } from '@/lib/auth/permissions';
import { getInvoicesOverview, listInvoices } from '@/lib/billing/service';
import { invoiceQuerySchema } from '@/lib/billing/validation';
import { listClientOptions } from '@/lib/clients/service';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Invoices',
};

const DEFAULT_QUERY = {
  page: 1,
  pageSize: 20,
  sort: 'date',
  direction: 'desc',
};

async function parseQuery(params) {
  try {
    return await invoiceQuerySchema.validate(params, {
      abortEarly: false,
      stripUnknown: true,
    });
  } catch {
    return { ...DEFAULT_QUERY };
  }
}

export default async function InvoicesPage({ searchParams }) {
  const viewer = await requirePermissionPage('invoices.view');
  const params = (await searchParams) || {};
  const query = await parseQuery(params);
  const workspaceId = viewer.membership.workspaceId;
  const role = viewer.membership.role;

  const [invoices, overview, clients] = await Promise.all([
    listInvoices(workspaceId, viewer.user.id, query),
    getInvoicesOverview(workspaceId),
    listClientOptions(workspaceId),
  ]);

  return (
    <InvoiceListView
      invoices={invoices}
      overview={overview}
      clients={clients}
      query={query}
      canCreate={hasPermission(role, 'invoices.create')}
      timezone={viewer.workspace.timezone || 'UTC'}
    />
  );
}
