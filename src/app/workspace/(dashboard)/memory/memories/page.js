import MemoryListView from '@/components/workspace/knowledge/MemoryListView';
import { requirePermissionPage } from '@/lib/auth/authorization';
import { hasPermission } from '@/lib/auth/permissions';
import { listMemories } from '@/lib/knowledge/memory';
import { memoryQuerySchema } from '@/lib/knowledge/validation';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'AI memories',
};

async function parseQuery(params) {
  try {
    return await memoryQuerySchema.validate(params, {
      abortEarly: false,
      stripUnknown: true,
    });
  } catch {
    return memoryQuerySchema.validate({});
  }
}

export default async function MemoriesPage({ searchParams }) {
  const viewer = await requirePermissionPage('memories.view');
  const params = (await searchParams) || {};
  const query = await parseQuery(params);
  const result = await listMemories(viewer.membership.workspaceId, query);

  return (
    <MemoryListView
      result={result}
      query={query}
      canCreate={hasPermission(viewer.membership.role, 'memories.create')}
      timezone={viewer.workspace.timezone || 'UTC'}
    />
  );
}
