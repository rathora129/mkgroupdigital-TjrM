import { errorResponse, jsonOk, validateBody } from '@/lib/api';
import { requirePermission } from '@/lib/auth/authorization';
import { listSyncEvents } from '@/lib/integrations/service';
import { syncEventListQuerySchema } from '@/lib/integrations/validation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request) {
  try {
    const viewer = await requirePermission('integrations.view');
    const search = Object.fromEntries(new URL(request.url).searchParams);
    const query = await validateBody(syncEventListQuerySchema, search);
    const result = await listSyncEvents(viewer.membership.workspaceId, query);
    return jsonOk(result);
  } catch (error) {
    return errorResponse(error);
  }
}
