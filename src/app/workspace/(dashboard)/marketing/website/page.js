import WebsiteView from '@/components/workspace/marketing/website/WebsiteView';
import { requirePermissionPage } from '@/lib/auth/authorization';
import { hasPermission } from '@/lib/auth/permissions';
import { listClientOptions } from '@/lib/marketing/helpers';
import {
  listWebsitePages,
  listWebsiteProposals,
} from '@/lib/marketing/website';
import {
  proposalQuerySchema,
  websitePageQuerySchema,
} from '@/lib/marketing/validation';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Marketing website changes',
};

async function parseQuery(schema, params) {
  try {
    return await schema.validate(params, {
      abortEarly: false,
      stripUnknown: true,
    });
  } catch {
    return { page: 1, pageSize: 20 };
  }
}

export default async function WebsitePage({ searchParams }) {
  const viewer = await requirePermissionPage('marketing.view');
  const params = (await searchParams) || {};
  const pageQuery = await parseQuery(websitePageQuerySchema, params);
  const proposalQuery = await parseQuery(proposalQuerySchema, params);
  const workspaceId = viewer.membership.workspaceId;

  const [pages, proposals, clients] = await Promise.all([
    listWebsitePages(workspaceId, pageQuery),
    listWebsiteProposals(workspaceId, proposalQuery),
    listClientOptions(workspaceId),
  ]);

  return (
    <WebsiteView
      pages={pages}
      proposals={proposals}
      clients={clients}
      query={{
        search: pageQuery.search || proposalQuery.search || null,
        clientId: pageQuery.clientId || proposalQuery.clientId || null,
      }}
      canManage={hasPermission(viewer.membership.role, 'marketing.manage')}
      timezone={viewer.workspace.timezone || 'UTC'}
    />
  );
}
