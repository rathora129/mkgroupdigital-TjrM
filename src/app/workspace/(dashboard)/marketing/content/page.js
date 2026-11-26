import ContentListView from '@/components/workspace/marketing/content/ContentListView';
import { requirePermissionPage } from '@/lib/auth/authorization';
import { hasPermission } from '@/lib/auth/permissions';
import { listClientOptions } from '@/lib/marketing/helpers';
import { listContent } from '@/lib/marketing/content';
import { contentQuerySchema } from '@/lib/marketing/validation';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Marketing content',
};

const DEFAULT_QUERY = { page: 1, pageSize: 20, view: 'list' };

async function parseQuery(params) {
  try {
    return await contentQuerySchema.validate(params, {
      abortEarly: false,
      stripUnknown: true,
    });
  } catch {
    return { ...DEFAULT_QUERY };
  }
}

export default async function ContentPage({ searchParams }) {
  const viewer = await requirePermissionPage('marketing.view');
  const params = (await searchParams) || {};
  const query = await parseQuery(params);
  const workspaceId = viewer.membership.workspaceId;

  const [content, clients] = await Promise.all([
    listContent(workspaceId, viewer.user.id, query),
    listClientOptions(workspaceId),
  ]);

  return (
    <ContentListView
      content={content}
      query={query}
      clients={clients}
      canManage={hasPermission(viewer.membership.role, 'marketing.manage')}
      timezone={viewer.workspace.timezone || 'UTC'}
    />
  );
}
