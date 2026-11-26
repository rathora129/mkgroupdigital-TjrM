import MarketingClientsView from '@/components/workspace/marketing/clients/MarketingClientsView';
import { requirePermissionPage } from '@/lib/auth/authorization';
import { hasPermission } from '@/lib/auth/permissions';
import { listMarketingClients } from '@/lib/marketing/service';
import { marketingClientQuerySchema } from '@/lib/marketing/validation';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Marketing client setup',
};

const DEFAULT_QUERY = { page: 1, pageSize: 20 };

async function parseQuery(params) {
  try {
    return await marketingClientQuerySchema.validate(params, {
      abortEarly: false,
      stripUnknown: true,
    });
  } catch {
    return { ...DEFAULT_QUERY };
  }
}

export default async function MarketingClientsPage({ searchParams }) {
  const viewer = await requirePermissionPage('marketing.view');
  const params = (await searchParams) || {};
  const query = await parseQuery(params);

  const clients = await listMarketingClients(
    viewer.membership.workspaceId,
    query,
  );

  return (
    <MarketingClientsView
      clients={clients}
      query={query}
      canManage={hasPermission(viewer.membership.role, 'marketing.manage')}
    />
  );
}
