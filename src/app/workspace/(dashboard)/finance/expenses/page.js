import ExpenseListView from '@/components/workspace/finance/ExpenseListView';
import { requirePermissionPage } from '@/lib/auth/authorization';
import { hasPermission } from '@/lib/auth/permissions';
import {
  getExpensesOverview,
  getInvoiceSourceOptions,
  listExpenses,
} from '@/lib/billing/service';
import { expenseQuerySchema } from '@/lib/billing/validation';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Expenses',
};

const DEFAULT_QUERY = {
  page: 1,
  pageSize: 20,
};

async function parseQuery(params) {
  try {
    return await expenseQuerySchema.validate(params, {
      abortEarly: false,
      stripUnknown: true,
    });
  } catch {
    return { ...DEFAULT_QUERY };
  }
}

export default async function ExpensesPage({ searchParams }) {
  const viewer = await requirePermissionPage('expenses.view');
  const params = (await searchParams) || {};
  const query = await parseQuery(params);
  const workspaceId = viewer.membership.workspaceId;
  const role = viewer.membership.role;

  const [expenses, overview, options] = await Promise.all([
    listExpenses(workspaceId, query),
    getExpensesOverview(workspaceId),
    getInvoiceSourceOptions(workspaceId),
  ]);

  return (
    <ExpenseListView
      expenses={expenses}
      overview={overview}
      projects={options.projects}
      query={query}
      canCreate={hasPermission(role, 'expenses.create')}
      canApprove={hasPermission(role, 'expenses.approve')}
      timezone={viewer.workspace.timezone || 'UTC'}
    />
  );
}
