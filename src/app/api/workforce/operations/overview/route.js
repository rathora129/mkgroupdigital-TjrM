import { errorResponse, jsonOk } from '@/lib/api';
import { requirePermission } from '@/lib/auth/authorization';
import { getOperationsOverview } from '@/lib/integrations/monitoring';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  try {
    const viewer = await requirePermission('integrations.view');
    const result = await getOperationsOverview(viewer.membership.workspaceId);
    return jsonOk(result);
  } catch (error) {
    return errorResponse(error);
  }
}
