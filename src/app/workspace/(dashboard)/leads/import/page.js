import LeadsImportView from '@/components/workspace/leads/LeadsImportView';
import { requirePermissionPage } from '@/lib/auth/authorization';
import { getImportOverview, listImportBatches } from '@/lib/leads/import';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Import leads',
};

export default async function LeadsImportPage() {
  const viewer = await requirePermissionPage('leads.import');
  const workspaceId = viewer.membership.workspaceId;

  const [batches, overview] = await Promise.all([
    listImportBatches(workspaceId),
    getImportOverview(workspaceId),
  ]);

  return (
    <LeadsImportView
      batches={batches}
      overview={overview}
      timezone={viewer.workspace.timezone || 'UTC'}
    />
  );
}
