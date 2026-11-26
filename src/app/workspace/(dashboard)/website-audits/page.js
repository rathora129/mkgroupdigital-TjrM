import AuditsView from '@/components/workspace/audits/AuditsView';
import { requirePermissionPage } from '@/lib/auth/authorization';
import { hasPermission } from '@/lib/auth/permissions';
import {
  getWebsiteAuditOverview,
  listWebsiteAudits,
} from '@/lib/audits/service';
import { websiteAuditQuerySchema } from '@/lib/audits/validation';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Website audits',
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

export default async function WebsiteAuditsPage({ searchParams }) {
  const viewer = await requirePermissionPage('audits.view');
  const params = (await searchParams) || {};
  const query = await parseQuery(params);
  const workspaceId = viewer.membership.workspaceId;

  const [audits, overview] = await Promise.all([
    listWebsiteAudits(workspaceId, query),
    getWebsiteAuditOverview(workspaceId),
  ]);

  return (
    <AuditsView
      audits={audits}
      overview={overview}
      query={query}
      canCreate={hasPermission(viewer.membership.role, 'audits.create')}
      timezone={viewer.workspace.timezone || 'UTC'}
    />
  );
}
