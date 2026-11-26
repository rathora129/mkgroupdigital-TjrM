import PaymentListView from '@/components/workspace/finance/PaymentListView';
import { requirePermissionPage } from '@/lib/auth/authorization';
import { hasPermission } from '@/lib/auth/permissions';
import {
  getPaymentsOverview,
  listPayableInvoices,
  listPayments,
} from '@/lib/billing/service';
import { paymentQuerySchema } from '@/lib/billing/validation';
import { listClientOptions } from '@/lib/clients/service';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Payments',
};

const DEFAULT_QUERY = {
  page: 1,
  pageSize: 20,
};

async function parseQuery(params) {
  try {
    return await paymentQuerySchema.validate(params, {
      abortEarly: false,
      stripUnknown: true,
    });
  } catch {
    return { ...DEFAULT_QUERY };
  }
}

export default async function PaymentsPage({ searchParams }) {
  const viewer = await requirePermissionPage('payments.view');
  const params = (await searchParams) || {};
  const query = await parseQuery(params);
  const workspaceId = viewer.membership.workspaceId;
  const role = viewer.membership.role;

  const [payments, overview, payableInvoices, clients] = await Promise.all([
    listPayments(workspaceId, query),
    getPaymentsOverview(workspaceId),
    listPayableInvoices(workspaceId),
    listClientOptions(workspaceId),
  ]);

  return (
    <PaymentListView
      payments={payments}
      overview={overview}
      payableInvoices={payableInvoices}
      clients={clients}
      query={query}
      canRecord={hasPermission(role, 'payments.record')}
      timezone={viewer.workspace.timezone || 'UTC'}
    />
  );
}
