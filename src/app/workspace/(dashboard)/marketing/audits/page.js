import MarketingAuditListView from '@/components/workspace/marketing/audits/MarketingAuditListView';
import { requirePermissionPage } from '@/lib/auth/authorization';
import { hasPermission } from '@/lib/auth/permissions';
import {
  getWebsiteAuditOverview,
  listWebsiteAudits,
} from '@/lib/audits/service';
import { websiteAuditQuerySchema } from '@/lib/audits/validation';
import { getMarketingFindingsOverview } from '@/lib/marketing/seo';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Marketing SEO findings',
};

const DEFAULT_QUERY = { page: 1, pageSize: 20 };

async function parseQuery(params) {
  try {
    return await websiteAuditQuerySchema.validate(params, {
      abortEarly: false,
      stripUnknown: true,
    });
  } catch {
    return { ...DEFAULT_QUERY };
  }
}

export default async function MarketingAuditsPage({ searchParams }) {
  const viewer = await requirePermissionPage('audits.view');
  const params = (await searchParams) || {};
  const query = await parseQuery(params);
  const workspaceId = viewer.membership.workspaceId;

  const [audits, overview, findingsOverview] = await Promise.all([
    listWebsiteAudits(workspaceId, query),
    getWebsiteAuditOverview(workspaceId),
    getMarketingFindingsOverview(workspaceId),
  ]);

  return (
    <MarketingAuditListView
      audits={audits}
      overview={overview}
      findingsOverview={findingsOverview}
      query={query}
      canManage={hasPermission(viewer.membership.role, 'marketing.manage')}
      timezone={viewer.workspace.timezone || 'UTC'}
    />
  );
}
