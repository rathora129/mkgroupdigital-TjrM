import RunsView from '@/components/workspace/ai/RunsView';
import { requirePermissionPage } from '@/lib/auth/authorization';
import { listRuns } from '@/lib/ai/runtime';
import { RUN_STATUSES } from '@/lib/ai/validation';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Agent runs',
};

export default async function RunsPage({ searchParams }) {
  const viewer = await requirePermissionPage('agents.view');
  const params = (await searchParams) || {};

  const status = RUN_STATUSES.includes(params.status) ? params.status : undefined;
  const parsedPage = Number.parseInt(params.page, 10);
  const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;

  const runs = await listRuns(viewer.membership.workspaceId, {
    page,
    pageSize: 20,
    status,
  });

  return (
    <RunsView
      runs={runs}
      status={status || null}
      timezone={viewer.workspace.timezone || 'UTC'}
    />
  );
}
